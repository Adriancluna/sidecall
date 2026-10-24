import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    DEMO_MODE: v.optional(v.string()), // "true" enables seed:resetDemo and unsigned demo incidents
    INCIDENT_WEBHOOK_SECRET: v.optional(v.string()), // HMAC key real senders sign POST /incident with
    INCIDENT_AUTO_RESPONSE: v.optional(v.string()), // enroll the signed detector for confirmed automatic response; off by default
    RESPONSE_SANDBOX: v.optional(v.string()), // "true" applies responses to explicitly provisioned owned test resources
    ANTHROPIC_API_KEY: v.optional(v.string()), // Role 4: only for generating text off stage
    NOTIFY_LIVE: v.optional(v.string()), // "true" lets notify.dispatch POST to real webhooks; otherwise rows end "simulated"
    AI_LIVE: v.optional(v.string()), // Role 4: "true" lets ai.ts call the model; otherwise cached text only
    PRESENTER_KEY: v.optional(v.string()), // set on prod: Reset and the unsigned stage Fire need it (the demo password is public)
  },
});

export default app;
