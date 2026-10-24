// A portfolio company's dashboard. The hero is the one thing this person must do now (finance:
// the held payment; IT and everyone else: the incident steps). Everything else is a tab.
// The backend never sends which company reported the incident.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { QuickLinks, Tabs, type QuickLink, type TabDef } from "../layout/Tabs";
import { useTabs } from "../layout/useTabs";
import { AcknowledgedBy } from "./AcknowledgedBy";
import { BillsPanel } from "./BillsPanel";
import { ControlsLogPanel } from "./ControlsLogPanel";
import { ExposureHero } from "./ExposureHero";
import { readableEvidence } from "./exposureCopy";
import { dateTime, money } from "./format";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { EXPOSURE_STATUS, paymentLook, URGENCY } from "./labels";
import { LedgerPanel } from "./LedgerPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { PaymentCard } from "./PaymentCard";
import { PlaybookPanel } from "./ResponsePlaybook";
import { TimelinePanel } from "./TimelinePanel";
import type { HeldPaymentRow } from "./types";
import { Card, Chip, Empty, LookChip } from "./ui";
import { BUTTON_SECONDARY } from "./styles";
import { useExposureAction } from "./useExposureAction";

type Props = {
  companyId: Id<"companies">;
  meId: Id<"users">;
  role: Doc<"users">["role"];
};

type IncidentRow = NonNullable<ReturnType<typeof useIncidents>>[number];
const useIncidents = () => useQuery(api.blastRadius.listIncidents, {});

