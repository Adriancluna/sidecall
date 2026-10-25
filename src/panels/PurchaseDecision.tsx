import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { dateTime, humanize } from "./format";
import { BUTTON_SECONDARY, FIELD } from "./styles";
import { Chip, Skeleton } from "./ui";

type Evidence = NonNullable<Doc<"purchaseReceipts">["evidence"]>;
type Agent = { id: Id<"agents">; name: string; onBehalfOfName: string };

const amount = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function PurchasePreview({
  billId,
  agents,
}: {
  billId: Id<"bills">;
  agents: Agent[];
}) {
  const [asOf, setAsOf] = useState(() => Date.now());
  const [agentId, setAgentId] = useState<Id<"agents">>();
  const preview = useQuery(api.purchases.preview, {
    billId,
    asOf,
    executorAgentId: agentId,
  });
  const expiresAt = preview?.evidence?.expected.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined || expiresAt <= asOf) return;
    // Data changes arrive through Convex; only the passage of an expiry needs a timer.
    const timer = window.setTimeout(
      () => setAsOf((previous) => Math.max(Date.now(), previous + 1)),
      Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() + 1)),
    );
    return () => window.clearTimeout(timer);
  }, [asOf, expiresAt]);
  return (
    <div className="mt-4 rounded-tile border border-line p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-0 max-w-lg flex-1 text-sm">
          Preview requester
          <select
            className={`${FIELD} mt-1 block w-full min-w-0`}
            value={agentId ?? ""}
            onChange={(event) => {
              setAgentId(
                agents.find((agent) => agent.id === event.target.value)?.id,
              );
              setAsOf(Date.now());
            }}
          >
            <option value="">My signed-in user</option>
            {agentId && !agents.some((agent) => agent.id === agentId) && (
              <option value={agentId}>
                Selected assistant is no longer eligible
              </option>
            )}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · for {agent.onBehalfOfName}
              </option>
            ))}
          </select>
        </label>
        <button
          className={BUTTON_SECONDARY}
          onClick={() =>
            setAsOf((previous) => Math.max(Date.now(), previous + 1))
          }
        >
          Refresh preview
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ash">
        Choosing an assistant previews its authority; it does not sign you in as
        that assistant or grant it permission.
      </p>
      {preview === undefined ? (
        <div className="mt-4">
          <Skeleton rows={3} />
        </div>
      ) : preview === null ? (
        <p className="mt-4 text-sm text-ash">
          This purchase is no longer available to preview. Choose another bill.
        </p>
      ) : (
        <div className="mt-4">
          <Chip
            tone={
              preview.decision === "approved"
                ? "ok"
                : preview.decision === "refused"
                  ? "amber"
                  : "muted"
            }
          >
            {preview.decision === "approved"
              ? "Eligible now · preview only"
              : preview.decision === "refused"
                ? "Automatic purchase unavailable"
                : "No automatic approval"}
          </Chip>
          <p className="mt-2 text-sm leading-relaxed">{preview.reason}</p>
          {preview.existingPaymentId && (
            <p className="mt-2 text-sm text-ash">
              This bill already has a payment record. A preview does not create
              another payment or establish that the existing one has settled.
            </p>
          )}
          {preview.evidence && (
            <PurchaseEvidence evidence={preview.evidence} recorded={false} />
          )}
          <p className="mt-3 text-xs leading-relaxed text-ash">
            {`Evaluated ${dateTime(preview.evidence?.evaluatedAt ?? asOf)}. `}
            Every payment request rechecks the current facts and remaining
            budget. An eligible preview does not reserve money.
          </p>
        </div>
      )}
    </div>
  );
}

export function PurchaseReceiptEvidence({
  receipt,
}: {
  receipt: Doc<"purchaseReceipts">;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-medium">
        Recorded checks and purchase facts
      </summary>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-ash">
        This record describes the decision at the time of the request. Later
        changes to approvals or vendor records do not rewrite it.
      </p>
      <p className="mt-2 text-xs text-ash">
        {!receipt.evidence
          ? "Requester type was not recorded"
          : receipt.agentId
            ? "Requested by an assistant"
            : "Requested by a signed-in user"}
        {receipt.ledgerEntryId
          ? " · Linked demo ledger entry recorded"
          : " · No demo ledger entry attached"}
      </p>
      {receipt.evidence ? (
        <PurchaseEvidence evidence={receipt.evidence} recorded />
      ) : (
        <p className="mt-3 text-sm text-ash">
          This earlier decision has no saved check-by-check snapshot. Its
          original approval and reason remain in the evidence export.
        </p>
      )}
    </details>
  );
}

