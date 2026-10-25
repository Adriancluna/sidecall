import { afterEach, expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoControls } from "../src/demo/DemoControls";
const query = vi.hoisted(() => ({ value: { allowed: true, presenterKeyRequired: true, running: false, resetNumber: 0, resetError: null as string | null, deployment: "shared-test", preservesExternal: true, reason: "Recovery history stays available." } }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => query.value }));
afterEach(() => { vi.unstubAllGlobals(); query.value.resetNumber = 0; query.value.resetError = null; });

test("ordinary simulator enables Reset without a key field or extra confirmation", () => {
  vi.stubGlobal("window", { location: { hostname: "sidecall.vercel.app" }, localStorage: { getItem: () => null } });
  const html = renderToStaticMarkup(createElement(DemoControls));
  expect(html).toContain("Shared demo");
  expect(html).not.toContain("Presenter key");
  expect(html).not.toContain("Confirm reset");
  const reset = html.match(/<button[^>]*>Reset<\/button>/)?.[0];
  expect(reset).toBeDefined();
  expect(reset).not.toContain(' disabled=""');
});

test("local previews identify their separate connection and link to shared demo", () => {
  vi.stubGlobal("window", { location: { hostname: "127.0.0.1" }, localStorage: { getItem: () => null } });
  const html = renderToStaticMarkup(createElement(DemoControls));
  expect(html).toContain("Local preview");
  expect(html).toContain('href="https://sidecall.vercel.app/?stage"');

});

test("shared failure state cannot be labelled a completed reset", () => {
  query.value.resetNumber = 4; query.value.resetError = "Receiver unreachable";
  const html = renderToStaticMarkup(createElement(DemoControls));
  expect(html).toContain("Reset stopped: Receiver unreachable");
  expect(html).not.toContain("Ready for the next practice run");
});
