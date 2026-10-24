// Every word the blast radius map shows, in one place, so the SVG map and the phone list say the same thing.
// It only describes what the backend decided (relation, urgency, link type, held payments); it decides nothing.
import type { Id } from "../../convex/_generated/dataModel";
import type { NodeRelation } from "../../convex/blastRadius";
import { money } from "../panels/format";
import type { BlastRadius, HeldPaymentRow } from "../panels/types";

export type MapNode = BlastRadius["nodes"][number];
export type MapEdge = BlastRadius["edges"][number];
export type Tone = "danger" | "amber" | "ok" | "paper" | "ash";

// What the map shows about a company's payments for this incident.
export type MoneyFacts = { flaggedHeld: number; releasedCents: number };
const NO_MONEY: MoneyFacts = { flaggedHeld: 0, releasedCents: 0 };

export function moneyFacts(rows: HeldPaymentRow[] | undefined) {
  const facts = new Map<Id<"companies">, MoneyFacts>();
  for (const r of rows ?? []) {
    const f = { ...(facts.get(r.payment.companyId) ?? NO_MONEY) };
    if (r.payment.status === "held" && r.bankChange) f.flaggedHeld += 1;
    if (r.decision?.status === "paid") f.releasedCents += r.payment.amountCents;
    facts.set(r.payment.companyId, f);
  }
  return (id: Id<"companies">) => facts.get(id) ?? NO_MONEY;
}

export const SHARE_WORDS: Record<MapEdge["shareType"], string> = {
  shared_credential: "Shared login",
  shared_admin_access: "Shared admin access",
  same_vendor_only: "Customer of the vendor",
};

// The link to the breached asset says how a company is tied in; a link to a sibling asset is the fallback.
export function mainEdge(edges: MapEdge[], companyId: Id<"companies">) {
  const own = edges.filter((e) => e.companyId === companyId);
  return own.find((e) => e.compromised) ?? own[0];
}

export function tone(node: MapNode): Tone {
  switch (node.relation) {
    case "exposed":
      return node.urgency === "urgent" ? "danger" : "amber";
    case "reporter":
      return "paper";
    case "same_vendor_separate_access":
      return "ok";
    case "linked_not_exposed":
    case "unrelated":
      return "ash";
  }
}

export function statusWord(node: MapNode) {
  const words: Record<NodeRelation, string> = {
    exposed: node.urgency === "urgent" ? "Urgent" : "Advisory",
    reporter: "Reported this incident",
    linked_not_exposed: "Linked · not exposed",
    same_vendor_separate_access: "Separate access · not exposed",
    unrelated: "Not linked",
  };
  return words[node.relation];
}

// The deciding reason under the urgency word. Inferred links are only ever a "candidate".
export function reason(
  node: MapNode,
  edge: MapEdge | undefined,
  facts: MoneyFacts,
) {
  if (!node.exposed) return null;
  const why =
    facts.flaggedHeld > 0
      ? "Payment to a changed account"
      : edge
        ? SHARE_WORDS[edge.shareType]
        : null;
  if (!why) return null;
  return edge?.source === "dns_inferred" ? `${why} · candidate link` : why;
}

// A red-team finding proved a path at the reporting company; at an exposed company Sidecall only
// knows the path reaches it. Never "validated" for a sister company.
export function pathWord(edge: MapEdge | undefined) {
  return edge?.path === "reachable_not_tested"
    ? "Reachable here · not tested"
    : null;
}

// Under the reporter, firm view only: the one place the map says "validated".
export const VALIDATED_HERE = "Red-team path validated here";
export const validatedWord = (reporterName: string | null) =>
  `validated at ${reporterName ?? "the reporting company"}`;

export type MoneyBadge = { text: string; tone: "amber" | "ok" };

export function moneyBadges(node: MapNode, facts: MoneyFacts): MoneyBadge[] {
  const badges: MoneyBadge[] = [];
  if (node.heldCents > 0) {
    badges.push({ text: `${money(node.heldCents)} held`, tone: "amber" });
  }
  if (facts.releasedCents > 0) {
    badges.push({ text: `${money(facts.releasedCents)} released`, tone: "ok" });
  }
  return badges;
}

export function exposureState(node: MapNode) {
  if (node.status === "acknowledged") return "✓ Acknowledged";
  if (node.status === "closed") return "✓ Closed";
  return null;
}

// Shown under the map when someone clicks a company that isn't exposed (the evidence panel only explains exposures).
export function caption(
  node: MapNode,
  assetName: string,
  siblingName?: string,
) {
  switch (node.relation) {
    case "exposed":
      return null;
    case "reporter":
      return `${node.name} reported this incident. Only the firm sees this.`;
    case "same_vendor_separate_access":
      return `${node.name} uses ${siblingName ?? "the same vendor"} with its own access, separate from ${assetName}. Not alerted.`;
    case "linked_not_exposed":
      return `${node.name} is linked to ${assetName}, but not in a way that exposes it. Not alerted.`;
    case "unrelated":
      return `${node.name} has no link to ${assetName}.`;
  }
}

export function ariaLabel(
  node: MapNode,
  edge: MapEdge | undefined,
  facts: MoneyFacts,
) {
  return [
    node.name,
    statusWord(node),
    reason(node, edge, facts),
    pathWord(edge),
    ...moneyBadges(node, facts).map((b) => b.text),
    exposureState(node)?.replace("✓ ", ""),
    `${node.headcount.toLocaleString()} people`,
  ]
    .filter(Boolean)
    .join(", ");
}
