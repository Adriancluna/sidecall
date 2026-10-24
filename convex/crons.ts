import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Held payments approaching their due date get escalated to a controller (payments.ts).
crons.interval("escalate held payments near due date", { minutes: 15 }, internal.payments.escalateDueHolds, {});

// Notifications stuck in "sending" after a crashed dispatch run go back to the queue (notifications.ts).
crons.interval("requeue stuck notifications", { minutes: 5 }, internal.notifications.requeueStuck, {});

export default crons;
