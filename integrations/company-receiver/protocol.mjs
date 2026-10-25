import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_BODY_BYTES = 8192;
export const COMMAND_PATH = '/v1/commands';
export const STATUS_PATH = '/v1/status';
export const digest = body => createHash('sha256').update(body).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/.test(value);

export function sign(secret, path, body, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const mac = createHmac('sha256', secret).update(`sidecall-v1\n${timestamp}\nPOST\n${path}\n${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verify(secret, path, body, signature, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof body !== 'string' || Buffer.byteLength(body) > MAX_BODY_BYTES) return false;
  const match = /^t=(\d{10,12}),v1=([a-f0-9]{64})$/.exec(signature ?? '');
  if (!match) return false;
  const age = Math.floor(now / 1000) - Number(match[1]);
  if (age > 300 || age < -30) return false;
  const expected = sign(secret, path, body, Number(match[1]) * 1000).split('v1=')[1];
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(match[2], 'hex'));
}

export function parseCommand(raw, statusOnly = false) {
  let body;
  try { body = JSON.parse(raw); } catch { throw new Error('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
  const keys = statusOnly ? ['version', 'companyId', 'commandId']
    : ['version', 'companyId', 'commandId', 'target', 'incidentId', 'action', 'policyVersion', 'pauseCommandId'];
  if (Object.keys(body).some(key => !keys.includes(key)) || body.version !== 1 || !identifier(body.companyId) ||
      !identifier(body.commandId) || body.commandId.length < 8) throw new Error('invalid_command');
  if (!statusOnly && (!identifier(body.target) || !identifier(body.incidentId) ||
      !['pause_shared_login', 'restore_shared_login'].includes(body.action) ||
      !Number.isSafeInteger(body.policyVersion) || body.policyVersion < 1 ||
      (body.action === 'restore_shared_login' ? !identifier(body.pauseCommandId) : body.pauseCommandId !== undefined))) {
    throw new Error('invalid_command');
  }
  return body;
}

// Used by a sender to reject mismatched or unauthenticated receipts. Never infer an
// account effect from an HTTP status alone; inspect the signed outcome and state.
export function readReceipt(secret, path, raw, signature, command, now = Date.now()) {
  if (!verify(secret, `${path}:receipt`, raw, signature, now)) throw new Error('invalid_receipt_signature');
  const receipt = JSON.parse(raw);
  for (const key of ['companyId', 'commandId', 'target', 'action']) {
    if (command[key] !== undefined && receipt[key] !== command[key]) throw new Error('receipt_binding_mismatch');
  }
  if (command.action !== undefined && receipt.commandHash !== digest(JSON.stringify(command))) throw new Error('receipt_command_hash_mismatch');
  if (receipt.version !== 1 || !['pending', 'unknown', 'confirmed', 'refused'].includes(receipt.status)) throw new Error('invalid_receipt');
  if (!['ACTIVE', 'SUSPENDED', null].includes(receipt.observedState) || typeof receipt.restoreEligible !== 'boolean' ||
      typeof receipt.reason !== 'string' || receipt.reason.length > 300 ||
      !['not_confirmed', 'not_requested', 'provider_acknowledged'].includes(receipt.sessionRevocation) ||
      (receipt.status === 'confirmed' && (receipt.observedState === null || !Number.isSafeInteger(receipt.observedAt)))) throw new Error('invalid_receipt_evidence');
  return receipt;
}
