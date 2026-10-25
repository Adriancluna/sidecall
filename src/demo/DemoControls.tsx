// Stage buttons: fire the demo incident through the real webhook, replay it (nothing duplicates), reset.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../layout/errors";
import { BUTTON_QUIET, BUTTON_SECONDARY, FIELD } from "../panels/styles";

// Mirrors SCENARIOS in convex/seed.ts (not imported: that file is server code). These four are
// the only incidents /incident accepts unsigned, and only on DEMO_MODE deployments.
const SCENARIOS = [
  {
    label: "Brightline payroll breach",
    about: "A payroll vendor four companies use is breached. See who is exposed and which payments are held.",
    body: {
      externalId: "demo-brightline-001",
      assetName: "Brightline Payroll",
      reportedByDomain: "pinecreststaffing.example",
      summary:
        "Attacker used Brightline's admin access at the newest acquisition to reach the payroll vendor's tenant.",
    },
  },
  {
    label: "Ironclad shared login leaked",
    about: "One shared IT login leaks. Only companies that share that login are alerted, not every Ironclad customer.",
    body: {
      externalId: "demo-ironclad-cred-002",
      assetName: "Ironclad shared admin account",
      reportedByDomain: "pinecreststaffing.example",
      summary:
        "Ironclad's shared admin credential seen in use from an unknown host.",
    },
  },
  {
    label: "Ironclad MSP compromised",
    about: "The IT contractor itself is breached, so every customer is exposed and a changed bank account is caught.",
    body: {
      externalId: "demo-ironclad-msp-003",
      assetName: "Ironclad IT Services",
      reportedByDomain: "pinecreststaffing.example",
      summary: "Ironclad Managed IT reports a compromise of its own systems.",
    },
  },
  {
    // The server fills in the red-team finding itself; unsigned demo requests send only the id.
    label: "Red-team finding (Ironclad login)",
    about: "An AI red team proves an attack path at one company. See which sister companies it reaches and what they should check.",
    body: {
      externalId: "demo-armadin-004",
      assetName: "Ironclad shared admin account",
    },
  },
] as const;

type Scenario = (typeof SCENARIOS)[number];

// `convex deploy` (Vercel) only sets VITE_CONVEX_URL, so derive the HTTP-actions host from it.
const SITE_URL =
  (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ||
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  );

// The presenter key (PRESENTER_KEY on prod) lives in this browser only. Storage can be blocked
// (private windows), so every read and write is guarded.
const KEY_STORAGE = "sidecall-presenter-key";
function loadKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}
function saveKey(key: string) {
  try {
    window.localStorage.setItem(KEY_STORAGE, key);
  } catch {
    // kept in memory for this page only
  }
}

