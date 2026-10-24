// Presenter-only UI (Reset, the demo steps) shows when the app is opened with ?stage.
// The real guard for Reset is DEMO_MODE on the deployment; this just keeps judges from hitting it.
// Remembered for this tab, so a sign-in or reload that drops the query string keeps presenter mode.
const STAGE_KEY = "sidecall-stage";

function detectStage(): boolean {
  const inUrl = new URLSearchParams(window.location.search).has("stage");
  try {
    if (inUrl) window.sessionStorage.setItem(STAGE_KEY, "1");
    return inUrl || window.sessionStorage.getItem(STAGE_KEY) === "1";
  } catch {
    return inUrl;
  }
}

export const IS_STAGE = detectStage();

// Small per-tab memory for presenter state (current beat, panel open). Storage can be blocked.
export function loadStage<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(`sidecall-stage-${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function saveStage(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(`sidecall-stage-${key}`, JSON.stringify(value));
  } catch {
    // kept in memory for this page only
  }
}
