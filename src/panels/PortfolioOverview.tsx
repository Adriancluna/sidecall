import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Tabs } from "../layout/Tabs";
import { Card, Empty, HeroSkeleton, StatusLine } from "./ui";
import { dateTime, money } from "./format";
import { BUTTON_SECONDARY } from "./styles";
import { InvestigationPanel, ResponseSafetyPanel } from "./InvestigationPanel";
import { ApImportPanel } from "./ApImportPanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProofPanel } from "./ProofPanel";

type PastIncident = { _id: Id<"incidents">; vendorName: string; assetName: string; createdAt: number; containedAt: number | null };
export function PortfolioOverview({ incidents, active, select, onHistory }: {
  incidents: PastIncident[]; active: string; select: (id: string) => void;
  onHistory: (id: Id<"incidents">) => void;
}) {
  const companies = useQuery(api.blastRadius.listCompanies, {});
  const assets = useQuery(api.blastRadius.listAssets, {});
  const payments = useQuery(api.payments.getHeldPayments, {});
  const reset = useQuery(api.seed.resetAvailability, {});
  if (!companies || !assets || !payments || !reset) return <HeroSkeleton />;
  const held = payments.filter(p => p.payment.status === "held");
  const history = incidents.filter(i => i.containedAt !== null);
  const historyPanel = () => <Card title="Incident history">
    <p className="mb-4 text-sm text-ash">Past incidents and account recovery records are retained here. They are not active alerts.</p>
    {history.length ? <ul className="divide-y divide-line">{history.map(i => <li key={i._id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div><p className="font-medium">{i.vendorName} · {i.assetName}</p><p className="mt-1 text-sm text-ash">Contained · {dateTime(i.containedAt!)}</p></div>
      <button className={BUTTON_SECONDARY} onClick={() => onHistory(i._id)}>View record</button>
    </li>)}</ul> : <Empty>No past incidents.</Empty>}
  </Card>;
  return <Tabs active={active} onSelect={select} label="Portfolio" leadTab="map"
    lead={<section aria-labelledby="hero-title">
      <StatusLine tone={reset.running || reset.resetError || held.length ? "amber" : "ok"} state="No open incidents" />
      <h1 id="hero-title" className="mt-5 text-headline font-semibold text-balance">Your portfolio, at a glance</h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ash">Your companies and vendors are in place. When an incident is reported, Sidecall shows the affected relationships and coordinates the response here.</p>
      {(reset.running || reset.resetError) && <p role="status" className="mt-5 rounded-tile border border-line p-4 text-amber">{reset.running ? `Practice reset in progress: ${reset.reason}` : `Practice reset needs attention: ${reset.resetError}`}</p>}
      {held.length > 0 && <p className="mt-5 text-amber">{held.length} payment{held.length === 1 ? " remains" : "s remain"} held for verification. <button className="underline" onClick={() => select("payments")}>Review payments</button></p>}
      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[['Portfolio companies', companies.length], ['Vendors on file', new Set(assets.map(a => a.vendorName)).size], ['Open incidents', 0], ['Payments held', money(held.reduce((n,p) => n+p.payment.amountCents,0))]].map(([label,value]) => <div key={label} className="rounded-tile border border-line p-5"><dt className="text-sm text-ash">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
    </section>}
    tabs={[
      {id:'map',label:'Portfolio overview',content:() => <div className="space-y-6">
        <Card title="Portfolio companies" aside={<span className="text-sm text-ash">No open incident reports</span>}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{companies.map(c => <li key={c._id} className="rounded-tile border border-line p-4"><p className="font-medium">{c.name}</p><p className="mt-2 text-sm text-ash">{c.headcount.toLocaleString()} people</p></li>)}</ul>
        </Card>
        <Card title="Vendors on file"><div className="flex flex-wrap gap-3">{[...new Set(assets.map(a => a.vendorName))].map(name => <span key={name} className="rounded-chip border border-line px-3 py-2 text-sm text-ash">{name}</span>)}</div></Card>
      </div>},
      {id:'alerts',label:'Alerts',content:() => <Card><Empty>No open incident alerts. Past alerts are available in Incident history.</Empty></Card>},
      {id:'payments',label:'Payments & controls',count:held.length,content:() => <div className="space-y-6"><HeldPaymentsPanel title="Payments held" rows={held} /><InvestigationPanel firm /></div>},
      {id:'timeline',label:'Incident history',content:() => <div className="space-y-6">{historyPanel()}<ResponseSafetyPanel /><NotificationsPanel scope="firm" canManage /></div>},
      {id:'onboard',label:'Onboard',content:() => <ApImportPanel />},
      {id:'proof',label:'Proof',content:() => <ProofPanel />},
    ]} />;
}
