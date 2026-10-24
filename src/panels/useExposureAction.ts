// Acknowledge / close an exposure. Refusals (someone else acknowledged first, already closed)
// are expected when two people act at once, so they come back as a message, not an error.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";
import { humanize } from "./format";

export function useExposureAction(exposureId: Id<"exposures">) {
  const acknowledge = useMutation(api.incidents.acknowledgeExposure);
  const close = useMutation(api.incidents.closeExposure);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const run = async (action: "acknowledge" | "close") => {
    setBusy(true);
    try {
      const res =
        action === "acknowledge" ? await acknowledge({ exposureId }) : await close({ exposureId });
      setMessage(
        res.ok
          ? undefined
          : `Not ${action === "acknowledge" ? "acknowledged" : "closed"}: ${humanize(res.reason)}`,
      );
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, message };
}
