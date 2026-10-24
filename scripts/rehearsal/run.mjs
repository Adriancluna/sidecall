#!/usr/bin/env node
// Dress rehearsal: plays the whole demo against a live deployment, the way people would
// (real sign-ins, the real webhook, real mutations), and checks every number on the way.
// Resets before and after, so it leaves the deployment clean. Needs DEMO_MODE=true there.
//
//   node scripts/rehearsal/run.mjs                       # your dev deployment (.env.local)
//   node scripts/rehearsal/run.mjs --url https://<prod>.convex.cloud   # e.g. production, before judging
//
// Exit code 0 = every beat passed.
import { readFileSync } from "node:fs";

const PASSWORD = "sidecall-demo";
const EMAIL = {
  jamie: "jamie.chen@summithomehealth.example", // Summit AP clerk, requested the $480K
  rosa: "rosa.alvarez@summithomehealth.example", // Summit controller
  kwame: "kwame.mensah@summithomehealth.example", // Summit IT
  jordan: "jordan.ames@northpasscapital.example", // PE partner
};
const BRIGHTLINE = {
  externalId: "demo-brightline-001",
  assetName: "Brightline Payroll",
  reportedByDomain: "pinecreststaffing.example",
};

function deploymentUrl() {
  const i = process.argv.indexOf("--url");
  if (i !== -1) return process.argv[i + 1];
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const match = env.match(/^VITE_CONVEX_URL=(\S+)/m);
  if (!match) throw new Error("No VITE_CONVEX_URL in .env.local; pass --url");
  return match[1];
}

const cloud = deploymentUrl().replace(/\/$/, "");
const site = cloud.replace(/\.convex\.cloud$/, ".convex.site");

