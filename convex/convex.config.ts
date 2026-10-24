import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    DEMO_MODE: v.optional(v.string()), // "true" enables seed:resetDemo and unsigned demo incidents
    INCIDENT_WEBHOOK_SECRET: v.optional(v.string()), // HMAC key real senders sign POST /incident with
  },
});

export default app;
