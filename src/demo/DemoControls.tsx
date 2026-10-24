// Stage buttons: fire the demo incident through the real webhook, replay it (nothing duplicates), reset.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../layout/errors";
import { BUTTON_QUIET, BUTTON_SECONDARY, FIELD } from "../panels/styles";
import { IS_STAGE } from "./stage";

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
    error?: string;
  };
  if (!res.ok || !body.incidentId) {
    if (body.error?.includes("presenter-only")) {
      throw new Error("the live demo's scenarios are run by the presenter. Explore any person's dashboard instead.");
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return { incidentId: body.incidentId, duplicate: body.duplicate === true };
}

type Action = "fire" | "replay" | "reset";
const BUSY: Record<Action, string> = { fire: "Firing…", replay: "Replaying…", reset: "Resetting…" };

// Demo tooling, outside the product: one slim row under the header, opened from its "Simulator"
// switch. Every control is quiet; nothing here outshines the screen the judges are reading.
export function DemoControls() {
  const resetDemo = useMutation(api.seed.resetDemo);
  const [busy, setBusy] = useState<Action>();
  const [status, setStatus] = useState<string>();
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [presenterKey, setPresenterKey] = useState(loadKey);
  const [editingKey, setEditingKey] = useState(false);

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
    return res.duplicate ? "duplicate, nothing new written." : "incident recorded.";
  };

  const button = (action: Action, label: string) => (busy === action ? BUSY[action] : label);

  return (
    <div id="simulator" className="border-b border-dashed border-line">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 md:px-8">
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
          disabled={busy !== undefined}
          onClick={() => void run("fire", "Fire incident", send)}
          className={BUTTON_SECONDARY}
        >
          {button("fire", "Fire incident")}
        </button>
        <button
          type="button"
          disabled={busy !== undefined}
          onClick={() => void run("replay", "Replay webhook", send)}
          className={BUTTON_QUIET}
        >
          {button("replay", "Replay webhook")}
        </button>
        {IS_STAGE && (
          <button
            type="button"
            disabled={busy !== undefined}
            onClick={() =>
              window.confirm("Reset the demo? This wipes every incident, hold and sign-in and reseeds the portfolio.") &&
              void run("reset", "Reset", async () => {
                await resetDemo(presenterKey ? { presenterKey } : {});
                return "portfolio reseeded.";
              })
            }
            className={BUTTON_QUIET}
          >
            {button("reset", "Reset")}
          </button>
        )}
        {IS_STAGE &&
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
                autoFocus={editingKey}
                onBlur={() => setEditingKey(false)}
                placeholder="prod only"
                className={`min-h-9 w-28 py-1.5 ${FIELD}`}
              />
            </label>
          ))}
        <p
          className={`min-w-0 basis-full truncate text-sm lg:flex-1 lg:basis-56 ${status ? "text-paper" : "text-ash"}`}
          title={status ?? scenario.about}
          aria-live="polite"
        >
          {status ?? scenario.about}
        </p>
      </div>
    </div>
  );
}
