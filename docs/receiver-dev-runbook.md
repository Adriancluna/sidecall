# Sidecall signed-response DEV checkpoint

Updated October 24, 2026 by Pegasus. This is an operating note, not a production-release claim.

## What now works

An authorized detector reports a synthetic shared-login incident. Convex checks the company's existing response policy and confirmed relationship. For the one configured company and asset, it saves a command before sending it. The separate receiver verifies the signature and its own allowlist, suspends the disposable Okta account, reads its state, and returns a signed receipt. Convex saves that result; the company's live UI updates from it.

The live acceptance run recorded confirmation about three seconds after the report. A second test account stayed ACTIVE. The company IT view requested restoration; a local operator approved that exact restore command for this synthetic test; the real UI sent it; Okta and the UI then showed ACTIVE. The synthetic detector credential was revoked and the incident contained after verification. No real compromise or real payment occurred.

Evidence: [integrated report](evidence/convex-okta-live-proof.json), [UI screenshot](evidence/receiver-ui-restored.jpg), [earlier isolated receiver proof](evidence/okta-receiver-live-proof.json).

## Where each part runs

| Part | Current location | What it holds |
| --- | --- | --- |
| Frontend | http://127.0.0.1:5180/ | UI and the user's authenticated demo session |
| Backend | Convex DEV `tangible-koala-842` | Policies, incidents, exact outbound commands, signed-receipt results and command-signing secret |
| Company receiver | This Mac, loopback port 4319 | Okta token, matching signing secret, one-user allowlist and persistent SQLite history |
| HTTPS route | Temporary Cloudflare Quick Tunnel | Routes authenticated commands to the receiver; it does not host the service or its database |
| Provider | The user's new Okta Integrator Free Plan tenant | Original administrator and two labelled disposable non-admin test users |
| Public website | Existing Vercel deployment | **Unchanged; this checkpoint does not establish public-site integration** |

The Okta token is saved only in git-ignored `.env.receiver.local`, mode 0600. It is not sent to Convex or the frontend. `RESPONSE_RECEIVER_SECRET` is a separate command-signing key. Never paste either secret into chat, source code, screenshots or demo slides.

## What the UI means

| Label | Meaning |
| --- | --- |
| Confirmation pending | Delivery or reconciliation is still running; no confirmed provider effect yet |
| Confirmation unknown | The request or reply may have been lost; the account might already be suspended |
| Receiver refused | The configured receiver or dispatch checks did not allow this command |
| Pause confirmed | The receiver returned a matching authenticated receipt reporting SUSPENDED at the displayed time |
| Awaiting operator | Restoration needs separate company-local approval after remediation |
| Incident hold released | That incident's restriction was released; read the restore receipt for ACTIVE versus still SUSPENDED under other holds |

These are historical observations. An administrator can later change Okta state. A session-revocation acknowledgement does not prove every downstream app session ended. The test users had no established downstream sessions, so this proof cannot demonstrate their termination.

## Operating the current DEV connection

The receiver, tunnel and Vite frontend were left running for inspection. **Keep this Mac awake and online.** There is no scheduled Codex automation to create: Convex's scheduled jobs run in response to authorized incident events.

To stop new receiver operations while retaining status/evidence access, run from the Sidecall checkout:

```sh
node --env-file=.env.receiver.local integrations/company-receiver/operator.mjs disable
```

This cannot recall an operation already sent to Okta. To resume this same reviewed configuration, `operator.mjs enable` clears the local disable marker; both local `RECEIVER_ENABLED=true` and Convex `RESPONSE_RECEIVER_LIVE=true` must also be set. Do not enable a newly changed target without inspecting it.

If the receiver process alone stops, restart it with:

```sh
node --env-file=.env.receiver.local integrations/company-receiver/server.mjs
```

Preserve `.state/dev-commands.sqlite` and its journal files. The earlier standalone proof uses a different database and company alias. Do not substitute it for the integrated database or delete the integrated database to resolve an error.

