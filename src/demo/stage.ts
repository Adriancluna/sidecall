// Presenter-only UI (Reset, the demo steps) shows when the app is opened with ?stage.
// The real guard for Reset is DEMO_MODE on the deployment; this just keeps judges from hitting it.
export const IS_STAGE = new URLSearchParams(window.location.search).has(
  "stage",
);
