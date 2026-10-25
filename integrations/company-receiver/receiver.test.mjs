import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './store.mjs';
import { createReceiver } from './receiver.mjs';
import { sign, readReceipt, verify, COMMAND_PATH, STATUS_PATH, MAX_BODY_BYTES } from './protocol.mjs';
import { receiverServer } from './server.mjs';
import { oktaProvider } from './okta.mjs';
import { deliver } from './client.mjs';

const secret = 'test-only-signing-secret-not-used-anywhere-else';
const stamp = 1_792_901_000_000;
function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sidecall-receiver-'));
  const path = join(directory, 'commands.sqlite');
  const cfg = { companyId: 'cedar-ridge', secret, targets: { vendor: 'account1', unrelated: 'account2' }, enabled: true, maxPausesPerHour: 3 };
  const accounts = new Map([['account1', 'ACTIVE'], ['account2', 'ACTIVE']]);
  const calls = []; let time = stamp;
  const provider = { kind: 'test-double', binding: 'owned-test-fixture',
    state: async id => { calls.push(['state', id]); return accounts.get(id); },
    pause: async id => { calls.push(['pause', id]); accounts.set(id, 'SUSPENDED'); },
    revokeSessions: async id => { calls.push(['revoke', id]); },
    restore: async id => { calls.push(['restore', id]); accounts.set(id, 'ACTIVE'); },
  };
  Object.assign(provider, options.provider);
  let store = openStore(path), receiver = createReceiver({ store, provider, getConfig: () => cfg, now: () => time });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const pause = (extra = {}) => ({ version: 1, companyId: cfg.companyId, commandId: 'pause-command-0001',
    target: 'vendor', incidentId: 'incident-one', action: 'pause_shared_login', policyVersion: 1, ...extra });
  const send = (body, { path = COMMAND_PATH, signature, raw = JSON.stringify(body), at = time } = {}) => receiver.handle(path, raw, signature ?? sign(secret, path, raw, at));
  const status = id => send({ version: 1, companyId: cfg.companyId, commandId: id }, { path: STATUS_PATH });
  const restore = (original, extra = {}) => pause({ commandId: 'restore-command-0001', action: 'restore_shared_login',
    pauseCommandId: original.commandId, incidentId: original.incidentId, target: original.target, ...extra });
  return { cfg, accounts, calls, provider, pause, restore, send, status, path,
    get store() { return store; }, get receiver() { return receiver; },
    advance: ms => { time += ms; },
    restart: () => { store.close(); store = openStore(path); receiver = createReceiver({ store, provider, getConfig: () => cfg, now: () => time }); },
  };
}

test('valid signed pause verifies the target and leaves unrelated access state unchanged', async t => {
  const s = fixture(t), out = await s.send(s.pause());
  assert.equal(out.http, 200); assert.equal(out.body.status, 'confirmed');
  assert.equal(out.body.observedState, 'SUSPENDED'); assert.equal(out.body.restoreEligible, true);
  assert.equal(out.body.provider, 'test-double');
  assert.equal(s.accounts.get('account2'), 'ACTIVE');
  assert.deepEqual(s.calls.filter(([kind]) => kind !== 'state'), [['pause', 'account1'], ['revoke', 'account1']]);
});

for (const scenario of ['forged', 'old', 'future', 'path changed', 'body changed', 'oversize', 'wrong company', 'unlisted', 'extra authority']) {
  test(`${scenario} request cannot reach the provider`, async t => {
    const s = fixture(t), body = s.pause(); let options = {};
    if (scenario === 'forged') options.signature = sign('another-long-secret-key-for-an-attacker', COMMAND_PATH, JSON.stringify(body), stamp);
    if (scenario === 'old') options.at = stamp - 301_000;
    if (scenario === 'future') options.at = stamp + 31_000;
    if (scenario === 'path changed') options.signature = sign(secret, STATUS_PATH, JSON.stringify(body), stamp);
    if (scenario === 'body changed') { options.signature = sign(secret, COMMAND_PATH, JSON.stringify(body), stamp); body.target = 'unrelated'; }
    if (scenario === 'oversize') options.raw = ' '.repeat(MAX_BODY_BYTES + 1);
    if (scenario === 'wrong company') body.companyId = 'other-company';
    if (scenario === 'unlisted') body.target = 'admin';
    if (scenario === 'extra authority') body.override = true;
    const out = await s.send(body, options);
    assert.ok(out.http >= 400); assert.equal(s.calls.length, 0);
  });
}

