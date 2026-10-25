# Focused release verification rehearsal

This runner exercises real authenticated Convex release mutations on Pegasus's synthetic DEV, `tangible-koala-842`. It requires the structured release-verification contract: `getHeldPayments` supplies `releaseContext`, and `releasePayment` accepts `verification: { context, confirmedAccountLast4, calledPhoneOnFile }`. The context is copied from the server row without reconstructing its fields.

Prepare the reviewed backend on that DEV and run the original rehearsal separately so it finishes with clean seeded data. This runner never deploys, resets, changes configuration or calls a model. It reads only the deployment's non-secret `DEMO_MODE` and `AI_LIVE` flags before signing in; demo mode must be true and live AI must be false or unset. It requires an explicit target and matching local DEV selector/cloud URL, and revalidates the guard before every API or operator call. Production, Adrian's DEV, other DEV names, deployment-key aliases and self-hosted overrides are refused.

This harness is independent of the purchasing PR and needs no purchase sample setup. Its internal fixture is DEMO_MODE-only and accepts only the seeded held $480K Brightline payment; it inserts a same-suffix bank record without changing the payment. The original rehearsal still needs the matching presenter key where configured.

```sh
node scripts/release/rehearse.mjs --deployment tangible-koala-842 --report scripts/release/report.json
```

The report includes full source commit SHA, start/end and per-check timestamps, actual business outcomes, contexts, ledger entries, refusal/release audit rows and session cleanup. Authentication credentials remain in memory and are redacted from output. Existing process environment takes precedence over `.env.local`, then `.env`; the runner never writes those files.

The checks cover:

- Missing structured verification produces an audited refusal and no cash movement.
- Confirming `2208` cannot release the $480,000 payment addressed to `7731`.
- Failing to confirm the stored phone, the requesting AP clerk, and another company's controller each leave that payment held and its ledger unchanged.
- The seeded held Brightline payment’s release context is captured, and a new payee record with the same suffix is inserted through the restricted internal fixture; the old context must be refused without changing cash or the destination.
- Two concurrent valid $480,000 releases yield exactly one success, one refusal, one accounts-payable debit/cash credit and one release audit entry, retaining destination `7731`.
- Those Summit checks leave Cedar Ridge's ledger and payment states unchanged.
- Cedar Ridge can then separately confirm its own $92,000 payment already addressed to historical account `2208`; this verifies that the latest vendor account does not silently redirect an older payment.

Phone confirmations are **simulated test assertions**, not actual calls or real-world verification. All settlement uses the demo ledger. The runner creates synthetic incident and bank-record evidence and leaves the two valid releases paid for inspection. Run the original rehearsal separately again before a clean rerun or stage demo. It never releases an arbitrary user-selected payment or changes a payment's account.

All three temporary demo sessions are signed out in `finally`, including failed runs; a cleanup failure fails the report. No MCP credentials are minted. Transport failures are not automatically retried, and raw command/API errors are withheld. The exported `optionsFor`, `createTransport` and `runRehearsal` functions allow offline mocked verification without calling the live entry point.
