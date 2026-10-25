import { createServer } from 'node:http';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openStore } from './store.mjs';
import { createReceiver } from './receiver.mjs';
import { oktaProvider } from './okta.mjs';
import { COMMAND_PATH, STATUS_PATH, MAX_BODY_BYTES, sign } from './protocol.mjs';

export function receiverServer({ receiver, secret, now = Date.now }) {
  let active = 0, windowStart = now(), requests = 0;
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5000, maxHeaderSize: 4096 }, async (req, res) => {
    const send = (http, body, path) => {
      const raw = JSON.stringify(body);
      res.writeHead(http, { 'content-type': 'application/json', 'cache-control': 'no-store',
        ...(path ? { 'x-sidecall-signature': sign(secret, `${path}:receipt`, raw, now()) } : {}) });
      res.end(raw);
    };
    if (now() - windowStart >= 60_000) { requests = 0; windowStart = now(); }
    if (++requests > 120 || active >= 16) return send(429, { error: 'receiver_busy' });
    if (req.method !== 'POST' || ![COMMAND_PATH, STATUS_PATH].includes(req.url)) return send(404, { error: 'not_found' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'json_required' });
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) return send(413, { error: 'body_too_large' });
    active++;
    try {
      let bytes = 0; const parts = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) { send(413, { error: 'body_too_large' }); return; }
        parts.push(chunk);
      }
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
      const output = await receiver.handle(req.url, raw, req.headers['x-sidecall-signature']);
      send(output.http, output.body, req.url);
    } catch {
      if (!res.headersSent) send(500, { error: 'receiver_unavailable_check_command_status' });
    } finally { active--; }
  });
  return server;
}

export function loadRuntime(env = process.env) {
  const statePath = resolve(env.RECEIVER_DB ?? 'integrations/company-receiver/.state/commands.sqlite');
  if (!env.RECEIVER_COMPANY_ID || !env.RECEIVER_SIGNING_SECRET || !env.RECEIVER_TARGETS_JSON) throw new Error('Receiver company, secret and allowlist are required.');
  const targets = JSON.parse(env.RECEIVER_TARGETS_JSON);
  if (!targets || Array.isArray(targets) || typeof targets !== 'object' || Object.keys(targets).length < 1 || Object.keys(targets).length > 3 ||
      Object.entries(targets).some(([alias, id]) => !/^[A-Za-z0-9_.:-]{1,96}$/.test(alias) || typeof id !== 'string' || !/^00u[A-Za-z0-9]{8,64}$/.test(id))) {
    throw new Error('Allowlist must map one to three target aliases to dedicated Okta test user IDs.');
  }
  const provider = oktaProvider({ orgUrl: env.OKTA_ORG_URL, token: env.OKTA_API_TOKEN });
  const disabledFile = `${statePath}.disabled`;
  const getConfig = () => ({ companyId: env.RECEIVER_COMPANY_ID, secret: env.RECEIVER_SIGNING_SECRET, targets,
    demoResetTarget: env.RECEIVER_DEMO_RESET_TARGET ?? null,
    enabled: env.RECEIVER_ENABLED === 'true' && !existsSync(disabledFile),
    maxPausesPerHour: Number(env.RECEIVER_MAX_PAUSES_PER_HOUR ?? '3') });
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  const store = openStore(statePath);
  try {
    return { store, receiver: createReceiver({ store, provider, getConfig }), secret: env.RECEIVER_SIGNING_SECRET, statePath, disabledFile };
  } catch (error) { store.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const runtime = loadRuntime();
    const server = receiverServer(runtime);
    const port = Number(process.env.RECEIVER_PORT ?? 4319);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid receiver port.');
    // A TLS reverse proxy/tunnel may forward here; never expose plaintext on LAN.
    server.listen(port, '127.0.0.1', () => console.log(`Company receiver listening on loopback port ${port}; provider effects require explicit configuration.`));
    const stop = () => server.close(() => { runtime.store.close(); process.exit(0); });
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch { console.error('Receiver setup failed. Check local configuration; credentials are never printed.'); process.exitCode = 1; }
}
