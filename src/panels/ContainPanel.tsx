// The PE firm closes out an incident: what was fixed and how it was confirmed. Containment stops
// new holds for that vendor; the backend refuses vague notes and non-PE users.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { refusalOf } from "../layout/errors";
import { dateTime } from "./format";
import { Card } from "./ui";

type Props = { incidentId: Id<"incidents">; containedAt: number | null };

export function ContainPanel({ incidentId, containedAt }: Props) {
  const contain = useMutation(api.incidents.containIncident);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();

  if (containedAt !== null) {
    return (
      <Card title="Containment">
        <p className="text-sm text-ok">
          Contained {dateTime(containedAt)}. New payments to this vendor are no
          longer held.
        </p>
      </Card>
    );
  }

  const submit = async () => {
    setBusy(true);
    setRefusal(undefined);
    setRefusal(
      await refusalOf(() => contain({ incidentId, note: note.trim() })),
    );
    setBusy(false);
  };

  return (
    <Card title="Containment">
      <label
        className="block text-xs text-ash"
        htmlFor={`contain-${incidentId}`}
      >
        What was fixed, and how it was confirmed
      </label>
      <textarea
        id={`contain-${incidentId}`}
        name="containmentNote"
        autoComplete="off"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Vendor rotated all admin credentials; confirmed on a call with their security lead…"
        className="mt-1 w-full rounded-md border border-line bg-graphite px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={busy || note.trim() === ""}
        onClick={() => void submit()}
        className="mt-2 rounded-md bg-amber px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-amber/90 disabled:opacity-50"
      >
        Mark contained
      </button>
      {refusal && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {refusal}
        </p>
      )}
    </Card>
  );
}
