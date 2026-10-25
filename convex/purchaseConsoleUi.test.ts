import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import { PurchaseConsole } from "../src/panels/PurchaseConsole";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: query, useMutation: () => vi.fn() }));
afterEach(() => vi.resetAllMocks());
const meId = "test-ap" as Id<"users">;
function render(state: unknown) {
  query.mockReturnValueOnce(state).mockReturnValueOnce([]).mockReturnValueOnce(undefined);
  return renderToStaticMarkup(createElement(PurchaseConsole, { meId }));
}
const disabled = { configured: false, canRun: true, runs: [], model: "test-model",
  configurationReason: "Live invoice processing is switched off." };

test("unavailable or loading console adds no panel ahead of ordinary bill actions", () => {
  for (const state of [undefined, null, disabled]) expect(render(state)).toBe("");
});

test("disabled console retains saved outcomes and Stop without a submission form", () => {
  const html = render({ ...disabled, runs: [{ requesterName: "AP clerk", receipt: null, run: {
    _id: "run-1", requestedBy: meId, status: "running", createdAt: 0, sourceText: "Masked invoice",
    sourceSha256: "test-hash", events: [], modelCalls: 1, inputTokens: 20, outputTokens: 5, model: "test-model",
    snapshot: { vendorName: "Test vendor", amountCents: 12000, accountLast4: "4242", description: "Supplies" },
  } }] });
  expect(html).toContain("Live invoice processing is switched off");
  expect(html).toContain("Stop this run");
  expect(html).toContain("Masked invoice");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("name=\"purchasePresenterKey\"");
});

test("explicitly enabled AP console exposes the invoice workflow and simulation label", () => {
  const html = render({ ...disabled, configured: true });
  expect(html).toContain("<form");
  expect(html).toContain("Process approved bill");
  expect(html).toContain("No bank or Visa transaction is sent");
});
