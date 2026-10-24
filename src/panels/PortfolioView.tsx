// PE firm dashboard: the only view allowed to name the reporting company. The hero answers
// "how bad, and is every company handling it?"; the map and everything else are tabs.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BlastRadiusMap } from "../map/BlastRadiusMap";
import { EvidencePanel } from "../map/EvidencePanel";
import { Tabs, type TabDef } from "../layout/Tabs";
import { useTabs } from "../layout/useTabs";
import { dateTime, money } from "./format";
import { ExposureAcknowledgedBy } from "./AcknowledgedBy";
import { ApImportPanel } from "./ApImportPanel";
import { ContainPanel } from "./ContainPanel";
import { ControlsLogPanel } from "./ControlsLogPanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { EXPOSURE_STATUS, paymentLook } from "./labels";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProofPanel } from "./ProofPanel";
import { TimelinePanel } from "./TimelinePanel";
import type { BlastRadius } from "./types";
import { VendorLetterActions } from "./VendorLetterActions";
import { FirstStepCell } from "./ResponsePlaybook";
import { Card, Chip, Empty, LookChip, UrgencyChip } from "./ui";

const PIN_KEY = "sidecall-pe-incident";
function loadPinned(): Id<"incidents"> | undefined {
  try {
    return (window.sessionStorage.getItem(PIN_KEY) as Id<"incidents"> | null) ?? undefined;
  } catch {
    return undefined;
  }
}
function savePinned(id: Id<"incidents">) {
  try {
    window.sessionStorage.setItem(PIN_KEY, id);
  } catch {
    // remembered for this page only
  }
}

// Six tabs so every one fits on a projected laptop screen; related panels share a tab.
const TAB_IDS = ["map", "alerts", "payments", "timeline", "onboard", "proof"] as const;

