import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// The authenticated agent or human identity is the key: a noisy agent cannot exhaust its owner's
// allowance or another company’s. Return refusals instead of throwing so the consumed quota commits with the decision.
export const purchaseLimits = new RateLimiter(components.rateLimiter, {
  requests: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 10 },
});