If the tunnel stops, **do not assume restarting it restores the same route**. Quick Tunnels get a new hostname. The Convex job ledger binds old jobs to their original connection configuration. Preserve that evidence and reconcile unresolved commands before changing the route; this prototype intentionally refuses to silently redirect old commands. A stable deployment needs a fixed HTTPS hostname and persistent receiver storage. [Cloudflare's Quick Tunnel limits](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Restore an actual demo pause

1. The company's IT lead or controller chooses **Prepare restoration** in Sidecall.
2. The receiver operator checks that the incident has been remediated and that no other restriction should remain. For synthetic acceptance cleanup, verify that it is the disposable test account and the synthetic incident.
3. Using the exact two command IDs shown in the UI, run:

   ```sh
   node --env-file=.env.receiver.local integrations/company-receiver/operator.mjs approve-restore <pause-command-id> <restore-command-id> --remediation-confirmed
   ```

4. Within fifteen minutes, choose **Send approved restore** in Sidecall.
5. Read the receipt. ACTIVE means the account was observed active. SUSPENDED can mean another incident still holds it. Unknown means check the same command rather than issue a fresh restore.

Local approval is a human assertion, not proof that a stolen password was rotated. Sidecall's signing key alone cannot grant it. Previously revoked sessions or tokens are not resurrected.

## Rehearsal and release limits

The stage Reset button works with unfinished tests. It first freezes new demo actions, cancels unsent pauses and reconciles any possibly-sent commands. For a confirmed pause owned by the receiver, it sends a signed restoration bound to that original pause. Automatic reset restoration requires the receiver's local `RECEIVER_DEMO_RESET_TARGET=disposable-vendor-login` opt-in; it applies only to that allowlisted disposable target. Ordinary restoration still requires local operator approval. Reset never recreates revoked sessions or tokens.

Only after recovery is confirmed does Reset clear simulated payments, purchase approvals, AI runs and unrelated incidents, then rebuild the financial fixtures. Company/user/asset IDs, sign-ins, real command receipts and their incident history remain available. Retained practice episodes are closed with an explicit demo-reset note so the next take creates a fresh episode. This is not a claim that a real compromise was remediated.

Unknown results are checked using the same command identity, without repeating a provider write. Reset stops after three minutes or on a refusal, shows the error and keeps the demo data and recovery evidence. A receipt that merely releases one hold while the account is still SUSPENDED is insufficient to finish. Fix the reported receiver problem before retrying; uncertain suspension ownership still requires manual review.

Reset is batched; wait for **Ready for the next practice run**, not merely an enabled button. An already-sent model call may incur usage but cannot settle while reset is running or after its run is cleared. Existing response policies and receiver limits remain in force, including the hourly pause budget. The stage path bounds command/incident scans to 1,000 each; larger histories require operator archival.

Live DEV verification of automatic Reset passed nine checks, including an independent Okta ACTIVE read-back, unchanged control account, retained pause evidence, cleared practice data and surviving sign-in: [reset evidence](evidence/reset-okta-dev.json).

Open `/?stage`, expand Simulator, enter the existing presenter key and click Reset. The controller can load the office-supply sample bills again after reset. This behavior replaces the earlier blanket reset prohibition; historical evidence documents describe the behavior at the time of their runs.

The default receiver budget is three new pauses per hour. A reused report or command does not cause another pause. A fresh incident after cleanup still counts toward the budget. Plan rehearsals around that limit; do not remove the limit to disguise a failed demo.

The next checkpoint should make repeated stage runs convenient without deleting the external ledger, then choose stable hosting and verify the intended final frontend/backend together. No production deployment has occurred here.

The [full MVP rehearsal](full-mvp-rehearsal.md) subsequently passed a second integrated Okta cycle alongside payment, Claude and continuity checks. The receiver harness now supports `--run-id <unique-label>` after `--disposable-test-only`, using the same label for `pause` and `verify-restored`. Each run preserves its own report; existing incidents must still be contained and both test users ACTIVE before a fresh pause. This does not refresh purchase fixtures or bypass receiver limits.

## Honest track explanation

- **Convex:** transactional policy/command creation, role-scoped data, scheduled delivery/reconciliation and live UI updates do substantive work; external side effects themselves are not atomic with database writes.
- **Hyphenate:** the existing AP incident and payment-protection flow remains the business workflow; the receiver is an added targeted response, not a replacement for the payment demo.
- **Security/Armadin:** this demonstrates an authenticated response to a synthetic detector report, scope controls, replay resistance, uncertainty handling and real disposable-account containment; it does not prove an Armadin integration or a real detected intrusion.
- **Visa:** the purchasing/ledger path remains simulated and separate; this Okta integration does not create a Visa payment or resolve the sponsor-fit question by itself.
