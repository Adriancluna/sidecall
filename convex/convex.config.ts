import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    DEMO_MODE: v.optional(v.string()), // "true" enables seed:resetDemo
  },
});

export default app;
