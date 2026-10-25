import { afterEach, expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoControls } from "../src/demo/DemoControls";
const query = vi.hoisted(() => ({ value: { allowed: true, presenterKeyRequired: true, running: false, resetNumber: 0, resetError: null as string | null, deployment: "shared-test", preservesExternal: true, reason: "Recovery history stays available." } }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => query.value }));
afterEach(() => { vi.unstubAllGlobals(); query.value.resetNumber = 0; query.value.resetError = null; });

test("ordinary non-stage simulator exposes Reset and presenter-key guidance", () => {
  vi.stubGlobal("window", { location: { hostname: "sidecall.vercel.app" }, localStorage: { getItem: () => null } });
  const html = renderToStaticMarkup(createElement(DemoControls));
  expect(html).toContain("Shared demo");
  expect(html).toContain("Enter the presenter key below");
  expect(html).toContain('placeholder="Presenter key"');
  expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Reset<\/button>/);
});

test("local previews identify their separate connection and link to shared demo", () => {
  vi.stubGlobal("window", { location: { hostname: "127.0.0.1" }, localStorage: { getItem: () => null } });
  const html = renderToStaticMarkup(createElement(DemoControls));
  expect(html).toContain("Local preview");
  expect(html).toContain('href="https://sidecall.vercel.app/?stage"');
  expect(html).toContain("Refreshing a page does not reset");
});

test("shared failure state cannot be labelled a completed reset", () => {
  query.value.resetNumber = 4; query.value.resetError = "Receiver unreachable";
  const html = renderToStaticMarkup(createElement(DemoControls));
  expect(html).toContain("did not finish");
  expect(html).not.toContain("Ready for the next practice run");
});