test('concurrent duplicates perform one effect and survive receiver restart', async t => {
  const s = fixture(t), body = s.pause();
  await Promise.all(Array.from({ length: 12 }, () => s.send(body)));
  assert.equal(s.calls.filter(([kind]) => kind === 'pause').length, 1);
  const original = await s.status(body.commandId), count = s.calls.length;
  s.restart(); assert.deepEqual(await s.send(body), original);
  assert.equal(s.calls.length, count);
  assert.equal((await s.send({ ...body, target: 'unrelated' })).http, 409);
  assert.equal(s.accounts.get('account2'), 'ACTIVE');
});

test('fresh command IDs cannot repeatedly pause the same active incident', async t => {
  const s = fixture(t); await s.send(s.pause());
  const out = await s.send(s.pause({ commandId: 'another-command-0001' }));
  assert.equal(out.body.reason, 'incident_already_has_active_hold');
  assert.equal(s.calls.filter(([kind]) => kind === 'pause').length, 1);
});

test('receiver has an independent persistent pause budget', async t => {
  const s = fixture(t); s.cfg.maxPausesPerHour = 1;
  await s.send(s.pause()); s.restart();
  const out = await s.send(s.pause({ commandId: 'pause-command-0002', target: 'unrelated', incidentId: 'incident-two' }));
  assert.equal(out.http, 429); assert.equal(out.body.reason, 'receiver_pause_budget_exhausted');
  assert.equal(s.accounts.get('account2'), 'ACTIVE');
});

test('receiver disable switch blocks new operations but preserves receipts and status', async t => {
  const s = fixture(t), body = s.pause(); const original = await s.send(body);
  s.cfg.enabled = false;
  assert.deepEqual(await s.send(body), original);
  assert.equal((await s.status(body.commandId)).body.status, 'confirmed');
  assert.equal((await s.send(s.pause({ commandId: 'pause-command-0002', target: 'unrelated' }))).body.reason, 'receiver_disabled');
  assert.equal(s.accounts.get('account2'), 'ACTIVE');
});

test('lost pause acknowledgement reconciles observed state without blind retry or restore authority', async t => {
  const s = fixture(t);
  s.provider.pause = async id => { s.calls.push(['pause', id]); s.accounts.set(id, 'SUSPENDED'); throw new Error('Lost response with secret text'); };
  const body = s.pause(), out = await s.send(body);
  assert.equal(out.body.status, 'unknown'); assert.ok(!JSON.stringify(out).includes('secret text'));
  s.restart();
  assert.equal((await s.send(body)).body.status, 'unknown');
  assert.equal((await s.send(s.pause({ commandId: 'pause-command-0002', incidentId: 'incident-two' }))).body.reason, 'target_has_unresolved_command');
  const reconciled = await s.status(body.commandId);
  assert.equal(reconciled.body.status, 'confirmed'); assert.equal(reconciled.body.restoreEligible, false);
  assert.equal(reconciled.body.sessionRevocation, 'not_confirmed');
  const restore = s.restore(body); s.receiver.approveRestore(body.commandId, restore.commandId, true);
  assert.equal((await s.send(restore)).body.reason, 'suspension_ownership_unknown_manual_review_required');
  assert.equal(s.calls.filter(([kind]) => kind === 'pause').length, 1);
  assert.equal(s.accounts.get('account1'), 'SUSPENDED');
});

test('timeout without the desired effect stays unknown and never silently reissues the operation', async t => {
  const s = fixture(t); s.provider.pause = async () => { throw new Error('Timeout'); };
  const body = s.pause(); await s.send(body);
  const out = await s.status(body.commandId);
  assert.equal(out.body.status, 'unknown'); assert.equal(out.body.observedState, 'ACTIVE');
  assert.equal(out.body.reason, 'desired_state_not_observed_manual_review_required');
});

test('a stale in-progress command after a crash is reconciled without repeating a pause', async t => {
  const s = fixture(t), body = s.pause(); await s.send(body);
  s.store.db.prepare("UPDATE commands SET status='pending', phase='pause_intent' WHERE id=?").run(body.commandId);
  s.store.db.prepare('UPDATE targets SET owned=0').run();
  s.restart(); s.advance(60_001);
  const out = await s.status(body.commandId);
  assert.equal(out.body.status, 'confirmed'); assert.equal(out.body.restoreEligible, false);
  assert.equal(s.calls.filter(([kind]) => kind === 'pause').length, 1);
});

