// Double-entry ledger for one company. Optional for the demo: if Hyphenate is lukewarm, stop rendering this.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { dateTime, money } from "./format";
import { Card, Empty } from "./ui";

const ACCOUNT_LABEL: Record<
  Doc<"ledgerEntries">["lines"][number]["account"],
  string
> = {
  cash: "Cash",
  accounts_payable: "Accounts payable",
  expense: "Expense",
  equity: "Equity",
};

// Company users always get their own ledger; the firm would pass companyId.
export function LedgerPanel() {
  const ledger = useQuery(api.payments.getLedger, {});

  return (
    <Card
      title="Ledger"
      aside={
        ledger && (
          <span className="text-sm">
            Cash {money(ledger.balances.cash)} · AP{" "}
            {money(ledger.balances.accounts_payable)}
          </span>
        )
      }
    >
      {!ledger?.entries.length ? (
        <Empty>{ledger === undefined ? "Loading…" : "No entries."}</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ash">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">Memo</th>
              <th className="py-1 font-medium">Account</th>
              <th className="py-1 text-right font-medium">Debit</th>
              <th className="py-1 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {ledger.entries.flatMap((e) =>
              e.lines.map((l, i) => (
                <tr
                  key={`${e._id}-${i}`}
                  className={i === 0 ? "border-t border-line" : ""}
                >
                  <td className="py-1 text-ash">
                    {i === 0 ? dateTime(e.date) : ""}
                  </td>
                  <td className="py-1">{i === 0 ? e.memo : ""}</td>
                  <td className={`py-1 ${l.creditCents ? "pl-4" : ""}`}>
                    {ACCOUNT_LABEL[l.account]}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {l.debitCents ? money(l.debitCents) : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {l.creditCents ? money(l.creditCents) : ""}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