export function CompanyView({ companyId, meId, role }: Props) {
  const isController = role === "controller";
  // Clerks and controllers act on payments, so the held payment leads; IT acts on the incident.
  const handlesPayments = role === "ap_clerk" || isController;
  const company = useQuery(api.blastRadius.listCompanies, {})?.find((c) => c._id === companyId);
  const exposures = useQuery(api.blastRadius.getMyExposures, {});
  const alerts = useQuery(api.alerts.getMyAlerts, {});
  const held = useQuery(api.payments.getHeldPayments, {});
  const incidents = useIncidents();
  const assets = useQuery(api.blastRadius.listAssets, {});
  const bills = useQuery(api.payments.getMyBills, {});

  const incidentById = new Map((incidents ?? []).map((i) => [i._id, i]));
  const phoneFor = (incident?: IncidentRow) => assets?.find((a) => a._id === incident?.assetId)?.phoneOnFile;
  const escalations = new Map(
    (alerts ?? []).flatMap((a) => (a.kind === "escalation" && a.paymentId ? [[a.paymentId, a.body] as const] : [])),
  );
  const alertByExposure = new Map(
    (alerts ?? []).flatMap((a) => (a.kind === "company_alert" && a.exposureId ? [[a.exposureId, a] as const] : [])),
  );
  const stillHeld = (held ?? []).filter((r) => r.payment.status === "held");
  const heldCents = stillHeld.reduce((s, r) => s + r.payment.amountCents, 0);
  const openExposures = (exposures ?? []).filter((e) => e.status !== "closed");
  // Urgent first, then newest (the query returns newest first).
  const leadExposure = [...openExposures].sort(
    (a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent"),
  )[0];
  const latestIncident = incidents?.[0];
  const unpaidBills = (bills ?? []).filter((b) => b.payment === null).length;

  const viewer = { id: meId, isController };
  const heroPayment = handlesPayments ? pickHeroPayment(stillHeld, escalations) : undefined;

  const tabIds = ["alerts", "payments", "bills", "playbook", "timeline", "controls", "ledger", "notifications"] as const;
  const fallback = isController ? "payments" : role === "ap_clerk" ? "bills" : "alerts";
  const { active, select } = useTabs(tabIds, fallback);

  const tabs: TabDef[] = [
    {
      id: "alerts",
      label: "Incident & evidence",
      count: openExposures.length,
      content: () => (
        <AlertsTab
          exposures={exposures}
          alertByExposure={alertByExposure}
          incidentById={incidentById}
          held={held ?? []}
        />
      ),
    },
    {
      id: "payments",
      label: "Held payments",
      count: stillHeld.length,
      content: () => (
        <HeldPaymentsPanel
          title="Payments held until verified"
          rows={held}
          intro="Held payments are never cancelled. A controller who didn't request the payment calls the vendor at the number on file, then releases or rejects it."
          escalations={handlesPayments ? escalations : undefined}
          viewer={viewer}
        />
      ),
    },
    { id: "bills", label: "Bills to pay", count: unpaidBills, content: () => <BillsPanel /> },
    { id: "playbook", label: "Response playbook", content: () => <PlaybookPanel /> },
    {
      id: "timeline",
      label: "Timeline",
      content: () =>
        latestIncident ? <TimelinePanel incidentId={latestIncident._id} /> : <Card><Empty>No incident yet.</Empty></Card>,
    },
    {
      id: "controls",
      label: "Controls log",
      content: () =>
        latestIncident ? (
          <ControlsLogPanel
            incidentId={latestIncident._id}
            fileLabel={`${company?.domain ?? "company"}-${latestIncident.externalId}`}
          />
        ) : (
          <Card><Empty>Nothing logged yet.</Empty></Card>
        ),
    },
    { id: "ledger", label: "Ledger", content: () => <LedgerPanel /> },
    {
      id: "notifications",
      label: "Slack & alerts out",
      content: () => <NotificationsPanel scope="company" canManage={isController} />,
    },
  ];

  const links: QuickLink[] = [
    ...(leadExposure && heroPayment
      ? [{ tab: "alerts", label: "The incident", detail: `${URGENCY[leadExposure.urgency].label} · ${incidentById.get(leadExposure.incidentId)?.vendorName ?? ""}`, tone: leadExposure.urgency === "urgent" ? ("danger" as const) : ("amber" as const) }]
      : openExposures.length > 0
        ? [{ tab: "alerts", label: "Why you're affected", detail: openExposures.length > 1 ? `${openExposures.length} active incidents` : "Full alert and evidence" }]
        : [{ tab: "alerts", label: "Alert history", detail: (exposures ?? []).length ? `${(exposures ?? []).length} past` : "None so far" }]),
    ...(stillHeld.length > 0
      ? [{ tab: "payments", label: "Held payments", detail: `${stillHeld.length} held · ${money(heldCents)}`, tone: "amber" as const }]
      : []),
    ...(handlesPayments ? [{ tab: "bills", label: "Bills to pay", detail: unpaidBills ? `${unpaidBills} unpaid` : "All paid or in progress" }] : []),
    { tab: "playbook", label: "Response playbook", detail: "What Sidecall may do for you" },
    { tab: "timeline", label: "What happened, second by second" },
    { tab: "controls", label: "Controls log", detail: "Every hold, refusal and release" },
    { tab: "notifications", label: "Slack messages sent" },
  ];

  let hero;
  if (exposures === undefined || held === undefined) {
    hero = <HeroFrame><Empty>Loading…</Empty></HeroFrame>;
  } else if (heroPayment) {
    hero = (
      <PaymentHero
        row={heroPayment}
        escalation={escalations.get(heroPayment.payment._id)}
        viewer={viewer}
        others={stillHeld.length - 1}
        onOpenTab={(t) => select(t, true)}
      />
    );
  } else if (leadExposure) {
    const incident = incidentById.get(leadExposure.incidentId);
    const heldHere = stillHeld.filter((r) => r.payment.heldByIncidentId === leadExposure.incidentId);
    hero = (
      <ExposureHero
        key={leadExposure._id}
        exposure={leadExposure}
        incident={incident}
        phone={phoneFor(incident)}
        heldForIncident={{ count: heldHere.length, cents: heldHere.reduce((s, r) => s + r.payment.amountCents, 0) }}
        onOpenTab={(t) => select(t, true)}
      />
    );
  } else {
    hero = <AllClear companyName={company?.name} resolved={(exposures ?? []).length > 0} />;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {hero}
        <QuickLinks links={links} onPick={(t) => select(t, true)} />
      </div>
      <Tabs tabs={tabs} active={active} onSelect={(t) => select(t)} label={`${company?.name ?? "Company"} details`} />
    </div>
  );
}

// The payment a finance person should decide first: escalated (due soon), then a changed bank
// account, then the largest.
function pickHeroPayment(rows: HeldPaymentRow[], escalations: Map<Id<"payments">, string>) {
  return [...rows].sort(
    (a, b) =>
      Number(escalations.has(b.payment._id)) - Number(escalations.has(a.payment._id)) ||
      Number(b.bankChange !== null) - Number(a.bankChange !== null) ||
      b.payment.amountCents - a.payment.amountCents,
  )[0];
}

function HeroFrame({ children, tone }: { children: React.ReactNode; tone?: "danger" | "amber" | "ok" }) {
  const accent = tone === "danger" ? "border-l-danger" : tone === "ok" ? "border-l-ok" : "border-l-amber";
  return (
    <section aria-labelledby="hero-title" className={`rounded-2xl border border-l-4 border-line bg-panel p-6 md:p-8 ${accent}`}>
      {children}
    </section>
  );
}

function PaymentHero({
  row,
  escalation,
  viewer,
  others,
  onOpenTab,
}: {
  row: HeldPaymentRow;
  escalation?: string;
  viewer: { id: Id<"users">; isController: boolean };
  others: number;
  onOpenTab: (tab: string) => void;
}) {
  const { payment, bankChange } = row;
  const isRequester = viewer.id === payment.requestedBy;
  const headline = bankChange
    ? `${money(payment.amountCents)} held: the account it pays was changed by ${bankChange.requestChannel.replace("_", " ")} ${bankChange.daysBeforeIncident} days before the breach`
    : `${money(payment.amountCents)} to ${row.vendorName} is held until someone verifies it`;
  const who = viewer.isController && !isRequester
    ? "You decide. Call the vendor at the number on file, write down what they confirmed, then release or reject."
    : isRequester
      ? "You requested this payment, so you can't release it. A controller verifies it by phone."
      : "A controller verifies it by phone before any money moves.";
  return (
    <HeroFrame tone={bankChange ? "danger" : "amber"}>
      <p className="text-sm text-ash">
        {escalation ? "Decision needed today" : "Payment held"} · {row.companyName}
      </p>
      <h1 id="hero-title" className="mt-2 max-w-4xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {headline}
      </h1>
      <p className="mt-3 max-w-3xl text-ash">{who}</p>
      <div className="mt-6">
        <PaymentCard row={row} escalation={escalation} viewer={viewer} />
      </div>
      {others > 0 && (
        <button type="button" onClick={() => onOpenTab("payments")} className="mt-4 text-sm text-ash hover:text-paper">
          {others} more held payment{others === 1 ? "" : "s"} →
        </button>
      )}
    </HeroFrame>
  );
}

function AllClear({ companyName, resolved }: { companyName?: string; resolved: boolean }) {
  return (
    <HeroFrame tone="ok">
      <p className="text-sm text-ok">{resolved ? "Resolved" : "All clear"}</p>
      <h1 id="hero-title" className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
        {resolved ? "Every incident affecting you is resolved" : "Nothing needs your attention"}
      </h1>
      <p className="mt-3 max-w-3xl text-ash">
        {resolved
          ? `${companyName ?? "Your company"} has closed every alert. The history stays in the tabs below.`
          : `No active incident touches anything ${companyName ?? "your company"} shares. Sidecall only alerts you when you genuinely share what was compromised, not just the same vendor.`}
      </p>
    </HeroFrame>
  );
}

function AlertsTab({
  exposures,
  alertByExposure,
  incidentById,
  held,
}: {
  exposures: Doc<"exposures">[] | undefined;
  alertByExposure: Map<Id<"exposures">, Doc<"alerts">>;
  incidentById: Map<Id<"incidents">, IncidentRow>;
  held: HeldPaymentRow[];
}) {
  if (exposures === undefined) return <Empty>Loading…</Empty>;
  if (exposures.length === 0) {
    return (
      <Card>
        <Empty>No alerts. Nothing you share is affected.</Empty>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {exposures.map((e) => (
        <AlertItem
          key={e._id}
          exposure={e}
          alert={alertByExposure.get(e._id)}
          incident={incidentById.get(e.incidentId)}
          payments={held.filter((r) => r.payment.heldByIncidentId === e.incidentId)}
        />
      ))}
    </div>
  );
}

function AlertItem({
  exposure,
  alert,
  incident,
  payments,
}: {
  exposure: Doc<"exposures">;
  alert?: Doc<"alerts">;
  incident?: IncidentRow;
  payments: HeldPaymentRow[];
}) {
  const { run, busy, message } = useExposureAction(exposure._id);
  return (
    <article className="grid gap-6 rounded-2xl border border-line bg-panel p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <LookChip look={URGENCY[exposure.urgency]} />
          <Chip tone="muted">{EXPOSURE_STATUS[exposure.status]}</Chip>
          <AcknowledgedBy userId={exposure.acknowledgedBy} />
        </div>
        {incident && (
          <h3 className="text-lg font-semibold">
            {incident.vendorName} · {incident.assetName}
            <span className="ml-2 text-sm font-normal text-ash">{dateTime(incident.createdAt)}</span>
          </h3>
        )}
        <p className="mt-2 max-w-prose text-sm leading-relaxed">
          {alert?.status === "ready" ? alert.body : "Writing your alert…"}
        </p>
        {/* The alert text is written once; payments show their state now. */}
        {payments.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {payments.map((r) => (
              <li key={r.payment._id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tabular-nums">{money(r.payment.amountCents)}</span>
                <LookChip look={paymentLook(r.payment)} />
                {r.decision && (
                  <span className="text-ash">
                    {r.decision.status === "paid" ? "since released" : "rejected"} by {r.decision.byName ?? "a controller"}
                    {r.decision.at !== null && ` · ${dateTime(r.decision.at)}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {exposure.status !== "closed" && (
          <div className="mt-4 flex gap-2">
            {exposure.status === "open" && (
              <button type="button" disabled={busy} onClick={() => void run("acknowledge")} className={BUTTON_SECONDARY}>
                Acknowledge
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void run("close")} className={BUTTON_SECONDARY}>
              Mark resolved
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="mt-2 text-sm text-ash">
            {message}
          </p>
        )}
      </div>
      <dl className="space-y-3 rounded-xl bg-graphite p-4 text-sm">
        {readableEvidence(exposure.evidence).map((e) => (
          <div key={`${e.label}-${e.text}`}>
            <dt className="text-xs font-semibold tracking-wider text-ash uppercase">{e.label}</dt>
            <dd className="mt-0.5 leading-relaxed">{e.text}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
