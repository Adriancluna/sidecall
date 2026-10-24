// Proof for judges (Hyphenate): what's real vs. simulated, and the scorecard against the
// planted answer key. Copy follows CLAUDE.md "Real vs. simulated".
import aiCacheRaw from "../../data/ai_cache.json?raw";
import { dnsFindings } from "./dnsFindings";
import { dateTime, humanize } from "./format";
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

const RESULT_TONE: Record<string, "ok" | "danger"> = {
  caught: "ok",
  correct_no_action: "ok",
  missed: "danger",
  false_hold: "danger",
};

export function ProofPanel() {
  return (
    <Card title="Proof">
      <div className="grid gap-6 md:grid-cols-2">
        <ProofList title="Real" items={REAL} />
        <ProofList title="Simulated" items={SIMULATED} />
      </div>
      {dnsFindings.length > 0 && <DnsFindings />}
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-semibold">
          Scorecard vs. the planted answer key
        </h3>
        <ScorecardBody />
      </div>
    </Card>
  );
}

function ProofList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ash uppercase">
        {title}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ScorecardBody() {
  if (scorecard === null) {
    return (
      <Empty>Scorecard file is unreadable. Re-run the scorecard script.</Empty>
    );
  }
  if (scorecard.generatedAt === null || scorecard.scenarios.length === 0) {
    return <Empty>Awaiting scorecard run.</Empty>;
  }
  const cases = scorecard.scenarios.reduce((n, s) => n + s.cases.length, 0);
  const missed = scorecard.scenarios.reduce((n, s) => n + s.missed, 0);
  const falseHolds = scorecard.scenarios.reduce((n, s) => n + s.falseHolds, 0);
  return (
    <div className="space-y-6">
      {/* The one line to end the demo on; the detail follows. */}
      <p className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">
        {cases} planted cases · <span className={missed ? "text-danger" : "text-ok"}>{missed} missed</span> ·{" "}
        <span className={falseHolds ? "text-danger" : "text-ok"}>{falseHolds} false holds</span>
      </p>
      <p className="text-xs text-ash">
        Our own planted cases, not a benchmark · generated {dateTime(Date.parse(scorecard.generatedAt))}
      </p>
      {scorecard.scenarios.map((s) => (
        <ScenarioBlock key={s.externalId} scenario={s} />
      ))}
    </div>
  );
}

function ScenarioBlock({ scenario: s }: { scenario: ScorecardScenario }) {
  const tiles = [
    { label: "Caught", value: s.caught, tone: "text-ok" },
    { label: "Missed", value: s.missed, tone: s.missed ? "text-danger" : "" },
    {
      label: "False holds",
      value: s.falseHolds,
      tone: s.falseHolds ? "text-danger" : "",
    },
    { label: "Correctly left alone", value: s.correctNoAction, tone: "" },
  ];
  return (
    <section>
      <h4 className="mb-2 text-sm font-semibold">
        {SCENARIO_NAME[s.externalId] ?? s.externalId}{" "}
        <span className="font-mono text-xs font-normal text-ash">{s.externalId}</span>
      </h4>
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-line p-3">
            <dt className="text-xs text-ash">{t.label}</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${t.tone}`}>
              {t.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-ash">
            <tr>
              <th className="py-1 pr-3 font-medium">Case</th>
              <th className="py-1 pr-3 font-medium">Expected</th>
              <th className="py-1 pr-3 font-medium">Actual</th>
              <th className="py-1 pr-3 font-medium">Result</th>
              <th className="py-1 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {s.cases.map((c) => (
              <tr key={c.ref} className="border-t border-line align-top">
                <td className="py-1.5 pr-3 font-mono text-xs">{c.ref}</td>
                <td className="py-1.5 pr-3">{humanize(c.expected)}</td>
                <td className="py-1.5 pr-3">{humanize(c.actual)}</td>
                <td className="py-1.5 pr-3">
                  <Chip tone={RESULT_TONE[c.result] ?? "muted"}>
                    {humanize(c.result)}
                  </Chip>
                </td>
                <td className="py-1.5">{c.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Shared vendors visible from public DNS alone: the same method that produces the seed's
// "candidate" links, run on real domains.
function DnsFindings() {
  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="mb-1 text-sm font-semibold">
        Vendor detection on real public domains
      </h3>
      <p className="mb-3 text-xs text-ash">
        From public DNS only (MX, SPF, TXT, CNAME). It shows a shared vendor,
        never a shared login, so these stay candidates.
      </p>
      <dl className="space-y-2 text-sm">
        {dnsFindings.map((d) => (
          <div key={d.domain} className="flex flex-wrap gap-x-3 gap-y-1">
            <dt className="w-36 shrink-0 font-mono text-xs text-ash">
              {d.domain}
            </dt>
            <dd className="flex min-w-0 flex-1 flex-wrap gap-1">
              {d.vendors.map((v) => (
                <span
                  key={v.vendor}
                  className="rounded-full border border-line px-2 py-0.5 text-xs"
                >
                  {v.vendor}{" "}
                  <span className="text-ash">{v.records.join("/")}</span>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
