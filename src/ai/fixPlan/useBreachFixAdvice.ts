// Role 4: the breach fix advice for one exposure, live. Not mounted anywhere yet (README.md).
// The backend (convex/ai.ts getBreachFixAdvice) picks every step and its status; this only
// subscribes. Pass null to skip, e.g. before a company is selected.
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// The brief one company sees: summary, source ("cache" = AI-written off stage, "canned" = the
// rule's standard text) and the ordered recommendations. Null when the viewer may not see it.
export type BreachFixAdvice = NonNullable<FunctionReturnType<typeof api.ai.getBreachFixAdvice>>;
export type BreachFixRecommendation = BreachFixAdvice["recommendations"][number];

// undefined while loading, null when there is nothing to show (not found or not yours).
export function useBreachFixAdvice(exposureId: Id<"exposures"> | null): BreachFixAdvice | null | undefined {
  return useQuery(api.ai.getBreachFixAdvice, exposureId ? { exposureId } : "skip");
}
