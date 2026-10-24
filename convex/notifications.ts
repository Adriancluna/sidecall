// Notifications to Slack / Discord / a generic webhook (docs/specs/notifications.md).
// Role 1 owns this file: channels, the outbox, and enqueueing. Role 4 owns convex/notify.ts,
// the action that actually sends (or, with NOTIFY_LIVE off, marks rows "simulated").
import { v, type Infer } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getViewer, type Viewer } from "./access";
import { notifyEvent, notifyKind } from "./schema";

type NotifyEvent = Infer<typeof notifyEvent>;
type NotifyKind = Infer<typeof notifyKind>;

// ---- Enqueue (called from the mutations that create the thing being announced) ----

type Enqueue = {
  event: NotifyEvent;
  scope: "company" | "firm";
  companyId?: Id<"companies">;
  incidentId: Id<"incidents">;
  refId: string; // "<event>:<id>", the dedupe key per channel
  text: string;
};

// Queues one outbox row per enabled, subscribed channel, skipping rows that already exist
// (a replayed webhook or a re-saved alert never notifies twice). Returns how many were queued.
// Dispatch is scheduled by queueRow, so callers have nothing else to remember.
export async function enqueue(ctx: MutationCtx, item: Enqueue): Promise<number> {
  const channels =
    item.scope === "company"
      ? item.companyId
        ? await ctx.db
            .query("notificationChannels")
            .withIndex("by_companyId", (q) => q.eq("companyId", item.companyId))
            .take(20)
        : []
      : await ctx.db
          .query("notificationChannels")
          .withIndex("by_scope", (q) => q.eq("scope", "firm"))
          .take(20);
  let queued = 0;
  for (const channel of channels) {
    if (!channel.enabled || channel.scope !== item.scope || !channel.events.includes(item.event)) continue;
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_channelId_and_refId", (q) => q.eq("channelId", channel._id).eq("refId", item.refId))
      .first();
    if (existing) continue;
    await queueRow(ctx, {
      channelId: channel._id,
      companyId: item.companyId,
      incidentId: item.incidentId,
      event: item.event,
      refId: item.refId,
      text: item.text,
    });
    queued += 1;
  }
  return queued;
}

// Inserts one queued outbox row. If nothing was queued before it, schedules a dispatch: any
// earlier queued row already has one coming, and that run claims this row too. Convex runs
// mutations serializably, so this check can't race with a dispatch claiming rows.
async function queueRow(
  ctx: MutationCtx,
  row: Omit<Doc<"notifications">, "_id" | "_creationTime" | "status" | "createdAt">,
) {
  const alreadyQueued = await ctx.db
    .query("notifications")
    .withIndex("by_status", (q) => q.eq("status", "queued"))
    .first();
  await ctx.db.insert("notifications", { ...row, status: "queued", createdAt: Date.now() });
  if (!alreadyQueued) await ctx.scheduler.runAfter(0, internal.notify.dispatch, {});
}

// Company-scoped message for a ready alert. Never mentions the reporting company: the alert
// text it reuses is already written for the company's own view.
export async function enqueueAlert(
  ctx: MutationCtx,
  alert: Pick<Doc<"alerts">, "_id" | "kind" | "body" | "incidentId" | "companyId">,
) {
  const event: NotifyEvent | null =
    alert.kind === "company_alert" ? "alert" : alert.kind === "hold_notice" ? "hold" : alert.kind === "escalation" ? "escalation" : null;
  if (!event || !alert.companyId) return 0;
  const header =
    event === "alert" ? "Sidecall alert" : event === "hold" ? "Sidecall: payment held until verified" : "Sidecall: decision needed";
  return await enqueue(ctx, {
    event,
    scope: "company",
    companyId: alert.companyId,
    incidentId: alert.incidentId,
    refId: `${event}:${alert._id}`,
    text: `${header}\n${alert.body}`,
  });
}

// ---- Channel configuration ----

