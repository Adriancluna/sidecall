import { loadRuntime } from './server.mjs';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

// Local company operator only: no HTTP route exposes these controls to Sidecall.
let runtime;
try {
  runtime = loadRuntime();
  const [operation, pauseId, restoreId, confirmation] = process.argv.slice(2);
  if (operation === 'disable') {
    writeFileSync(runtime.disabledFile, 'Disabled by the company operator.\n', { mode: 0o600 });
    console.log('New provider operations disabled. Already-sent operations may finish; status reconciliation remains available.');
  } else if (operation === 'enable') {
    if (existsSync(runtime.disabledFile)) unlinkSync(runtime.disabledFile);
    console.log('Local disable marker cleared; RECEIVER_ENABLED=true is still required.');
  } else if (operation === 'approve-restore') {
    runtime.receiver.approveRestore(pauseId, restoreId, confirmation === '--remediation-confirmed');
    console.log('That restore command is authorized for 15 minutes; current restrictions will still be checked.');
  } else {
    throw new Error('Use disable, enable, or approve-restore <pause-id> <restore-command-id> --remediation-confirmed.');
  }
} catch {
  console.error('Operator request refused. Check configuration, command IDs and explicit remediation confirmation. No credentials are printed.');
  process.exitCode = 1;
} finally { runtime?.store.close(); }