function PurchaseEvidence({
  evidence,
  recorded,
}: {
  evidence: Evidence;
  recorded: boolean;
}) {
  const expected = evidence.expected;
  const current = evidence.current;
  const budget = evidence.budget;
  const rows = [
    {
      label: "Bill description",
      approved: expected.bill?.description ?? "Not in this approval",
      current: current.bill.description,
      changed: expected.bill?.description !== current.bill.description,
    },
    {
      label: "Bill amount",
      approved: expected.bill
        ? amount(expected.bill.amountCents)
        : "Not in this approval",
      current: amount(current.bill.amountCents),
      changed: expected.bill?.amountCents !== current.bill.amountCents,
    },
    {
      label: "Due date",
      approved: expected.bill
        ? dateTime(expected.bill.dueDate)
        : "Not in this approval",
      current: dateTime(current.bill.dueDate),
      changed: expected.bill?.dueDate !== current.bill.dueDate,
    },
    {
      label: "Payee account suffix",
      approved: `••${expected.payee.accountLast4}`,
      current: current.payee
        ? `••${current.payee.accountLast4}`
        : "No current payee record",
      changed: expected.payee.accountLast4 !== current.payee?.accountLast4,
    },
    {
      label: "Payee verification",
      approved: `${humanize(expected.payee.requestChannel)} · ${dateTime(expected.payee.changedAt)}`,
      current: current.payee
        ? `${humanize(current.payee.requestChannel)} · ${dateTime(current.payee.changedAt)}`
        : "No current payee record",
      changed:
        expected.payee.bankDetailId !== current.payee?.bankDetailId ||
        expected.payee.changedAt !== current.payee?.changedAt ||
        expected.payee.requestChannel !== current.payee?.requestChannel,
    },
  ];
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 rounded-chip bg-raised p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-ash">
            Spent before {recorded ? "request" : "preview"}
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {amount(budget.beforeCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ash">
            {recorded
              ? "Spent after decision"
              : "Projected spend after decision"}
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {amount(budget.afterCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ash">Approved total budget</p>
          <p className="mt-1 font-semibold tabular-nums">
            {amount(budget.limitCents)}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-ash">
        {amount(Math.max(0, budget.limitCents - budget.beforeCents))} remained
        before this {recorded ? "request" : "preview"}. A refused request spends
        nothing.
        {` Approval expires ${dateTime(expected.expiresAt)}.`}
      </p>
      <ul
        className="divide-y divide-line"
        aria-label={
          recorded ? "Recorded approval checks" : "Current approval checks"
        }
      >
        {evidence.checks.map((check) => (
          <li key={check.code} className="flex items-start gap-3 py-2 text-sm">
            <span
              className={`mt-0.5 shrink-0 text-xs font-semibold ${check.passed ? "text-ok" : "text-amber"}`}
            >
              {check.passed ? "Passed" : "Not met"}
            </span>
            <span className="min-w-0 break-words leading-relaxed">
              {check.reason}
            </span>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Compare approved and {recorded ? "requested" : "current"} facts
        </summary>
        <div className="mt-3 divide-y divide-line">
          {rows.map((row) => (
            <div key={row.label} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{row.label}</p>
                <span
                  className={`text-xs ${row.changed ? "text-amber" : "text-ash"}`}
                >
                  {row.changed ? "Changed or not approved" : "Matches approval"}
                </span>
              </div>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-ash">Approved</dt>
                  <dd className="mt-1 break-words whitespace-pre-wrap">
                    {row.approved}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-ash">
                    {recorded ? "At request" : "Current"}
                  </dt>
                  <dd className="mt-1 break-words whitespace-pre-wrap">
                    {row.current}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        {expected.payee.bankDetailId !== current.payee?.bankDetailId && (
          <p className="mt-2 text-xs leading-relaxed text-amber">
            The payee verification record differs from the approved record;
            matching account suffixes cannot restore this approval.
          </p>
        )}
      </details>
    </div>
  );
}