const ALLOWED_HOSTS: Record<NotifyKind, string[] | null> = {
  slack: ["hooks.slack.com"],
  discord: ["discord.com", "discordapp.com"],
  webhook: null, // any https host that isn't local or an IP literal
};

// SSRF guard: only https, only the provider's webhook host for Slack/Discord, never localhost,
// private names or raw IPs.
function checkWebhookUrl(kind: NotifyKind, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "That isn't a valid URL.";
  }
  if (url.protocol !== "https:") return "Webhook URLs must use https.";
  if (url.username || url.password) return "Webhook URLs can't contain credentials.";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "Local addresses aren't allowed.";
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) {
    return "IP addresses aren't allowed; use a hostname.";
  }
  const allowed = ALLOWED_HOSTS[kind];
  if (allowed && !allowed.includes(host)) return `A ${kind} webhook must be on ${allowed.join(" or ")}.`;
  if (kind === "slack" && !url.pathname.startsWith("/services/")) return "Slack webhooks look like https://hooks.slack.com/services/…";
  if (kind === "discord" && !url.pathname.startsWith("/api/webhooks/")) return "Discord webhooks look like https://discord.com/api/webhooks/…";
  return null;
}

// Controllers configure their own company's channels; the PE partner configures the firm's.
function canConfigure(viewer: Viewer, scope: "company" | "firm"): boolean {
  return scope === "firm" ? viewer.firm : !viewer.firm && viewer.user.role === "controller";
}

async function refuse(ctx: MutationCtx, viewer: Viewer, reason: string) {
  await ctx.db.insert("auditLog", {
    at: Date.now(),
    actor: viewer.user._id,
    action: "refused",
    companyId: viewer.firm ? undefined : viewer.companyId,
    rule: "notification_settings",
    reason: `Refused notification change: ${reason}`,
  });
  return { ok: false as const, reason };
}

const result = v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.string() }));

export const addChannel = mutation({
  args: {
    scope: v.union(v.literal("company"), v.literal("firm")),
    kind: notifyKind,
    label: v.string(),
    url: v.string(),
    events: v.array(notifyEvent),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), channelId: v.id("notificationChannels") }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!canConfigure(viewer, args.scope)) {
      return await refuse(
        ctx,
        viewer,
        args.scope === "firm" ? "only the PE firm sets firm channels" : "only a controller sets company channels",
      );
    }
    const urlProblem = checkWebhookUrl(args.kind, args.url);
    if (urlProblem) return await refuse(ctx, viewer, urlProblem);
    const label = args.label.trim();
    if (label.length === 0 || label.length > 60) return { ok: false as const, reason: "Give the channel a short label." };
    const events = [...new Set(args.events)];
    if (events.length === 0) return { ok: false as const, reason: "Pick at least one event." };

    const channelId = await ctx.db.insert("notificationChannels", {
      scope: args.scope,
      companyId: viewer.firm ? undefined : viewer.companyId,
      kind: args.kind,
      label,
      url: args.url.trim(),
      events,
      enabled: true,
      createdBy: viewer.user._id,
    });
    return { ok: true as const, channelId };
  },
});

async function ownChannel(ctx: MutationCtx, viewer: Viewer, channelId: Id<"notificationChannels">) {
  const channel = await ctx.db.get("notificationChannels", channelId);
  if (!channel) return null;
  const mine = channel.scope === "firm" ? viewer.firm : !viewer.firm && channel.companyId === viewer.companyId;
  return mine && canConfigure(viewer, channel.scope) ? channel : null;
}

export const removeChannel = mutation({
  args: { channelId: v.id("notificationChannels") },
  returns: result,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const channel = await ownChannel(ctx, viewer, args.channelId);
    if (!channel) return await refuse(ctx, viewer, "not your channel to remove");
    await ctx.db.delete("notificationChannels", channel._id);
    return { ok: true as const };
  },
});

