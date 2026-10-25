# Company-owned signed response receiver

This is the receiving half of the proposed Sidecall response connection. It is a separate Node service, with its own credentials and durable SQLite command history. It is **not yet wired into the Convex response executor or the website**, and it has **not yet suspended a real Okta account**. The tests use an explicitly labelled provider substitute plus actual local HTTP requests.

## In plain English

Sidecall sends a sealed instruction naming a company, incident and previously allowed account. The receiver checks the seal and its own rules. It asks Okta to suspend that account, reads back the account state, and sends a sealed result. If a reply is lost, the sender asks about the original command instead of inventing another one.

The website's existing simulated/owned-sandbox response remains unchanged until the next integration checkpoint. A test passing here does not change any badge in the app.

## What this checkpoint implements

- HMAC-SHA256 request signatures bind the timestamp, HTTP method, exact route and raw JSON body. Five-minute age limit; at most thirty seconds of future clock skew.
- Signed receipts bind the complete command hash as well as company, command ID, action and target. A sender never treats bare HTTP 200 as account-effect proof.
- One configured company and provider tenant per durable database. Caller-controlled values cannot choose a provider URL, credential or user ID.
- One to three allowlisted account aliases, with a default budget of three new pause commands per hour. The budget survives restart. Changing the local budget is a company operation, not a Sidecall tool.
- Commands are recorded before external effects. Concurrent duplicates, restarted processes and identical retries retain their original command identity. Reusing an identity with different content is refused.
- Unknown commands block further operations on that target until reconciled or manually reviewed; other targets remain independent within the receiver budget.
- Multiple incidents can hold the same account. Removing one hold cannot release another incident's restriction.
- Restoring access requires a local, fifteen-minute, command-specific operator approval after remediation. Sidecall's signing secret cannot create that approval.
- Accounts already suspended before our request are not re-enabled by this service. Lost pause acknowledgements do not grant restoration authority merely because the account now looks suspended.
- A company-controlled disable file prevents new provider operations without removing status/history access. Already-sent operations may finish.
- Bounded bodies, request admission, provider timeouts, no redirects and no automatic write retry. No credentials or raw provider errors are returned in receipts.

## What each result means

| Result | Meaning | Next action |
|---|---|---|
| pending | A worker owns the operation; it may still be running | Check the same command later |
| confirmed | The indicated account state was read from the provider at observedAt | Display exactly that state and time |
| refused | This request did not pass the receiver's rules, or needs operator review | Show the reason; do not bypass the rule |
| unknown | The effect or reply could not be confirmed | Query status; do not assume success or failure |

A confirmed receipt is historical evidence, not a guarantee that an administrator cannot change the account afterward. `sessionRevocation=provider_acknowledged` means the API accepted that request; it is **not** proof every downstream application session ended instantly. `this_hold_released_other_holds_remain` means the account is still suspended.

## Protocol

`POST /v1/commands`, JSON content type, header `X-Sidecall-Signature: t=<seconds>,v1=<hex>`:

```json
{
  "version": 1,
  "companyId": "cedar-ridge",
  "commandId": "pause-example-0001",
  "target": "vendor-login",
  "incidentId": "incident-example-0001",
  "action": "pause_shared_login",
  "policyVersion": 1
}
```

Restoration uses a **different** commandId, action `restore_shared_login` and `pauseCommandId` pointing to the original confirmed pause. The company/target/incident must match the held account. The sender must persist its original command JSON to verify the matching receipt hash and preserve exact retries.

`POST /v1/status` uses the same signature scheme with its own route and only `{version:1, companyId, commandId}`. A status check performs read-only provider reconciliation; it does not retry a suspend/restore write. The response signature uses `<request-path>:receipt` as its domain separator, so a response cannot be replayed as a command. `client.mjs` provides the bounded sender transport and matching-receipt validation; it is not yet called by Convex.

## Local prerequisites and human steps

