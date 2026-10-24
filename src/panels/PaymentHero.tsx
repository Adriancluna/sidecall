// The money moment (demo beat 1-3): one held payment, as a case file. Left: what is held and the
// evidence (the account that changed by email). Right: the decision rail for this person, and the
// audit record that updates live when anyone acts.
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { humanize, money } from "./format";
import { AccountChange, DecisionForm, PaymentAudit, PhoneOnFile, WhyHeld } from "./PaymentCard";
import { dueIn, usePaymentDecision, type Viewer } from "./usePaymentDecision";
import type { HeldPaymentRow } from "./types";
import { Chip, Eyebrow } from "./ui";

type Props = {
  row: HeldPaymentRow;
  escalation?: string;
  viewer: Viewer;
  others: number;
  onOpenTab: (tab: string) => void;
};

export function PaymentHero({ row, escalation, viewer, others, onOpenTab }: Props) {
  const { payment, bankChange } = row;
  const decision = usePaymentDecision(row, viewer);
  const [now] = useState(() => Date.now());
  const due = dueIn(payment.dueDate, now);
  // Name the colleague who can release it (same company, controller, not the requester).
  const controller = useQuery(api.blastRadius.listUsers, {})?.find(
    (u) => u.companyId === payment.companyId && u.role === "controller" && u._id !== payment.requestedBy,
  );
  const lead = bankChange
    ? `The account it pays was changed by ${humanize(bankChange.requestChannel)} ${bankChange.daysBeforeIncident} days before the breach.`
    : `${row.vendorName} has an active security incident, so this payment waits for a person to verify it.`;

  return (
    <section
      aria-labelledby="hero-title"
      className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:gap-x-16"
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <Eyebrow>
          <Chip tone="amber">Held until verified</Chip>
          {escalation ? (
            <span className="font-semibold text-paper">Decision needed today{due && ` · ${due}`}</span>
          ) : (
            due && <span>{due[0].toUpperCase() + due.slice(1)}</span>
          )}
          <span>{row.companyName}</span>
        </Eyebrow>

        <h1 id="hero-title" className="mt-6">
          <span className="block text-display font-semibold tabular-nums">{money(payment.amountCents)}</span>
          <span className="mt-3 block text-2xl font-medium tracking-tight text-ash md:text-3xl">
            to <span className="text-paper">{row.vendorName}</span>
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-snug font-medium text-balance md:text-2xl">{lead}</p>

        {bankChange && (
          <div className="mt-8 max-w-3xl">
            <AccountChange row={row} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <WhyHeld row={row} escalation={escalation} />
          {others > 0 && (
            <button
              type="button"
              onClick={() => onOpenTab("payments")}
              className="text-sm text-ash underline-offset-4 hover:text-paper hover:underline"
            >
              {others} more held payment{others === 1 ? "" : "s"} →
            </button>
          )}
        </div>
      </div>

      {/* Phones read top to bottom: evidence, decision, record. Wider: the decision rail sits beside both. */}
      <aside
        aria-label="Decision"
        className="flex min-w-0 flex-col gap-6 self-start rounded-tile border border-line bg-panel p-5 md:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        {decision.isDecider ? (
          <div>
            <h2 className="text-lg font-semibold">Verify, then decide</h2>
            <ol className="mt-4 space-y-5">
              <Step n={1} title={`Call ${row.vendorName} at the number on file`}>
                <PhoneOnFile phone={row.phoneOnFile} large />
                <p className="mt-1 text-sm text-ash">Never a number or link from a recent email.</p>
              </Step>
              <Step n={2} title="Write down what they confirmed, then decide">
                <DecisionForm paymentId={payment._id} decision={decision} large />
              </Step>
            </ol>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold">
              {decision.isRequester ? "You can't release this one" : "A controller verifies this one"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ash">
              {decision.isRequester && "You requested it, so a different person has to verify it. "}
              <span className="text-paper">{controller?.name ?? "Your controller"}</span> calls {row.vendorName} at{" "}
              <PhoneOnFile phone={row.phoneOnFile} />, the number on file, then releases or rejects it.
            </p>
            <div className="mt-5 border-t border-line pt-5">
              <DecisionForm paymentId={payment._id} decision={decision} />
            </div>
          </div>
        )}
      </aside>

      <div className="max-w-3xl min-w-0 lg:col-start-1 lg:row-start-2">
        <PaymentAudit paymentId={payment._id} variant="record" />
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-chip border border-line text-sm font-semibold tabular-nums text-ash"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="pt-0.5 font-semibold">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}
