// Onboard a portfolio company from its own AP exports: a vendor master and open bills (the CSVs
// any AP system produces). Sidecall matches its vendors to the shared vendors it already tracks,
// links them, and turns open bills into pending payments to the bank accounts in the file.
// If a vendor is under an active incident, the new company is exposed and its payments are held
// on import, flagged when the file pays an account changed recently. PE partner only.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./access";
import { activeIncidentFor, holdNewPayment, recentBankChanges } from "./payments";
import { openExposure } from "./incidents";
import { demoEmail } from "./shared";
import { postLedgerEntry } from "./ledger";

const MAX_VENDORS = 200;
const MAX_BILLS = 500;

// ---- CSV ----

// RFC 4180-ish: quoted fields, doubled quotes, CRLF, a leading BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Column names seen in QuickBooks, NetSuite, Xero, Bill.com and SAP exports.
const COLUMNS = {
  vendorId: ["vendorid", "vendorno", "vendornumber", "vendorcode", "supplierid", "id"],
  vendorName: ["vendorname", "vendor", "name", "payee", "supplier", "suppliername", "company"],
  phone: ["phone", "phonenumber", "vendorphone", "contactphone", "mainphone"],
  bank: ["bankaccount", "bankaccountnumber", "accountnumber", "account", "remitaccount", "achaccount", "iban", "bankacct"],
  invoice: ["invoice", "invoiceno", "invoicenumber", "invoicenum", "billno", "billnumber", "reference", "ref", "num", "docnumber"],
  amount: ["amount", "amountdue", "openbalance", "balance", "amountremaining", "openamount", "total", "balancedue"],
  due: ["duedate", "due", "paymentdue", "datedue"],
  description: ["description", "memo", "memodescription", "terms", "notes"],
} as const;

function table(text: string, label: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ConvexError(`${label}: need a header row and at least one data row.`);
  const header = rows[0].map(key);
  const col = (names: readonly string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  return { rows: rows.slice(1), col };
}

const last4 = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

function parseAmountCents(raw: string): number | null {
  const negative = /^\s*\(.*\)\s*$/.test(raw) || raw.trim().startsWith("-");
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || negative) return null;
  return Math.round(n * 100);
}

function parseDate(raw: string): number | null {
  const t = raw.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], 17); // 5pm UTC ≈ business day in the US
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return Date.UTC(year, +m[1] - 1, +m[2], 17);
  }
  return null;
}

// "Brightline Payroll, Inc." → "brightline payroll"
const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|plc|gmbh|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type ParsedVendor = { ref: string; name: string; phone: string | null; bankLast4: string | null };
type ParsedBill = { vendorRef: string; invoice: string; amountCents: number; dueDate: number; description: string };