1. Create an [Okta Integrator Free Plan tenant](https://developer.okta.com/signup/) and complete its account/email verification. Okta requires an eligible business email; signup availability is not guaranteed. Do not purchase a plan simply to get this demo working.
2. After signup succeeds, create one dedicated disposable **non-admin** local user and activate it. Never allowlist the administrator account you use to manage the tenant. A second unrelated user supports the continuity test.
3. Configure a receiver-only API token privately. It belongs in the receiver process, **never in Convex, the browser bundle, chat or Git**. The token's actual permissions matter: this prototype uses a test-tenant SSWS token, not a production least-privilege service-app deployment.
4. Run this service with Node 24 and a persistent local disk. Node's built-in SQLite is used; no new package is needed.
5. The eventual Convex-to-receiver connection needs an HTTPS route to this service. Hosting/tunnel selection and production deployment are not completed by this checkpoint.

The user's screenshot confirms successful Integrator Free Plan signup. Private receiver credential setup is next. `configure.py` prompts for the tenant URL and a hidden API token, generates a separate signing secret and writes a git-ignored `.env.receiver.local` with mode 0600. It refuses to overwrite an existing file, contacts no service, leaves provider operations OFF and leaves the target allowlist empty. A local convenience launcher is prepared outside the repository at `/Users/ashwathram/Documents/ChatGPT/Job/pegasus-receiver-setup.command`; other machines can run `python3 integrations/company-receiver/configure.py` from their own checkout.

## Configuration

Use a git-ignored local environment file, for example `.env.receiver.local` in the repository root. These are **names and placeholders**, not usable credentials:

```dotenv
RECEIVER_COMPANY_ID=cedar-ridge
RECEIVER_SIGNING_SECRET=<at-least-32-random-characters>
RECEIVER_TARGETS_JSON={"vendor-login":"<dedicated-Okta-user-ID>"}
RECEIVER_ENABLED=false
RECEIVER_MAX_PAUSES_PER_HOUR=3
OKTA_ORG_URL=https://<your-test-tenant>.okta.com
OKTA_API_TOKEN=<receiver-only-test-tenant-token>
```

The company ID must ultimately match the company configured by the Sidecall connector. Startup rejects invalid IDs, origins and missing secrets. Explicitly enable only after mapping the intended disposable user. Do not put real account credentials into the example command or a shell-history command.

```sh
node --env-file=.env.receiver.local integrations/company-receiver/server.mjs
```

The server binds only `127.0.0.1:4319`. The default SQLite path is `integrations/company-receiver/.state/commands.sqlite`; override with RECEIVER_DB for a persistent mounted disk. Preserve the database and its WAL files when moving a running service; use a consistent backup or shut it down first. **Do not run this SQLite design on ephemeral Vercel functions or independent replicas with separate files.** Losing the database loses duplicate/hold history; that requires operator recovery, not silently starting from empty storage.

Local company controls, run with the same environment and database:

```sh
node --env-file=.env.receiver.local integrations/company-receiver/operator.mjs disable
node --env-file=.env.receiver.local integrations/company-receiver/operator.mjs enable
node --env-file=.env.receiver.local integrations/company-receiver/operator.mjs approve-restore <pause-id> <new-restore-command-id> --remediation-confirmed
```

The last command records a human assertion; it does not prove a stolen password was changed. It authorizes only that restoration request for fifteen minutes. Restoration does not resurrect revoked sessions or tokens. External administrator changes and provider-specific app sessions still require company IT judgment.

## Verification and remaining work

```sh
node --test integrations/company-receiver/receiver.test.mjs
```

The checkpoint covers forged/expired/future signatures, body/path/company binding, allowlist, concurrency and restart replay, pause quota, disable, lost pause/restore replies, stale in-progress reconciliation, pre-existing suspension, local restoration consent/expiry, multiple incident holds, changed mappings, signed HTTP receipts, payload limits, sender uncertainty and exact Okta adapter request paths. All provider-effect cases are controlled test doubles; one test uses real loopback HTTP. No Okta credential or live tenant was used.

Next: bind these commands to existing Convex policy/authority checks, persist outbound jobs and receipts, and expose pending/unknown/refused/confirmed outcomes in the response UI. Then verify an actual disposable account and unrelated account through the provider. Finally rehearse the selected deployed frontend/backend/receiver together before recording or claiming the integration works.

Official references: [Okta free-plan setup](https://developer.okta.com/docs/reference/org-defaults/), [user lifecycle API](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/UserLifecycle/), [user sessions API](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/UserSessions/), [Universal Logout limitations and integration](https://developer.okta.com/docs/guides/oin-universal-logout-overview/), [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).
