import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import { PlanSteps, FirstStepCell } from "../src/panels/ResponsePlaybook";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: query, useMutation: () => vi.fn() }));
afterEach(() => vi.resetAllMocks());
function render(status: string, deliveries: unknown[]) {
  query.mockReturnValue([{ action: "pause_shared_login", stepId: "step-1", label: "Pause the shared login", status,
    executionMode: "external", canUndo: false, canApprove: false, canManageReceiver: true, deliveries,
    msAfterReport: null, verification: null, effect: "Suspend a disposable test account", undo: "Restore access" }]);
  return renderToStaticMarkup(createElement(PlanSteps, { incidentId: "incident-1" as Id<"incidents"> }));
}
test("unknown external effects never render Done or instant Undo", () => {
  const html = render("unknown", [{ id: "job", kind: "pause", status: "unknown", reason: "Reply unavailable", receipt: null }]);
  expect(html).toContain("The action may have happened"); expect(html).toContain("Check original command");
  expect(html).not.toContain("Undo ("); expect(html).not.toContain("Pause confirmed"); expect(html).not.toContain("Simulated.");
});
test("external confirmation shows provider observation time and session limitation", () => {
  const html = render("done", [{ id: "job", kind: "pause", status: "confirmed", reason: "suspension_verified",
    receipt: { observedAt: 1000, observedState: "SUSPENDED", sessionRevocation: "provider_acknowledged", restoreEligible: true } }]);
  expect(html).toContain("Pause confirmed"); expect(html).toContain("Okta reported SUSPENDED");
  expect(html).toContain("downstream logout is not verified"); expect(html).toContain("Prepare restoration");
  expect(html).not.toContain("Undo (");
});
test("restore preparation exposes command IDs and separate operator approval", () => {
  const html = render("done", [{ id: "pause", kind: "pause", commandId: "pause-123", status: "confirmed", reason: "verified" },
    { id: "restore", kind: "restore", commandId: "restore-123", status: "awaiting_operator", reason: "Company approval required" }]);
  expect(html).toContain("company operator must approve"); expect(html).toContain("pause-123"); expect(html).toContain("restore-123");
  expect(html).toContain("Send approved restore");
});
test("portfolio tracker does not hide uncertainty behind another completed step", () => {
  const html = renderToStaticMarkup(createElement(FirstStepCell, { row: { done: 1, ready: 0, unknown: 1, firstStepMs: 5, notifyOnly: false } }));
  expect(html).toContain("Confirmation unknown"); expect(html).not.toContain("Done");
});
