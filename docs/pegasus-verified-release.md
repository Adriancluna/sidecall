# Release verification bound to the payment

Author: Pegasus. Implemented contract; live release rehearsal results are pending.

A note saying “confirmed account 2208” must not release a payment addressed to 7731. Release now requires a structured controller attestation bound to the exact held payment and the records reviewed. The [FBI's business email compromise guidance](https://www.fbi.gov/how-we-can-help-you/common-frauds-and-scams/business-email-compromise) recommends independently contacting the company and verifying changes to account numbers or payment procedures. Sidecall applies that callback pattern using the vendor's stored phone number; a recent email cannot supply the release destination or callback number.

## Contract

`payments:getHeldPayments` supplies `row.releaseContext` while a payment is held; paid/rejected rows return `null`. The context includes payment/company/vendor/bill/requester IDs, amount, destination suffix, hold references, due date, saved bill facts, vendor name/phone and the exact latest bank-record ID, timestamp, suffix and channel.

```ts
releasePayment({
  paymentId,
  verificationNote,
  verification: {
    context: row.releaseContext,
    confirmedAccountLast4,
    calledPhoneOnFile: true,
  },
})
```

`verification` is optional only for compatibility at argument validation: a legacy request without it returns an audited refusal. The server still requires a different controller at the payment's company. It compares the submitted snapshot with current records, checks the bill and payment agree, requires the confirmed four digits to equal the payment's destination, and requires a usable stored phone plus the callback assertion. The verification note must be 15–2,000 characters. Evidence supplies no additional role authority.

Changed payment amounts/destinations, bill facts, vendor phone or bank records invalidate an open verification. A replacement bank record invalidates it even with the same suffix. The latest vendor bank record is context for review, not an instruction to redirect an existing payment: an old 2208 payment can still be explicitly confirmed as 2208 while the latest vendor record ends in 7731.

Failures retain the hold and write a reasoned refusal audit without moving cash. Relevant rules include `structured_verification_required`, `verification_context_changed`, `payment_bill_mismatch`, `verified_account_mismatch` and `trusted_callback_required`; role checks retain their existing refusal rules. The server also checks the indexed paid-payment range for the bill before settlement, preventing a second held duplicate from paying it again.

On success, one mutation writes the double-entry journal, paid status, controller/time and `releaseVerification`. That record preserves the reviewed context, confirmed suffix, callback assertion, `method: "controller_phone_attestation"`, `identityScope: "masked_demo_account"` and exact ledger-entry ID. A release audit is part of the same transaction. This implementation uses [Convex's atomic mutations and serializable optimistic concurrency control](https://docs.convex.dev/database/advanced/occ): conflicting attempts re-evaluate their reads instead of independently committing a second settlement. That guarantee covers the Convex transaction, not an external payment network.

## Threat limits

The stored phone is assumed trustworthy; the checkbox records the controller's assertion, not proof a call occurred or the person answered legitimately. A dishonest or compromised controller can lie. Four digits identify only this masked demo destination and cannot distinguish all real bank accounts. The context is an ordinary snapshot, not a signed authorization token. The evidence is auditable application data, not a tamper-proof attestation. No bank/Visa connector or real money movement is claimed.

## Verification and evidence

[Backend regressions](../convex/paymentVerification.test.ts) cover old-account prose, omitted/mismatched verification, changed amount/destination/bill/phone/same-suffix bank records, fresh-context bill mismatch, unusable callback numbers, historical destinations, duplicate held-payment races, immutable release evidence and unauthorized actors.

The [focused live rehearsal](../scripts/release/README.md) uses actual authenticated requests on Pegasus's own DEV, including concurrent $480,000 releases, a real synthetic payee-record replacement and Cedar Ridge isolation followed by its separately verified $92,000 payment. Its report records source commit, timestamps, results, contexts, journal entries, audits and session cleanup. Callback assertions are explicitly simulated. **Live pass counts and report conclusions remain pending until that run completes.** Offline mocked harness results do not establish a live backend pass.
