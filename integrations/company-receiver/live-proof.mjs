// Opt-in LOCAL operator rehearsal, never an application endpoint or CI test.
// Creates only two disposable, non-admin identities. No activation emails.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { oktaProvider } from './okta.mjs';
import { openStore } from './store.mjs';
import { createReceiver } from './receiver.mjs';
import { receiverServer } from './server.mjs';
import { deliver } from './client.mjs';
import { COMMAND_PATH, sign } from './protocol.mjs';

const directory = resolve('integrations/company-receiver/.state');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const manifestPath = `${directory}/live-test-users.json`;
const proofPath = `${directory}/live-proof.json`;
const env = process.env;
// Validates the official tenant origin before any authenticated request.
const provider = oktaProvider({ orgUrl: env.OKTA_ORG_URL, token: env.OKTA_API_TOKEN });
const save = (path, value) => {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
};
const ensure = (condition, label) => { if (!condition) throw new Error(label); };
async function api(path, method = 'GET', body) {
  const result = await fetch(provider.binding + path, { method, redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { authorization: `SSWS ${env.OKTA_API_TOKEN}`, accept: 'application/json', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!result.ok) throw new Error(`Okta HTTP ${result.status}; inspect state before retrying a write`);
  return result.status === 204 ? null : result.json();
}
function manifest() {
  const value = JSON.parse(readFileSync(manifestPath, 'utf8'));
  ensure(value.tenant === provider.binding, 'Manifest belongs to another tenant');
  return value;
}
async function provision() {
  let value;
  if (existsSync(manifestPath)) value = manifest();
  else {
    const suffix = randomBytes(6).toString('hex');
    value = { tenant: provider.binding, createdAt: new Date().toISOString(), users: ['target', 'control'].map(role => ({
      role, login: `sidecall-${role}-${suffix}@example.invalid`, phase: 'new',
    })) };
    save(manifestPath, value);
  }
  for (const item of value.users) {
    if (item.phase === 'new') {
      item.phase = 'create_requested'; save(manifestPath, value);
      // Random password never printed or persisted. This checkpoint tests lifecycle,
      // not interactive sign-in or downstream application sessions.
      const user = await api('/api/v1/users?activate=false', 'POST', {
        profile: { firstName: `Sidecall ${item.role}`, lastName: 'SidecallReceiverTest', login: item.login, email: item.login },
        credentials: { password: { value: `Aa9!${randomBytes(32).toString('hex')}` } },
      });
      item.id = user.id; item.phase = 'created'; save(manifestPath, value);
    }
    // Recover creation only by read: never create a second user after a lost reply.
    const user = await api(`/api/v1/users/${encodeURIComponent(item.id ?? item.login)}`);
    ensure(user.profile.login === item.login && user.profile.lastName === 'SidecallReceiverTest', 'Test identity mismatch');
    item.id = user.id; save(manifestPath, value);
    const roles = await api(`/api/v1/users/${user.id}/roles`);
    ensure(Array.isArray(roles) && roles.length === 0, 'Test account has privileged roles');
    if (user.status === 'STAGED') {
      ensure(item.phase !== 'activation_requested', 'Activation outcome unresolved; inspect manually');
      item.phase = 'activation_requested'; save(manifestPath, value);
      await api(`/api/v1/users/${user.id}/lifecycle/activate?sendEmail=false`, 'POST');
    }
    ensure(await provider.state(user.id) === 'ACTIVE', 'Test user is not active');
    item.phase = 'ready'; save(manifestPath, value);
  }
  console.log(JSON.stringify({ provisioned: true, nonAdminTestUsers: value.users.length, receiverRemainsDisabled: env.RECEIVER_ENABLED !== 'true' }));
}

async function rehearse() {
  const value = manifest();
  ensure(value.users.length === 2 && value.users.every(u => u.phase === 'ready'), 'Provision test users first');
  const target = value.users.find(u => u.role === 'target'), control = value.users.find(u => u.role === 'control');
  ensure(target && control && target.id !== control.id, 'Distinct disposable users required');
  for (const user of value.users) {
    const live = await api(`/api/v1/users/${user.id}`);
    ensure(live.profile.login === user.login && live.profile.lastName === 'SidecallReceiverTest', 'Test identity mismatch');
    const roles = await api(`/api/v1/users/${user.id}/roles`);
    ensure(Array.isArray(roles) && roles.length === 0, 'Test account has privileged roles');
  }
  // Never rerun automatically after an interrupted provider operation.
  if (existsSync(proofPath)) {
    const prior = JSON.parse(readFileSync(proofPath, 'utf8'));
    ensure(prior.passed === true, 'Prior live proof needs reconciliation; preserve command IDs and inspect its database');
    throw new Error('Live proof already complete; inspect the saved evidence instead of repeating account changes');
  }
  const runId = randomUUID();
  const command = { version: 1, companyId: env.RECEIVER_COMPANY_ID, commandId: `proof-pause-${runId}`,
    target: 'disposable-vendor-login', incidentId: `synthetic-proof-${runId}`, action: 'pause_shared_login', policyVersion: 1 };
  const restore = { ...command, commandId: `proof-restore-${runId}`, action: 'restore_shared_login', pauseCommandId: command.commandId };
  const report = { version: 1, startedAt: new Date().toISOString(), provider: 'okta', scope: 'local signed HTTP to real disposable Okta users',
    command, restoreCommand: restore, checks: [], passed: false, limitation: 'Provider lifecycle states only; no browser login, real downstream sessions, Convex delivery or website integration tested.' };
  const check = (name, result) => { report.checks.push({ name, ...result }); save(proofPath, report); };
  save(proofPath, report);
  let store, server;
  let enabled = true;
  const writes = { pause: 0, revokeSessions: 0, restore: 0 };
  const auditedProvider = { ...provider };
  for (const name of Object.keys(writes)) auditedProvider[name] = async id => { writes[name]++; return provider[name](id); };
  const config = () => ({ companyId: env.RECEIVER_COMPANY_ID, secret: env.RECEIVER_SIGNING_SECRET,
    targets: { [command.target]: target.id }, enabled, maxPausesPerHour: 3 });
  const start = async () => {
    store = openStore(`${directory}/live-proof.sqlite`);
    const receiver = createReceiver({ store, provider: auditedProvider, getConfig: config });
    server = receiverServer({ receiver, secret: env.RECEIVER_SIGNING_SECRET });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return { receiver, origin: `http://127.0.0.1:${server.address().port}` };
  };
  const stop = async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); store?.close(); store = null; };
  try {
    ensure(await provider.state(target.id) === 'ACTIVE' && await provider.state(control.id) === 'ACTIVE', 'Both test accounts must start active');
    check('initial_states', { target: 'ACTIVE', control: 'ACTIVE' });
    let runtime = await start();
    const send = cmd => deliver({ origin: runtime.origin, secret: env.RECEIVER_SIGNING_SECRET, command: cmd, allowLoopback: true, timeoutMs: 30_000 });
    const raw = JSON.stringify(command);
    const forged = await fetch(runtime.origin + COMMAND_PATH, { method: 'POST', headers: { 'content-type': 'application/json',
      'x-sidecall-signature': sign('incorrect-secret-with-at-least-32-characters', COMMAND_PATH, raw) }, body: raw });
    await forged.text(); ensure(forged.status === 401, 'Forged request was not rejected');
    check('forged_signal_refused', { http: forged.status });
    const unlisted = await send({ ...command, commandId: `unlisted-${runId}`, target: 'unrelated-account' });
    ensure(unlisted.receipt?.reason === 'target_not_allowed', 'Unlisted target was not refused');
    check('unlisted_target_refused', { receipt: unlisted.receipt });
    const pause = await send(command);
    ensure(pause.receipt?.status === 'confirmed' && pause.receipt.observedState === 'SUSPENDED', 'Pause not confirmed; reconcile original command');
    ensure(await provider.state(target.id) === 'SUSPENDED' && await provider.state(control.id) === 'ACTIVE', 'Provider state or isolation check failed');
    check('real_target_suspended_control_active', { receipt: pause.receipt, independentReadback: { target: 'SUSPENDED', control: 'ACTIVE' } });
    await stop(); runtime = await start();
    const duplicate = await send(command);
    ensure(duplicate.receipt?.commandHash === pause.receipt.commandHash && duplicate.receipt?.status === 'confirmed' && writes.pause === 1, 'Restart replay caused another pause');
    check('restart_duplicate_stable', { pauseApiCalls: writes.pause });
    const blocked = await send(restore);
    ensure(blocked.receipt?.reason === 'company_operator_restore_approval_required' && await provider.state(target.id) === 'SUSPENDED', 'Unapproved restoration not blocked');
    check('unapproved_restore_refused', { receipt: blocked.receipt });
    // LOCAL operator cleanup for this script's synthetic incident only. No real
    // compromise exists; this is not a remotely callable remediation bypass.
    runtime.receiver.approveRestore(command.commandId, restore.commandId, true);
    const restored = await send(restore);
    ensure(restored.receipt?.status === 'confirmed' && restored.receipt.observedState === 'ACTIVE', 'Restore not confirmed; reconcile original command');
    ensure(await provider.state(target.id) === 'ACTIVE' && await provider.state(control.id) === 'ACTIVE', 'Final provider states incorrect');
    check('approved_test_cleanup_restored', { receipt: restored.receipt, independentReadback: { target: 'ACTIVE', control: 'ACTIVE' } });
    enabled = false;
    const disabled = await send({ ...command, commandId: `disabled-${runId}` });
    ensure(disabled.receipt?.reason === 'receiver_disabled', 'Disable switch did not refuse');
    check('disabled_receiver_refuses', { receipt: disabled.receipt });
    report.passed = true;
  } catch (error) {
    // Only locally authored errors are copied; raw provider responses never are.
    report.failure = error instanceof Error ? error.message.slice(0, 200) : 'Live proof failed';
    process.exitCode = 1;
  } finally {
    await stop(); report.finishedAt = new Date().toISOString(); report.providerWriteCalls = writes;
    save(proofPath, report);
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: proofPath, failure: report.failure ?? null, providerWriteCalls: writes }, null, 2));
  }
}

try {
  const operation = process.argv[2];
  ensure(process.argv[3] === '--disposable-test-only', 'Explicit --disposable-test-only is required');
  if (operation === 'provision') await provision();
  else if (operation === 'rehearse') await rehearse();
  else throw new Error('Choose provision or rehearse');
} catch {
  console.error('Live setup stopped. Preserve local state; check account/configuration state before retrying. No credentials are printed.');
  process.exitCode = 1;
}