function parseFiles(vendorsCsv: string, billsCsv: string) {
  const problems: string[] = [];
  const vt = table(vendorsCsv, "Vendor master");
  const vName = vt.col(COLUMNS.vendorName);
  if (vName === -1) throw new ConvexError("Vendor master: no vendor name column (e.g. \"Vendor Name\").");
  const vId = vt.col(COLUMNS.vendorId);
  const vPhone = vt.col(COLUMNS.phone);
  const vBank = vt.col(COLUMNS.bank);
  if (vt.rows.length > MAX_VENDORS) throw new ConvexError(`Vendor master: at most ${MAX_VENDORS} vendors.`);
  const vendors: ParsedVendor[] = [];
  for (const [i, r] of vt.rows.entries()) {
    const name = (r[vName] ?? "").trim();
    if (!name) {
      problems.push(`Vendor master row ${i + 2}: no vendor name, skipped.`);
      continue;
    }
    vendors.push({
      ref: vId !== -1 && r[vId]?.trim() ? r[vId].trim() : name,
      name,
      phone: vPhone !== -1 ? r[vPhone]?.trim() || null : null,
      bankLast4: vBank !== -1 ? last4(r[vBank] ?? "") : null,
    });
  }

  const refs = new Map<string, ParsedVendor>();
  for (const vendor of vendors) {
    for (const ref of [vendor.ref, vendor.name]) {
      if (refs.has(ref) && refs.get(ref) !== vendor) throw new ConvexError(`Ambiguous vendor reference "${ref}"; resolve duplicate vendor rows before importing.`);
      refs.set(ref, vendor);
    }
  }

  const bt = table(billsCsv, "Open bills");
  const bVendor = bt.col(COLUMNS.vendorId) !== -1 ? bt.col(COLUMNS.vendorId) : bt.col(COLUMNS.vendorName);
  const bAmount = bt.col(COLUMNS.amount);
  const bDue = bt.col(COLUMNS.due);
  if (bVendor === -1 || bAmount === -1 || bDue === -1) {
    throw new ConvexError("Open bills: need vendor, amount and due date columns (e.g. \"Vendor\", \"Amount Due\", \"Due Date\").");
  }
  if (bt.rows.length > MAX_BILLS) throw new ConvexError(`Open bills: at most ${MAX_BILLS} bills.`);
  const bInvoice = bt.col(COLUMNS.invoice);
  const bDesc = bt.col(COLUMNS.description);
  const vendorRefs = new Set(vendors.flatMap((x) => [x.ref, x.name]));
  const bills: ParsedBill[] = [];
  for (const [i, r] of bt.rows.entries()) {
    const vendorRef = (r[bVendor] ?? "").trim();
    const amountCents = parseAmountCents(r[bAmount] ?? "");
    const dueDate = parseDate(r[bDue] ?? "");
    if (!vendorRefs.has(vendorRef)) problems.push(`Open bills row ${i + 2}: vendor "${vendorRef}" isn't in the vendor master, skipped.`);
    else if (amountCents === null) problems.push(`Open bills row ${i + 2}: amount "${r[bAmount]}" isn't a positive number, skipped.`);
    else if (dueDate === null) problems.push(`Open bills row ${i + 2}: due date "${r[bDue]}" isn't YYYY-MM-DD or MM/DD/YYYY, skipped.`);
    else {
      const invoice = bInvoice !== -1 ? (r[bInvoice] ?? "").trim() : "";
      const description = bDesc !== -1 ? (r[bDesc] ?? "").trim() : "";
      bills.push({ vendorRef, invoice, amountCents, dueDate, description: description || (invoice ? `Invoice ${invoice}` : "Open bill") });
    }
  }
  return { vendors, bills, problems };
}

// ---- Matching against the vendors Sidecall already tracks ----

async function matchVendors(ctx: QueryCtx, vendors: ParsedVendor[]) {
  const assets = await ctx.db.query("assets").take(200);
  const candidatesFor = vendors.map((vendor) => {
    const n = normalizeName(vendor.name);
    return assets.filter((a) => {
      const names = [normalizeName(a.vendorName), normalizeName(a.name)];
      return n.length > 0 && names.some((x) => x === n);
    });
  });
  // Bank history only for assets some vendor actually matched, fetched in parallel.
  const matchedIds = [...new Set(candidatesFor.flat().map((a) => a._id))];
  const bankHistory = new Map<Id<"assets">, Doc<"bankDetailChanges">[]>(
    await Promise.all(
      matchedIds.map(
        async (id) =>
          [
            id,
            await ctx.db
              .query("bankDetailChanges")
              .withIndex("by_assetId_and_changedAt", (q) => q.eq("assetId", id))
              .order("desc")
              .take(20),
          ] as const,
      ),
    ),
  );
  return vendors.map((vendor, i) => {
    const candidates = candidatesFor[i];
    // A credential asset is not a payee. Resolve a multi-asset vendor only when exactly one
    // matching asset has bank records; never guess between two possible payees.
    const payees = candidates.filter((a) => (bankHistory.get(a._id)?.length ?? 0) > 0);
    const resolved = payees.length === 1 ? payees : candidates;
    if (resolved.length > 1) {
      throw new ConvexError(`Ambiguous vendor "${vendor.name}": multiple tracked assets match; resolve the vendor master before importing.`);
    }
    const asset = resolved[0] ?? null;
    const history = asset ? (bankHistory.get(asset._id) ?? []) : [];
    const verified = history.find((c) => c.requestChannel === "verified_call");
    const fileChange = vendor.bankLast4 ? history.find((c) => c.accountLast4 === vendor.bankLast4) : undefined;
    let warning: string | null = null;
    if (asset && vendor.bankLast4 && verified && vendor.bankLast4 !== verified.accountLast4) {
      warning = fileChange
        ? `Your AP system pays ${asset.vendorName} at ••${vendor.bankLast4}, set by ${fileChange.requestChannel.replace("_", " ")} on ${new Date(fileChange.changedAt).toISOString().slice(0, 10)}. The last account confirmed by phone is ••${verified.accountLast4}.`
        : `Your AP system pays ${asset.vendorName} at ••${vendor.bankLast4}; the last account confirmed by phone is ••${verified.accountLast4}.`;
    }
    return { vendor, asset, warning, latestChange: history[0] ?? null };
  });
}

