// Role 4: the stop-loss advice the viewer may see, live. Not mounted anywhere yet (README.md).
// The backend (convex/ai.ts getStopLossAdvice) picks every recommendation; this only subscribes.
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

// A company user gets portfolio null and its own brief/readiness; the PE firm gets the
// portfolio rollup and bounded company briefs/readiness. nextReviewAt anchors expiry updates.
export type StopLossAdvice = FunctionReturnType<typeof api.ai.getStopLossAdvice>;
export type StopLossBrief = StopLossAdvice["companies"][number];
export type StopLossRecommendation = StopLossBrief["recommendations"][number];

// Convex pushes data changes. Move the rolling time boundary only when a returned bank-change
// record actually expires; this is an expiry timer, not a polling interval.
export function useStopLossAdvice(): StopLossAdvice | undefined {
  const [asOf, setAsOf] = useState(() => Date.now());
  const advice = useQuery(api.ai.getStopLossAdvice, { asOf });
  const nextReviewAt = advice?.nextReviewAt;
  useEffect(() => {
    if (nextReviewAt === null || nextReviewAt === undefined) return;
    const timer = setTimeout(() => setAsOf(previous => Math.max(Date.now(), previous + 1)),
      Math.min(2_147_483_647, Math.max(1, nextReviewAt - Date.now())));
    return () => clearTimeout(timer);
  }, [nextReviewAt, asOf]);
  return advice;
}