test('an already suspended account is never claimed as ours or re-enabled', async t => {
  const s = fixture(t); s.accounts.set('account1', 'SUSPENDED');
  const body = s.pause(), paused = await s.send(body);
  assert.equal(paused.body.restoreEligible, false);
  const restore = s.restore(body); s.receiver.approveRestore(body.commandId, restore.commandId, true);
  assert.equal((await s.send(restore)).body.status, 'refused');
  assert.equal(s.calls.filter(([kind]) => ['pause', 'restore'].includes(kind)).length, 0);
});

test('restoration needs an explicit local approval and never restores old sessions', async t => {
  const s = fixture(t), body = s.pause(); await s.send(body);
  const restore = s.restore(body);
  assert.equal((await s.send(restore)).body.reason, 'company_operator_restore_approval_required');
  assert.throws(() => s.receiver.approveRestore(body.commandId, restore.commandId, false));
  s.receiver.approveRestore(body.commandId, restore.commandId, true);
  const out = await s.send(restore);
  assert.equal(out.body.status, 'confirmed'); assert.equal(out.body.observedState, 'ACTIVE');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 1);
  assert.equal(s.calls.filter(([kind]) => kind === 'revoke').length, 1);
  assert.deepEqual(await s.send(restore), out);
});

test('expired local restoration approval does not grant authority', async t => {
  const s = fixture(t), body = s.pause(); await s.send(body);
  const restore = s.restore(body); s.receiver.approveRestore(body.commandId, restore.commandId, true);
  s.advance(900_001);
  assert.equal((await s.send(restore)).body.reason, 'company_operator_restore_approval_required');
  assert.equal(s.accounts.get('account1'), 'SUSPENDED');
});

test('restoring one incident cannot remove another active hold', async t => {
  const s = fixture(t), first = s.pause(), second = s.pause({ commandId: 'pause-command-0002', incidentId: 'incident-two' });
  await s.send(first); await s.send(second);
  const r1 = s.restore(first), r2 = s.restore(second, { commandId: 'restore-command-0002' });
  s.receiver.approveRestore(first.commandId, r1.commandId, true);
  assert.equal((await s.send(r1)).body.reason, 'this_hold_released_other_holds_remain');
  assert.equal(s.accounts.get('account1'), 'SUSPENDED');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 0);
  s.receiver.approveRestore(second.commandId, r2.commandId, true);
  assert.equal((await s.send(r2)).body.observedState, 'ACTIVE');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 1);
});

test('lost restoration acknowledgement is reconciled without a second restore', async t => {
  const s = fixture(t), body = s.pause(); await s.send(body);
  s.provider.restore = async id => { s.calls.push(['restore', id]); s.accounts.set(id, 'ACTIVE'); throw new Error('Lost response'); };
  const restore = s.restore(body); s.receiver.approveRestore(body.commandId, restore.commandId, true);
  assert.equal((await s.send(restore)).body.status, 'unknown');
  s.restart(); assert.equal((await s.status(restore.commandId)).body.status, 'confirmed');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 1);
});

test('changing the allowlist cannot redirect reconciliation to another account', async t => {
  const s = fixture(t); s.provider.pause = async () => { throw new Error('Lost response'); };
  const body = s.pause(); await s.send(body); s.cfg.targets.vendor = 'account2';
  const count = s.calls.length;
  assert.equal((await s.status(body.commandId)).body.reason, 'target_configuration_changed_manual_review_required');
  assert.equal(s.calls.length, count);
});

test('HTTP transport signs matching receipts and rejects changed receipts and oversized bodies', async t => {
  const s = fixture(t), server = receiverServer({ receiver: s.receiver, secret, now: () => stamp });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const body = s.pause(), raw = JSON.stringify(body);
  const res = await fetch(url + COMMAND_PATH, { method: 'POST', headers: { 'content-type': 'application/json',
    'x-sidecall-signature': sign(secret, COMMAND_PATH, raw, stamp) }, body: raw });
  const receiptRaw = await res.text(), signature = res.headers.get('x-sidecall-signature');
  assert.equal(readReceipt(secret, COMMAND_PATH, receiptRaw, signature, body, stamp).status, 'confirmed');
  assert.throws(() => readReceipt(secret, COMMAND_PATH, receiptRaw.replace('confirmed', 'refused'), signature, body, stamp));
  assert.throws(() => readReceipt(secret, COMMAND_PATH, receiptRaw, signature, { ...body, commandId: 'wrong-command' }, stamp));
  assert.throws(() => readReceipt(secret, COMMAND_PATH, receiptRaw, signature, { ...body, incidentId: 'different-incident' }, stamp));
  assert.equal(verify(secret, COMMAND_PATH, receiptRaw, signature, stamp), false);
  const oversized = await fetch(url + COMMAND_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(MAX_BODY_BYTES + 1) });
  assert.equal(oversized.status, 413);
  const retried = await deliver({ origin: url, secret, command: body, allowLoopback: true, now: () => stamp });
  assert.equal(retried.delivery, 'authenticated_receipt');
  const checked = await deliver({ origin: url, secret, command: body, statusOnly: true, allowLoopback: true, now: () => stamp });
  assert.equal(checked.receipt.status, 'confirmed');
  assert.equal(s.calls.filter(([kind]) => kind === 'pause').length, 1);
});

