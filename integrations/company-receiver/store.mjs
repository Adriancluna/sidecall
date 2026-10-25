import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';

export function openStore(path) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY, hash TEXT NOT NULL, body TEXT NOT NULL, binding TEXT NOT NULL,
      created INTEGER NOT NULL, status TEXT NOT NULL, phase TEXT NOT NULL,
      lease_until INTEGER NOT NULL, receipt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS targets (target TEXT PRIMARY KEY, owned INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS holds (
      pause_id TEXT PRIMARY KEY, target TEXT NOT NULL, incident TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS holds_by_target ON holds(target, active);
    CREATE TABLE IF NOT EXISTS restore_approvals (
      command_id TEXT PRIMARY KEY, pause_id TEXT NOT NULL, expires INTEGER NOT NULL
    );`);
  const transaction = operation => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const command = id => db.prepare('SELECT * FROM commands WHERE id=?').get(id);
  const receipt = id => { const row = command(id); return row ? JSON.parse(row.receipt) : null; };
  const update = (id, patch, phase) => {
    const previous = receipt(id);
    const next = { ...previous, ...patch };
    db.prepare('UPDATE commands SET status=?, phase=COALESCE(?,phase), receipt=? WHERE id=?')
      .run(next.status, phase ?? null, JSON.stringify(next), id);
    return next;
  };
  return { db, transaction, command, receipt, update, close: () => db.close() };
}
