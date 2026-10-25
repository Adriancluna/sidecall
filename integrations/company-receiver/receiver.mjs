import { digest, parseCommand, verify, COMMAND_PATH, STATUS_PATH } from './protocol.mjs';

// The receiver owns its policy and credentials. A valid signature authenticates
// the sender; it does not override this policy or authorize account restoration.
export function createReceiver({ store, provider, getConfig, now = Date.now }) {
  const { db, transaction, command, receipt, update } = store;
  const initial = getConfig();
  if (!initial.companyId || typeof initial.enabled !== 'boolean' || typeof initial.secret !== 'string' || initial.secret.length < 32 ||
      !initial.targets || !Number.isInteger(initial.maxPausesPerHour) || initial.maxPausesPerHour < 1 || initial.maxPausesPerHour > 10) {
    throw new Error('Explicit company, signing secret, target allowlist and bounded pause budget required.');
  }
  db.exec('CREATE TABLE IF NOT EXISTS receiver_identity (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL)');
  const identity = digest(`${initial.companyId}:${provider.kind}:${provider.binding}`);
  transaction(() => {
    const saved = db.prepare('SELECT binding FROM receiver_identity WHERE id=1').get();
    if (saved && saved.binding !== identity) throw new Error('This database belongs to another receiver or provider.');
    db.prepare('INSERT OR IGNORE INTO receiver_identity VALUES(1,?)').run(identity);
  });
  const config = () => {
    const value = getConfig();
    if (value.companyId !== initial.companyId || value.secret !== initial.secret) throw new Error('Restart after company or key configuration changes.');
    return value;
  };
  const binding = (body, cfg) => digest(`${provider.kind}:${provider.binding}:${cfg.companyId}:${cfg.targets[body.target]}`);
  const base = body => ({ version: 1, companyId: body.companyId, commandId: body.commandId,
    target: body.target, action: body.action, incidentId: body.incidentId, commandHash: digest(JSON.stringify(body)), provider: provider.kind,
    status: 'pending', reason: 'accepted', observedState: null, observedAt: null,
    sessionRevocation: 'not_confirmed', restoreEligible: false });
  const refuse = (body, reason) => ({ ...base(body), status: 'refused', reason });
  const hold = body => db.prepare('INSERT OR IGNORE INTO holds(pause_id,target,incident) VALUES(?,?,?)').run(body.commandId, body.target, body.incidentId);
  const others = body => db.prepare('SELECT COUNT(*) AS count FROM holds WHERE target=? AND active=1 AND pause_id<>?').get(body.target, body.pauseCommandId ?? '').count;
  const owned = target => db.prepare('SELECT owned FROM targets WHERE target=?').get(target)?.owned === 1;
  const setOwned = (target, value) => db.prepare('INSERT INTO targets(target,owned) VALUES(?,?) ON CONFLICT(target) DO UPDATE SET owned=excluded.owned').run(target, value ? 1 : 0);
  const finishPause = (body, reason, sessions) => transaction(() => {
    hold(body);
    return update(body.commandId, { status: 'confirmed', reason, observedState: 'SUSPENDED', observedAt: now(),
      sessionRevocation: sessions, restoreEligible: owned(body.target) }, 'complete');
  });
  const finishRestore = (body, state, reason) => transaction(() => {
    db.prepare('UPDATE holds SET active=0 WHERE pause_id=?').run(body.pauseCommandId);
    if (state === 'ACTIVE') setOwned(body.target, false);
    return update(body.commandId, { status: 'confirmed', reason, observedState: state, observedAt: now(), restoreEligible: false }, 'complete');
  });
  const enabled = () => { if (config().enabled !== true) throw new Error('Receiver disabled.'); };

  async function execute(body, cfg) {
    const id = cfg.targets[body.target];
    try {
      enabled();
      const current = await provider.state(id);
      if (body.action === 'pause_shared_login') {
        if (current === 'SUSPENDED') return finishPause(body, 'suspension_observed_no_new_pause', 'not_requested');
        // Commit intent before the external effect. If acknowledgement is lost,
        // reconciliation observes status but never assumes we own the suspension.
        transaction(() => { setOwned(body.target, false); update(body.commandId, { reason: 'pause_requested' }, 'pause_intent'); });
        enabled(); await provider.pause(id);
        transaction(() => { setOwned(body.target, true); hold(body); update(body.commandId, { reason: 'pause_acknowledged' }, 'pause_ack'); });
        enabled(); await provider.revokeSessions(id);
        update(body.commandId, { sessionRevocation: 'provider_acknowledged' }, 'sessions_ack');
        if (await provider.state(id) !== 'SUSPENDED') throw new Error('State not confirmed.');
        return finishPause(body, 'suspension_verified', 'provider_acknowledged');
      }
      if (others(body) > 0) {
        if (current !== 'SUSPENDED') throw new Error('Other holds require a suspended account.');
        return finishRestore(body, current, 'this_hold_released_other_holds_remain');
      }
      if (!owned(body.target)) return update(body.commandId, { status: 'refused', reason: 'suspension_ownership_unknown_manual_review_required' }, 'complete');
      if (current !== 'SUSPENDED') return update(body.commandId, { status: 'refused', reason: 'account_changed_outside_receiver_manual_review_required' }, 'complete');
      update(body.commandId, { reason: 'restore_requested' }, 'restore_intent');
      enabled(); await provider.restore(id);
      update(body.commandId, { reason: 'restore_acknowledged' }, 'restore_ack');
      if (await provider.state(id) !== 'ACTIVE') throw new Error('State not confirmed.');
      return finishRestore(body, 'ACTIVE', 'restoration_verified');
    } catch {
      // Includes network timeouts: a side effect might already have happened.
      // No new command, reversal or blind provider retry is generated here.
      return update(body.commandId, { status: 'unknown', reason: 'confirmation_pending_check_status', restoreEligible: false });
    }
  }

  async function reconcile(row, cfg) {
    const body = JSON.parse(row.body);
    if (!Object.hasOwn(cfg.targets, body.target) || binding(body, cfg) !== row.binding) return { ...JSON.parse(row.receipt), reason: 'target_configuration_changed_manual_review_required' };
    // One reconciler per command, including across processes. Unknown commands
    // block other commands on this target until reconciled or locally reviewed.
    const claimed = transaction(() => {
      const latest = command(row.id);
      if (!['pending', 'unknown'].includes(latest.status) || (latest.status === 'pending' && latest.lease_until > now())) return false;
      db.prepare('UPDATE commands SET status=?,lease_until=? WHERE id=?').run('pending', now() + 60_000, row.id);
      return true;
    });
    if (!claimed) return receipt(row.id);
    try {
      const state = await provider.state(cfg.targets[body.target]);
      const phase = command(row.id).phase;
      if (body.action === 'pause_shared_login' && state === 'SUSPENDED') {
        return finishPause(body, 'suspension_observed_after_uncertainty', receipt(row.id).sessionRevocation);
      }
      if (body.action === 'restore_shared_login' && ['restore_intent', 'restore_ack'].includes(phase) && state === 'ACTIVE') {
        return finishRestore(body, 'ACTIVE', 'restoration_observed_after_uncertainty');
      }
      if (phase === 'inspect') return update(row.id, { status: 'refused', reason: 'no_provider_change_was_started', observedState: state, observedAt: now() }, 'complete');
      return update(row.id, { status: 'unknown', reason: 'desired_state_not_observed_manual_review_required', observedState: state, observedAt: now() });
    } catch {
      return update(row.id, { status: 'unknown', reason: 'provider_status_unavailable' });
    }
  }

  async function handle(path, raw, signature) {
    const cfg = config();
    if (![COMMAND_PATH, STATUS_PATH].includes(path)) return { http: 404, body: { error: 'not_found' } };
    if (!verify(cfg.secret, path, raw, signature, now())) return { http: 401, body: { error: 'invalid_signature_or_time' } };
    let body;
    try { body = parseCommand(raw, path === STATUS_PATH); } catch { return { http: 400, body: { error: 'invalid_command' } }; }
    if (body.companyId !== cfg.companyId) return { http: 403, body: { error: 'wrong_company' } };
    if (path === STATUS_PATH) {
      const row = command(body.commandId);
      if (!row) return { http: 404, body: { error: 'unknown_command' } };
      return { http: 200, body: ['confirmed', 'refused'].includes(row.status) ? JSON.parse(row.receipt) : await reconcile(row, cfg) };
    }
    const admission = transaction(() => {
      const previous = command(body.commandId);
      if (previous) return { http: previous.hash === digest(raw) ? 200 : 409,
        body: previous.hash === digest(raw) ? JSON.parse(previous.receipt) : refuse(body, 'command_id_payload_conflict') };
      if (!cfg.enabled) return { http: 403, body: refuse(body, 'receiver_disabled') };
      if (!Object.hasOwn(cfg.targets, body.target)) return { http: 403, body: refuse(body, 'target_not_allowed') };
      const count = db.prepare('SELECT COUNT(*) AS count FROM commands WHERE created>?').get(now() - 3_600_000).count;
      if (count >= 60) return { http: 429, body: refuse(body, 'receiver_command_budget_exhausted') };
      const pending = db.prepare("SELECT id FROM commands WHERE status IN ('pending','unknown') AND json_extract(body,'$.target')=? LIMIT 1").get(body.target);
      if (pending) return { http: 409, body: refuse(body, 'target_has_unresolved_command') };
      if (body.action === 'pause_shared_login') {
        const duplicate = db.prepare('SELECT pause_id FROM holds WHERE target=? AND incident=? AND active=1 LIMIT 1').get(body.target, body.incidentId);
        if (duplicate) return { http: 409, body: refuse(body, 'incident_already_has_active_hold') };
        const pauses = db.prepare("SELECT COUNT(*) AS count FROM commands WHERE created>? AND json_extract(body,'$.action')='pause_shared_login'").get(now() - 3_600_000).count;
        if (pauses >= cfg.maxPausesPerHour) return { http: 429, body: refuse(body, 'receiver_pause_budget_exhausted') };
      } else {
        const original = command(body.pauseCommandId);
        const originalBody = original && JSON.parse(original.body);
        const liveHold = db.prepare('SELECT * FROM holds WHERE pause_id=? AND active=1').get(body.pauseCommandId);
        if (!original || original.status !== 'confirmed' || !liveHold || originalBody.action !== 'pause_shared_login' ||
            originalBody.target !== body.target || originalBody.incidentId !== body.incidentId || original.binding !== binding(body, cfg)) {
          return { http: 403, body: refuse(body, 'restore_does_not_match_active_confirmed_pause') };
        }
        const approval = db.prepare('SELECT * FROM restore_approvals WHERE command_id=? AND pause_id=?').get(body.commandId, body.pauseCommandId);
        if (!approval || approval.expires <= now()) return { http: 403, body: refuse(body, 'company_operator_restore_approval_required') };
        db.prepare('DELETE FROM restore_approvals WHERE command_id=?').run(body.commandId);
      }
      const saved = base(body);
      db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?,?)')
        .run(body.commandId, digest(raw), raw, binding(body, cfg), now(), 'pending', 'inspect', now() + 60_000, JSON.stringify(saved));
      return null;
    });
    if (admission) return admission;
    return { http: 200, body: await execute(body, cfg) };
  }

  // Local-only company operation, never an HTTP tool available to Sidecall.
  function approveRestore(pauseId, restoreId, remediationConfirmed) {
    if (remediationConfirmed !== true || !/^[A-Za-z0-9_.:-]{8,96}$/.test(restoreId)) throw new Error('Explicit local remediation confirmation and a restore command ID required.');
    transaction(() => {
      const pause = command(pauseId);
      if (!pause || pause.status !== 'confirmed' || JSON.parse(pause.body).action !== 'pause_shared_login' || command(restoreId)) throw new Error('Choose a confirmed pause and an unused restore command ID.');
      db.prepare('INSERT INTO restore_approvals VALUES(?,?,?) ON CONFLICT(command_id) DO UPDATE SET pause_id=excluded.pause_id,expires=excluded.expires')
        .run(restoreId, pauseId, now() + 900_000);
    });
  }
  return { handle, approveRestore };
}
