# Recover a rejected bill without reopening the unsafe destination

Author: Pegasus · Oct 24, 2026.

A hold is only half the business outcome. After a controller verifies the old account ending 2208 and rejects a request addressed to 7731, the ordinary request path still selects the vendor's latest 7731 record. This follow-up gives that specific bill a reviewed correction while leaving the shared vendor master unchanged.

1. A different company controller calls the number already on file, confirms the existing phone-confirmed destination and amount, and prepares a correction for the rejected bill.
2. A separate AP clerk requests the correction within 15 minutes. Convex checks the exact invoice, payment, vendor contact, latest bank record, selected verified record and controller authority again.
3. The replacement is always held, including after containment or when automatic holds are disabled. The existing controller release requires fresh structured verification and writes the final ledger entry atomically.

Eight retries of one proposal create one replacement; concurrent release attempts produce one debit. An unrelated pre-approved purchase can still settle while the rejected bill is being recovered. The original payment remains rejected, and the replacement links to both it and the immutable correction proposal. No model or requester can change the vendor master, invent a new destination, approve a correction or release money through this API.

## Contract and boundaries

`paymentRecovery.getForPayment({paymentId})` returns company-scoped recovery options only for a rejected payment. It exposes current facts separately from the saved proposal's amount and suffix. It returns no company details to the firm or another company. Role flags and stale-fact warnings are reactive; a local one-shot timer handles proposal expiry in the UI, and the mutation independently enforces expiry.

`prepare({paymentId, context, bankRecordId, bankRecordChangedAt, confirmedAccountLast4, calledPhoneOnFile, verificationNote})` requires a controller other than the original requester. The selected record must be the vendor's current latest `verified_call` record and differ from the rejected destination. The snapshot and bank timestamp must match, the bill must agree with the payment, the stored callback must be usable and the note must contain 15–2,000 characters. A new preparation supersedes the previous unused proposal.

`requestReplacement({proposalId})` requires a separate company AP clerk. It rechecks the controller's current role/company, original rejection, newest rejected request for the bill, absence of a live/paid payment, all saved facts and expiry. It consumes the proposal and creates one held payment atomically. Exact retries return that same payment ID; they never create another request or restore a rejected replacement. This operation bypasses automatic purchasing deliberately: correction authority is not payment authority.

`revoke({proposalId})` lets a company controller withdraw an unused proposal. After consumption, decide the replacement through its existing held-payment controls. A later correction cannot revive an old proposal. No browser arguments accept an acting-user ID.

`paymentRecoveries` preserves the original snapshot, selected bank record/time/suffix, controller/time/note, expiry, status, and replacement/requester link. `payments.recoveryFromPaymentId` and `recoveryProposalId` preserve the chain. The normal `releaseVerification.ledgerEntryId` completes it. Audits record preparation, withdrawal, request and refusal. New indexed reads are bounded; there is no background auto-release, new dependency, chatbot change or external payment connector.

The stored phone and `verified_call` record are trusted inputs in this prototype. The checkbox records a human assertion; it does not prove a call occurred. Four digits are masked demo identifiers, not unique real bank identities. Missing prior verified records require separate vendor verification; this feature does not invent new bank details. A controller can lie, and database administrators are outside this boundary. This is a synthetic workflow demonstration, not a fraud-accuracy benchmark.

## Validation

Seventeen backend regression cases cover the completed chain, concurrent request/release, wrong actors and company scope, wrong account/no callback/short note/unverified record, changed invoice/contact/bank/proposer, in-place provenance timestamp changes, expiry/withdrawal/supersession, containment and disabled hold policy, and an ordinary request racing the correction.

The live runner, `scripts/recovery/rehearse.mjs`, requires explicit Pegasus DEV selection and a matching local selector/cloud URL, refuses deployment-key/self-hosted overrides, does not reset/deploy/call a model, signs out issued sessions and revokes its routine-purchase mandate. It uses the original rehearsal's clean seeded data and the configured presenter key for synthetic sample setup. Run:

```sh
node scripts/recovery/rehearse.mjs --deployment tangible-koala-842 --report scripts/recovery/report.json
```

Run the original own-DEV rehearsal separately first. Never pass a key on a command line or commit an env file. Live evidence and browser validation will be recorded after execution; no pending result is a claimed pass.

## Why this adds depth

The supplied Visa starter pack weights commerce impact and UX at 20% each and explicitly includes secure payments; it does not supply proprietary Visa APIs. This closes a specific merchant-payment failure instead of adding another dashboard. Visa's [Intelligent Commerce overview](https://corporate.visa.com/en/products/intelligent-commerce.html) emphasizes controls and authentication around automated buying. Convex's [serializable transactions](https://docs.convex.dev/database/advanced/occ) support the consume-once correction and settlement checks. These sources motivate the design; this feature is not Visa certification or an integration.

Keep this follow-up separate from the accepted #125/#127 batch. Role 1 owns release review and any production merge; the existing three-minute demo remains usable without it.
