import { COMMAND_PATH, STATUS_PATH, MAX_BODY_BYTES, sign, readReceipt } from './protocol.mjs';

// Transport foundation for Sidecall's sender. Nothing in the UI calls this yet.
// A timeout returns uncertainty; it NEVER creates a fresh command or retries a write.
export async function deliver({ origin, secret, command, statusOnly = false, allowLoopback = false,
  fetchImpl = fetch, now = Date.now, timeoutMs = 5000 }) {
  const url = new URL(origin);
  if ((url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && url.hostname === '127.0.0.1')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Configured HTTPS receiver origin required.');
  if (typeof secret !== 'string' || secret.length < 32 || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error('Invalid sender configuration.');
  const path = statusOnly ? STATUS_PATH : COMMAND_PATH;
  const body = statusOnly ? { version: 1, companyId: command.companyId, commandId: command.commandId } : command;
  const raw = JSON.stringify(body);
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('Command too large.');
  try {
    const response = await fetchImpl(url.origin + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', 'x-sidecall-signature': sign(secret, path, raw, now()) }, body: raw });
    if (!response.body) throw new Error('Missing receipt');
    const reader = response.body.getReader(), parts = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > MAX_BODY_BYTES) throw new Error('Receipt too large');
        parts.push(value);
      }
    } finally { await reader.cancel(); }
    const receiptRaw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
    const receipt = readReceipt(secret, path, receiptRaw, response.headers.get('x-sidecall-signature'), command, now());
    return { delivery: 'authenticated_receipt', http: response.status, receipt };
  } catch {
    return { delivery: 'unknown', commandId: command.commandId, reason: 'No matching authenticated receipt; check the same command status before further action.' };
  }
}
