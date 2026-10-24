// PE firm dashboard: the only view allowed to name the reporting company. The hero answers
// "how bad, and is every company handling it?" with the three numbers beside the response table,
// so both, the tab bar and the top of the map fit on one projected screen.
import { InvestigationPanel, ResponseSafetyPanel } from "./InvestigationPanel";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BlastRadiusMap } from "../map/BlastRadiusMap";
import { EvidencePanel } from "../map/EvidencePanel";
import { Tabs, type TabDef } from "../layout/Tabs";
import { useTabs } from "../layout/useTabs";
import { assetTitle, dateTime, money } from "./format";
import { AcknowledgedBy, ExposureAcknowledgedBy } from "./AcknowledgedBy";
import { ApImportPanel } from "./ApImportPanel";
import { ContainPanel } from "./ContainPanel";
import { ControlsLogPanel } from "./ControlsLogPanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { paymentLook } from "./labels";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProofPanel } from "./ProofPanel";
import { TimelinePanel } from "./TimelinePanel";
import type { BlastRadius } from "./types";
import { VendorLetterActions } from "./VendorLetterActions";
import { FirstStepCell } from "./ResponsePlaybook";
import { Card, Chip, Empty, HeroSkeleton, LookChip, StatusLine, Tile, UrgencyChip } from "./ui";
import { FIELD } from "./styles";

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