export const sendTest = mutation({
  args: { channelId: v.id("notificationChannels") },
  returns: result,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const channel = await ownChannel(ctx, viewer, args.channelId);
    if (!channel) return await refuse(ctx, viewer, "not your channel to test");
    await queueRow(ctx, {
      channelId: channel._id,
      companyId: channel.companyId,
      event: "test",
      refId: `test:${Date.now()}`,
      text: `Sidecall test message for "${channel.label}". If you can read this, notifications reach this channel.`,
    });
    return { ok: true as const };
  },
});

// ---- Reads (scoped to the viewer; webhook URLs never leave the server) ----

function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}/…${raw.slice(-4)}`;
  } catch {
    return `…${raw.slice(-4)}`;
  }
}

export const listChannels = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    const channels = viewer.firm
      ? await ctx.db
          .query("notificationChannels")
          .withIndex("by_scope", (q) => q.eq("scope", "firm"))
          .take(50)
      : await ctx.db
          .query("notificationChannels")
          .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
          .take(50);
    return channels.map((c) => ({
      _id: c._id,
      scope: c.scope,
      kind: c.kind,
      label: c.label,
      target: maskUrl(c.url),
      events: c.events,
      enabled: c.enabled,
      canEdit: canConfigure(viewer, c.scope),
    }));
  },
});

export const listOutbox = query({
  args: { incidentId: v.optional(v.id("incidents")) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    let rows: Doc<"notifications">[];
    if (viewer.firm) {
      rows = args.incidentId
        ? await ctx.db
            .query("notifications")
            .withIndex("by_incidentId", (q) => q.eq("incidentId", args.incidentId))
            .order("desc")
            .take(100)
        : await ctx.db.query("notifications").order("desc").take(100);
    } else {
      rows = (
        await ctx.db
          .query("notifications")
          .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
          .order("desc")
          .take(100)
      ).filter((r) => !args.incidentId || r.incidentId === args.incidentId);
    }
    const channels = new Map<Id<"notificationChannels">, Doc<"notificationChannels"> | null>();
    return await Promise.all(
      rows.map(async (r) => {
        if (!channels.has(r.channelId)) channels.set(r.channelId, await ctx.db.get("notificationChannels", r.channelId));
        const channel = channels.get(r.channelId);
        return {
          _id: r._id,
          createdAt: r.createdAt,
          channelLabel: channel?.label ?? "(removed channel)",
          kind: channel?.kind ?? null,
          event: r.event,
          status: r.status,
          text: r.text,
          error: r.error ?? null,
          sentAt: r.sentAt ?? null,
        };
      }),
    );
  },
});

// ---- For convex/notify.ts (Role 4) ----

// Claims up to `limit` queued rows (status → "sending") and returns what the sender needs,
// including the secret URL (internal only). Claiming makes concurrent dispatches safe.
export const claimQueued = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(Math.min(args.limit ?? 50, 100));
    const claimed = [];
    for (const r of rows) {
      await ctx.db.patch("notifications", r._id, { status: "sending" });
      const [channel, company] = await Promise.all([
        ctx.db.get("notificationChannels", r.channelId),
        r.companyId ? ctx.db.get("companies", r.companyId) : null,
      ]);
      claimed.push({
        notificationId: r._id,
        event: r.event,
        text: r.text,
        incidentId: r.incidentId ?? null,
        companyName: company?.name ?? null,
        createdAt: r.createdAt,
        channel: channel ? { kind: channel.kind, url: channel.url, label: channel.label } : null,
      });
    }
    return claimed;
  },
});

export const markResults = internalMutation({
  args: {
    results: v.array(
      v.object({
        notificationId: v.id("notifications"),
        status: v.union(v.literal("sent"), v.literal("simulated"), v.literal("failed")),
        error: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.results) {
      const row = await ctx.db.get("notifications", r.notificationId);
      if (!row || (row.status !== "queued" && row.status !== "sending")) continue; // never re-mark a finished row
      await ctx.db.patch("notifications", r.notificationId, {
        status: r.status,
        error: r.error,
        sentAt: r.status === "sent" ? now : undefined,
      });
    }
    return null;
  },
});
