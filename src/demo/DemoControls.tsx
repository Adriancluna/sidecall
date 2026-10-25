// Signed-in practice controls use the same incident engine as detector intake.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../layout/errors";
import { BUTTON_QUIET, BUTTON_SECONDARY, FIELD } from "../panels/styles";

const SCENARIOS = [
  { id: "brightline", label: "Brightline payroll breach", about: "See which companies are exposed and which payments are held." },
  { id: "ironcladCredential", label: "Ironclad shared login leaked", about: "See how a leaked shared login triggers a scoped response." },
  { id: "ironcladMsp", label: "Ironclad MSP compromised", about: "See the response to a compromised IT contractor." },
  { id: "armadinFinding", label: "Red-team finding (Ironclad login)", about: "See which sister companies share a validated attack path." },
] as const;
type Scenario = (typeof SCENARIOS)[number];
type Action = "fire" | "replay" | "reset";

export function DemoControls() {
  const resetDemo = useMutation(api.seed.resetDemo);
  const fireScenario = useMutation(api.seed.fireScenario);
  const state = useQuery(api.seed.resetAvailability, {});
  const [busy, setBusy] = useState<Action>();
  const [status, setStatus] = useState<string>();
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const blocked = busy !== undefined || !state?.allowed;
  const localPreview = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location?.hostname ?? "");

  const run = async (action: Action, work: () => Promise<string>) => {
    setBusy(action); setStatus(undefined);
    try { setStatus(await work()); }
    catch (err) { setStatus(`Action failed: ${friendlyError(err)}`); }
    finally { setBusy(undefined); }
  };
  const send = async () => {
    const result = await fireScenario({ scenario: scenario.id });
    return result.duplicate ? "Already recorded. Reset to start a new practice run."
      : result.correlated ? "Report added to the current incident." : "Incident recorded. The dashboards are updating.";
  };
  const resetStatus = state?.running ? state.reason
    : state?.resetError ? `Reset stopped: ${state.resetError}`
    : state?.resetNumber ? `Reset ${state.resetNumber} complete. Ready to run a scenario.` : undefined;

  return (
    <div id="simulator" className="border-b border-dashed border-line">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-3 md:px-8">
        <label className="sr-only" htmlFor="demo-scenario">Scenario</label>
        <select id="demo-scenario" value={scenario.id}
          onChange={e => setScenario(SCENARIOS.find(s => s.id === e.target.value) ?? SCENARIOS[0])}
          className={`min-h-9 w-full min-w-0 py-1.5 sm:w-auto ${FIELD}`}>
          {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" disabled={blocked} onClick={() => void run("fire", send)} className={BUTTON_SECONDARY}>
          {busy === "fire" ? "Firing…" : "Fire incident"}
        </button>
        <button type="button" disabled={blocked} onClick={() => void run("replay", send)} className={BUTTON_QUIET}>
          {busy === "replay" ? "Replaying…" : "Replay"}
        </button>
        <button type="button" disabled={blocked} className={BUTTON_QUIET}
          onClick={() => void run("reset", async () => {
            const result = await resetDemo({});
            return result.continuing ? "Reset started." : "Demo reset. Ready to run a scenario.";
          })}>
          {busy === "reset" || state?.running ? "Resetting…" : "Reset"}
        </button>
        <span className="text-xs text-ash" title={state?.deployment}>{localPreview ? "Local preview" : "Shared demo"}</span>
        {localPreview && <a className="text-xs text-amber underline" href="https://sidecall.vercel.app/?stage">Use the shared demo on all laptops</a>}
        <p className="basis-full text-sm text-ash" role={status?.startsWith("Action failed:") || state?.resetError ? "alert" : "status"} aria-live="polite">
          {state?.running || state?.resetError ? resetStatus
            : status && status !== "Reset started." ? status : resetStatus ?? scenario.about}
        </p>
      </div>
    </div>
  );
}
