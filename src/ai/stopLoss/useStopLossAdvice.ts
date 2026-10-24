// Role 4: the stop-loss advice the viewer may see, live. Not mounted anywhere yet (README.md).
// The backend (convex/ai.ts getStopLossAdvice) picks every recommendation; this only subscribes.
import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

// { portfolio, companies }: a company user gets portfolio null and one brief (its own); the PE
// firm gets the portfolio rollup and every company's brief.
export type StopLossAdvice = FunctionReturnType<typeof api.ai.getStopLossAdvice>;
export type StopLossBrief = StopLossAdvice["companies"][number];
export type StopLossRecommendation = StopLossBrief["recommendations"][number];

const HOUR_MS = 60 * 60 * 1000;

// undefined while loading. Queries can't read the clock, so the hook passes the time, rounded
// down to the hour and fixed for the component's life, so the subscription stays stable.
export function useStopLossAdvice(): StopLossAdvice | undefined {
  const [asOf] = useState(() => Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  return useQuery(api.ai.getStopLossAdvice, { asOf });
}
