import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../layout/errors";
import { money, dateTime } from "./format";
import { Card, Skeleton } from "./ui";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD } from "./styles";

export function PurchaseControls() {
  const overview = useQuery(api.purchases.overview, {});
  const bills = useQuery(api.payments.getMyBills, {});
  const record = useQuery(
    api.purchases.getRecord,
    overview?.receipts.length ? {} : "skip",
  );
  const approve = useMutation(api.purchases.approve);
  const revoke = useMutation(api.purchases.revoke);
  const load = useMutation(api.purchases.loadSamples);
  const [selected, setSelected] = useState<string[]>([]);
  const [perPurchase, setPerPurchase] = useState("250");
  const [budget, setBudget] = useState("300");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [presenterKey, setPresenterKey] = useState("");
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  if (overview === undefined || bills === undefined) return <Skeleton />;
  if (!overview) return null;
  const eligible = bills.filter((b) => !b.payment);
  const chosen = eligible.filter((b) => selected.includes(b.bill._id));
  const settled = overview.receipts.filter((r) => r.outcome === "paid_demo");
  // Keep every receipt in the export while preventing repeated refusals from burying useful work.
  const grouped = new Map<
    string,
    { receipt: (typeof overview.receipts)[number]; count: number }
  >();
  for (const receipt of overview.receipts) {
    const key =
      receipt.outcome === "paid_demo"
        ? receipt._id
        : `${receipt.mandateId}:${receipt.billId}:${receipt.rule}`;
    const previous = grouped.get(key);
    if (previous) previous.count += 1;
    else grouped.set(key, { receipt, count: 1 });
  }
  const download = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record, null, 2))}`;
  return (
    <Card title="Automatic purchasing">
      <p className="max-w-prose text-sm leading-relaxed text-ash">
        Approve specific bills once, then let your AP clerk or existing
        assistant request them. Sidecall checks the saved bill, payee, expiry
        and budget in the same transaction as settlement. Confirmed incident
        holds still require human review.
      </p>
      <p className="mt-2 text-sm text-amber">
        Demo ledger only · No bank or Visa transaction is sent.
      </p>
      {overview.canApprove && overview.enabled && (
        <details
          className="mt-5 rounded-tile border border-line p-4"
          open={overview.mandates.length === 0}
        >
          <summary className="cursor-pointer font-medium">
            Set a purchasing approval
          </summary>
          <p className="mt-3 text-sm text-ash">
            Choose up to 25 unchanged bills from one vendor with a verified
            payee record. This replaces that vendor’s previous approval and
            expires in one hour.
          </p>
          <div className="my-4 space-y-2">
            {eligible.length === 0 && (
              <p className="text-sm text-ash">
                No bills without a payment yet.
              </p>
            )}
            {eligible.map((b) => (
              <label
                key={b.bill._id}
                className="flex items-start gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-amber"
                  checked={selected.includes(b.bill._id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, b.bill._id]
                        : selected.filter((id) => id !== b.bill._id),
                    )
                  }
                />
                <span>
                  {b.bill.description} · {money(b.bill.amountCents)}
                  <span className="block text-ash">{b.vendorName}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid max-w-lg gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Per purchase (USD)
              <input
                className={`${FIELD} mt-1 w-full`}
                type="number"
                min="0.01"
                step="0.01"
                value={perPurchase}
                onChange={(e) => setPerPurchase(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Total budget (USD)
              <input
                className={`${FIELD} mt-1 w-full`}
                type="number"
                min="0.01"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
          </div>
          <button
            disabled={busy || chosen.length === 0}
            className={`${BUTTON_PRIMARY} mt-4`}
            onClick={() =>
              void run(
                () =>
                  approve({
                    billIds: chosen.map((b) => b.bill._id),
                    perPurchaseCents: Math.round(Number(perPurchase) * 100),
                    budgetCents: Math.round(Number(budget) * 100),
                    expiresAt: Date.now() + 3_600_000,
                  }),
                "Approval saved. Your clerk or assistant can now request these purchases.",
              )
            }
          >
            Approve {chosen.length || "selected"}{" "}
            {chosen.length === 1 ? "purchase" : "purchases"} for one hour
          </button>
          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-sm text-ash">
              Load synthetic purchases for a demo
            </summary>
            <p className="mt-2 max-w-prose text-sm text-ash">
              Adds $120, $180 and $210 sample orders with a synthetic verified
              payee. Approve all three with a $300 total budget; only $300 can
              settle.
            </p>
            <label className="mt-3 block text-sm">
              Presenter key (if configured)
              <input
                className={`${FIELD} mt-1 block`}
                type="password"
                autoComplete="off"
                value={presenterKey}
                onChange={(e) => setPresenterKey(e.target.value)}
              />
            </label>
            <button
              className={`${BUTTON_SECONDARY} mt-3`}
              disabled={busy}
              onClick={() =>
                void run(
                  () => load({ presenterKey: presenterKey || undefined }),
                  "Sample purchases ready. Select the three Northstar bills above.",
                )
              }
            >
              Load sample purchases
            </button>
          </details>
        </details>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-5 space-y-3">
        {overview.mandates.map((m) => (
          <div key={m._id} className="rounded-tile border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs text-ash">Current approval</p>
                <h3 className="font-semibold">{m.vendorName}</h3>
                <p className="mt-1 text-sm text-ash">
                  {m.billCount} saved {m.billCount === 1 ? "bill" : "bills"} ·
                  payee ••{m.accountLast4} · approved by {m.approvedByName}
                </p>
              </div>
              {overview.canApprove && m.revokedAt === undefined && (
                <button
                  className={BUTTON_SECONDARY}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => revoke({ mandateId: m._id }),
                      "Approval revoked. New automatic purchases will be refused.",
                    )
                  }
                >
                  Revoke approval
                </button>
              )}
            </div>
            <p className="mt-3 text-xl font-semibold tabular-nums">
              {money(m.spentCents)}{" "}
              <span className="text-sm font-normal text-ash">
                of {money(m.budgetCents)} spent · {money(m.perPurchaseCents)}{" "}
                per purchase
              </span>
            </p>
            <p className="mt-2 text-xs text-ash">
              {m.revokedAt !== undefined
                ? `Revoked ${dateTime(m.revokedAt)}`
                : `Expires ${dateTime(m.expiresAt)}; checked on every request`}
            </p>
          </div>
        ))}
      </div>
      {overview.receipts.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">Purchase decisions</h3>
            {record && (
              <a
                className={BUTTON_SECONDARY}
                download="sidecall-purchase-record.json"
                href={download}
              >
                Export evidence
              </a>
            )}
          </div>
          <p className="mt-1 text-xs text-ash">
            Latest 50 decisions · original approvals and saved bills ·
            company-scoped record
          </p>
          <p className="mt-3 text-sm text-ash">
            Across current and past approvals:{" "}
            <span className="font-semibold text-ok">
              {money(settled.reduce((sum, r) => sum + r.amountCents, 0))}{" "}
              automatically settled
            </span>{" "}
            · {overview.receipts.length - settled.length} refused attempts ·
            demo ledger
          </p>
          <ul className="mt-3 divide-y divide-line">
            {[...grouped.values()].map(({ receipt: r, count }) => (
              <li key={r._id} className="py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <strong
                    className={
                      r.outcome === "paid_demo" ? "text-ok" : "text-amber"
                    }
                  >
                    {r.outcome === "paid_demo"
                      ? "Automatically paid · demo"
                      : "Automatic purchase refused"}
                  </strong>
                  <span className="tabular-nums">{money(r.amountCents)}</span>
                </div>
                <p className="mt-1 max-w-prose text-ash">{r.reason}</p>
                <p className="mt-1 text-xs text-ash">
                  {count > 1 ? `${count} attempts · latest ` : ""}
                  {dateTime(r.at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
