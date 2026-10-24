// Sends queued notifications (docs/specs/notifications.md). Rows are claimed first
// (internal.notifications.claimQueued marks them "sending"), so overlapping runs never send the
// same row. With NOTIFY_LIVE off (the default, and the stage rule) nothing leaves Convex: rows end
// "simulated". With it on: Slack { text }, Discord { content } (≤ 2,000 chars) or generic JSON,
// a 5 s timeout and one retry, ending "sent" or "failed". Never throws.
import type { FunctionReturnType } from "convex/server";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const BATCH = 50;
const TIMEOUT_MS = 5_000;
const PARALLEL = 5;

type Claimed = FunctionReturnType<typeof internal.notifications.claimQueued>[number];

function payload(row: Claimed, channel: NonNullable<Claimed["channel"]>): unknown {
  switch (channel.kind) {
    case "slack":
      return { text: row.text };
    case "discord":
      return { content: row.text.length > 2000 ? `${row.text.slice(0, 1997)}...` : row.text };
    case "webhook":
      return {
        event: row.event,
        text: row.text,
        incidentId: row.incidentId,
        company: row.companyName,
        at: new Date(row.createdAt).toISOString(),
      };
  }
}

// Retries once on a network error, a timeout, 429 or 5xx. 4xx means the URL or payload is wrong:
// retrying won't help. The URL is a secret, so errors never include it.
async function post(url: string, body: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { ok: true };
      error = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      error = e instanceof Error && e.name === "TimeoutError" ? "timed out after 5 s" : "network error";
    }
  }
  return { ok: false, error };
}

export const dispatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows: Claimed[] = await ctx.runMutation(internal.notifications.claimQueued, { limit: BATCH });
    if (rows.length === 0) return null;

    const live = env.NOTIFY_LIVE === "true";
    const results: { notificationId: Id<"notifications">; status: "sent" | "simulated" | "failed"; error?: string }[] = [];
    for (let i = 0; i < rows.length; i += PARALLEL) {
      const batch = rows.slice(i, i + PARALLEL);
      results.push(
        ...(await Promise.all(
          batch.map(async (row) => {
            if (!live) return { notificationId: row.notificationId, status: "simulated" as const };
            if (!row.channel) return { notificationId: row.notificationId, status: "failed" as const, error: "channel removed" };
            const sent = await post(row.channel.url, payload(row, row.channel));
            return sent.ok
              ? { notificationId: row.notificationId, status: "sent" as const }
              : { notificationId: row.notificationId, status: "failed" as const, error: sent.error };
          }),
        )),
      );
    }
    await ctx.runMutation(internal.notifications.markResults, { results });

    // A full batch means more may be waiting: keep going in a fresh run.
    if (rows.length === BATCH) await ctx.scheduler.runAfter(0, internal.notify.dispatch, {});
    return null;
  },
});
