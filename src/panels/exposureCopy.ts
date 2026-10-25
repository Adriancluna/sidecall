// Plain-English words for an exposure, for the person who has to fix it. The backend decides
// exposure and urgency; this only phrases what it sent.
import type { Doc } from "../../convex/_generated/dataModel";
import { humanize } from "./format";

export type ShareType = "shared_credential" | "shared_admin_access" | "same_vendor_only";
const SHARE_TYPES: readonly ShareType[] = ["shared_credential", "shared_admin_access", "same_vendor_only"];

export const SHARE_LABEL: Record<ShareType, string> = {
  shared_credential: "Shared login",
  shared_admin_access: "Vendor admin access",
  same_vendor_only: "Customer of the same vendor",
};

// From the path (red-team findings) or the "link" evidence ("shared_credential via <asset>").
export function shareTypeOf(e: Doc<"exposures">): ShareType {
  if (e.path) return e.path.linkType;
  const code = e.evidence.find((x) => x.kind === "link")?.detail.split(" ")[0];
  return SHARE_TYPES.find((s) => s === code) ?? "same_vendor_only";
}

// A link guessed from public DNS, not confirmed by the company.
export const isCandidate = (e: Doc<"exposures">) =>
  e.evidence.some((x) => x.kind === "source" && x.detail.includes("DNS"));

// fromFinding: the report is an authorized red-team test result. A proven path is exploitable,
// not proof anyone exploited it, so it is never called a compromise or incident.
export function exposureHeadline(share: ShareType, vendor: string, candidate: boolean, fromFinding = false): string {
  if (fromFinding) {
    if (share === "shared_admin_access")
      return `${vendor} reaches your systems through an admin account an authorized test proved exploitable elsewhere`;
    return `A login you share with ${vendor} was proven exploitable at another portfolio company`;
  }
  if (candidate) return `${vendor} may be one of your vendors, and it has had a security incident`;
  if (share === "shared_credential") return `Your shared login with ${vendor} may be compromised`;
  if (share === "shared_admin_access")
    return `${vendor} reaches your systems through an admin account that may be compromised`;
  return `${vendor}, a vendor you use, has had a security incident`;
}

const FIRST_STEP: Record<ShareType, (vendor: string, asset: string) => string> = {
  shared_credential: (vendor, asset) =>
    `Rotate the login you share with ${vendor} (${asset}) today, even if nothing looks wrong.`,
  shared_admin_access: (vendor) =>
    `Ask ${vendor} to rotate the admin account it uses for you, and remove any access you no longer need.`,
  same_vendor_only: (vendor) =>
    `Ask ${vendor} whether your account was affected, and turn on sign-in alerts if you can.`,
};

// The steps an IT lead takes, in order. "What to check" (red-team findings) leads when present.
export function nextSteps(args: {
  share: ShareType;
  vendor: string;
  asset: string;
  phone?: string;
  whatToCheck?: string;
}): string[] {
  const steps: string[] = [];
  if (args.whatToCheck) {
    steps.push(args.whatToCheck.replace(/^What to check:\s*/, "Check "));
  } else {
    steps.push(FIRST_STEP[args.share](args.vendor, args.asset));
    steps.push(
      `Review recent sign-ins, new users and admin changes in ${args.asset} for anything you don't recognize.`,
    );
  }
  steps.push(
    args.phone
      ? `If you need to reach ${args.vendor}, call ${args.phone}, the number on file. Never use a number or link from a recent email.`
      : `If you need to reach ${args.vendor}, use the number on file, never one from a recent email.`,
  );
  return steps;
}

// Evidence rows with labels a non-specialist can read.
const EVIDENCE_LABEL: Record<string, string> = {
  what_to_check: "What to check",
  path: "What this means for you",
  link: "How you're connected",
  source: "How we know",
  technique: "Attack technique",
  payments_held: "Payments held at report time",
};
const EVIDENCE_ORDER = ["what_to_check", "path", "link", "source", "technique", "payments_held"];

export function readableEvidence(evidence: Doc<"exposures">["evidence"]) {
  return [...evidence]
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map((e) => ({
      kind: e.kind,
      label: EVIDENCE_LABEL[e.kind] ?? humanize(e.kind),
      text:
        e.kind === "link"
          ? e.detail.replace(/^(\w+) via /, (_, code: string) => `${SHARE_LABEL[code as ShareType] ?? humanize(code)} via `)
          : e.kind === "what_to_check"
            ? capitalize(e.detail.replace(/^What to check:\s*/, ""))
            : e.detail,
    }));
}

function rank(kind: string) {
  const i = EVIDENCE_ORDER.indexOf(kind);
  return i === -1 ? EVIDENCE_ORDER.length : i;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
