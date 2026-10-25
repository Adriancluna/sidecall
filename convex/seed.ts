// Demo portfolio. Everything here is simulated. Re-runnable: clears every table first.
//   npx convex run seed:run
//   UI: api.seed.resetDemo (needs DEMO_MODE=true on the deployment and a signed-in user)
//   npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'
//
// The planted cases (seedRef) are listed in data/answer_key.json, which nothing in convex/ reads.
import { ConvexError, v } from "convex/values";
import { env, internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { recordIncidentImpl } from "./incidents";
import type { Finding } from "./findings";
import { getViewer, isPresenter } from "./access";
// Role 4's DNS findings, bundled at deploy time. Each entry becomes a dns_inferred candidate link.
import dnsLinks from "../data/dns_links.json";
import { DAY_MS, demoEmail } from "./shared";
import { postLedgerEntry } from "./ledger";

type DnsLink = { companyDomain: string; assetName: string; detail?: string };

const cents = (dollars: number) => Math.round(dollars * 100); // dollars → integer cents

// Auth tables are cleared too: their rows point at users that a reseed replaces.
const TABLES: TableNames[] = [
  "paymentRecoveries",
  "purchaseRequests",
  "purchaseReceipts",
  "purchaseQuotes",
  "purchaseMandates",
  "incidentReports",
  "investigations",
  "sandboxResources",
  "notifications",
  "notificationChannels",
  "authSessions",
  "authRefreshTokens",
  "authAccounts",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
  "auditLog",
  "responseSteps",
  "responsePolicies",
  "ledgerEntries",
  "alerts",
  "exposures",
  "payments",
  "bills",
  "bankDetailChanges",
  "incidents",
  "detectorSources",
  "links",
  "users",
  "assets",
  "companies",
];

type CompanyKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N";
type AssetKey =
  | "brightline"
  | "ironcladMsp"
  | "ironcladAdmin"
  | "keystone"
  | "relay"
  | "ledgerly"
  | "fleetline"
  | "tether"
  | "vaultline"
  | "bramble"
  | "inkwell"
  | "helmsman";

const COMPANIES: Record<CompanyKey, Omit<Doc<"companies">, "_id" | "_creationTime">> = {
  A: { name: "Alder Freight Systems", domain: "alderfreight.example", sector: "Logistics", headcount: 1800, holdRuleEnabled: true },
  B: { name: "Cedar Ridge Manufacturing", domain: "cedarridge.example", sector: "Manufacturing", headcount: 2100, holdRuleEnabled: true },
  C: { name: "Summit Home Health", domain: "summithomehealth.example", sector: "Healthcare", headcount: 1600, holdRuleEnabled: true },
  D: { name: "Bayview Veterinary Partners", domain: "bayviewvet.example", sector: "Veterinary", headcount: 500, holdRuleEnabled: true },
  E: { name: "Granite Peak Software", domain: "granitepeak.example", sector: "Software", headcount: 650, holdRuleEnabled: false },
  F: { name: "Harborline Foods", domain: "harborlinefoods.example", sector: "Food distribution", headcount: 1200, holdRuleEnabled: true },
  G: { name: "Meridian Dental Group", domain: "meridiandental.example", sector: "Dental", headcount: 900, holdRuleEnabled: false },
  // Newest, smallest acquisition: least reviewed, where the attacker gets in.
  H: { name: "Pinecrest Staffing", domain: "pinecreststaffing.example", sector: "Staffing", headcount: 140, holdRuleEnabled: false },
  // Background companies: none of them uses Brightline or Ironclad, so every demo headline is unchanged.
  // They make the portfolio the size of a real mid-market fund and the map's "3 of 14" a discipline story.
  I: { name: "Ridgeway Comfort Services", domain: "ridgewaycomfort.example", sector: "HVAC and plumbing", headcount: 1350, holdRuleEnabled: true },
  J: { name: "Oakmont Specialty Pharmacy", domain: "oakmontrx.example", sector: "Specialty pharmacy", headcount: 420, holdRuleEnabled: true },
  K: { name: "Fairhaven Physical Therapy", domain: "fairhavenpt.example", sector: "Physical therapy", headcount: 780, holdRuleEnabled: false },
  L: { name: "Kestrel Insurance Partners", domain: "kestrelins.example", sector: "Insurance brokerage", headcount: 310, holdRuleEnabled: true },
  M: { name: "Wrenfield Fleet Software", domain: "wrenfield.example", sector: "Software", headcount: 260, holdRuleEnabled: false },
  N: { name: "Saltmarsh Pool Supply", domain: "saltmarshpool.example", sector: "Distribution", headcount: 950, holdRuleEnabled: true },
};

const ASSETS: Record<AssetKey, Omit<Doc<"assets">, "_id" | "_creationTime">> = {
  brightline: { name: "Brightline Payroll", vendorName: "Brightline Payroll Inc.", kind: "payroll", phoneOnFile: "+1 (415) 555-0142" },
  ironcladMsp: { name: "Ironclad IT Services", vendorName: "Ironclad Managed IT", kind: "msp", phoneOnFile: "+1 (415) 555-0178" },
  ironcladAdmin: { name: "Ironclad shared admin account", vendorName: "Ironclad Managed IT", kind: "msp", phoneOnFile: "+1 (415) 555-0178" },
  keystone: { name: "Keystone SSO", vendorName: "Keystone Identity", kind: "idp", phoneOnFile: "+1 (628) 555-0110" },
  relay: { name: "Relay Mail", vendorName: "Relay Mail Co.", kind: "email", phoneOnFile: "+1 (628) 555-0193" },
  ledgerly: { name: "Ledgerly AP Portal", vendorName: "Ledgerly", kind: "other", phoneOnFile: "+1 (510) 555-0127" },
  // Background stack, shaped like a real portfolio's public DNS (scripts/dns/portfolio_report.json): device
  // management on half the companies, a few on the same remote-access tool, password manager, ERP. Never incidents.
  fleetline: { name: "Fleetline MDM", vendorName: "Fleetline Device Management", kind: "other", phoneOnFile: "+1 (312) 555-0164" },
  tether: { name: "Tether Remote Support", vendorName: "Tether Remote", kind: "msp", phoneOnFile: "+1 (206) 555-0139" },
  vaultline: { name: "Vaultline Passwords", vendorName: "Vaultline", kind: "idp", phoneOnFile: "+1 (617) 555-0181" },
  bramble: { name: "Bramble ERP", vendorName: "Bramble Software", kind: "other", phoneOnFile: "+1 (512) 555-0152" },
  inkwell: { name: "Inkwell eSign", vendorName: "Inkwell", kind: "other", phoneOnFile: "+1 (628) 555-0106" },
  helmsman: { name: "Helmsman Service Desk", vendorName: "Helmsman", kind: "other", phoneOnFile: "+1 (720) 555-0148" },
};

const LINKS: [CompanyKey, AssetKey, Doc<"links">["shareType"], Doc<"links">["source"]][] = [
  // Brightline Payroll (the demo breach)
  ["H", "brightline", "shared_admin_access", "self_reported"],
  ["B", "brightline", "shared_credential", "self_reported"],
  ["C", "brightline", "same_vendor_only", "self_reported"],
  ["D", "brightline", "same_vendor_only", "dns_inferred"],
  // Ironclad: C uses the MSP but has its own login, so a breach of the shared admin account must NOT alert C.
  ["A", "ironcladMsp", "same_vendor_only", "self_reported"],
  ["C", "ironcladMsp", "same_vendor_only", "self_reported"],
  ["F", "ironcladMsp", "same_vendor_only", "self_reported"],
  ["H", "ironcladMsp", "shared_admin_access", "self_reported"],
  ["B", "ironcladAdmin", "shared_credential", "self_reported"],
  ["E", "ironcladAdmin", "shared_credential", "self_reported"],
  ["F", "ironcladAdmin", "shared_admin_access", "self_reported"],
  ["H", "ironcladAdmin", "shared_credential", "self_reported"],
  // Background links
  ["A", "keystone", "shared_credential", "self_reported"],
  ["G", "keystone", "shared_credential", "self_reported"],
  ["E", "keystone", "same_vendor_only", "dns_inferred"],
  ["A", "relay", "same_vendor_only", "dns_inferred"],
  ["C", "relay", "same_vendor_only", "dns_inferred"],
  ["F", "relay", "same_vendor_only", "dns_inferred"],
  ["G", "relay", "same_vendor_only", "dns_inferred"],
  ["B", "ledgerly", "same_vendor_only", "self_reported"],
  ["D", "ledgerly", "same_vendor_only", "self_reported"],
  // Background stack (no demo incident touches these assets)
  ["I", "keystone", "same_vendor_only", "self_reported"],
  ["K", "keystone", "shared_credential", "self_reported"],
  ["A", "fleetline", "same_vendor_only", "self_reported"],
  ["C", "fleetline", "same_vendor_only", "self_reported"],
  ["E", "fleetline", "shared_admin_access", "self_reported"],
  ["I", "fleetline", "same_vendor_only", "self_reported"],
  ["M", "fleetline", "shared_admin_access", "self_reported"],
  ["F", "tether", "same_vendor_only", "self_reported"],
  ["I", "tether", "shared_admin_access", "self_reported"],
  ["N", "tether", "shared_admin_access", "self_reported"],
  ["B", "vaultline", "same_vendor_only", "self_reported"],
  ["E", "vaultline", "same_vendor_only", "self_reported"],
  ["L", "vaultline", "same_vendor_only", "self_reported"],
  ["D", "bramble", "same_vendor_only", "self_reported"],
  ["J", "bramble", "same_vendor_only", "self_reported"],
  ["L", "bramble", "same_vendor_only", "self_reported"],
  ["N", "bramble", "same_vendor_only", "self_reported"],
  ["A", "inkwell", "same_vendor_only", "self_reported"],
  ["C", "inkwell", "same_vendor_only", "self_reported"],
  ["J", "inkwell", "same_vendor_only", "self_reported"],
  ["L", "inkwell", "same_vendor_only", "self_reported"],
  ["E", "helmsman", "same_vendor_only", "self_reported"],
  ["K", "helmsman", "same_vendor_only", "self_reported"],
  ["M", "helmsman", "same_vendor_only", "self_reported"],
];

const USERS: Record<CompanyKey, { clerk: string; controller: string; it?: string }> = {
  A: { clerk: "Dana Whitfield", controller: "Marcus Oyelaran", it: "Priya Natarajan" },
  B: { clerk: "Tom Becker", controller: "Elena Ruiz", it: "Sam Kowalski" },
  C: { clerk: "Jamie Chen", controller: "Rosa Alvarez", it: "Kwame Mensah" },
  D: { clerk: "Lily Okafor", controller: "Grant Holloway" },
  E: { clerk: "Noah Fischer", controller: "Aisha Rahman", it: "Ben Carter" },
  F: { clerk: "Carmen Diaz", controller: "Victor Lindqvist" },
  G: { clerk: "Hannah Park", controller: "Omar Haddad" },
  H: { clerk: "Riley Moore", controller: "Sofia Bianchi" },
  I: { clerk: "Megan Ostrowski", controller: "Darnell Price" },
  J: { clerk: "Ines Moreau", controller: "Paul Nakamura" },
  K: { clerk: "Chloe Brandt", controller: "Rafael Soto" },
  L: { clerk: "Yusuf Demir", controller: "Karen Liu" },
  M: { clerk: "Leo Varga", controller: "Nadia Petrova", it: "Arjun Mehta" },
  N: { clerk: "Tessa Grant", controller: "Hector Alvarado" },
};

// Bank detail history. Dates are relative to seeding; fire the demo incident soon after.
const BANK_CHANGES: { ref: string; asset: AssetKey; daysAgo: number; last4: string; channel: Doc<"bankDetailChanges">["requestChannel"] }[] = [
  { ref: "bc_brightline_2208_honest", asset: "brightline", daysAgo: 150, last4: "2208", channel: "verified_call" },
  { ref: "bc_brightline_0193_old_email", asset: "brightline", daysAgo: 95, last4: "0193", channel: "email" },
  { ref: "bc_brightline_4419_email_change", asset: "brightline", daysAgo: 9, last4: "4419", channel: "email" },
  { ref: "bc_brightline_7731_email_change", asset: "brightline", daysAgo: 2, last4: "7731", channel: "email" },
  { ref: "bc_ironclad_5510_honest", asset: "ironcladMsp", daysAgo: 210, last4: "5510", channel: "verified_call" },
  { ref: "bc_ironclad_9902_email_change", asset: "ironcladMsp", daysAgo: 4, last4: "9902", channel: "email" },
];

const PAYMENTS: {
  ref: string;
  company: CompanyKey;
  asset: AssetKey;
  dollars: number;
  last4: string;
  status: "pending" | "paid";
  description: string;
  dueInHours?: number; // default 72h; the $480K is due tomorrow so escalation shows in the demo
}[] = [
  { ref: "pay_C_brightline_480k", company: "C", asset: "brightline", dollars: 480_000, last4: "7731", status: "pending", description: "Q4 payroll funding and service fees", dueInHours: 20 },
  { ref: "pay_B_brightline_92k", company: "B", asset: "brightline", dollars: 92_000, last4: "2208", status: "pending", description: "Payroll processing, October" },
  { ref: "pay_D_brightline_28k", company: "D", asset: "brightline", dollars: 28_000, last4: "2208", status: "pending", description: "Payroll processing, October" },
  { ref: "pay_D_brightline_12k", company: "D", asset: "brightline", dollars: 12_000, last4: "4419", status: "pending", description: "Year-end tax filing add-on" },
  { ref: "pay_H_brightline_35k", company: "H", asset: "brightline", dollars: 35_000, last4: "2208", status: "pending", description: "Payroll processing, October" },
  { ref: "pay_B_brightline_paid", company: "B", asset: "brightline", dollars: 41_000, last4: "2208", status: "paid", description: "Payroll processing, September" },
  { ref: "pay_F_ironclad_55k", company: "F", asset: "ironcladMsp", dollars: 55_000, last4: "5510", status: "pending", description: "Managed IT retainer, Q4" },
  { ref: "pay_F_ironclad_37k", company: "F", asset: "ironcladMsp", dollars: 37_000, last4: "9902", status: "pending", description: "Emergency network refresh" },
  { ref: "pay_A_ironclad_24k", company: "A", asset: "ironcladMsp", dollars: 24_000, last4: "5510", status: "pending", description: "Managed IT retainer, Q4" },
  { ref: "pay_A_keystone_22k", company: "A", asset: "keystone", dollars: 22_000, last4: "3380", status: "pending", description: "SSO licences, annual" },
  { ref: "pay_G_relay_9k", company: "G", asset: "relay", dollars: 9_000, last4: "6612", status: "pending", description: "Email hosting, annual" },
  // Ordinary AP at the background companies, so their books aren't empty.
  { ref: "pay_I_fleetline_18k", company: "I", asset: "fleetline", dollars: 18_400, last4: "4471", status: "pending", description: "Device management, 1,350 seats, annual" },
  { ref: "pay_I_tether_6k", company: "I", asset: "tether", dollars: 6_200, last4: "8023", status: "pending", description: "Remote support seats, Q4" },
  { ref: "pay_I_tether_paid", company: "I", asset: "tether", dollars: 6_200, last4: "8023", status: "paid", description: "Remote support seats, Q3" },
  { ref: "pay_J_bramble_31k", company: "J", asset: "bramble", dollars: 31_500, last4: "2950", status: "pending", description: "ERP subscription, annual" },
  { ref: "pay_J_inkwell_4k", company: "J", asset: "inkwell", dollars: 4_800, last4: "6318", status: "pending", description: "E-signature seats, annual" },
  { ref: "pay_K_helmsman_7k", company: "K", asset: "helmsman", dollars: 7_300, last4: "1187", status: "pending", description: "Service desk licences, Q4" },
  { ref: "pay_K_keystone_11k", company: "K", asset: "keystone", dollars: 11_250, last4: "3380", status: "pending", description: "SSO licences, annual" },
  { ref: "pay_L_bramble_22k", company: "L", asset: "bramble", dollars: 22_000, last4: "2950", status: "pending", description: "ERP implementation, milestone 2 of 3" },
  { ref: "pay_L_vaultline_3k", company: "L", asset: "vaultline", dollars: 3_900, last4: "7764", status: "pending", description: "Password manager, 310 seats" },
  { ref: "pay_L_bramble_paid", company: "L", asset: "bramble", dollars: 22_000, last4: "2950", status: "paid", description: "ERP implementation, milestone 1 of 3" },
  { ref: "pay_M_fleetline_4k", company: "M", asset: "fleetline", dollars: 4_100, last4: "4471", status: "pending", description: "Device management, 260 seats, annual" },
  { ref: "pay_M_helmsman_5k", company: "M", asset: "helmsman", dollars: 5_600, last4: "1187", status: "pending", description: "Service desk licences, Q4" },
  { ref: "pay_N_bramble_27k", company: "N", asset: "bramble", dollars: 27_800, last4: "2950", status: "pending", description: "ERP subscription and warehouse module" },
  { ref: "pay_N_tether_5k", company: "N", asset: "tether", dollars: 5_450, last4: "8023", status: "pending", description: "Remote support seats, Q4" },
];

// Bills with no payment yet: the AP clerk requests one in the app (payments.requestPayment).
// Requested after the Brightline incident, it is held on creation.
const UNPAID_BILLS: { company: CompanyKey; asset: AssetKey; dollars: number; dueInHours: number; description: string }[] = [
  { company: "C", asset: "brightline", dollars: 38_000, dueInHours: 120, description: "November payroll processing" },
];

const OPENING_CASH = cents(5_000_000);



// A validated red-team finding at Pinecrest (our finding schema, convex/findings.ts), already
// normalized: the stage button sends only the id and asset, and this copy is what runs.
const PINECREST_FINDING: Finding = {
  source: "armadin",
  findingId: "ARM-2026-0412",
  engagementId: "ENG-PINECREST-Q4",
  validatedAt: Date.parse("2026-10-24T08:12:00Z"),
  technique: { id: "T1078", name: "Valid Accounts" },
  terminalKind: "credential",
  path: [
    { kind: "foothold", label: "Exposed RDP on PC-OPS-12" },
    { kind: "system", label: "pinecrest-jump01" },
    { kind: "credential", label: "Ironclad shared admin (ironclad-svc) in jump-host script" },
  ],
  evidence: [{ kind: "session", summary: "Interactive logon as ironclad-svc on pinecrest-jump01 08:09 UTC" }],
  confidence: 0.92,
};

const PLAYBOOKS: { company: CompanyKey; action: "pause_shared_login" | "revoke_vendor_tokens"; mode: "notify" | "prepare" | "act" }[] = [
  { company: "B", action: "pause_shared_login", mode: "act" },
  { company: "B", action: "revoke_vendor_tokens", mode: "prepare" },
  { company: "E", action: "pause_shared_login", mode: "prepare" },
  { company: "F", action: "pause_shared_login", mode: "notify" },
  { company: "F", action: "revoke_vendor_tokens", mode: "notify" },
];

export const SCENARIOS = {
  brightline: {
    externalId: "demo-brightline-001",
    assetName: "Brightline Payroll",
    reportedByDomain: "pinecreststaffing.example",
    summary: "Attacker used Brightline's admin access at the newest acquisition to reach the payroll vendor's tenant.",
  },
  ironcladCredential: {
    externalId: "demo-ironclad-cred-002",
    assetName: "Ironclad shared admin account",
    reportedByDomain: "pinecreststaffing.example",
    summary: "Ironclad's shared admin credential seen in use from an unknown host.",
  },
  ironcladMsp: {
    externalId: "demo-ironclad-msp-003",
    assetName: "Ironclad IT Services",
    reportedByDomain: "pinecreststaffing.example",
    summary: "Ironclad Managed IT reports a compromise of its own systems.",
  },
  armadinFinding: {
    externalId: "demo-armadin-004",
    assetName: "Ironclad shared admin account",
    reportedByDomain: "pinecreststaffing.example",
    summary: "An autonomous red-team test validated a path from a Pinecrest workstation to Ironclad's shared admin account.",
    finding: PINECREST_FINDING,
  },
} as const;

// Deletes up to CLEAR_BUDGET rows per transaction (well under the 16,000-write limit), so a reset
// after a big scale test finishes in scheduled follow-up runs instead of failing or leaving rows.
const CLEAR_BUDGET = 4000;

async function clearSome(ctx: MutationCtx): Promise<boolean> {
  let left = CLEAR_BUDGET;
  for (const table of TABLES) {
    const docs = await ctx.db.query(table).take(left);
    for (const doc of docs) await ctx.db.delete(table, doc._id);
    left -= docs.length;
    if (left === 0) return false;
  }
  return true;
}

const EMPTY_COUNTS = {
  companies: 0,
  assets: 0,
  links: 0,
  payments: 0,
  bankChanges: 0,
  dnsImported: 0,
  dnsDetailed: 0,
  dnsSkipped: [] as string[],
};

// Clear, then seed. Small databases do both in one transaction. Big ones return
// { continuing: true } and finish in finishReset.
async function resetAll(ctx: MutationCtx) {
  if (!(await clearSome(ctx))) {
    await ctx.scheduler.runAfter(0, internal.seed.finishReset, {});
    return { ...EMPTY_COUNTS, continuing: true };
  }
  return { ...(await seedAll(ctx)), continuing: false };
}

export const finishReset = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await clearSome(ctx)) await seedAll(ctx);
    else await ctx.scheduler.runAfter(0, internal.seed.finishReset, {});
    return null;
  },
});

