// Acknowledge / close an exposure. Refusals (someone else acknowledged first, already closed)
// are expected when two people act at once, so they come back as a message, not an error.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";

type Action = "acknowledge" | "close";

// convex/incidents.ts refusal codes, in words.
const REASON: Record<string, string> = {
  already_acknowledged: "A teammate acknowledged it first.",
  closed: "It's already resolved.",
  not_your_company: "This alert belongs to another company.",
  not_found: "This alert no longer exists.",
};

export function useExposureAction(exposureId: Id<"exposures">) {
  const acknowledge = useMutation(api.incidents.acknowledgeExposure);
  const close = useMutation(api.incidents.closeExposure);
  const [pending, setPending] = useState<Action>();
  const [message, setMessage] = useState<string>();

  const run = async (action: Action) => {
    setPending(action);
    try {
      const res = action === "acknowledge" ? await acknowledge({ exposureId }) : await close({ exposureId });
      setMessage(res.ok ? undefined : (REASON[res.reason] ?? "Not saved. Try again."));
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setPending(undefined);
    }
  };
  return { run, busy: pending !== undefined, pending, message };
}
