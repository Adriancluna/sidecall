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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ash">
              <tr>
                <th className="w-32 py-1 pr-4 font-medium">Date</th>
                <th className="py-1 pr-4 font-medium">Memo</th>
                <th className="w-40 py-1 pr-4 font-medium">Account</th>
                <th className="w-28 py-1 pr-4 text-right font-medium">Debit</th>
                <th className="w-28 py-1 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.flatMap((e) =>
                e.lines.map((l, i) => (
                  <tr
                    key={`${e._id}-${i}`}
                    className={i === 0 ? "border-t border-line" : ""}
                  >
                    <td className="py-1 pr-4 align-top whitespace-nowrap text-ash">
                      {i === 0 ? dateTime(e.date) : ""}
                    </td>
                    <td className="py-1 pr-4 align-top">
                      {i === 0 ? e.memo : ""}
                    </td>
                    <td
                      className={`py-1 pr-4 align-top whitespace-nowrap ${l.creditCents ? "pl-4" : ""}`}
                    >
                      {ACCOUNT_LABEL[l.account]}
                    </td>
                    <td className="py-1 pr-4 text-right align-top whitespace-nowrap tabular-nums">
                      {l.debitCents ? money(l.debitCents) : ""}
                    </td>
                    <td className="py-1 text-right align-top whitespace-nowrap tabular-nums">
                      {l.creditCents ? money(l.creditCents) : ""}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
