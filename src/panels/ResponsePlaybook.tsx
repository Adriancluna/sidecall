// Response playbook UI (docs/specs/response-playbook.md): the steps a company approved in advance
// for Sidecall to take, what ran in this incident, and the switches themselves.
// The backend decides everything (caps, two-person rule, who may act); this only shows it.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";
import { dateTime, humanize } from "./format";
import { BUTTON_SECONDARY } from "./styles";
import { Card, Chip, Empty } from "./ui";

type Mode = "notify" | "prepare" | "act";
const MODE_LABEL: Record<Mode, string> = {
  notify: "Notify only",
  prepare: "One click",
  act: "Pre-approved",
};
const MODE_HELP: Record<Mode, string> = {
  notify: "Tell us what to do.",
  prepare: "Have it ready; our IT lead or controller runs it with one click.",
  act: "Run it the moment a report lands, log it, offer Undo.",
};

const seconds = (ms: number) => (ms < 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);

// The steps for this incident, as the IT lead sees them in the hero.
export function PlanSteps({ incidentId }: { incidentId: Id<"incidents"> }) {
  const plan = useQuery(api.responses.getMyResponsePlan, { incidentId });
  const approve = useMutation(api.responses.approveStep);
  const undo = useMutation(api.responses.undoStep);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  if (!plan || plan.length === 0) return null;

  const run = async (key: string, call: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(key);
    setMessage(undefined);
    try {
      const res = await call();
      if (!res.ok) setMessage(`Not done: ${humanize(res.reason ?? "refused")}`);
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-line bg-graphite p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Your pre-approved steps</h2>
        <span className="text-xs text-ash">From your company's response playbook</span>
      </div>
      <ul className="mt-3 space-y-3">
        {plan.map((p) => (
          <li key={p.action} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-2xl">
              <p className="font-medium">
                {p.label}{" "}
                {p.status === "done" ? (
                  <Chip tone="ok">Done{p.msAfterReport !== null && ` ${seconds(p.msAfterReport)} after the report`}</Chip>
                ) : p.status === "awaiting_approval" ? (
                  <Chip tone="amber">Ready, one click</Chip>
                ) : p.status === "undone" ? (
                  <Chip tone="muted">Undone{p.undoneByName && ` by ${p.undoneByName}`}</Chip>
                ) : p.status === "recommended" ? (
                  <Chip tone="muted">Notify only</Chip>
                ) : (
                  <Chip tone="muted">{humanize(p.status)}</Chip>
                )}
              </p>
              <p className="mt-0.5 text-sm text-ash">
                {p.effect}
                {p.status === "done" &&
                  (p.approvedByName ? ` Run by ${p.approvedByName}.` : " Your company pre-approved this.")}
              </p>
              {p.capNote && <p className="mt-0.5 text-xs text-amber">{p.capNote}</p>}
              <p className="mt-0.5 text-xs text-ash/80">{p.executionMode === "sandbox" ? "Applied to an owned sandbox resource; external identity providers are not connected." : `Simulated. Stands for: ${p.wouldCall}`}</p>
              {p.verification && <p className="mt-1 text-sm text-ash">Recorded access check: {p.verification.accessBefore ? "allowed" : "denied"} → {p.verification.accessAfter ? "allowed" : "denied"}{p.status === "undone" ? " (before undo)" : ""}.</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {p.canApprove && p.stepId && (
                <button
                  type="button"
                  disabled={busy !== undefined}
                  onClick={() => void run(p.action, () => approve({ stepId: p.stepId! }))}
                  className={BUTTON_SECONDARY}
                >
                  Run now
                </button>
              )}
              {p.canUndo && p.stepId && (
                <button
                  type="button"
                  disabled={busy !== undefined}
                  onClick={() => void run(p.action, () => undo({ stepId: p.stepId! }))}
                  className={BUTTON_SECONDARY}
                >
                  Undo ({p.undo.toLowerCase()})
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {message && (
        <p role="status" className="mt-2 text-sm text-ash">
          {message}
        </p>
      )}
    </div>
  );
}

// The switches. Set in advance, per step; raising a step to Pre-approved takes two people.
export function PlaybookPanel() {
  const rows = useQuery(api.responses.getMyPlaybook, {});
  const setMode = useMutation(api.responses.setPlaybookMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const change = async (action: (typeof rows & object)[number]["action"], mode: Mode) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await setMode({ action, mode });
      setMessage(
        !res.ok
          ? res.reason
          : res.awaitingSecondPerson
            ? "Proposed. A second person at your company (IT lead or controller) must confirm before it's pre-approved."
            : res.applied
              ? "Saved. It applies to the next report."
              : undefined,
      );
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Response playbook">
      <p className="max-w-3xl text-sm text-ash">
        Decide now, not at 2am, what Sidecall may do for your company when a vendor or login you share is
        compromised. Sidecall only runs steps you chose, only where your team confirmed the link, and every one can
        be undone. Raising a step to Pre-approved takes two people. The PE firm can recommend; only your company
        decides. The identity-provider call is simulated in this demo.
      </p>
      {rows === undefined ? (
        <Empty>Loading…</Empty>
      ) : rows.length === 0 ? (
        <Empty>The PE firm sees each company's steps in the response tracker; only the company sets them.</Empty>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.action} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="font-medium">{r.label}</p>
                <p className="mt-0.5 text-sm text-ash">Why: {r.finding}. Undo: {r.undo.toLowerCase()}.</p>
                <p className="mt-0.5 text-xs text-ash">
                  {r.action === "hold_payments"
                    ? `Switched ${r.mode === "act" ? "on" : "off"} by your controller`
                    : r.setByName
                    ? `Set by ${r.setByName}${r.confirmedByName ? `, confirmed by ${r.confirmedByName}` : ""}${r.version ? `, version ${r.version}` : ""}${r.setAt ? `, ${dateTime(r.setAt)}` : ""}`
                    : "Not set yet: Notify only"}
                  {r.mode !== r.recommendedMode && `. The firm recommends ${MODE_LABEL[r.recommendedMode]}`}
                </p>
                {r.proposedMode && (
                  <p className="mt-1 text-sm text-amber">
                    {r.proposedByName} proposed {MODE_LABEL[r.proposedMode]}: waiting for a second person.
                  </p>
                )}
              </div>
              <div role="radiogroup" aria-label={r.label} className="flex flex-wrap gap-1 self-start">
                {r.allowedModes.map((m) => {
                  const on = r.mode === m;
                  const confirm = r.proposedMode === m && !on;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={MODE_HELP[m]}
                      disabled={busy || !r.canEdit}
                      onClick={() => void change(r.action, m)}
                      className={`min-h-8 rounded-chip px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed ${
                        on
                          ? "bg-paper text-graphite"
                          : confirm
                            ? "text-amber ring-1 ring-amber/60 hover:bg-hover"
                            : "text-ash ring-1 ring-line hover:bg-hover hover:text-paper"
                      }`}
                    >
                      {confirm ? `Confirm ${MODE_LABEL[m]}` : MODE_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-ash">
          {message}
        </p>
      )}
    </Card>
  );
}

// PE tracker cell: how far one company's own steps got.
export function FirstStepCell({
  row,
}: {
  row?: { done: number; ready: number; firstStepMs: number | null; notifyOnly: boolean };
}) {
  if (!row) return <span className="text-ash">–</span>;
  if (row.done > 0)
    return (
      <span className="text-ok">
        First step done{row.firstStepMs !== null && ` in ${seconds(row.firstStepMs)}`}
      </span>
    );
  if (row.ready > 0) return <span className="text-amber">Ready, one click</span>;
  return <span className="text-ash">Notify only</span>;
}
