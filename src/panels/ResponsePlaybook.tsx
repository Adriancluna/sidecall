// Response playbook UI (docs/specs/response-playbook.md): the steps a company approved in advance
// for Sidecall to take, what ran in this incident, and the switches themselves.
// The backend decides everything (caps, two-person rule, who may act); this only shows it.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";
import { dateTime, humanize } from "./format";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./styles";
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
        <h2 className="text-xs font-semibold tracking-wider text-ash uppercase">Your pre-approved steps</h2>
        <span className="text-xs text-ash">From your response playbook · connector simulated in this demo</span>
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
                  <Chip tone="amber">Ready · one click</Chip>
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
              {p.approvalReason && (
                <p className="mt-0.5 text-sm text-ash">
                  Why your company pre-approved it: <q className="text-paper">{p.approvalReason}</q>
                </p>
              )}
              {p.capNote && <p className="mt-0.5 text-xs text-amber">{p.capNote}</p>}
              <p className="mt-0.5 text-xs text-ash/80">Stands for: {p.wouldCall}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {p.canApprove && p.stepId && (
                <button
                  type="button"
                  disabled={busy !== undefined}
                  onClick={() => void run(p.action, () => approve({ stepId: p.stepId! }))}
                  className={BUTTON_PRIMARY}
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

const MIN_REASON = 20; // the backend enforces the same minimum

// The switches. Set in advance, per step; raising a step to Pre-approved takes two people,
// and each of them writes down why.
export function PlaybookPanel() {
  const rows = useQuery(api.responses.getMyPlaybook, {});
  const setMode = useMutation(api.responses.setPlaybookMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  type Action = (typeof rows & object)[number]["action"];
  const [draft, setDraft] = useState<{ action: Action; confirming: boolean }>();
  const [note, setNote] = useState("");

  const change = async (action: Action, mode: Mode, reason?: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await setMode({ action, mode, note: reason });
      if (res.ok) {
        setDraft(undefined);
        setNote("");
      }
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
                    ? `Set by ${r.setByName}${r.confirmedByName ? `, confirmed by ${r.confirmedByName}` : ""}${r.version ? ` · v${r.version}` : ""}${r.setAt ? ` · ${dateTime(r.setAt)}` : ""}`
                    : "Not set yet: Notify only"}
                  {r.mode !== r.recommendedMode && ` · firm recommends ${MODE_LABEL[r.recommendedMode]}`}
                </p>
                {r.reason && (
                  <p className="mt-1 text-sm text-ash">
                    Why: <q className="text-paper">{r.reason}</q>
                    {r.setByName && ` (${r.setByName})`}
                  </p>
                )}
                {r.confirmNote && (
                  <p className="mt-0.5 text-sm text-ash">
                    Confirmed because: <q className="text-paper">{r.confirmNote}</q>
                    {r.confirmedByName && ` (${r.confirmedByName})`}
                  </p>
                )}
                {r.proposedMode && (
                  <p className="mt-1 text-sm text-amber">
                    {r.proposedByName} proposed {MODE_LABEL[r.proposedMode]}: waiting for a second person.
                    {r.proposedReason && (
                      <>
                        {" "}
                        Reason: <q className="text-paper">{r.proposedReason}</q>
                      </>
                    )}
                  </p>
                )}
                {draft?.action === r.action && (
                  <form
                    className="mt-3 max-w-2xl"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void change(r.action, "act", note);
                    }}
                  >
                    <label htmlFor={`reason-${r.action}`} className="text-sm font-medium">
                      {draft.confirming
                        ? `Why do you agree Sidecall may ${r.label.toLowerCase()} without asking?`
                        : `Why may Sidecall ${r.label.toLowerCase()} without asking first?`}
                    </label>
                    <textarea
                      id={`reason-${r.action}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={500}
                      autoFocus
                      placeholder={
                        draft.confirming
                          ? "e.g. Agreed: the vendor can still reach us through our own break-glass account while it's paused."
                          : "e.g. This login reaches our production systems; a paused login costs an hour, a night of access costs a shutdown."
                      }
                      className="mt-1 w-full rounded-md border border-line bg-graphite p-2 text-sm text-paper placeholder:text-ash/60 focus:border-amber focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        disabled={busy || note.trim().length < MIN_REASON}
                        className={BUTTON_PRIMARY}
                      >
                        {draft.confirming ? "Confirm Pre-approved" : "Propose Pre-approved"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(undefined);
                          setNote("");
                        }}
                        className={BUTTON_SECONDARY}
                      >
                        Cancel
                      </button>
                      <span className="text-xs text-ash">
                        {note.trim().length < MIN_REASON
                          ? `At least a sentence (${MIN_REASON - note.trim().length} more characters).`
                          : "Saved with your name in the controls log."}
                      </span>
                    </div>
                  </form>
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
                      onClick={() => {
                        // Raising a step to Pre-approved needs a written reason first.
                        if (m === "act" && !on && r.action !== "hold_payments") {
                          setMessage(undefined);
                          setNote("");
                          setDraft({ action: r.action, confirming: confirm });
                        } else void change(r.action, m);
                      }}
                      className={`rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed ${
                        on
                          ? "border-amber bg-amber/15 text-paper"
                          : confirm
                            ? "border-amber/60 text-amber hover:bg-amber/10"
                            : "border-line text-ash hover:border-ash hover:text-paper"
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
  if (row.ready > 0) return <span className="text-amber">Ready · one click</span>;
  return <span className="text-ash">Notify only</span>;
}
