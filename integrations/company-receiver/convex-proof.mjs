// Owned-DEV acceptance harness. Synthetic detector -> real Convex jobs -> real Okta
// receiver. Restoration is deliberately left for the UI + local operator checkpoint.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createOwnedDev } from '../../scripts/scorecard/ownedDev.mjs';
import { oktaProvider } from './okta.mjs';
const exec = promisify(execFile);
const dev = createOwnedDev({ argv: ['--deployment', 'tangible-koala-842'] });
const cloud = `https://${dev.deployment}.convex.cloud`, site = cloud.replace('.cloud', '.site');
// An explicit run ID gives a fresh report without erasing earlier command evidence.
// Safety checks below still require contained incidents and ACTIVE disposable users.
const extra = process.argv.slice(4);
if (extra.length && (extra.length !== 2 || extra[0] !== '--run-id' || !/^[a-zA-Z0-9_-]{8,80}$/.test(extra[1]))) throw Error('Use --run-id followed by a unique safe rehearsal label');
const file = `integrations/company-receiver/.state/convex-proof${extra.length ? `-${extra[1]}` : ''}.json`;
const users = JSON.parse(readFileSync('integrations/company-receiver/.state/live-test-users.json', 'utf8'));
const provider = oktaProvider({ orgUrl: process.env.OKTA_ORG_URL, token: process.env.OKTA_API_TOKEN });
if (users.tenant !== provider.binding) throw Error('Disposable tenant mismatch');
const target = users.users.find(u => u.role === 'target'), control = users.users.find(u => u.role === 'control');
const ensure = (value, label) => { if (!value) throw Error(label); };
const save = value => { writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(file + '.tmp', file); };
const childEnv = { ...process.env }; delete childEnv.OKTA_API_TOKEN; delete childEnv.RECEIVER_SIGNING_SECRET;
async function operator(path, args = {}) {
  let stdout;
  try { ({ stdout } = await exec('npx', ['--no-install', 'convex', 'run', path, JSON.stringify(args), '--deployment-name', dev.deployment], { env: childEnv, timeout: 30000, maxBuffer: 1024 * 1024 })); }
  catch { throw Error('Operator request failed; private output withheld'); }
  return stdout.trim() ? JSON.parse(stdout) : null;
}
async function call(kind, path, args = {}, token) {
  const res = await fetch(`${cloud}/api/${kind}`, { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ path, args, format: 'json' }) });
  const body = await res.json(); ensure(body.status === 'success', `Request ${path} was refused`); return body.value;
}
async function login(email) {
  for (const flow of ['signIn', 'signUp']) {
    try { const result = await call('action', 'auth:signIn', { provider: 'password', params: { email, password: 'sidecall-demo', flow } }); if (result.tokens?.token) return result.tokens.token; } catch { /* fixed demo credentials only */ }
  }
  throw Error('Demo sign-in failed');
}
async function waitForPlan(incidentId, token, predicate) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const plan = await call('query', 'responses:getMyResponsePlan', { incidentId }, token);
    const step = plan.find(s => s.executionMode === 'external');
    if (step && predicate(step)) return step;
    if (step?.status === 'refused') throw Error('External response refused; inspect stored evidence');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error('Timed out waiting for receipt; original command must be reconciled');
}

