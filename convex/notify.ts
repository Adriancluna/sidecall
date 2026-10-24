// STUB owned by Role 4 (Omar): replace the inside per docs/specs/notifications.md
// (Slack { text } / Discord { content } / generic JSON, 5 s timeout, one retry, never throw).
// Contract: claim queued rows with internal.notifications.claimQueued, report each outcome through
// internal.notifications.markResults. With NOTIFY_LIVE off nothing is sent: rows end "simulated".
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const dispatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runMutation(internal.notifications.claimQueued, {});
    if (rows.length === 0) return null;
    await ctx.runMutation(internal.notifications.markResults, {
      results: rows.map((r) => ({ notificationId: r.notificationId, status: "simulated" as const })),
    });
    return null;
  },
});
