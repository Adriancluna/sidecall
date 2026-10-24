// Validated red-team findings on POST /incident (spec: docs/specs/armadin-one-step-ahead.md).
// This is our own schema, modelled on what an autonomous red team reports: a technique, the hops
// it proved inside the one company it was authorized to test, and the shared asset at the edge.
// Sidecall carries that last hop to sister companies; it never tests anything itself.
import type { Infer } from "convex/values";
import type { finding as findingValidator } from "./schema";

export type Finding = Infer<typeof findingValidator>;

// Technique names sisters may see. A name the sender made up stays firm-only.
export const ATTACK_TECHNIQUES: Record<string, string> = {
  T1078: "Valid Accounts",
  "T1078.001": "Default Accounts",
  "T1078.002": "Domain Accounts",
  "T1078.003": "Local Accounts",
  "T1078.004": "Cloud Accounts",
  T1021: "Remote Services",
  "T1021.001": "Remote Desktop Protocol",
  T1098: "Account Manipulation",
  T1110: "Brute Force",
  T1133: "External Remote Services",
  T1190: "Exploit Public-Facing Application",
  T1199: "Trusted Relationship",
  T1552: "Unsecured Credentials",
  "T1552.001": "Credentials In Files",
  T1566: "Phishing",
};

export const techniqueLabel = (id: string) => (ATTACK_TECHNIQUES[id] ? `${id} ${ATTACK_TECHNIQUES[id]}` : id);

export type ParsedFinding = {
  finding: Finding;
  assetName: string; // terminalAsset.assetName
  organizationDomain: string; // scope.organizationDomain
};

const HOP_KINDS = ["foothold", "credential", "system", "vendor_tenant"] as const;
const TERMINAL_KINDS = ["credential", "vendor_tenant"] as const;
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const TECHNIQUE_RE = /^T\d{4}(\.\d{3})?$/;
const FUTURE_SLACK_MS = 5 * 60 * 1000;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isText = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const oneOf = <T extends string>(x: unknown, options: readonly T[]): x is T =>
  typeof x === "string" && (options as readonly string[]).includes(x);

// Returns the normalized finding, or the reason it was refused (sent back as a 400).
export function parseFinding(raw: unknown, now: number): ParsedFinding | { error: string } {
  if (!isObject(raw)) return { error: "finding must be an object" };
  const { source, findingId, validatedAt, scope, technique, path, terminalAsset, evidence, confidence } = raw;

  if (!oneOf(source, ["armadin", "manual"] as const)) return { error: 'finding.source must be "armadin" or "manual"' };
  if (typeof findingId !== "string" || !ID_RE.test(findingId)) {
    return { error: "finding.findingId must be 1–128 letters, digits or . _ : -" };
  }

  const at = typeof validatedAt === "number" ? validatedAt : typeof validatedAt === "string" ? Date.parse(validatedAt) : NaN;
  if (!Number.isFinite(at)) return { error: "finding.validatedAt must be ms since epoch or an ISO date" };
  if (at > now + FUTURE_SLACK_MS) return { error: "finding.validatedAt is in the future" };

  if (!isObject(scope) || !isText(scope.organizationDomain, 253)) {
    return { error: "finding.scope.organizationDomain is required" };
  }
  if (scope.engagementId !== undefined && (typeof scope.engagementId !== "string" || !ID_RE.test(scope.engagementId))) {
    return { error: "finding.scope.engagementId must be 1–128 letters, digits or . _ : -" };
  }

  if (!isObject(technique) || typeof technique.id !== "string" || !TECHNIQUE_RE.test(technique.id)) {
    return { error: "finding.technique.id must be a MITRE ATT&CK id like T1078 or T1078.004" };
  }
  if (technique.name !== undefined && !isText(technique.name, 80)) {
    return { error: "finding.technique.name must be a string of at most 80 characters" };
  }

  if (!Array.isArray(path) || path.length < 1 || path.length > 12) {
    return { error: "finding.path must list 1–12 hops" };
  }
  const hops: Finding["path"] = [];
  for (const hop of path) {
    if (!isObject(hop)) return { error: "each finding.path hop must be an object" };
    if (hop.validated !== true) return { error: "findings carry only validated hops; Sidecall infers the rest" };
    if (!oneOf(hop.kind, HOP_KINDS)) return { error: `hop kind must be one of ${HOP_KINDS.join(", ")}` };
    if (!isText(hop.label, 120)) return { error: "hop label must be a string of at most 120 characters" };
    hops.push({ kind: hop.kind, label: hop.label });
  }

  if (!isObject(terminalAsset) || !isText(terminalAsset.assetName, 200) || !oneOf(terminalAsset.kind, TERMINAL_KINDS)) {
    return { error: 'finding.terminalAsset needs assetName and kind "credential" or "vendor_tenant"' };
  }
  if (hops[hops.length - 1].kind !== terminalAsset.kind) {
    return { error: "the last validated hop must be the terminal asset (same kind)" };
  }

  const items: Finding["evidence"] = [];
  if (evidence !== undefined) {
    if (!Array.isArray(evidence) || evidence.length > 10) return { error: "finding.evidence must be at most 10 items" };
    for (const e of evidence) {
      if (!isObject(e) || !isText(e.kind, 40) || !isText(e.summary, 500)) {
        return { error: "each evidence item needs kind (≤ 40 chars) and summary (≤ 500 chars)" };
      }
      items.push({ kind: e.kind, summary: e.summary });
    }
  }

  if (confidence !== undefined && (typeof confidence !== "number" || !(confidence >= 0 && confidence <= 1))) {
    return { error: "finding.confidence must be between 0 and 1" };
  }

  return {
    finding: {
      source,
      findingId,
      ...(typeof scope.engagementId === "string" ? { engagementId: scope.engagementId } : {}),
      validatedAt: at,
      technique: { id: technique.id, name: typeof technique.name === "string" ? technique.name : (ATTACK_TECHNIQUES[technique.id] ?? null) },
      terminalKind: terminalAsset.kind,
      path: hops,
      evidence: items,
      confidence: typeof confidence === "number" ? confidence : null,
    },
    assetName: terminalAsset.assetName,
    organizationDomain: scope.organizationDomain,
  };
}
