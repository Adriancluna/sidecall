// Proof for judges (Hyphenate): what's real vs. simulated, and the scorecard against the
// planted answer key. Copy follows CLAUDE.md "Real vs. simulated".
import { Fragment } from "react";
import aiCacheRaw from "../../data/ai_cache.json?raw";
import { dnsFindings } from "./dnsFindings";
import { dateTime } from "./format";
import { scorecard, type ScorecardScenario } from "./scorecard";
import { Card, Chip, Empty } from "./ui";

// Role 4's pre-generated texts (data/ai_cache.json). Until it has entries, alerts use canned
// placeholder text, so we don't claim AI writing as real.
const AI_TEXTS = (() => {
  try {
    const data: unknown = JSON.parse(aiCacheRaw);
    const entries = (data as { entries?: unknown }).entries;
    return entries && typeof entries === "object"
      ? Object.keys(entries).length
      : 0;
  } catch {
    return 0;
  }
})();

const REAL = [
  "The Convex backend and its guarantees: one webhook write fans out atomically, every client sees the same snapshot, replays are idempotent, acknowledge is race-safe",
  "Exposure and hold logic",
  ...(AI_TEXTS > 0
    ? [
        "The AI writing (alerts, vendor letter, hold notices), generated with Claude ahead of the demo",
      ]
    : []),
  "The scorecard against the planted answer key",
  "DNS-based vendor detection on real public domains",
];

const SIMULATED = [
  "The portfolio and its companies",
  "Users, bills, payments and amounts",
  "Incidents and bank-detail changes",
  ...(AI_TEXTS > 0
    ? []
    : ["Alert wording (placeholder text until the AI texts are generated)"]),
];

// Scenario ids as the presenter's simulator names them (src/demo/DemoControls.tsx).
const SCENARIO_NAME: Record<string, string> = {
  "demo-brightline-001": "Brightline payroll breach",
  "demo-ironclad-cred-002": "Ironclad shared login leaked",
  "demo-ironclad-msp-003": "Ironclad MSP compromised",
  "demo-armadin-004": "Red-team finding (Ironclad login)",
};

const RESULT: Record<string, { tone: "ok" | "danger"; label: string }> = {
  caught: { tone: "ok", label: "Caught" },
  correct_no_action: { tone: "ok", label: "Correctly left alone" },
  missed: { tone: "danger", label: "Missed" },
  false_hold: { tone: "danger", label: "False hold" },
};

const OUTCOME: Record<string, string> = {
  hold_and_flag: "hold and flag",
  hold_no_flag: "hold, no flag",
  no_action: "no action",
};
const outcome = (code: string) => OUTCOME[code] ?? code.replace(/_/g, " ");

export function ProofPanel() {
  return (
    <Card>
      <div className="grid gap-6 md:grid-cols-2">
        <ProofList title="Real" items={REAL} />
        <ProofList title="Simulated" items={SIMULATED} />
      </div>
      <p className="mt-4 text-sm text-ash">Identity responses are labelled per step. Only a confirmed external receiver receipt supports an Okta account-state claim; sandbox and simulated steps do not. A suspension receipt does not prove every downstream app session ended.</p>
      {dnsFindings.length > 0 && <DnsFindings />}
      <div className="mt-6 border-t border-line pt-5">
        <h2 className="mb-3 text-xl font-semibold tracking-[-0.02em]">Scorecard against the planted answer key</h2>
        <ScorecardBody />
      </div>
    </Card>
  );
}

function ProofList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ScorecardBody() {
  if (scorecard === null) {
    return <Empty>Scorecard file is unreadable. Re-run the scorecard script.</Empty>;
  }
  if (scorecard.generatedAt === null || scorecard.scenarios.length === 0) {
    return <Empty>Awaiting scorecard run.</Empty>;
  }
  const cases = scorecard.scenarios.reduce((n, s) => n + s.cases.length, 0);
  const missed = scorecard.scenarios.reduce((n, s) => n + s.missed, 0);
  const falseHolds = scorecard.scenarios.reduce((n, s) => n + s.falseHolds, 0);
  return (
    <div className="space-y-8">
      {/* The one line to end the demo on; the detail follows. */}
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">
          {cases} planted cases, <span className={missed ? "text-danger" : "text-ok"}>{missed} missed</span>,{" "}
          <span className={falseHolds ? "text-danger" : "text-ok"}>{falseHolds} false holds</span>
        </p>
        <p className="mt-2 text-sm text-ash">
          Our own planted cases, not a benchmark. Generated {dateTime(Date.parse(scorecard.generatedAt))}.
        </p>
      </div>
      {scorecard.scenarios.map((s) => (
        <ScenarioBlock key={s.externalId} scenario={s} />
      ))}
    </div>
  );
}

function ScenarioBlock({ scenario: s }: { scenario: ScorecardScenario }) {
  const figures = [
    { label: "caught", value: s.caught, tone: "text-ok" },
    { label: "missed", value: s.missed, tone: s.missed ? "text-danger" : "" },
    { label: "false holds", value: s.falseHolds, tone: s.falseHolds ? "text-danger" : "" },
    { label: "correctly left alone", value: s.correctNoAction, tone: "" },
  ];
  return (
    <section>
      <h3 className="font-semibold">{SCENARIO_NAME[s.externalId] ?? "Scenario"}</h3>
      <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ash">
        {figures.map((f) => (
          <span key={f.label} className="flex items-baseline gap-1.5">
            <span className={`text-lg font-semibold tabular-nums ${f.tone || "text-paper"}`}>{f.value}</span>
            {f.label}
          </span>
        ))}
      </p>
      <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
        {s.cases.map((c) => (
          <li key={c.ref} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p>{c.why}</p>
              <p className="text-ash">
                Expected {outcome(c.expected)}, got {outcome(c.actual)}
              </p>
            </div>
            <span>
              <Chip tone={RESULT[c.result]?.tone ?? "muted"}>{RESULT[c.result]?.label ?? outcome(c.result)}</Chip>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Shared vendors visible from public DNS alone: the same method that produces the seed's
// "candidate" links, run on real domains.
function DnsFindings() {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h2 className="text-xl font-semibold tracking-[-0.02em]">Vendor detection on real public domains</h2>
      <p className="mt-1 mb-3 max-w-prose text-sm text-ash">
        From public DNS only (MX, SPF, TXT, CNAME). It shows a shared vendor, never a shared login, so these stay
        candidates.
      </p>
      <dl className="divide-y divide-line border-y border-line text-sm">
        {dnsFindings.map((d) => (
          <div key={d.domain} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
            <dt className="w-40 shrink-0 text-ash">{d.domain}</dt>
            <dd className="min-w-0 flex-1">
              {d.vendors.map((v, i) => (
                <Fragment key={v.vendor}>
                  {i > 0 && ", "}
                  <span className="whitespace-nowrap">
                    {v.vendor} <span className="text-ash">({v.records.join(", ")})</span>
                  </span>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
