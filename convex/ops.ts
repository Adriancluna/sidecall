// Pre-stage checks: is this deployment ready to run the demo? Read-only.
//   npx convex run ops:demoReadiness            (dev)
//   npx convex run ops:demoReadiness --prod     (before going on stage)
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { SCENARIOS } from "./seed";
import { DAY_MS, MAX_FANOUT } from "./shared";


type Check = { name: string; ok: boolean; detail: string };

export const readinessChecks = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const checks: Check[] = [];
    const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

    add(
      "DEMO_MODE",
      env.DEMO_MODE === "true",
      env.DEMO_MODE === "true" ? "on: Reset and the stage buttons work" : "off: run `npx convex env set DEMO_MODE true`",
    );

    const companies = await ctx.db.query("companies").take(100);
    const users = await ctx.db.query("users").take(200);
    add("Seed data", companies.length === 8 && users.length === 21, `${companies.length} companies, ${users.length} users (want 8 and 21)`);

    // The money moment: the $480K must still be pending (not yet fired), or Reset first.
    const summit = companies.find((c) => c.name === "Summit Home Health");
    const summitPayments = summit
      ? await ctx.db
          .query("payments")
          .withIndex("by_companyId_and_status", (q) => q.eq("companyId", summit._id))
          .take(50)
      : [];
    const big = summitPayments.find((p) => p.seedRef === "pay_C_brightline_480k");
    add(
      "$480K payment ready",
      big?.status === "pending",
      big ? `status ${big.status}${big.status === "pending" ? "" : ": press Reset on /?stage before the demo"}` : "missing: reseed",
    );
    add(
      "Escalation will show",
      big?.dueDate !== undefined && big.dueDate - now > 0 && big.dueDate - now <= DAY_MS,
      big?.dueDate
        ? `$480K due in ${((big.dueDate - now) / (60 * 60 * 1000)).toFixed(1)}h (needs 0–24h; Reset refreshes it)`
        : "no due date: Reset to reseed",
    );

    // "Bank details changed 2 days before the breach" only reads right shortly after seeding.
    const changes = await ctx.db.query("bankDetailChanges").take(100);
    const emailChange = changes.find((c) => c.seedRef === "bc_brightline_7731_email_change");
    const ageDays = emailChange ? (now - emailChange.changedAt) / DAY_MS : null;
    add(
      "Bank-change story fresh",
      ageDays !== null && ageDays < 3,
      ageDays !== null ? `7731 changed ${ageDays.toFixed(1)} days ago (story says 2; Reset if ≥ 3)` : "missing: reseed",
    );

    const incidents = await ctx.db.query("incidents").take(20);
    add(
      "No incident yet",
      incidents.length === 0,
      incidents.length === 0 ? "clean slate" : `${incidents.length} incident(s) already fired: Reset for a clean run`,
    );

    // Every ledger entry must balance (double-entry).
    let unbalanced = 0;
    for await (const entry of ctx.db.query("ledgerEntries")) {
      const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
      const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
      if (debits !== credits) unbalanced += 1;
    }
    add("Ledger balances", unbalanced === 0, unbalanced === 0 ? "every entry balances" : `${unbalanced} unbalanced entries`);

    // If an incident was fired, its AI-written alerts should all be ready.
    let pending = 0;
    for (const incident of incidents) {
      for (const kind of ["company_alert", "vendor_letter", "hold_notice"] as const) {
        const rows = await ctx.db
          .query("alerts")
          .withIndex("by_incidentId_and_kind", (q) => q.eq("incidentId", incident._id).eq("kind", kind))
          .take(200);
        pending += rows.filter((a) => a.status === "pending").length;
      }
    }
    add("AI alerts written", pending === 0, pending === 0 ? "none pending" : `${pending} still pending`);

    add(
      "Demo scenarios",
      true,
      Object.values(SCENARIOS)
        .map((s) => `${s.externalId} → ${s.assetName}`)
        .join("; "),
    );

    const blocking = checks.filter((c) => !c.ok && c.name !== "No incident yet");
    return { ready: blocking.length === 0, checks };
  },
});

export const demoReadiness = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ready: boolean; checks: Check[] }> => {
    return await ctx.runQuery(internal.ops.readinessChecks, { now: Date.now() });
  },
});

// Scale benchmark (dev and tests only): adds `count` extra portfolio companies, each sharing a
// credential with Brightline and with one pending $10K payment to it. Then
//   npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'
// shows one report fanning out to every one of them in a single transaction.
// Refuses unless DEMO_MODE=true; Reset or seed:run removes the extra companies.
export const addScalePortfolio = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    if (env.DEMO_MODE !== "true") throw new ConvexError("Scale benchmark only runs where DEMO_MODE=true.");
    const max = MAX_FANOUT - 50; // leave room for the seed's own links to Brightline
    if (count < 1 || count > max) throw new ConvexError(`count must be 1–${max} (fan-out reads up to ${MAX_FANOUT} links).`);
    const brightline = await ctx.db
      .query("assets")
      .withIndex("by_name", (q) => q.eq("name", "Brightline Payroll"))
      .first();
    if (!brightline) throw new ConvexError("Seed first: npx convex run seed:run");
    const [latest] = await ctx.db
      .query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", (q) => q.eq("assetId", brightline._id))
      .order("asc")
      .take(1); // the oldest, verified account: these payments are held but not flagged

    const now = Date.now();
    for (let i = 1; i <= count; i++) {
      const companyId = await ctx.db.insert("companies", {
        name: `Scale Portfolio Co ${i}`,
        domain: `scale-${i}.example`,
        sector: "Benchmark",
        headcount: 100,
        holdRuleEnabled: true,
      });
      const clerk = await ctx.db.insert("users", { companyId, name: `Scale Clerk ${i}`, role: "ap_clerk" });
      await ctx.db.insert("links", {
        companyId,
        assetId: brightline._id,
        shareType: "shared_credential",
        source: "self_reported",
      });
      const dueDate = now + 72 * 60 * 60 * 1000;
      const billId = await ctx.db.insert("bills", {
        companyId,
        assetId: brightline._id,
        amountCents: 1_000_000,
        dueDate,
        description: "Benchmark payroll run",
      });
      await ctx.db.insert("payments", {
        billId,
        companyId,
        assetId: brightline._id,
        amountCents: 1_000_000,
        accountLast4: latest?.accountLast4 ?? "0000",
        status: "pending",
        requestedBy: clerk,
        dueDate,
      });
    }
    return { added: count };
  },
});
