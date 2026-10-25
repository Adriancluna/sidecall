// Double-entry postings. Each kind has one fixed pair of lines, so every entry balances.
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const POSTINGS = {
  opening: ["cash", "equity"], // money the company starts with
  bill: ["expense", "accounts_payable"], // a bill is booked: cost recognized, owed
  payment: ["accounts_payable", "cash"], // a payment goes out: debt settled, cash leaves
} as const;

export async function postLedgerEntry(
  ctx: MutationCtx,
  entry: {
    kind: keyof typeof POSTINGS;
    companyId: Id<"companies">;
    amountCents: number;
    date: number;
    memo: string;
    billId?: Id<"bills">;
    paymentId?: Id<"payments">;
  },
) {
  const [debit, credit] = POSTINGS[entry.kind];
  return await ctx.db.insert("ledgerEntries", {
    companyId: entry.companyId,
    date: entry.date,
    memo: entry.memo,
    billId: entry.billId,
    paymentId: entry.paymentId,
    lines: [
      { account: debit, debitCents: entry.amountCents, creditCents: 0 },
      { account: credit, debitCents: 0, creditCents: entry.amountCents },
    ],
  });
}