// Six tabs so every one fits on a projected laptop screen; related panels share a tab
// (payment investigation sits under Payments, response safety under Timeline & close-out).
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

  if (incidents === undefined) return <HeroSkeleton />;

  if (!incidentId) {
    const tabs: TabDef[] = [
      { id: "payments", label: "Payments", content: () => <InvestigationPanel firm /> },
      { id: "timeline", label: "Response safety", content: () => <ResponseSafetyPanel /> },
      { id: "onboard", label: "Onboard", content: () => <ApImportPanel /> },
      { id: "alerts", label: "Slack & alerts out", content: () => <NotificationsPanel scope="firm" canManage /> },
      { id: "proof", label: "Proof", content: () => <ProofPanel /> },
    ];
    return (
      <div className="space-y-12">
        <section aria-labelledby="hero-title">
          <StatusLine tone="ok" state="All clear" />
          <h1 id="hero-title" className="mt-5 max-w-3xl text-headline font-semibold text-balance">
            No open incidents across the portfolio
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ash">
            When a shared vendor or login is compromised, this page shows which companies genuinely share it, what each
            was told to do, and which payments are held.
          </p>
        </section>
        <Tabs
          tabs={tabs}
          active={tabs.some((t) => t.id === active) ? active : "onboard"}
          onSelect={(t) => select(t)}
          label="Portfolio"
        />
      </div>
    );
  }
  if (!blast) return <HeroSkeleton />;

  const { incident, totals } = blast;
  const nodeById = new Map(blast.nodes.map((n) => [n.companyId, n]));
  const selectedNode = selected ? nodeById.get(selected) : undefined;
  const selectedHeld = held?.filter((r) => r.payment.companyId === selected);
  const releasedCents = (held ?? [])
    .filter((r) => r.decision?.status === "paid")
    .reduce((sum, r) => sum + r.payment.amountCents, 0);
  const letter = alerts?.find((a) => a.kind === "vendor_letter");
  // Still open above resolved, then most urgent first (scoring decides urgency; the AI only writes).
  const exposed = blast.nodes
    .filter((n) => n.exposed)
    .sort(
      (a, b) =>
        Number(a.status === "closed") - Number(b.status === "closed") ||
        Number(b.urgency === "urgent") - Number(a.urgency === "urgent") ||
        b.score - a.score,
    );
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
              <Card title={`Payments held at ${selectedNode.name}`}>
                {!selectedHeld?.length ? (
                  <Empty>No payments held at this company.</Empty>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {selectedHeld.map((r) => (
                      <li key={r.payment._id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold tabular-nums">{money(r.payment.amountCents)}</span>
                        <span className="flex gap-1">
                          {r.bankChange && <Chip tone="danger">Bank details changed</Chip>}
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
            <h2 id="told-title" className="mb-4 text-lg font-semibold">
              What each company was told
            </h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {companyAlerts.map(({ alert, node }) => (
                <article key={alert._id} className="rounded-tile border border-line bg-panel p-5 md:p-6">
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-lg font-semibold tracking-tight">{node?.name}</span>
                    {node?.urgency && <UrgencyChip urgency={node.urgency} resolved={node.status === "closed"} />}
                    {node?.status === "open" ? (
                      <span className="text-sm text-ash">Not acknowledged yet</span>
                    ) : (
                      alert.exposureId && <ExposureAcknowledgedBy exposureId={alert.exposureId} />
                    )}
                  </div>
                  <p className="max-w-prose leading-relaxed">{alert.status === "ready" ? alert.body : "Writing alert…"}</p>
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
                  <span className="text-sm text-ash">Writing…</span>
                )
              }
            >
              <p className="max-w-3xl leading-relaxed whitespace-pre-wrap">{letter.body}</p>
            </Card>
          ) : (
            <Card>
              <Empty>No vendor letter for this incident.</Empty>
            </Card>
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
            title="Payments held"
            rows={held}
            intro="The firm sees every hold. Only a controller at the portfolio company can release or reject."
          />
          <ControlsLogPanel incidentId={incident._id} fileLabel={incident.externalId} />
          <InvestigationPanel firm />
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
          <ResponseSafetyPanel />
        </div>
      ),
    },
    { id: "onboard", label: "Onboard", content: () => <ApImportPanel /> },
    { id: "proof", label: "Proof", content: () => <ProofPanel /> },
  ];

  return (
    <div className="space-y-12">
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
  const progress = [
    tracker && tracker.totals.firstStepDone > 0
      ? `first step done at ${tracker.totals.firstStepDone} of ${tracker.totals.exposed}`
      : undefined,
    `${acknowledged} of ${exposed.length} acknowledged`,
    resolved > 0 ? `${resolved} resolved` : undefined,
  ].filter(Boolean);
  const progressText = progress.join(", ");

  return (
    <section aria-labelledby="hero-title">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-96">
          <StatusLine tone={contained ? "ok" : "danger"} state={contained ? "Contained" : "Active incident"}>
            <span className="font-semibold text-paper">{assetTitle(asset.vendorName, asset.name)}</span>
            <span className="tabular-nums">{dateTime(incident.createdAt)}</span>
            {incident.reportedByName && (
              <span>
                Reported by <span className="text-paper">{incident.reportedByName}</span>, visible to the firm only
              </span>
            )}
          </StatusLine>
        </div>
        {incidents.length > 1 && (
          <label className="flex min-w-0 items-center gap-2 text-sm text-ash">
            <span className="hidden sm:inline">Incident</span>
            <select
              value={incident._id}
              onChange={(e) => onPickIncident(e.target.value as Id<"incidents">)}
              className={`min-h-9 max-w-full min-w-0 py-1.5 ${FIELD}`}
            >
              {incidents.map((i) => (
                <option key={i._id} value={i._id}>
                  {i.assetName}, {dateTime(i.createdAt)}
                  {i.containedAt !== null && ", contained"}
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

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="min-w-0">
          {/* The zoom-out line as three figures, each beside what it counts. Never wraps mid-number. */}
          <div aria-hidden className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3">
            <Stat value={String(totals.companiesExposed)} label={totals.companiesExposed === 1 ? "company exposed" : "companies exposed"} />
            <Stat value={totals.peopleExposed.toLocaleString()} label="people behind them" />
            <Stat
              value={totals.heldCents > 0 ? money(totals.heldCents) : "$0"}
              label={totals.heldCents > 0 ? "held until verified" : "no payments held"}
              tone={totals.heldCents > 0 ? "text-amber" : "text-ash"}
            />
          </div>
          {releasedCents > 0 && (
            <p className="mt-4 flex items-center gap-2 font-semibold text-ok">
              <Tile />
              {money(releasedCents)} released after phone verification
            </p>
          )}
          {/* A red-team finding's own paragraph says what happened; the summary would repeat it. */}
          {incident.summary && !finding && (
            <p className="mt-5 max-w-[52ch] leading-relaxed text-ash">{incident.summary}</p>
          )}
          {finding && (
            <div className="mt-5 max-w-[56ch] space-y-2">
              <Chip tone="amber">Red-team finding</Chip>
              <p className="leading-relaxed">
                Path proven at {incident.reportedByName ?? "the tested company"}
                {finding.technique.name && ` using ${finding.technique.name} (${finding.technique.id})`}. Sister
                companies that share it are <strong className="font-semibold">reachable, not tested</strong>. Nobody
                touched their systems.
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-lg font-semibold">Response by company</h2>
            <p className="flex items-center gap-3 text-sm text-ash tabular-nums">
              <AckTiles nodes={exposed} />
              <span>{progressText.charAt(0).toUpperCase() + progressText.slice(1)}</span>
            </p>
          </div>
          {exposed.length === 0 ? (
            <p className="mt-3 text-ash">No company shares what was compromised. No alerts were sent.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-tile border border-line">
              <div
                aria-hidden
                className={`hidden border-b border-line bg-panel px-4 py-2.5 text-xs font-medium text-ash md:grid ${ROW_GRID}`}
              >
                <span>Company</span>
                <span>Urgency</span>
                <span>Acknowledged</span>
                <span>First step</span>
                <span className="text-right">Held</span>
              </div>
              <ul className="divide-y divide-line">
                {exposed.map((n) => (
                  <li key={n.companyId}>
                    <button
                      type="button"
                      onClick={() => onOpenCompany(n.companyId)}
                      className={`group grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-panel ${ROW_GRID}`}
                    >
                      <span className="min-w-0 font-semibold text-balance underline-offset-4 group-hover:underline">
                        {n.name}
                      </span>
                      <span>{n.urgency && <UrgencyChip urgency={n.urgency} resolved={n.status === "closed"} />}</span>
                      {/* Phones: these three share a line under the name; wider: one column each. */}
                      <span className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-sm md:contents">
                        <span className="text-ash">
                          {n.status === "open" ? (
                            <span className="text-amber">Not acknowledged yet</span>
                          ) : (
                            n.exposureId && <AckCell exposureId={n.exposureId} />
                          )}
                        </span>
                        <span>
                          <FirstStepCell row={stepFor.get(n.companyId)} />
                        </span>
                        <span className="tabular-nums md:text-right">
                          {n.heldCents > 0 ? (
                            <span className="font-semibold text-amber">
                              {money(n.heldCents)}
                              <span className="md:sr-only"> held</span>
                            </span>
                          ) : (
                            <span className="text-ash">No holds</span>
                          )}
                        </span>
                      </span>
                      <span className="sr-only">. Open its evidence on the map.</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const ROW_GRID = "md:grid-cols-[minmax(0,1.4fr)_6.5rem_minmax(0,1.3fr)_minmax(0,1fr)_6.5rem]";

// Who acknowledged. A row resolved without anyone acknowledging says so quietly; its urgency
// chip already reads "Resolved", so the word isn't repeated here.
function AckCell({ exposureId }: { exposureId: Id<"exposures"> }) {
  const evidence = useQuery(api.blastRadius.getExposureEvidence, { exposureId });
  if (evidence === undefined) return null;
  if (evidence?.acknowledgedBy) return <AcknowledgedBy userId={evidence.acknowledgedBy} />;
  return <span className="text-ash">No acknowledgement</span>;
}

// One small tile per exposed company, like the mark's tiles: hollow until acknowledged, filled
// when resolved. The count next to it says the same in words.
function AckTiles({ nodes }: { nodes: Node[] }) {
  return (
    <span aria-hidden className="flex gap-1">
      {nodes.map((n) => (
        <span
          key={n.companyId}
          className={`size-3 rounded-[4px] border ${
            n.status === "closed" ? "border-ok bg-ok" : n.status === "acknowledged" ? "border-ok bg-ok/30" : "border-ash/50"
          }`}
        />
      ))}
    </span>
  );
}

function Stat({ value, label, tone = "text-paper" }: { value: string; label: string; tone?: string }) {
  return (
    <>
      <span
        className={`text-right text-[clamp(2.5rem,1.6rem+2.2vw,3.75rem)] leading-none font-semibold tracking-[-0.03em] tabular-nums ${tone}`}
      >
        {value}
      </span>
      <span className="text-base leading-snug text-ash md:text-lg">{label}</span>
    </>
  );
}
