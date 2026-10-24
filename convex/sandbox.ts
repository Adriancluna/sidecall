// A real authorization boundary on resources this demo owns, NOT an Okta/Entra integration.
import { ConvexError, v } from "convex/values";
import {
  env,
  httpAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { toHex } from "./shared";
import type { ResponseAction } from "./scoring";

export const provision = internalMutation({
  args: {
    companyDomain: v.string(),
    assetName: v.string(),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    if (env.DEMO_MODE !== "true" || env.RESPONSE_SANDBOX !== "true")
      throw new ConvexError(
        "Sandbox provision requires DEMO_MODE and RESPONSE_SANDBOX.",
      );
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash))
      throw new ConvexError(
        "Supply a SHA-256 hash of a newly generated random sandbox token.",
      );
    const company = await ctx.db
      .query("companies")
      .withIndex("by_domain", (q) => q.eq("domain", args.companyDomain))
      .unique();
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_name", (q) => q.eq("name", args.assetName))
      .unique();
    if (!company || !asset) throw new ConvexError("Unknown sandbox scope.");
    const collision = await ctx.db
      .query("sandboxResources")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (collision)
      throw new ConvexError("Use a fresh unique token per resource.");
    const existing = await ctx.db
      .query("sandboxResources")
      .withIndex("by_companyId_and_assetId", (q) =>
        q.eq("companyId", company._id).eq("assetId", asset._id),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("sandboxResources", existing._id, {
        tokenHash: args.tokenHash,
        revoked: false,
      });
      return existing._id;
    }
    return await ctx.db.insert("sandboxResources", {
      companyId: company._id,
      assetId: asset._id,
      tokenHash: args.tokenHash,
      paused: false,
      revoked: false,
    });
  },
});
export async function applySandboxResponse(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  assetId: Id<"assets">,
  action: ResponseAction,
) {
  if (env.RESPONSE_SANDBOX !== "true") return null;
  const resource = await ctx.db
    .query("sandboxResources")
    .withIndex("by_companyId_and_assetId", (q) =>
      q.eq("companyId", companyId).eq("assetId", assetId),
    )
    .unique();
  if (!resource) return null;
  await ctx.db.patch(
    "sandboxResources",
    resource._id,
    action === "pause_shared_login" ? { paused: true } : { revoked: true },
  );
  const after = (await ctx.db.get("sandboxResources", resource._id))!;
  return { method: "owned_resource_state" as const, resourceId: resource._id, checkedAt: Date.now(),
    accessBefore: !resource.paused && !resource.revoked, accessAfter: !after.paused && !after.revoked };
}
export async function undoSandboxResponse(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  assetId: Id<"assets">,
) {
  const resource = await ctx.db
    .query("sandboxResources")
    .withIndex("by_companyId_and_assetId", (q) =>
      q.eq("companyId", companyId).eq("assetId", assetId),
    )
    .unique();
  if (resource)
    await ctx.db.patch("sandboxResources", resource._id, { paused: false });
}
export const check = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    if (env.RESPONSE_SANDBOX !== "true") return false;
    const resource = await ctx.db
      .query("sandboxResources")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    return !!resource && !resource.paused && !resource.revoked;
  },
});
export const sandboxAccess = httpAction(async (ctx, req) => {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 200)
    return new Response("Sandbox access denied", { status: 401 });
  const token = header.slice(7);
  if (!/^sc_test_[a-f0-9]{64}$/.test(token))
    return new Response("Sandbox access denied", { status: 401 });
  const tokenHash = toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  const allowed = await ctx.runQuery(internal.sandbox.check, { tokenHash });
  return new Response(
    allowed
      ? "Owned sandbox resource: access granted"
      : "Sandbox access denied",
    {
      status: allowed ? 200 : 403,
      headers: { "cache-control": "no-store" },
    },
  );
});
