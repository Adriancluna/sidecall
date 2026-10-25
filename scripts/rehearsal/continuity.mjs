#!/usr/bin/env node
// Preserves receiver history; uses only previously unused Cedar Ridge purchase fixtures.
import { createTransport, runtimeEnv, optionsFor } from '../release/rehearse.mjs';
import { redact, requireProof } from '../release/core.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const options = optionsFor(process.argv.slice(2)), env = runtimeEnv();
requireProof(process.argv.includes('--report') && !existsSync(options.report), 'Choose a new report; preserve earlier evidence');
const t = createTransport({ options, env }), exec = promisify(execFile);
const tokens = [], secrets = [env.PRESENTER_KEY], checks = [], cleanup = [];
let source, incident, grant, firm, controller, clerk, failure;
const report = { startedAt: new Date().toISOString(), deployment: options.deployment, sourceCommit: await t.commit(),
  scope: 'Authenticated synthetic observation flood and concurrent demo-ledger purchases; no reset or external payment', checks, cleanup };
const q = (path, args, token) => t.call('query', path, args, token);
const m = (path, args, token) => t.call('mutation', path, args, token);
const check = (name, value, evidence) => { checks.push({ name, passed: !!value, evidence }); requireProof(value, name); console.log('PASS', name); };
async function login(email) {
  for (const flow of ['signIn', 'signUp']) {
    try {
      const a = await t.call('action', 'auth:signIn', { provider: 'password', params: { email, password: 'sidecall-demo', flow } });
      if (!a.tokens?.token) continue;
      tokens.push(a.tokens.token); secrets.push(a.tokens.token, a.tokens.refreshToken); return a.tokens.token;
    } catch { /* Same first-use demo sign-up as the site's seeded role picker. */ }
  }
  throw Error('Synthetic demo sign-in failed');
}
async function op(path, args) {
  t.guard(); let out;
  try { out = (await exec('npx', ['--no-install', 'convex', 'run', path, JSON.stringify(args), '--deployment-name', options.deployment], { timeout: 30000 })).stdout; }
  catch { throw Error('Operator request failed; private output withheld'); }
  return out.trim() ? JSON.parse(out) : null;
}
async function post(token, payload) {
  t.guard();
  const r = await fetch(`https://${options.deployment}.convex.site/incident`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  return { status: r.status, body: await r.json() };
}
try {
  const flags = await t.flags(); requireProof(flags.demoMode && !flags.aiLive, 'Owned demo with background AI off required');
  controller = await login('elena.ruiz@cedarridge.example'); clerk = await login('tom.becker@cedarridge.example'); firm = await login('jordan.ames@northpasscapital.example');
  requireProof((await q('purchases:overview', {}, controller)).mandates.length === 0, 'No existing Cedar purchase approval may be superseded');
  requireProof((await m('purchases:loadSamples', { presenterKey: env.PRESENTER_KEY }, controller)).created, 'Fresh Cedar samples required; no existing records changed');
  const bills = (await q('payments:getMyBills', {}, clerk)).filter(r => r.vendorName === 'Northstar Office Supplies (demo)');
  requireProof(bills.length === 3 && bills.every(r => !r.payment), 'Three unused synthetic bills required');
  const company = (await q('access:me', {}, clerk)).companyId;
  grant = await m('purchases:approve', { billIds: bills.map(r => r.bill._id), budgetCents: 30000, perPurchaseCents: 25000, expiresAt: Date.now() + 3600000 }, controller);
  source = await op('detectors:mint', { name: 'Pegasus full rehearsal observation', assetNames: [`Office supplies demo · ${company}`], reporterDomains: ['pinecreststaffing.example'], mode: 'observe', expiresAt: Date.now() + 1800000 });
  secrets.push(source.token);
  const payload = { externalId: `continuity-${randomUUID()}`, assetName: `Office supplies demo · ${company}`, reportedByDomain: 'pinecreststaffing.example', assessment: 'confirmed', summary: 'Synthetic private reporter detail', evidenceRefs: ['synthetic:full-rehearsal'] };
  check('Out-of-scope detector report refused before effects', (await post(source.token, { ...payload, assetName: 'Ironclad shared admin account' })).status === 403);
  const first = await post(source.token, payload); requireProof(first.status === 200, 'Observation report failed'); incident = first.body.incidentId;
  const original = await q('responseEvidence:getRecord', { incidentId: incident }, firm);
  check('Observation credential cannot escalate itself into a hold or action', first.body.assessment === 'observation' && original.incident.responseClass === 'observation' && original.payments.length === 0 && original.steps.length === 0);
  const repeated = await Promise.all(Array.from({ length: 5 }, (_, i) => post(source.token, { ...payload, externalId: `${payload.externalId}-${i}` })));
  const flooded = await q('responseEvidence:getRecord', { incidentId: incident }, firm);
  check('Repeated small attacks merge without restarting review or actions', repeated.every(r => r.status === 200 && r.body.correlated && r.body.incidentId === incident) && flooded.reports.length === 6 && flooded.incident.reviewDueAt === original.incident.reviewDueAt && flooded.steps.length === 0 && flooded.payments.length === 0, { reports: flooded.reports.length, incidentId: incident });
  check('AP requester cannot promote noise to a confirmed response', !(await m('incidents:reviewReport', { incidentId: incident, decision: 'confirm', note: 'Synthetic unauthorized escalation challenge; no genuine compromise.' }, clerk)).ok);
  const baseline = await q('payments:getLedger', {}, controller);
  const racers = bills.filter(r => [18000, 21000].includes(r.bill.amountCents)), requestIds = racers.map(() => `continuity-${randomUUID()}`);
  const results = await Promise.all(racers.map((r, i) => m('payments:requestPayment', { billId: r.bill._id, requestId: requestIds[i] }, clerk)));
  const winner = results.findIndex(r => r.ok && r.automatic); requireProof(winner >= 0, 'No purchase continued');
  const ledger = await q('payments:getLedger', {}, controller);
  check('Purchasing continues during noise without concurrent overspending', results.filter(r => r.ok && r.automatic).length === 1 && results.filter(r => r.ok && !r.automatic && !r.held).length === 1 && baseline.balances.cash - ledger.balances.cash === racers[winner].bill.amountCents, { results, cashDebitCents: baseline.balances.cash - ledger.balances.cash, budgetCents: 30000 });
  const exact = await Promise.all(Array.from({ length: 20 }, () => m('payments:requestPayment', { billId: racers[winner].bill._id, requestId: requestIds[winner] }, clerk)));
  check('Twenty exact retries preserve one receipt and unchanged ledger', exact.every(r => r.ok && r.receiptId === results[winner].receiptId && r.paymentId === results[winner].paymentId) && JSON.stringify(ledger) === JSON.stringify(await q('payments:getLedger', {}, controller)));
  check('Company requester cannot read firm-only detector evidence', await q('responseEvidence:getRecord', { incidentId: incident }, clerk) === null);
  await op('detectors:revoke', { sourceId: source.sourceId });
  check('Revoked detector credential is rejected', (await post(source.token, payload)).status === 401);
} catch (error) { failure = error.message; console.log('Continuity check stopped:', failure); }
finally {
  if (source) try { await op('detectors:revoke', { sourceId: source.sourceId }); cleanup.push({ detectorRevoked: true }); }
  catch { cleanup.push({ detectorRevoked: false }); failure ??= 'Detector cleanup failed'; }
  if (incident && firm) try {
    requireProof((await m('incidents:reviewReport', { incidentId: incident, decision: 'dismiss', note: 'Synthetic acceptance reports only; no actual compromise. Verified no holds or account effects from observation noise.' }, firm)).ok, 'Dismiss failed');
    cleanup.push({ observationDismissed: true });
  } catch { cleanup.push({ observationDismissed: false }); failure ??= 'Observation cleanup failed'; }
  if (grant && controller) try { await m('purchases:revoke', { mandateId: grant }, controller); cleanup.push({ approvalRevoked: true }); }
  catch { cleanup.push({ approvalRevoked: false }); failure ??= 'Approval cleanup failed'; }
  for (const token of tokens) try { await t.call('action', 'auth:signOut', {}, token); cleanup.push({ signedOut: true }); }
  catch { cleanup.push({ signedOut: false }); failure ??= 'Session cleanup failed'; }
  report.passed = !failure; report.failure = failure ?? null; report.finishedAt = new Date().toISOString();
  writeFileSync(options.report, JSON.stringify(redact(report, secrets), null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, failure: report.failure, report: options.report }));
  if (failure) process.exitCode = 1;
}
