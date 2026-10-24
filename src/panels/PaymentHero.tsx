// The money moment (demo beat 1-3): one held payment, as a case file. Left: what is held and the
// evidence (the account that changed by email), then the audit record that updates live when
// anyone acts. Right: two signature lines and this person's part in them. Phones read top to
// bottom: the evidence, the decision, then the details.
import { useState, type ReactNode } from "react";
import { money } from "./format";
import { AccountChange, DecisionForm, PaymentAudit, PhoneOnFile, Signatures, TryRelease, WhyHeld } from "./PaymentCard";
import { dueIn, usePaymentDecision, type Viewer } from "./usePaymentDecision";
import type { HeldPaymentRow } from "./types";
import { LINK } from "./styles";
import { StatusLine } from "./ui";

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

  return (
    <section
      aria-labelledby="hero-title"
      className="grid items-start gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]"
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <StatusLine tone="amber" state="Held until verified">
          {escalation ? (
            <span className="font-semibold text-paper">Decision needed today{due && `, ${due}`}</span>
          ) : (
            due && <span>{due[0].toUpperCase() + due.slice(1)}</span>
          )}
          {/* The header names the company from sm up. */}
          <span className="sm:hidden">{row.companyName}</span>
        </StatusLine>

        <h1 id="hero-title" className="mt-5">
          <span className="block text-display font-semibold tabular-nums">{money(payment.amountCents)}</span>
          <span className="mt-3 block text-2xl font-semibold tracking-tight md:text-[2rem]">
            <span className="font-medium text-ash">to </span>
            {row.vendorName}
          </span>
        </h1>

        {bankChange ? (
          <div className="mt-10">
            <AccountChange row={row} />
          </div>
        ) : (
          <p className="mt-6 max-w-2xl text-xl leading-snug font-medium text-balance">
            {row.vendorName} has an active security incident, so this payment waits for a person to verify it.
          </p>
        )}
      </div>

      <aside
        aria-label="Decision"
        className={`flex min-w-0 flex-col gap-6 self-start rounded-tile border bg-panel p-5 md:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 ${
          decision.isDecider ? "border-amber/45" : "border-line"
        }`}
      >
        <div>
          <h2 className="text-lg font-semibold">Two signatures before money moves</h2>
          <div className="mt-4">
            <Signatures row={row} decision={decision} />
          </div>
        </div>
        {decision.isDecider ? (
          <ol className="space-y-6 border-t border-line pt-6">
            <Step n={1} title={`Call ${row.vendorName} at the number on file`}>
              <PhoneOnFile phone={row.phoneOnFile} large />
              <p className="mt-1 text-sm text-ash">Never a number or link from a recent email.</p>
            </Step>
            <Step n={2} title="Write down what they confirmed, then decide">
              <DecisionForm paymentId={payment._id} decision={decision} large />
            </Step>
          </ol>
        ) : (
          <div className="space-y-4 border-t border-line pt-6">
            <p className="text-sm leading-relaxed text-ash">
              {decision.isRequester
                ? "You requested it, so you can't sign the second line."
                : "Only a controller who didn't request it can sign the second line."}
            </p>
            <TryRelease decision={decision} />
          </div>
        )}
      </aside>

      <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <WhyHeld row={row} escalation={escalation} />
          {others > 0 && (
            <button type="button" onClick={() => onOpenTab("payments")} className={LINK}>
              {others} more held payment{others === 1 ? "" : "s"}
            </button>
          )}
        </div>
        <div className="max-w-3xl">
          <PaymentAudit paymentId={payment._id} variant="record" />
        </div>
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
