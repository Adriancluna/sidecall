import { expect, test } from "vitest";
import { selectPortfolioIncident } from "../src/panels/portfolioState";
const closed = { _id: "retained-okta", containedAt: 100 };
const active = { _id: "active", containedAt: null };
test("empty and reset portfolios start at overview despite retained Okta history", () => {
  expect(selectPortfolioIncident([])).toBeUndefined();
  expect(selectPortfolioIncident([closed])).toBeUndefined();
  expect(selectPortfolioIncident([closed], { id: closed._id, newestId: closed._id, history: false })).toBeUndefined();
});
test("history opens only by explicit choice and a new incident takes priority", () => {
  const choice = { id: closed._id, newestId: closed._id, history: true };
  expect(selectPortfolioIncident([closed], choice)).toEqual(closed);
  expect(selectPortfolioIncident([active, closed], choice)).toEqual(active);
});
test("a contained latest record cannot conceal an older open incident", () => {
  expect(selectPortfolioIncident([closed, active])).toEqual(active);
});
test("containment returns the current incident view to baseline and deletion clears stale selection", () => {
  const choice = { id: active._id, newestId: active._id, history: false };
  expect(selectPortfolioIncident([active], choice)).toEqual(active);
  expect(selectPortfolioIncident([{ ...active, containedAt: 200 }], choice)).toBeUndefined();
  expect(selectPortfolioIncident([closed], choice)).toBeUndefined();
});