async function postIncident(scenario: Scenario, presenterKey: string): Promise<{
  incidentId: string;
  duplicate: boolean;
  correlated: boolean;
}> {
  if (!SITE_URL) throw new Error("VITE_CONVEX_URL is not set");
  const res = await fetch(`${SITE_URL}/incident`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(presenterKey ? { "X-Sidecall-Presenter": presenterKey } : {}),
    },
    body: JSON.stringify(scenario.body),
  });
  const body = (await res.json()) as {
    incidentId?: string;
    duplicate?: boolean;
    correlated?: boolean;
    error?: string;
  };
  if (!res.ok || !body.incidentId) {
    if (body.error?.includes("presenter-only")) {
      throw new Error("Presenter key missing or incorrect. Enter the key in Simulator on this laptop, then try again.");
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return { incidentId: body.incidentId, duplicate: body.duplicate === true, correlated: body.correlated === true };
}

type Action = "fire" | "replay" | "reset";
const BUSY: Record<Action, string> = { fire: "Firing…", replay: "Replaying…", reset: "Resetting…" };

// Demo tooling, outside the product: one slim row under the header, opened from its "Simulator"
// switch. Every control is quiet; nothing here outshines the screen the judges are reading.
export function DemoControls() {
  const resetDemo = useMutation(api.seed.resetDemo);
  const resetAvailability = useQuery(api.seed.resetAvailability, {});
  const [busy, setBusy] = useState<Action>();
  const [status, setStatus] = useState<string>();
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [presenterKey, setPresenterKey] = useState(loadKey);
  const [editingKey, setEditingKey] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const missingKey = resetAvailability?.presenterKeyRequired && !presenterKey.trim();
  const blocked = busy !== undefined || !resetAvailability || resetAvailability.running || missingKey;
  const localPreview = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

  const run = async (action: Action, label: string, work: () => Promise<string>) => {
    setBusy(action);
    try {
      setStatus(`${label}: ${await work()}`);
    } catch (err) {
      setStatus(`${label} failed: ${friendlyError(err)}`);
    } finally {
      setBusy(undefined);
    }
  };

  const send = async () => {
    const res = await postIncident(scenario, presenterKey);
    return res.duplicate ? "duplicate, nothing new written." : res.correlated ? "new report added to the active episode; actions not restarted." : "incident recorded.";
  };

  const button = (action: Action, label: string) => (busy === action ? BUSY[action] : label);

  return (
    <div id="simulator" className="border-b border-dashed border-line">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 md:px-8">
        <div className="basis-full rounded-chip border border-line bg-panel p-3 text-sm" aria-live="polite">
          <p className="font-medium">{localPreview ? "Local preview" : "Shared demo"} · {resetAvailability?.deployment ?? "Connecting…"}</p>
          <p className="mt-1 text-ash">All laptops must use the same website and connection shown here. Refreshing a page does not reset the demo.</p>
          {localPreview && <a className="mt-1 inline-block underline" href="https://sidecall.vercel.app/?stage">Open the shared demo for every laptop</a>}
          {resetAvailability && <p className="mt-2 font-medium">
            {resetAvailability.running ? `Reset ${resetAvailability.resetNumber} is in progress…`
              : resetAvailability.resetError ? `Reset ${resetAvailability.resetNumber} did not finish.`
              : resetAvailability.resetNumber ? `Reset ${resetAvailability.resetNumber} completed. Ready for the next practice run.`
              : "No reset has completed on this demo yet."}
          </p>}
          {missingKey && <p className="mt-2 text-amber">Enter the presenter key below to enable Fire, Replay and Reset. Only the laptop running these controls needs the key.</p>}
        </div>
        <label className="sr-only" htmlFor="demo-scenario">
          Scenario
        </label>
        <select
          id="demo-scenario"
          value={scenario.body.externalId}
          onChange={(e) =>
            setScenario(SCENARIOS.find((s) => s.body.externalId === e.target.value) ?? SCENARIOS[0])
          }
          className={`min-h-9 w-full min-w-0 py-1.5 sm:w-auto ${FIELD}`}
        >
          {SCENARIOS.map((s) => (
            <option key={s.body.externalId} value={s.body.externalId}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void run("fire", "Fire incident", send)}
          className={BUTTON_SECONDARY}
        >
          {button("fire", "Fire incident")}
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void run("replay", "Replay webhook", send)}
          className={BUTTON_QUIET}
        >
          {button("replay", "Replay webhook")}
        </button>
        <button
          type="button"
          disabled={blocked || !resetAvailability?.allowed}
          onClick={() => setConfirmReset(true)}
          className={BUTTON_QUIET}
        >
          {resetAvailability?.running ? "Resetting…" : button("reset", "Reset")}
        </button>
        {confirmReset && <div className="basis-full rounded-chip border border-amber bg-panel p-3" role="region" aria-label="Confirm demo reset">
          <p className="text-sm">{resetAvailability?.preservesExternal
            ? "Restart the practice demo for every laptop on this connection? Reset restores the disposable Okta account paused by the demo, then clears simulated payments and AI tests. Recovery history is kept. If recovery fails, Reset stops and shows the problem. Revoked sessions cannot be recreated."
            : "Restart the practice demo for every laptop on this connection? This clears unfinished tests, simulated payments and sign-ins, then reseeds the portfolio."}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={blocked || !resetAvailability?.allowed} className={BUTTON_SECONDARY}
              onClick={() => { setConfirmReset(false); void run("reset", "Reset", async () => {
                const result = await resetDemo(presenterKey ? { presenterKey } : {});
                return result.continuing ? "request accepted. Watch the shared reset status above." : "portfolio reseeded.";
              }); }}>Confirm reset</button>
            <button type="button" className={BUTTON_QUIET} onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </div>}
        {resetAvailability?.reason && <p className="basis-full text-xs text-amber">{resetAvailability.reason}</p>}
        {resetAvailability?.presenterKeyRequired &&
          (presenterKey && !editingKey ? (
            // Once set, the key field gets out of the projected frame.
            <button type="button" onClick={() => setEditingKey(true)} className={BUTTON_QUIET}>
              Presenter key set
            </button>
          ) : (
            <label className="flex items-center gap-2 text-sm text-ash">
              Presenter key
              <input
                type="password"
                autoComplete="off"
                value={presenterKey}
                onChange={(e) => {
                  setPresenterKey(e.target.value);
                  saveKey(e.target.value);
                }}
                onFocus={() => setEditingKey(true)}
                autoFocus={editingKey}
                onBlur={() => setEditingKey(false)}
                placeholder="Presenter key"
                className={`min-h-9 w-28 py-1.5 ${FIELD}`}
              />
            </label>
          ))}
        <p
          className={`min-w-0 basis-full whitespace-normal break-words text-sm ${status ? "text-paper" : "text-ash"}`}
          title={status ?? scenario.about}
          role={status?.includes("failed:") ? "alert" : "status"}
          aria-live="polite"
        >
          {status ?? scenario.about}
        </p>
      </div>
    </div>
  );
}
