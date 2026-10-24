// Stage buttons: fire the demo incident, replay the same webhook (nothing duplicates), reset.
import { useState } from "react";
import { postIncident, resetDemo } from "./mockBackend";
import { DEMO_EXTERNAL_ID } from "./mockIncident";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

export function DemoControls() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();

  const send = async (label: string) => {
    setBusy(true);
    try {
      const res = await postIncident(DEMO_EXTERNAL_ID);
      setStatus(
        res.duplicate
          ? `${label}: duplicate of ${res.incidentId}. Nothing new written.`
          : `${label}: incident recorded.`,
      );
    } catch (err) {
      setStatus(
        `${label} failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void send("Fire incident")}
        className={`${BUTTON} border-amber bg-amber text-graphite hover:bg-amber/90`}
      >
        Fire incident
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void send("Replay webhook")}
        className={`${BUTTON} border-line text-paper hover:border-ash`}
      >
        Replay webhook
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          resetDemo();
          setStatus(undefined);
        }}
        className={`${BUTTON} border-transparent text-ash hover:text-paper`}
      >
        Reset
      </button>
      {status && (
        <span role="status" className="text-xs text-ash">
          {status}
        </span>
      )}
    </div>
  );
}
