// Stage buttons: fire the demo incident through the real webhook, replay it (nothing duplicates), reset.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

// Mirrors SCENARIOS.brightline in convex/seed.ts (not imported: that file is server code).
const DEMO_INCIDENT = {
  externalId: "demo-brightline-001",
  assetName: "Brightline Payroll",
  reportedByDomain: "pinecreststaffing.example",
  summary:
    "Attacker used Brightline's admin access at the newest acquisition to reach the payroll vendor's tenant.",
};

const SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;

const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

async function postIncident(): Promise<{
  incidentId: string;
  duplicate: boolean;
}> {
  if (!SITE_URL) throw new Error("VITE_CONVEX_SITE_URL is not set");
  const res = await fetch(`${SITE_URL}/incident`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEMO_INCIDENT),
  });
  const body = (await res.json()) as {
    incidentId?: string;
    duplicate?: boolean;
    error?: string;
  };
  if (!res.ok || !body.incidentId) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return { incidentId: body.incidentId, duplicate: body.duplicate === true };
}

export function DemoControls() {
  const resetDemo = useMutation(api.seed.resetDemo);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();

  const run = async (label: string, action: () => Promise<string>) => {
    setBusy(true);
    try {
      setStatus(`${label}: ${await action()}`);
    } catch (err) {
      setStatus(
        `${label} failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const res = await postIncident();
    return res.duplicate
      ? "duplicate, nothing new written."
      : "incident recorded.";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("Fire incident", send)}
        className={`${BUTTON} border-amber bg-amber text-graphite hover:bg-amber/90`}
      >
        Fire incident
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("Replay webhook", send)}
        className={`${BUTTON} border-line text-paper hover:border-ash`}
      >
        Replay webhook
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void run("Reset", async () => {
            await resetDemo({});
            return "portfolio reseeded.";
          })
        }
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