export function PortfolioView() {
  const incidents = useQuery(api.blastRadius.listIncidents, {});
  // Follow the newest incident (list is newest first) unless the firm picked another one. The pick
  // survives switching people (this view remounts), so "Mark contained" never lands on the wrong one.
  const [chosen, setChosenState] = useState<Id<"incidents"> | undefined>(loadPinned);
  const setChosen = (id: Id<"incidents">) => {
    setChosenState(id);
    savePinned(id);
  };
  const incidentId = incidents?.find((i) => i._id === chosen)?._id ?? incidents?.[0]?._id;
  const blast = useQuery(api.blastRadius.getBlastRadius, incidentId ? { incidentId } : "skip");
  const held = useQuery(api.payments.getHeldPayments, incidentId ? { incidentId } : "skip");
  const alerts = useQuery(api.alerts.getIncidentAlerts, incidentId ? { incidentId } : "skip");
  const [selected, setSelected] = useState<Id<"companies">>();
  const { active, select } = useTabs(TAB_IDS, "map");

  if (incidents === undefined) return <Empty>Loading…</Empty>;

  if (!incidentId) {
    const tabs: TabDef[] = [
      { id: "onboard", label: "Onboard", content: () => <ApImportPanel /> },
      { id: "alerts", label: "Slack & alerts out", content: () => <NotificationsPanel scope="firm" canManage /> },
      { id: "proof", label: "Proof", content: () => <ProofPanel /> },
    ];
    return (
      <div className="space-y-8">
        <section aria-labelledby="hero-title" className="rounded-2xl border border-l-4 border-line border-l-ok bg-panel p-6 md:p-8">
          <p className="text-sm text-ok">All clear</p>
          <h1 id="hero-title" className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            No open incidents across the portfolio
          </h1>
          <p className="mt-3 max-w-3xl text-ash">
            When a shared vendor or login is compromised, Sidecall shows here which companies genuinely share it, what
            each was told to do, and which payments are held. Use the data leak simulator above to run one.
          </p>
        </section>
        <Tabs tabs={tabs} active={tabs.some((t) => t.id === active) ? active : "onboard"} onSelect={(t) => select(t)} label="Portfolio" />
      </div>
    );
  }
  if (!blast) return <Empty>Loading…</Empty>;

  const { incident, totals } = blast;
  const nodeById = new Map(blast.nodes.map((n) => [n.companyId, n]));
  const selectedNode = selected ? nodeById.get(selected) : undefined;
  const selectedHeld = held?.filter((r) => r.payment.companyId === selected);
  const releasedCents = (held ?? [])
    .filter((r) => r.decision?.status === "paid")
    .reduce((sum, r) => sum + r.payment.amountCents, 0);
  const letter = alerts?.find((a) => a.kind === "vendor_letter");
  // Most urgent first (scoring decides urgency; the AI only writes).
  const exposed = blast.nodes
    .filter((n) => n.exposed)
    .sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent") || b.score - a.score);
  const acknowledged = exposed.filter((n) => n.status !== "open").length;
  const companyAlerts = (alerts ?? [])
    .filter((a) => a.kind === "company_alert")
    .map((alert) => ({ alert, node: alert.companyId ? nodeById.get(alert.companyId) : undefined }))
    .sort((a, b) => (b.node?.score ?? 0) - (a.node?.score ?? 0));

  const openCompany = (id: Id<"companies">) => {
    setSelected(id);
    select("map", true);
  };

  const tabs: TabDef[] = [
    {
      id: "map",
      label: "Map & evidence",
      content: () => (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_400px] lg:grid-cols-[minmax(0,1fr)_360px]">
          <BlastRadiusMap blast={blast} selected={selected} onSelect={setSelected} />
          <div className="space-y-6">
            <EvidencePanel exposureId={selectedNode?.exposureId ?? undefined} companyName={selectedNode?.name} />
            {selectedNode && (
              <Card title={`Payments held · ${selectedNode.name}`}>
                {!selectedHeld?.length ? (
                  <Empty>No payments held at this company.</Empty>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {selectedHeld.map((r) => (
                      <li key={r.payment._id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold tabular-nums">{money(r.payment.amountCents)}</span>
                        <span className="flex gap-1">
                          {r.bankChange && <Chip tone="danger">Bank change</Chip>}
                          <LookChip look={paymentLook(r.payment)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "alerts",
      label: "Alerts & letter",
      count: companyAlerts.length,
      content: () => (
        <div className="space-y-8">
          <section aria-labelledby="told-title">
            <h2 id="told-title" className="mb-3 text-xs font-semibold tracking-wider text-ash uppercase">
              What each company was told
            </h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {companyAlerts.map(({ alert, node }) => (
                <article key={alert._id} className="rounded-2xl border border-line bg-panel p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{node?.name}</span>
                    {node?.urgency && <UrgencyChip urgency={node.urgency} resolved={node.status === "closed"} />}
                    {node?.status && node.status !== "closed" && <Chip tone="muted">{EXPOSURE_STATUS[node.status]}</Chip>}
                    {alert.exposureId && <ExposureAcknowledgedBy exposureId={alert.exposureId} />}
                  </div>
                  <p className="max-w-prose text-sm leading-relaxed">{alert.status === "ready" ? alert.body : "Writing alert…"}</p>
                </article>
              ))}
            </div>
          </section>
          {letter ? (
            <Card
              title={`Letter to ${blast.asset.vendorName}`}
              aside={
                letter.status === "ready" ? (
                  <VendorLetterActions vendorName={blast.asset.vendorName} body={letter.body} />
                ) : (
                  <Chip tone="muted">writing…</Chip>
                )
              }
            >
              <p className="max-w-3xl leading-relaxed whitespace-pre-wrap">{letter.body}</p>
            </Card>
          ) : (
            <Card><Empty>No vendor letter for this incident.</Empty></Card>
          )}
          <NotificationsPanel scope="firm" canManage incidentId={incident._id} />
        </div>
      ),
    },
    {
      id: "payments",
      label: "Payments & controls log",
      count: totals.paymentsHeld,
      content: () => (
        <div className="space-y-6">
          <HeldPaymentsPanel
            title={`Payments held · ${totals.paymentsHeld}`}
            rows={held}
            intro="The firm sees every hold. Only a controller at the portfolio company can release or reject."
          />
          <ControlsLogPanel incidentId={incident._id} fileLabel={incident.externalId} />
        </div>
      ),
    },
    {
      id: "timeline",
      label: "Timeline & close-out",
      count: incident.containedAt !== undefined ? "contained" : undefined,
      content: () => (
        <div className="space-y-6">
          <TimelinePanel incidentId={incident._id} />
          <ContainPanel key={incident._id} incidentId={incident._id} containedAt={incident.containedAt ?? null} />
        </div>
      ),
    },
    { id: "onboard", label: "Onboard", content: () => <ApImportPanel /> },
    { id: "proof", label: "Proof", content: () => <ProofPanel /> },
  ];

  return (
    <div className="space-y-8">
      <PortfolioHero
        blast={blast}
        incidents={incidents}
        onPickIncident={(id) => {
          setChosen(id);
          setSelected(undefined);
        }}
        releasedCents={releasedCents}
        exposed={exposed}
        acknowledged={acknowledged}
        onOpenCompany={openCompany}
      />
      <Tabs tabs={tabs} active={active} onSelect={(t) => select(t)} label="Incident details" />
    </div>
  );
}

type Node = BlastRadius["nodes"][number];

function PortfolioHero({
  blast,
  incidents,
  onPickIncident,
  releasedCents,
  exposed,
  acknowledged,
  onOpenCompany,
}: {
  blast: BlastRadius;
  incidents: NonNullable<ReturnType<typeof useQuery<typeof api.blastRadius.listIncidents>>>;
  onPickIncident: (id: Id<"incidents">) => void;
  releasedCents: number;
  exposed: Node[];
  acknowledged: number;
  onOpenCompany: (id: Id<"companies">) => void;
}) {
  const { incident, totals, asset } = blast;
  const finding = incident.finding;
  const tracker = useQuery(api.responses.getResponseTracker, { incidentId: incident._id });
  const stepFor = new Map((tracker?.companies ?? []).map((c) => [c.companyId, c]));
  const contained = incident.containedAt !== undefined;
  const resolved = exposed.filter((n) => n.status === "closed").length;
  return (
    <section
      aria-labelledby="hero-title"
      className={`rounded-2xl border border-l-4 border-line bg-panel p-6 md:p-8 ${contained ? "border-l-ok" : "border-l-danger"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-ash">
        {contained ? <Chip tone="ok">Contained</Chip> : <Chip tone="danger">Active incident</Chip>}
        <span>
          {asset.vendorName.toLowerCase().startsWith(asset.name.toLowerCase()) ? asset.vendorName : `${asset.vendorName} · ${asset.name}`}{" "}
          · {dateTime(incident.createdAt)}
          {incident.reportedByName && ` · reported by ${incident.reportedByName} (visible to the firm only)`}
        </span>
        {incidents.length > 1 && (
          <label className="ml-auto flex items-center gap-2">
            <span className="sr-only">Incident</span>
            <select
              value={incident._id}
              onChange={(e) => onPickIncident(e.target.value as Id<"incidents">)}
              className="max-w-full min-w-0 rounded-md border border-line bg-graphite px-2 py-1.5 text-paper"
            >
              {incidents.map((i) => (
                <option key={i._id} value={i._id}>
                  {i.assetName} · {dateTime(i.createdAt)}
                  {i.containedAt !== null && " · contained"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <h1 id="hero-title" className="sr-only">
        {totals.companiesExposed} {totals.companiesExposed === 1 ? "company" : "companies"} exposed,{" "}
        {totals.peopleExposed.toLocaleString()} people, {totals.heldCents > 0 ? `${money(totals.heldCents)} held` : "no payments held"}
      </h1>
      {/* Three stats, number over label, so the zoom-out line never wraps mid-number on a projector. */}
      <dl aria-hidden className="mt-4 grid grid-cols-3 gap-4 md:max-w-4xl">
        <Stat value={String(totals.companiesExposed)} label={totals.companiesExposed === 1 ? "company exposed" : "companies exposed"} />
        <Stat value={totals.peopleExposed.toLocaleString()} label="people behind them" />
        <Stat
          value={totals.heldCents > 0 ? money(totals.heldCents) : "$0"}
          label={totals.heldCents > 0 ? "in payments held" : "no payments held"}
          tone={totals.heldCents > 0 ? "text-amber" : "text-ash"}
        />
      </dl>
      {releasedCents > 0 && <p className="mt-2 text-ok">{money(releasedCents)} released after phone verification</p>}
      {incident.summary && <p className="mt-3 max-w-3xl text-ash">{incident.summary}</p>}

      {finding && (
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-graphite px-3 py-2 text-sm">
          <Chip tone="amber">Red-team finding</Chip>
          <span>
            Path validated at {incident.reportedByName ?? "the tested company"}
            {finding.technique.name && ` using ${finding.technique.name} (${finding.technique.id})`}. Sister companies that
            share it are <strong>reachable, not tested</strong>. Nobody touched their systems.
          </span>
        </p>
      )}

      <div className="mt-8 flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-semibold tracking-wider text-ash uppercase">Response by company</h2>
        <p className="text-sm text-ash tabular-nums">
          {tracker && tracker.totals.firstStepDone > 0 && (
            <>First step done at {tracker.totals.firstStepDone} of {tracker.totals.exposed} · </>
          )}
          {acknowledged} of {exposed.length} acknowledged
          {resolved > 0 && ` · ${resolved} resolved`}
        </p>
      </div>
      {exposed.length === 0 ? (
        <p className="mt-3 text-ash">No company shares what was compromised. No alerts were sent.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {exposed.map((n) => (
            <li key={n.companyId}>
              <button
                type="button"
                onClick={() => onOpenCompany(n.companyId)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-graphite sm:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <span className="min-w-0 truncate font-medium">{n.name}</span>
                {n.urgency && <UrgencyChip urgency={n.urgency} resolved={n.status === "closed"} />}
                <span className="text-sm text-ash">
                  {n.status === "open" ? (
                    <span className="text-amber">Not acknowledged yet</span>
                  ) : n.exposureId ? (
                    <ExposureAcknowledgedBy exposureId={n.exposureId} />
                  ) : (
                    EXPOSURE_STATUS[n.status ?? "open"]
                  )}
                  {n.status === "closed" && " · resolved"}
                </span>
                <span className="text-sm">
                  <FirstStepCell row={stepFor.get(n.companyId)} />
                </span>
                <span className="text-sm tabular-nums sm:text-right">
                  {n.heldCents > 0 ? <span className="text-amber">{money(n.heldCents)} held</span> : <span className="text-ash">no holds</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ value, label, tone = "text-paper" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className={`text-3xl font-semibold tracking-tight tabular-nums md:text-5xl ${tone}`}>{value}</dd>
      <dd className="mt-1 text-sm text-ash md:text-base">{label}</dd>
    </div>
  );
}
