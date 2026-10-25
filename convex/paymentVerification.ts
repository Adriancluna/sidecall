// A controller's attestation binds to the exact masked demo payment they reviewed. This is
// optimistic concurrency checking, not proof of a phone call or full bank-account identity.
import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const releaseContext = v.object({
  version: v.literal(1),
  paymentId: v.id("payments"),
  companyId: v.id("companies"),
  assetId: v.id("assets"),
  billId: v.id("bills"),
  requestedBy: v.id("users"),
  amountCents: v.number(),
  accountLast4: v.string(),
  heldByIncidentId: v.union(v.id("incidents"), v.null()),
  flaggedBankChangeId: v.union(v.id("bankDetailChanges"), v.null()),
  dueDate: v.union(v.number(), v.null()),
  bill: v.union(v.null(), v.object({
    companyId: v.id("companies"), assetId: v.id("assets"), amountCents: v.number(),
    description: v.string(), dueDate: v.number(),
  })),
  vendor: v.union(v.null(), v.object({ vendorName: v.string(), phoneOnFile: v.string() })),
  latestBankRecord: v.union(v.null(), v.object({
    id: v.id("bankDetailChanges"), changedAt: v.number(), accountLast4: v.string(),
    requestChannel: v.union(v.literal("email"), v.literal("portal"), v.literal("verified_call")),
  })),
});
export type ReleaseContext = Infer<typeof releaseContext>;

export const releaseAttestation = v.object({
  context: releaseContext,
  confirmedAccountLast4: v.string(),
  calledPhoneOnFile: v.boolean(),
});
export type ReleaseAttestation = Infer<typeof releaseAttestation>;

export const releaseVerification = v.object({
  context: releaseContext,
  confirmedAccountLast4: v.string(),
  calledPhoneOnFile: v.literal(true),
  attestedBy: v.id("users"),
  attestedAt: v.number(),
  method: v.literal("controller_phone_attestation"),
  identityScope: v.literal("masked_demo_account"),
  ledgerEntryId: v.id("ledgerEntries"),
});

export function makeReleaseContext(
  payment: Doc<"payments">, bill: Doc<"bills"> | null,
  vendor: Doc<"assets"> | null, latestBank: Doc<"bankDetailChanges"> | null,
): ReleaseContext {
  return {
    version: 1, paymentId: payment._id, companyId: payment.companyId,
    assetId: payment.assetId, billId: payment.billId, requestedBy: payment.requestedBy,
    amountCents: payment.amountCents, accountLast4: payment.accountLast4,
    heldByIncidentId: payment.heldByIncidentId ?? null,
    flaggedBankChangeId: payment.flaggedBankChangeId ?? null, dueDate: payment.dueDate ?? null,
    bill: bill ? { companyId: bill.companyId, assetId: bill.assetId, amountCents: bill.amountCents,
      description: bill.description, dueDate: bill.dueDate } : null,
    vendor: vendor ? { vendorName: vendor.vendorName, phoneOnFile: vendor.phoneOnFile } : null,
    latestBankRecord: latestBank ? { id: latestBank._id, changedAt: latestBank.changedAt,
      accountLast4: latestBank.accountLast4, requestChannel: latestBank.requestChannel } : null,
  };
}

export async function currentReleaseContext(ctx: QueryCtx, payment: Doc<"payments">) {
  const [bill, vendor, latestBank] = await Promise.all([
    ctx.db.get("bills", payment.billId),
    ctx.db.get("assets", payment.assetId),
    ctx.db.query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", q => q.eq("assetId", payment.assetId)).order("desc").first(),
  ]);
  return makeReleaseContext(payment, bill, vendor, latestBank);
}

// Compare values, independent of the caller's JSON object-key ordering. Every field comes from
// the strict validator above. This string is neither a secret nor a signed authorization token.
function contextValues(c: ReleaseContext) {
  return [c.version, c.paymentId, c.companyId, c.assetId, c.billId, c.requestedBy,
    c.amountCents, c.accountLast4, c.heldByIncidentId, c.flaggedBankChangeId, c.dueDate,
    c.bill && [c.bill.companyId, c.bill.assetId, c.bill.amountCents, c.bill.description, c.bill.dueDate],
    c.vendor && [c.vendor.vendorName, c.vendor.phoneOnFile],
    c.latestBankRecord && [c.latestBankRecord.id, c.latestBankRecord.changedAt,
      c.latestBankRecord.accountLast4, c.latestBankRecord.requestChannel]];
}

export function checkReleaseAttestation(current: ReleaseContext, supplied?: ReleaseAttestation):
  { ok: true } | { ok: false; rule: string; reason: string } {
  if (!supplied) return { ok: false, rule: "structured_verification_required",
    reason: "Confirm the exact destination account and the call to the number on file before releasing." };
  if (JSON.stringify(contextValues(current)) !== JSON.stringify(contextValues(supplied.context)))
    return { ok: false, rule: "verification_context_changed",
      reason: "Payment, bill or vendor details changed since verification began. Review the updated details and verify again." };
  const bill = current.bill;
  if (!bill || bill.companyId !== current.companyId || bill.assetId !== current.assetId ||
    bill.amountCents !== current.amountCents || !Number.isSafeInteger(current.amountCents) || current.amountCents <= 0 ||
    (current.dueDate !== null && current.dueDate !== bill.dueDate))
    return { ok: false, rule: "payment_bill_mismatch",
      reason: "The held payment no longer matches its saved bill. Resolve the mismatch before release." };
  if (!/^\d{4}$/.test(supplied.confirmedAccountLast4) || supplied.confirmedAccountLast4 !== current.accountLast4)
    return { ok: false, rule: "verified_account_mismatch",
      reason: "The confirmed account must match this payment's destination. Leave it held or reject it if the vendor confirmed another account." };
  const phone = current.vendor?.phoneOnFile ?? "";
  const digits = phone.replace(/\D/g, "");
  if (!supplied.calledPhoneOnFile || !/^[+\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15)
    return { ok: false, rule: "trusted_callback_required",
      reason: "Confirm that you called the stored number on file. A usable stored callback number is required." };
  // A different latest account is risk context, not an instruction to redirect the existing
  // payment. The controller can attest its exact historical destination after reviewing it.
  return { ok: true };
}