async function seedAll(ctx: MutationCtx) {
  const now = Date.now();

  const companyIds = {} as Record<CompanyKey, Id<"companies">>;
  for (const [key, company] of Object.entries(COMPANIES) as [CompanyKey, (typeof COMPANIES)[CompanyKey]][]) {
    companyIds[key] = await ctx.db.insert("companies", company);
    await postLedgerEntry(ctx, {
      kind: "opening",
      companyId: companyIds[key],
      amountCents: OPENING_CASH,
      date: now - 180 * DAY_MS,
      memo: "Opening balance",
    });
  }

  const assetIds = {} as Record<AssetKey, Id<"assets">>;
  for (const [key, asset] of Object.entries(ASSETS) as [AssetKey, (typeof ASSETS)[AssetKey]][]) {
    assetIds[key] = await ctx.db.insert("assets", asset);
  }

  // Remember each seeded dns_inferred link so the DNS import below can attach its record.
  const dnsInferredLinks = new Map<string, Id<"links">>();
  for (const [company, asset, shareType, source] of LINKS) {
    const linkId = await ctx.db.insert("links", { companyId: companyIds[company], assetId: assetIds[asset], shareType, source });
    if (source === "dns_inferred") dnsInferredLinks.set(`${companyIds[company]}:${assetIds[asset]}`, linkId);
  }

  // DNS can only say "this company uses this vendor": always same_vendor_only, never a
  // shared credential. A self-reported link for the same pair wins.
  const companyByDomain = new Map(
    (Object.keys(COMPANIES) as CompanyKey[]).map((k) => [COMPANIES[k].domain, companyIds[k]]),
  );
  const assetByName = new Map(
    (Object.keys(ASSETS) as AssetKey[]).map((k) => [ASSETS[k].name, assetIds[k]]),
  );
  const seenPairs = new Set(LINKS.map(([c, a]) => `${companyIds[c]}:${assetIds[a]}`));
  let dnsImported = 0;
  let dnsDetailed = 0;
  const dnsSkipped: string[] = [];
  for (const entry of dnsLinks as DnsLink[]) {
    const companyId = companyByDomain.get(entry.companyDomain);
    const assetId = assetByName.get(entry.assetName);
    const pair = `${companyId}:${assetId}`;
    // Already seeded as a DNS candidate: attach the record that explains it.
    const existingDnsLink = dnsInferredLinks.get(pair);
    if (existingDnsLink && entry.detail) {
      await ctx.db.patch("links", existingDnsLink, { detail: entry.detail });
      dnsDetailed += 1;
      continue;
    }
    if (!companyId || !assetId || seenPairs.has(pair)) {
      dnsSkipped.push(`${entry.companyDomain} → ${entry.assetName}`);
      continue;
    }
    seenPairs.add(pair);
    await ctx.db.insert("links", {
      companyId,
      assetId,
      shareType: "same_vendor_only",
      source: "dns_inferred",
      detail: entry.detail,
    });
    dnsImported += 1;
  }

  const clerkIds = {} as Record<CompanyKey, Id<"users">>;
  const controllerIds = {} as Record<CompanyKey, Id<"users">>;
  const itIds = {} as Partial<Record<CompanyKey, Id<"users">>>;
  for (const [key, people] of Object.entries(USERS) as [CompanyKey, (typeof USERS)[CompanyKey]][]) {
    const domain = COMPANIES[key].domain;
    clerkIds[key] = await ctx.db.insert("users", {
      companyId: companyIds[key],
      name: people.clerk,
      role: "ap_clerk",
      email: demoEmail(people.clerk, domain),
    });
    controllerIds[key] = await ctx.db.insert("users", {
      companyId: companyIds[key],
      name: people.controller,
      role: "controller",
      email: demoEmail(people.controller, domain),
    });
    if (people.it) {
      itIds[key] = await ctx.db.insert("users", {
        companyId: companyIds[key],
        name: people.it,
        role: "it",
        email: demoEmail(people.it, domain),
      });
    }
  }
  // Response playbooks (docs/specs/response-playbook.md), set by each company's own people.
  // Cedar Ridge pre-approved pausing its shared logins (proposed by IT, confirmed by the controller);
  // Granite Peak wants one click; Harborline only wants to be told. Everyone else: notify (no row).
  for (const p of PLAYBOOKS) {
    await ctx.db.insert("responsePolicies", {
      companyId: companyIds[p.company],
      action: p.action,
      mode: p.mode,
      version: 1,
      setBy: itIds[p.company] ?? controllerIds[p.company],
      confirmedBy: p.mode === "act" ? controllerIds[p.company] : undefined,
      setAt: now - 30 * DAY_MS,
    });
  }

  const peId = await ctx.db.insert("users", {
    name: "Jordan Ames (Northpass Capital)",
    role: "pe_partner",
    email: "jordan.ames@northpasscapital.example",
  });

  // Demo notification channels, so the outbox fills during the demo with no setup. The URLs
  // are placeholders: with NOTIFY_LIVE off (the default) nothing is ever sent, rows end "simulated".
  await ctx.db.insert("notificationChannels", {
    scope: "company",
    companyId: companyIds.C,
    kind: "slack",
    label: "#summit-finance",
    url: "https://hooks.slack.com/services/T0DEMO/B0SUMMIT/sidecall-demo-only",
    events: ["alert", "hold", "escalation"],
    enabled: true,
    createdBy: controllerIds.C,
  });
  await ctx.db.insert("notificationChannels", {
    scope: "firm",
    kind: "slack",
    label: "#northpass-portfolio-risk",
    url: "https://hooks.slack.com/services/T0DEMO/B0FIRM/sidecall-demo-only",
    events: ["incident", "contained"],
    enabled: true,
    createdBy: peId,
  });

  for (const change of BANK_CHANGES) {
    await ctx.db.insert("bankDetailChanges", {
      assetId: assetIds[change.asset],
      changedAt: now - change.daysAgo * DAY_MS,
      accountLast4: change.last4,
      requestChannel: change.channel,
      seedRef: change.ref,
    });
  }

  for (const b of UNPAID_BILLS) {
    const amountCents = cents(b.dollars);
    const billId = await ctx.db.insert("bills", {
      companyId: companyIds[b.company],
      assetId: assetIds[b.asset],
      amountCents,
      dueDate: now + b.dueInHours * 60 * 60 * 1000,
      description: b.description,
    });
    await postLedgerEntry(ctx, {
      kind: "bill",
      companyId: companyIds[b.company],
      amountCents,
      date: now - DAY_MS,
      memo: `Bill booked: ${ASSETS[b.asset].vendorName}, ${b.description}`,
      billId,
    });
  }

  for (const p of PAYMENTS) {
    const amountCents = cents(p.dollars);
    const companyId = companyIds[p.company];
    const booked = now - (p.status === "paid" ? 35 : 6) * DAY_MS;
    const dueDate =
      p.status === "paid" ? now - 30 * DAY_MS : now + (p.dueInHours ?? 72) * 60 * 60 * 1000;
    const billId = await ctx.db.insert("bills", {
      companyId,
      assetId: assetIds[p.asset],
      amountCents,
      dueDate,
      description: p.description,
    });
    await postLedgerEntry(ctx, {
      kind: "bill",
      companyId,
      amountCents,
      date: booked,
      memo: `Bill booked: ${ASSETS[p.asset].vendorName}, ${p.description}`,
      billId,
    });
    const paymentId = await ctx.db.insert("payments", {
      billId,
      companyId,
      assetId: assetIds[p.asset],
      amountCents,
      accountLast4: p.last4,
      status: p.status,
      requestedBy: clerkIds[p.company],
      dueDate,
      seedRef: p.ref,
      decidedAt: p.status === "paid" ? now - 30 * DAY_MS : undefined,
    });
    if (p.status === "paid") {
      await postLedgerEntry(ctx, {
        kind: "payment",
        companyId,
        amountCents,
        date: now - 30 * DAY_MS,
        memo: `Payment: ${ASSETS[p.asset].vendorName}, ${p.description}`,
        paymentId,
        billId,
      });
    }
  }

  return {
    companies: Object.keys(COMPANIES).length,
    assets: Object.keys(ASSETS).length,
    links: LINKS.length,
    payments: PAYMENTS.length,
    bankChanges: BANK_CHANGES.length,
    dnsImported,
    dnsDetailed,
    dnsSkipped,
  };
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => await resetAll(ctx),
});