let report, sourceId, phase = 'preflight';
const sessions = [];
try {
  ensure(process.argv[3] === '--disposable-test-only', 'Explicit disposable test flag required');
  const it = await login('sam.kowalski@cedarridge.example'); sessions.push(it);
  if (process.argv[2] === 'pause') {
    ensure(!existsSync(file), 'Prior integrated proof exists; do not create another incident');
    const setup = await operator('responseReceiver:setupState');
    ensure(setup.configured && setup.enabled && setup.policy?.mode === 'act', 'Receiver and company policy must already be enabled');
    ensure(setup.incidents.every(i => i.containedAt !== null), 'Existing target incident needs review before a fresh proof');
    ensure(await provider.state(target.id) === 'ACTIVE' && await provider.state(control.id) === 'ACTIVE', 'Disposable users must start active');
    report = { version: 1, deployment: dev.deployment, startedAt: new Date().toISOString(), stage: 'starting', passed: false, checks: [],
      limitations: ['Synthetic detector evidence and disposable account only', 'No live downstream application sessions established', 'No Visa payment sent', 'Public production frontend not deployed'] };
    save(report);
    phase = 'register scoped synthetic detector';
    const source = await operator('detectors:mint', { name: 'Pegasus synthetic Okta acceptance', mode: 'confirm',
      assetNames: ['Ironclad shared admin account'], reporterDomains: ['pinecreststaffing.example'], expiresAt: Date.now() + 3_600_000 });
    sourceId = source.sourceId; report.sourceId = sourceId; save(report);
    const payload = { externalId: `receiver-acceptance-${randomUUID()}`, assetName: 'Ironclad shared admin account',
      reportedByDomain: 'pinecreststaffing.example', assessment: 'confirmed', evidenceRefs: ['synthetic:owned-okta-acceptance'],
      summary: 'Synthetic acceptance test: exercise an approved response against one disposable Okta account.' };
    report.input = payload; save(report);
    const post = async () => {
      const res = await fetch(`${site}/incident`, { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${source.token}` }, body: JSON.stringify(payload) });
      ensure(res.status === 200, 'Detector report rejected'); return res.json();
    };
    phase = 'automatic pause and signed receipt';
    const accepted = await post(); ensure(!accepted.duplicate && !accepted.correlated, 'A new test episode was not created');
    report.incidentId = accepted.incidentId; save(report);
    const plan = await waitForPlan(accepted.incidentId, it, step => step.status === 'done');
    const pause = plan.deliveries.find(j => j.kind === 'pause');
    ensure(pause?.receipt?.observedState === 'SUSPENDED' && pause.receipt.provider === 'okta', 'No confirmed Okta suspension');
    ensure(await provider.state(target.id) === 'SUSPENDED' && await provider.state(control.id) === 'ACTIVE', 'Real account isolation failed');
    report.stepId = plan.stepId; report.pause = pause;
    report.checks.push({ name: 'Authorized detector automatically caused a signed real Okta pause', passed: true },
      { name: 'Company UI query reports confirmed provider state; unrelated account remains ACTIVE', passed: true }); save(report);
    phase = 'repeat report continuity';
    const replay = await post(); ensure(replay.duplicate && replay.incidentId === accepted.incidentId, 'Exact report replay not deduplicated');
    const after = await call('query', 'responses:getMyResponsePlan', { incidentId: accepted.incidentId }, it);
    ensure(after.find(s => s.stepId === plan.stepId).deliveries.find(d => d.kind === 'pause').commandId === pause.commandId, 'Replay changed command identity');
    report.checks.push({ name: 'Exact detector replay retains the same incident and command identity', passed: true });
    phase = 'prepare separate restoration';
    await call('mutation', 'responseReceiver:prepareRestore', { stepId: plan.stepId }, it);
    const prepared = await call('query', 'responses:getMyResponsePlan', { incidentId: accepted.incidentId }, it);
    report.restore = prepared.find(s => s.stepId === plan.stepId).deliveries.find(d => d.kind === 'restore');
    ensure(report.restore.status === 'awaiting_operator', 'Restoration was not separately gated');
    report.stage = 'awaiting_local_approval_and_ui_restore'; save(report);
    console.log(JSON.stringify({ stage: report.stage, incidentId: report.incidentId, pauseCommandId: pause.commandId, restoreCommandId: report.restore.commandId, checks: report.checks.length }));
  } else if (process.argv[2] === 'verify-restored') {
    report = JSON.parse(readFileSync(file, 'utf8')); sourceId = report.sourceId;
    phase = 'verify restoration from UI';
    const plan = await waitForPlan(report.incidentId, it, step => step.status === 'undone');
    report.restore = plan.deliveries.find(j => j.kind === 'restore');
    ensure(report.restore.receipt?.observedState === 'ACTIVE', 'Restore receipt did not confirm ACTIVE');
    ensure(await provider.state(target.id) === 'ACTIVE' && await provider.state(control.id) === 'ACTIVE', 'Final account state mismatch');
    const firm = await login('jordan.ames@northpasscapital.example'); sessions.push(firm);
    const record = await call('query', 'responseEvidence:getRecord', { incidentId: report.incidentId }, firm);
    ensure(record.steps.some(s => s.id === report.stepId && s.executionMode === 'external' && s.deliveries.some(d => d.kind === 'restore' && d.status === 'confirmed')), 'Firm evidence view missing receiver outcome');
    report.checks.push({ name: 'UI-requested restore confirmed by receiver and independent Okta read-back', passed: true },
      { name: 'Firm response evidence includes external pause and restore receipts', passed: true });
    const contained = await call('mutation', 'incidents:containIncident', { incidentId: report.incidentId, note: 'Synthetic Okta acceptance test complete: disposable account restored and unrelated account verified ACTIVE; no real compromise was asserted.' }, firm);
    ensure(contained.ok || contained.reason === 'Already contained.', 'Synthetic test containment failed');
    report.testIncidentContained = true;
    report.stage = 'complete'; report.passed = true; report.finishedAt = new Date().toISOString(); report.finalStates = { target: 'ACTIVE', control: 'ACTIVE' }; save(report);
    console.log(JSON.stringify({ passed: true, checks: report.checks.length, report: file }));
  } else throw Error('Choose pause or verify-restored');
} catch {
  if (report) { report.failure = `Stopped during ${phase}; preserve original command identities and reconcile before repeating.`; save(report); }
  console.error(`Acceptance stopped during ${phase}. No credentials are printed.`); process.exitCode = 1;
} finally {
  if (sourceId) {
    try { await operator('detectors:revoke', { sourceId }); if (report) { report.testDetectorRevoked = true; save(report); } }
    catch { console.error('Test detector revocation needs operator follow-up.'); process.exitCode = 1; }
  }
  for (const token of sessions) {
    try { await call('action', 'auth:signOut', {}, token); }
    catch { console.error('Synthetic session sign-out needs follow-up.'); process.exitCode = 1; }
  }
}