async function call(kind, path, args = {}, token) {
  const res = await fetch(`${cloud}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await res.json();
  if (body.status !== "success") throw new Error(`${path}: ${body.errorMessage ?? JSON.stringify(body)}`);
  return body.value;
}
const query = (path, args, token) => call("query", path, args, token);
const mutation = (path, args, token) => call("mutation", path, args, token);

// Same as the sign-in quick-pick: sign in, or create the password account on first use.
async function signIn(email) {
  for (const flow of ["signIn", "signUp"]) {
    try {
      const value = await call("action", "auth:signIn", {
        provider: "password",
        params: { email, password: PASSWORD, flow },
      });
      if (value?.tokens?.token) return value.tokens.token;
    } catch {
      // try the other flow
    }
  }
  throw new Error(`could not sign in as ${email}`);
}

async function postIncident() {
  const res = await fetch(`${site}/incident`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(BRIGHTLINE),
  });
  return { status: res.status, body: await res.json() };
}

let failures = 0;
function check(beat, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${beat}${detail ? `  (${detail})` : ""}`);
}
const dollars = (cents) => `$${(cents / 100).toLocaleString("en-US")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reset() {
  await mutation("seed:resetDemo", {}, await signIn(EMAIL.jamie));
}

console.log(`Rehearsal against ${cloud}\n`);

await reset();
let jamie = await signIn(EMAIL.jamie);
const rosa = await signIn(EMAIL.rosa);
const kwame = await signIn(EMAIL.kwame);
const jordan = await signIn(EMAIL.jordan);
check("0 reset + four people signed in", true);

// 1. Fire the incident through the real webhook; replay it.
const fired = await postIncident();
check("1 Fire incident (webhook)", fired.status === 200 && fired.body.duplicate === false, `HTTP ${fired.status}`);
const replay = await postIncident();
check("  Replay writes nothing", replay.body.duplicate === true && replay.body.incidentId === fired.body.incidentId);
const incidentId = fired.body.incidentId;

// 2. The money moment, as Jamie.
const [exposure] = await query("blastRadius:getMyExposures", {}, jamie);
check("2 Summit alerted, urgent", exposure?.urgency === "urgent", exposure?.urgency);
let held = await query("payments:getHeldPayments", {}, jamie);
const big = held.find((r) => r.payment.amountCents === 48_000_000);
check("  $480K held", big?.payment.status === "held");
check(
  "  flag ••2208 → ••7731",
  big?.bankChange?.lastVerifiedAccountLast4 === "2208" && big?.bankChange?.accountLast4 === "7731",
  big?.bankChange ? `${big.bankChange.daysBeforeIncident} days before, ${big.bankChange.requestChannel}` : "no flag",
);
const alerts = await query("alerts:getMyAlerts", {}, jamie);
check("  escalated to Rosa (knows when to ask)", alerts.some((a) => a.kind === "escalation" && a.body.includes("Rosa Alvarez")));
check("  alert never names the reporter", alerts.every((a) => !a.body.includes("Pinecrest")));

await sleep(1500); // let the AI writers and the notification dispatch finish
const outbox = await query("notifications:listOutbox", {}, rosa);
const kinds = new Set(outbox.map((r) => r.event));
check(
  "  Summit's Slack outbox: alert + hold + escalation",
  ["alert", "hold", "escalation"].every((e) => kinds.has(e)) && outbox.every((r) => r.status === "simulated" || r.status === "sent"),
  outbox.map((r) => `${r.event}:${r.status}`).join(", "),
);

// 3. Segregation of duties.
const selfRelease = await mutation("payments:releasePayment", { paymentId: big.payment._id, verificationNote: "Looks fine to me, please pay" }, jamie);
check("3 Jamie can't release her own request", selfRelease.ok === false, selfRelease.reason);

// 4. Two people acknowledge at once: exactly one wins.
const acks = await Promise.all([
  mutation("incidents:acknowledgeExposure", { exposureId: exposure._id }, rosa),
  mutation("incidents:acknowledgeExposure", { exposureId: exposure._id }, kwame),
]);
check("4 Acknowledge race: exactly one wins", acks.filter((a) => a.ok).length === 1, JSON.stringify(acks.map((a) => a.ok)));

// 5. Rosa verifies by phone and releases; cash moves only now.
const ledgerBefore = (await query("payments:getLedger", {}, rosa)).balances;
const vague = await mutation("payments:releasePayment", { paymentId: big.payment._id, verificationNote: "480000" }, rosa);
check("5 A vague note is refused", vague.ok === false);
const release = await mutation(
  "payments:releasePayment",
  { paymentId: big.payment._id, verificationNote: "Called Brightline at +1 415 555-0142, they confirmed account 7731" },
  rosa,
);
check("  Rosa releases after verifying", release.ok === true, release.reason);
const ledgerAfter = (await query("payments:getLedger", {}, rosa)).balances;
check("  cash moved by exactly $480K", ledgerBefore.cash - ledgerAfter.cash === 48_000_000, `${dollars(ledgerBefore.cash)} → ${dollars(ledgerAfter.cash)}`);

// 6. A new request to the breached vendor is held on creation.
const bills = await query("payments:getMyBills", {}, jamie);
const unpaid = bills.find((b) => b.payment === null);
const requested = unpaid ? await mutation("payments:requestPayment", { billId: unpaid.bill._id }, jamie) : null;
check("6 New $38K request held + flagged", requested?.ok === true && requested.held && requested.flagged);

// 7. The PE firm's view.
const blast = await query("blastRadius:getBlastRadius", { incidentId }, jordan);
const t = blast?.totals;
check(
  "7 PE headline",
  t?.companiesExposed === 3 && t?.peopleExposed === 4200 && t?.heldCents === 17_000_000,
  t ? `${t.companiesExposed} companies · ${t.peopleExposed.toLocaleString()} people · ${dollars(t.heldCents)} held` : "no map",
);
check("  reporter named only here", blast?.incident.reportedByName === "Pinecrest Staffing");
check("  company can't see the map", (await query("blastRadius:getBlastRadius", { incidentId }, jamie)) === null);
await sleep(1500); // let the AI writers finish
const timeline = await query("blastRadius:getIncidentTimeline", { incidentId }, jordan);
check(
  "  timeline: held in the report's transaction",
  timeline?.stats.holdsInReportTransaction === true,
  timeline?.stats.msToFirstAlert !== null ? `alerts in ${timeline.stats.msToFirstAlert} ms` : "alerts not written yet",
);
const letter = (await query("alerts:getIncidentAlerts", { incidentId }, jordan)).find((a) => a.kind === "vendor_letter");
check("  vendor letter written", letter?.status === "ready");
const firmOutbox = await query("notifications:listOutbox", { incidentId }, jordan);
check("  firm Slack got the headline", firmOutbox.some((r) => r.event === "incident"));

// 7b. Onboard a new acquisition from its own AP export, mid-incident.
const sample = (f) => readFileSync(new URL(`../../data/samples/${f}`, import.meta.url), "utf8");
const imported = await mutation(
  "imports:importPortfolioCompany",
  {
    vendorsCsv: sample("lakeside-vendor-master.csv"),
    billsCsv: sample("lakeside-open-bills.csv"),
    company: {
      name: "Lakeside Orthopedics",
      domain: "lakesideortho.example",
      sector: "Healthcare",
      headcount: 450,
      apClerkName: "Morgan Ellis",
      controllerName: "Daniel Okoro",
    },
  },
  jordan,
);
check(
  "7b AP import: new company's Brightline payments held + flagged on import",
  imported.held === 2 && imported.flagged === 2,
  `${imported.bills} bills, ${imported.held} held, ${imported.newVendors} new vendors`,
);
const afterImport = (await query("blastRadius:getBlastRadius", { incidentId }, jordan)).totals;
check("  headline now includes it", afterImport.companiesExposed === 4, `${afterImport.companiesExposed} companies · ${afterImport.peopleExposed.toLocaleString()} people`);

// 8. Containment ends it; existing holds stay.
const contained = await mutation(
  "incidents:containIncident",
  { incidentId, note: "Brightline rotated every shared credential; confirmed by phone at the number on file" },
  jordan,
);
check("8 PE marks contained", contained.ok === true, contained.reason);
held = await query("payments:getHeldPayments", { incidentId }, jordan);
check("  earlier holds still held", held.filter((r) => r.payment.status === "held").length === 6);

await reset();
jamie = null;
console.log(`\n${failures === 0 ? "PASS: every beat works. Deployment reset to a clean slate." : `FAIL: ${failures} beat(s) failed. Deployment reset.`}`);
process.exit(failures === 0 ? 0 : 1);
