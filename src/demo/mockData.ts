// Fake portfolio for building the UI before Adrian's seed + queries land.
// Mirrors the demo story in CLAUDE.md: a shared payroll vendor falls, B/C urgent, D advisory,
// C holds $480K to an account "updated" by email two days earlier. Totals: 3 exposed · 4,200 people · $612K held.
import type { Doc, Id, TableNames } from "../../convex/_generated/dataModel";

const id = <T extends TableNames>(raw: string) => raw as Id<T>;

const DAY = 24 * 60 * 60 * 1000;
export const INCIDENT_AT = Date.UTC(2026, 9, 24, 17, 0);

const company = (
  key: string,
  name: string,
  domain: string,
  sector: string,
  headcount: number,
  holdRuleEnabled: boolean,
): Doc<"companies"> => ({
  _id: id(key),
  _creationTime: 0,
  name,
  domain,
  sector,
  headcount,
  holdRuleEnabled,
});

export const companies: Doc<"companies">[] = [
  company(
    "co_a",
    "Tidewater Clinics",
    "tidewaterclinics.com",
    "Healthcare",
    240,
    true,
  ),
  company(
    "co_b",
    "Marlow Logistics",
    "marlowlogistics.com",
    "Logistics",
    1800,
    true,
  ),
  company(
    "co_c",
    "Corrigan Foods",
    "corriganfoods.com",
    "Food manufacturing",
    1500,
    true,
  ),
  company(
    "co_d",
    "Delta Ridge Software",
    "deltaridge.io",
    "Software",
    900,
    false,
  ),
  company(
    "co_e",
    "Everfield Labs",
    "everfieldlabs.com",
    "Life sciences",
    620,
    true,
  ),
  company(
    "co_f",
    "Fenwick Hardware",
    "fenwickhardware.com",
    "Retail",
    1100,
    true,
  ),
  company(
    "co_g",
    "Glasshouse Media",
    "glasshousemedia.com",
    "Media",
    380,
    false,
  ),
  company("co_h", "Halden Water", "haldenwater.com", "Utilities", 760, true),
];

const user = (
  key: string,
  name: string,
  role: Doc<"users">["role"],
  companyId?: string,
): Doc<"users"> => ({
  _id: id(key),
  _creationTime: 0,
  name,
  role,
  ...(companyId ? { companyId: id<"companies">(companyId) } : {}),
});

export const users: Doc<"users">[] = [
  user("u_c_clerk", "Dana Ruiz", "ap_clerk", "co_c"),
  user("u_c_ctrl", "Sam Okafor", "controller", "co_c"),
  user("u_pe", "Riley Chen", "pe_partner"),
  user("u_b_clerk", "Priya Nair", "ap_clerk", "co_b"),
  user("u_b_ctrl", "Jordan Lee", "controller", "co_b"),
  user("u_d_ctrl", "Alex Moreno", "controller", "co_d"),
];

export const assets: Doc<"assets">[] = [
  {
    _id: id("as_payroll"),
    _creationTime: 0,
    name: "Ledgerline Payroll",
    vendorName: "Ledgerline Inc.",
    kind: "payroll",
    phoneOnFile: "+1 (415) 555-0148",
  },
  {
    _id: id("as_msp"),
    _creationTime: 0,
    name: "Keystone Managed IT",
    vendorName: "Keystone IT Group",
    kind: "msp",
    phoneOnFile: "+1 (628) 555-0193",
  },
];

const link = (
  key: string,
  companyId: string,
  assetId: string,
  shareType: Doc<"links">["shareType"],
  source: Doc<"links">["source"],
): Doc<"links"> => ({
  _id: id(key),
  _creationTime: 0,
  companyId: id(companyId),
  assetId: id(assetId),
  shareType,
  source,
});

export const links: Doc<"links">[] = [
  link("ln_1", "co_a", "as_payroll", "shared_credential", "self_reported"),
  link("ln_2", "co_b", "as_payroll", "shared_admin_access", "self_reported"),
  link("ln_3", "co_c", "as_payroll", "shared_credential", "self_reported"),
  link("ln_4", "co_d", "as_payroll", "same_vendor_only", "dns_inferred"),
  link("ln_5", "co_e", "as_msp", "shared_admin_access", "self_reported"),
  link("ln_6", "co_f", "as_msp", "same_vendor_only", "self_reported"),
  link("ln_7", "co_c", "as_msp", "same_vendor_only", "dns_inferred"),
];

// Two days before the breach, by email: flagged. The MSP change months ago, by verified call: not flagged.
export const bankDetailChanges: Doc<"bankDetailChanges">[] = [
  {
    _id: id("bc_1"),
    _creationTime: 0,
    assetId: id("as_payroll"),
    changedAt: INCIDENT_AT - 2 * DAY,
    accountLast4: "9921",
    requestChannel: "email",
  },
  {
    _id: id("bc_2"),
    _creationTime: 0,
    assetId: id("as_msp"),
    changedAt: INCIDENT_AT - 140 * DAY,
    accountLast4: "3307",
    requestChannel: "verified_call",
  },
];

const payment = (
  key: string,
  companyId: string,
  amountCents: number,
  accountLast4: string,
  requestedBy: string,
): Doc<"payments"> => ({
  _id: id(key),
  _creationTime: 0,
  billId: id(`bill_${key}`),
  companyId: id(companyId),
  assetId: id("as_payroll"),
  amountCents,
  accountLast4,
  status: "pending",
  requestedBy: id(requestedBy),
});

// Before the incident: everything pending. D has holds off, so its payment stays pending afterwards.
export const pendingPayments: Doc<"payments">[] = [
  payment("pay_c", "co_c", 48_000_000, "9921", "u_c_clerk"),
  payment("pay_b", "co_b", 13_200_000, "4410", "u_b_clerk"),
  payment("pay_d", "co_d", 4_500_000, "4410", "u_d_ctrl"),
];

export const openingLedger: Doc<"ledgerEntries">[] = companies.flatMap((c) => [
  {
    _id: id(`le_open_${c._id}`),
    _creationTime: 0,
    companyId: c._id,
    date: INCIDENT_AT - 90 * DAY,
    memo: "Opening balance",
    lines: [
      { account: "cash", debitCents: 250_000_000, creditCents: 0 },
      { account: "equity", debitCents: 0, creditCents: 250_000_000 },
    ],
  },
  ...pendingPayments
    .filter((p) => p.companyId === c._id)
    .map((p): Doc<"ledgerEntries"> => ({
      _id: id(`le_bill_${p._id}`),
      _creationTime: 0,
      companyId: c._id,
      date: INCIDENT_AT - 10 * DAY,
      memo: "Bill booked: Ledgerline payroll services",
      billId: p.billId,
      lines: [
        { account: "expense", debitCents: p.amountCents, creditCents: 0 },
        {
          account: "accounts_payable",
          debitCents: 0,
          creditCents: p.amountCents,
        },
      ],
    })),
]);