// ---- Preview (writes nothing) ----

const filesArgs = { vendorsCsv: v.string(), billsCsv: v.string() };

export const previewApImport = query({
  args: filesArgs,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) return null;
    const { vendors, bills, problems } = parseFiles(args.vendorsCsv, args.billsCsv);
    const matches = await matchVendors(ctx, vendors);
    return {
      vendors: matches.map((m) => ({
        name: m.vendor.name,
        bankLast4: m.vendor.bankLast4,
        matchedTo: m.asset ? m.asset.vendorName : null,
        warning: m.warning,
        openBills: bills.filter((b) => b.vendorRef === m.vendor.ref || b.vendorRef === m.vendor.name).length,
      })),
      bills: bills.length,
      totalCents: bills.reduce((s, b) => s + b.amountCents, 0),
      problems,
    };
  },
});

// ---- Import ----


export const importPortfolioCompany = mutation({
  args: {
    ...filesArgs,
    company: v.object({
      name: v.string(),
      domain: v.string(),
      sector: v.string(),
      headcount: v.number(),
      apClerkName: v.string(),
      controllerName: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) throw new ConvexError("Only the PE firm onboards portfolio companies.");
    const c = args.company;
    const name = c.name.trim();
    const domain = c.domain.trim().toLowerCase();
    if (!name || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new ConvexError("Give the company a name and a domain like newco.example.");
    if (!Number.isInteger(c.headcount) || c.headcount < 1) throw new ConvexError("Headcount must be a whole number above 0.");
    if (!c.apClerkName.trim() || !c.controllerName.trim() || c.apClerkName.trim() === c.controllerName.trim()) {
      throw new ConvexError("Name two different people: the AP clerk who requests payments and the controller who approves them.");
    }
    const clash = await ctx.db
      .query("companies")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique();
    if (clash) throw new ConvexError(`${domain} is already in the portfolio.`);

    const { vendors, bills, problems } = parseFiles(args.vendorsCsv, args.billsCsv);
    if (bills.length === 0) throw new ConvexError(`No importable bills. ${problems.slice(0, 3).join(" ")}`);
    const matches = await matchVendors(ctx, vendors);
    const now = Date.now();

    // Company, the two people, opening balance.
    const companyId = await ctx.db.insert("companies", {
      name,
      domain,
      sector: c.sector.trim() || "Unspecified",
      headcount: c.headcount,
      holdRuleEnabled: true,
    });
    const clerkEmail = demoEmail(c.apClerkName, domain);
    const controllerEmail = demoEmail(c.controllerName, domain);
    const clerkId = await ctx.db.insert("users", { companyId, name: c.apClerkName.trim(), role: "ap_clerk", email: clerkEmail });
    await ctx.db.insert("users", { companyId, name: c.controllerName.trim(), role: "controller", email: controllerEmail });
    await postLedgerEntry(ctx, {
      kind: "opening",
      companyId,
      amountCents: 200_000_000,
      date: now,
      memo: "Opening balance (onboarded from AP export)",
    });

    // Vendors → assets + links. Unknown vendors become new tracked assets.
    const assetByRef = new Map<string, Doc<"assets">>();
    const linkByAsset = new Map<Id<"assets">, Doc<"links">>();
    let newVendors = 0;
    for (const m of matches) {
      let asset = m.asset;
      if (!asset) {
        const assetId = await ctx.db.insert("assets", {
          name: m.vendor.name,
          vendorName: m.vendor.name,
          kind: "other",
          phoneOnFile: m.vendor.phone ?? "not on file",
        });
        asset = (await ctx.db.get("assets", assetId))!;
        newVendors += 1;
      }
      assetByRef.set(m.vendor.ref, asset);
      assetByRef.set(m.vendor.name, asset);
      if (!linkByAsset.has(asset._id)) {
        const linkId = await ctx.db.insert("links", {
          companyId,
          assetId: asset._id,
          shareType: "same_vendor_only",
          source: "self_reported",
          detail: `From ${name}'s AP vendor master ("${m.vendor.name}")`,
        });
        linkByAsset.set(asset._id, (await ctx.db.get("links", linkId))!);
      }
    }
    const bankByRef = new Map(vendors.flatMap((x) => [[x.ref, x.bankLast4] as const, [x.name, x.bankLast4] as const]));

    // Bills → booked + pending payments; held at once when the vendor is under an active incident.
    let held = 0;
    let flagged = 0;
    let heldCents = 0;
    const heldByIncident = new Map<
      Id<"incidents">,
      { asset: Doc<"assets">; finding: Doc<"incidents">["finding"]; count: number; cents: number; flagged: number }
    >();
    // Per-vendor lookups, computed once rather than for every bill.
    const latestByAsset = new Map(matches.flatMap((m) => (m.asset && m.latestChange ? [[m.asset._id, m.latestChange] as const] : [])));
    const incidents = new Map<Id<"assets">, Doc<"incidents"> | null>();
    const incidentFor = async (assetId: Id<"assets">) => {
      if (!incidents.has(assetId)) incidents.set(assetId, await activeIncidentFor(ctx, assetId, now));
      return incidents.get(assetId)!;
    };
    const changes = new Map<Id<"assets">, Doc<"bankDetailChanges">[]>();
    const changesFor = async (assetId: Id<"assets">, incident: Doc<"incidents">) => {
      if (!changes.has(assetId)) changes.set(assetId, await recentBankChanges(ctx, assetId, incident.createdAt));
      return changes.get(assetId)!;
    };
    for (const b of bills) {
      const asset = assetByRef.get(b.vendorRef)!;
      const billId = await ctx.db.insert("bills", {
        companyId,
        assetId: asset._id,
        amountCents: b.amountCents,
        dueDate: b.dueDate,
        description: b.description,
      });
      await postLedgerEntry(ctx, {
        kind: "bill",
        companyId,
        amountCents: b.amountCents,
        date: now,
        memo: `Bill booked: ${asset.vendorName}, ${b.description}`,
        billId,
      });
      const paymentId = await ctx.db.insert("payments", {
        billId,
        companyId,
        assetId: asset._id,
        amountCents: b.amountCents,
        accountLast4: bankByRef.get(b.vendorRef) ?? latestByAsset.get(asset._id)?.accountLast4 ?? "0000",
        status: "pending",
        requestedBy: clerkId,
        dueDate: b.dueDate,
      });

      const incident = await incidentFor(asset._id);
      if (!incident) continue;
      const isFlagged = await holdNewPayment(ctx, {
        payment: (await ctx.db.get("payments", paymentId))!,
        incident,
        asset,
        changes: await changesFor(asset._id, incident),
        at: now,
        rule: "hold_payments_imported_during_incident",
        reason: `Imported while ${asset.vendorName} is under an active security incident. Payment held until verified.`,
      });
      held += 1;
      heldCents += b.amountCents;
      if (isFlagged) flagged += 1;
      const s = heldByIncident.get(incident._id) ?? { asset, finding: incident.finding, count: 0, cents: 0, flagged: 0 };
      s.count += 1;
      s.cents += b.amountCents;
      if (isFlagged) s.flagged += 1;
      heldByIncident.set(incident._id, s);
    }

    // The new company is now exposed to each active incident on a vendor it pays.
    const exposedTo: string[] = [];
    for (const [incidentId, s] of heldByIncident) {
      await openExposure(ctx, {
        incidentId,
        link: linkByAsset.get(s.asset._id)!,
        asset: s.asset,
        held: s,
        finding: s.finding,
        ready: true,
      });
      exposedTo.push(s.asset.vendorName);
    }

    await ctx.db.insert("auditLog", {
      at: now,
      actor: viewer.user._id,
      action: "import",
      companyId,
      rule: "ap_import",
      reason: `Onboarded ${name} from its AP export: ${vendors.length} vendors (${vendors.length - newVendors} already tracked), ${bills.length} open bills, ${held} held on import.`,
    });
    return {
      companyId,
      vendors: matches.map((m) => ({ name: m.vendor.name, matchedTo: m.asset?.vendorName ?? null, warning: m.warning })),
      newVendors,
      bills: bills.length,
      totalCents: bills.reduce((s, b) => s + b.amountCents, 0),
      held,
      flagged,
      heldCents,
      exposedTo,
      problems,
      logins: [
        { name: c.apClerkName.trim(), role: "ap_clerk" as const, email: clerkEmail },
        { name: c.controllerName.trim(), role: "controller" as const, email: controllerEmail },
      ],
    };
  },
});