test('sender treats a lost receipt as unknown without retrying or inventing a new command', async t => {
  const s = fixture(t); let calls = 0;
  const out = await deliver({ origin: 'https://receiver.example', secret, command: s.pause(), fetchImpl: async () => { calls++; throw new Error('Connection lost'); } });
  assert.equal(out.delivery, 'unknown'); assert.equal(out.commandId, s.pause().commandId); assert.equal(calls, 1);
  await assert.rejects(deliver({ origin: 'http://receiver.example', secret, command: s.pause() }));
});

test('Okta adapter uses only configured HTTPS origin and exact allowlisted user paths', async () => {
  const calls = [], userId = '00utest123456789';
  const provider = oktaProvider({ orgUrl: 'https://integrator-test.okta.com', token: 'test-token-never-used-outside-tests', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return options.method === 'GET' ? Response.json({ id: userId, status: 'SUSPENDED' }) : new Response(null, { status: 204 });
  } });
  await provider.pause(userId); await provider.revokeSessions(userId); assert.equal(await provider.state(userId), 'SUSPENDED'); await provider.restore(userId);
  assert.deepEqual(calls.map(c => [new URL(c.url).pathname, new URL(c.url).search, c.options.method]), [
    [`/api/v1/users/${userId}/lifecycle/suspend`, '', 'POST'], [`/api/v1/users/${userId}/sessions`, '?oauthTokens=true', 'DELETE'],
    [`/api/v1/users/${userId}`, '', 'GET'], [`/api/v1/users/${userId}/lifecycle/unsuspend`, '', 'POST'],
  ]);
  assert.ok(calls.every(c => c.options.redirect === 'error' && c.options.signal instanceof AbortSignal));
  assert.throws(() => oktaProvider({ orgUrl: 'https://evil.example', token: '123456789012345678901' }));
  await assert.rejects(provider.pause('../another-user'));
});


test('demo reset is opt-in, target scoped, persistent and never weakens ordinary restoration', async t => {
  const s = fixture(t), pause = s.pause(); await s.send(pause);
  const reset = s.restore(pause, { demoReset: true });
  assert.equal((await s.send(reset)).body.reason, 'demo_reset_not_authorized_for_owned_target');
  s.cfg.demoResetTarget = 'unrelated';
  assert.equal((await s.send(reset)).body.status, 'refused');
  s.cfg.demoResetTarget = 'vendor';
  assert.equal((await s.send(s.restore(pause))).body.reason, 'company_operator_restore_approval_required');
  assert.equal((await s.send(reset)).body.observedState, 'ACTIVE');
  s.restart();
  assert.equal((await s.send(reset)).body.status, 'confirmed');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 1);
  assert.equal(s.accounts.get('account2'), 'ACTIVE');
});

test('demo reset cannot release an externally suspended account', async t => {
  const s = fixture(t); s.cfg.demoResetTarget = 'vendor'; s.accounts.set('account1', 'SUSPENDED');
  const pause = s.pause(); await s.send(pause);
  assert.equal((await s.send(s.restore(pause, { demoReset: true }))).body.status, 'refused');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 0);
});

test('demo reset preserves other holds until the last matching pause is released', async t => {
  const s = fixture(t); s.cfg.demoResetTarget = 'vendor';
  const first = s.pause(), second = s.pause({ commandId: 'pause-command-0002', incidentId: 'incident-two' });
  await s.send(first); await s.send(second);
  assert.equal((await s.send(s.restore(first, { demoReset: true }))).body.observedState, 'SUSPENDED');
  assert.equal((await s.send(s.restore(second, { demoReset: true, commandId: 'restore-command-0002' }))).body.observedState, 'ACTIVE');
  assert.equal(s.calls.filter(([kind]) => kind === 'restore').length, 1);
});