// "Reset demo" button. Wipes and reseeds, so it only works where DEMO_MODE=true is set
// on the deployment (`npx convex env set DEMO_MODE true`). Never set it on a real deployment.
export const resetDemo = mutation({
  args: { presenterKey: v.optional(v.string()) },
  returns: v.object({
    companies: v.number(),
    assets: v.number(),
    links: v.number(),
    payments: v.number(),
    bankChanges: v.number(),
    dnsImported: v.number(),
    dnsDetailed: v.number(),
    dnsSkipped: v.array(v.string()),
    continuing: v.boolean(), // true: the wipe was too big for one transaction and finishes shortly
  }),
  handler: async (ctx, args) => {
    if (env.DEMO_MODE !== "true") {
      throw new ConvexError("Demo reset is disabled on this deployment (DEMO_MODE is not true).");
    }
    await getViewer(ctx); // signed in
    if (!isPresenter(args.presenterKey)) {
      throw new ConvexError("Reset is presenter-only on this deployment: enter the presenter key on /?stage.");
    }
    return await resetAll(ctx);
  },
});

// Same code path as POST /incident, for testing without curl.
export const fireDemoIncident = internalMutation({
  args: {
    scenario: v.union(
      v.literal("brightline"),
      v.literal("ironcladCredential"),
      v.literal("ironcladMsp"),
      v.literal("armadinFinding"),
    ),
  },
  handler: async (ctx, args) => {
    return await recordIncidentImpl(ctx, SCENARIOS[args.scenario]);
  },
});
