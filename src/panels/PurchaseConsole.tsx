import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";
import { dateTime, money } from "./format";
import { PurchaseReceiptEvidence } from "./PurchaseDecision";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD } from "./styles";
import { Card, Chip, Skeleton, type Tone } from "./ui";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "Claude is processing", tone: "muted" },
  paid: { label: "Paid once · demo ledger", tone: "ok" },
  held: { label: "Held until verified", tone: "amber" },
  pending: { label: "Pending · no automatic settlement", tone: "amber" },
  refused: { label: "Request refused", tone: "amber" },
  declined: { label: "Claude declined to request", tone: "amber" },
  failed: { label: "Run could not finish", tone: "danger" },
  cancelled: { label: "Run stopped", tone: "muted" },
};
const active = (status: string) => status === "queued" || status === "running";

export function PurchaseConsole({ meId }: { meId: Id<"users"> }) {
  const state = useQuery(api.purchaseConsole.state, {});
  const bills = useQuery(api.payments.getMyBills, state?.configured ? {} : "skip");
  const start = useMutation(api.purchaseConsole.start);
  const [billId, setBillId] = useState<Id<"bills">>();
  const [sourceText, setSourceText] = useState("");
  const [presenterKey, setPresenterKey] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [asOf, setAsOf] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLDetailsElement>(null);
  const recordRef = useRef<HTMLDivElement>(null);
  const preview = useQuery(
    api.purchases.preview,
    state?.configured && billId ? { billId, asOf } : "skip",
  );
  const selected = bills?.find((row) => row.bill._id === billId);
  const expiresAt = preview?.evidence?.expected.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined || expiresAt <= asOf) return;
    const timer = window.setTimeout(
      () => setAsOf((previous) => Math.max(Date.now(), previous + 1)),
      Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() + 1)),
    );
    return () => window.clearTimeout(timer);
  }, [asOf, expiresAt]);
  // Keep the ordinary bill actions in place while capability loads or is unavailable.
  // Existing records and Stop controls remain accessible when execution is disabled.
  if (!state || (!state.configured && state.runs.length === 0)) return null;
  if (state.configured && bills === undefined) return null;
  const running = state.runs.some(
    ({ run }) => run.requestedBy === meId && active(run.status),
  );
  const canStart =
    state.canRun &&
    state.configured &&
    !running &&
    !busy &&
    selected &&
    !selected.payment &&
    preview?.decision === "approved" &&
    sourceText.trim().length >= 10 &&
    presenterKey.trim().length > 0;
  const updateSource = (value: string) => {
    setSourceText(value);
    setRequestId(crypto.randomUUID());
    setMessage("");
  };
  const submit = async () => {
    if (!canStart || !billId) return;
    setBusy(true);
    setMessage("");
    try {
      await start({
        billId,
        sourceText,
        clientRequestId: requestId,
        presenterKey,
      });
      setPresenterKey("");
      setBillId(undefined);
      setSourceText("");
      setRequestId(crypto.randomUUID());
      if (formRef.current) formRef.current.open = false;
      setMessage(
        "Run saved. Its source, tools and payment outcome update below, even if you leave this page.",
      );
      recordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      // Keep this identity when the response is uncertain so retry cannot create a second run.
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Process an approved bill with Claude">
      <p className="max-w-prose text-sm leading-relaxed text-ash">
        Claude reads an invoice and requests only the saved bill you select.
        Convex rechecks the controller’s approval, payee, amount, requester,
        budget and incidents before any settlement.
      </p>
      <p className="mt-2 text-sm text-amber">
        Synthetic demo ledger · No bank or Visa transaction is sent.
      </p>
      {!state.configured && (
        <p
          role="status"
          className="mt-4 rounded-tile border border-line p-3 text-sm text-amber"
        >
          {state.configurationReason}
        </p>
      )}
      {state.configured && state.canRun ? (
        <details
          ref={formRef}
          className="mt-5 rounded-tile border border-line p-4"
          open={state.runs.length === 0}
        >
          <summary className="cursor-pointer text-sm font-medium">
            {state.runs.length
              ? "Process another approved bill"
              : "Choose an approved bill and its invoice"}
          </summary>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block max-w-2xl text-sm">
              Saved bill to process
              <select
                className={`${FIELD} mt-1 block w-full min-w-0`}
                value={billId ?? ""}
                disabled={busy || running}
                onChange={(event) => {
                  setBillId(
                    bills?.find((row) => row.bill._id === event.target.value)
                      ?.bill._id,
                  );
                  setAsOf(Date.now());
                  updateSource("");
                }}
              >
                <option value="">Choose a saved bill</option>
                {bills?.map((row) => (
                  <option
                    key={row.bill._id}
                    value={row.bill._id}
                    disabled={!!row.payment}
                  >
                    {row.vendorName} · {row.bill.description} ·{" "}
                    {money(row.bill.amountCents)}
                    {row.payment ? " · already requested" : ""}
                  </option>
                ))}
              </select>
            </label>
            {billId && (
              <div className="max-w-2xl rounded-tile border border-line p-3 text-sm">
                {selected?.payment ? (
                  <p className="text-ash">
                    This bill already has a payment request. Select another
                    bill; the recorded outcome is below.
                  </p>
                ) : preview === undefined ? (
                  <Skeleton rows={2} />
                ) : preview === null ? (
                  <p>This bill is no longer available.</p>
                ) : (
                  <>
                    <p
                      className={
                        preview.decision === "approved"
                          ? "text-ok"
                          : "text-amber"
                      }
                    >
                      {preview.decision === "approved"
                        ? "Currently eligible under a controller approval"
                        : "Controller approval needed before Claude can run"}
                    </p>
                    <p className="mt-1 leading-relaxed text-ash">
                      {preview.reason}
                    </p>
                    <p className="mt-1 text-xs text-ash">
                      Current facts are checked again when you submit and when
                      Claude requests payment.
                    </p>
                  </>
                )}
              </div>
            )}
            <label className="block text-sm">
              Invoice or email source
              <textarea
                className={`${FIELD} mt-1 min-h-40 w-full`}
                name="purchaseSource"
                autoComplete="off"
                placeholder="Paste invoice text with the vendor, description, amount and masked account."
                maxLength={6000}
                value={sourceText}
                disabled={busy || running}
                onChange={(event) => updateSource(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                className={BUTTON_SECONDARY}
                disabled={
                  !selected ||
                  !!selected.payment ||
                  busy ||
                  running ||
                  !preview?.evidence?.current.payee
                }
                onClick={() => {
                  if (!selected || !preview?.evidence?.current.payee) return;
                  updateSource(
                    `Synthetic invoice for this demo\nVendor: ${selected.vendorName}\nDescription: ${selected.bill.description}\nAmount: ${money(selected.bill.amountCents)}\nAccount: ****${preview.evidence.current.payee.accountLast4}`,
                  );
                }}
              >
                Use saved bill as demo source
              </button>
              <span className="text-xs text-ash">
                {sourceText.length.toLocaleString()} / 6,000 characters
              </span>
            </div>
            <p className="max-w-prose text-xs leading-relaxed text-ash">
              Source text is saved with this run and sent to Claude as untrusted
              evidence. Use masked account details and no credentials. A
              document cannot grant approval or change the payee.
            </p>
            <label className="block max-w-md text-sm">
              Presenter key
              <input
                type="password"
                className={`${FIELD} mt-1 block w-full`}
                name="purchasePresenterKey"
                autoComplete="off"
                value={presenterKey}
                disabled={busy || running}
                onChange={(event) => setPresenterKey(event.target.value)}
              />
            </label>
            <p className="max-w-prose text-xs text-ash">
              Authorizes paid model usage; never saved in the run. Uses{" "}
              {state.model}, with at most four calls and a three-minute
              execution window.
            </p>
            <button
              type="submit"
              className={BUTTON_PRIMARY}
              disabled={!canStart}
            >
              {busy
                ? "Saving run…"
                : running
                  ? "A purchase run is active"
                  : "Process approved bill"}
            </button>
          </form>
        </details>
      ) : state.configured ? (
        <p className="mt-4 max-w-prose text-sm text-ash">
          Set a purchasing approval below, then sign in as the AP clerk to
          process its invoice. You can review and stop your company’s active
          runs here.
        </p>
      ) : null}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      <div
        ref={recordRef}
        className="mt-6 scroll-mt-6 border-t border-line pt-5"
      >
        <h3 className="font-medium">Live execution record</h3>
        <p className="mt-1 text-xs text-ash">
          Up to 10 recent company runs, including your active run · recorded
          source, tool calls and server outcomes · no model reasoning is
          displayed
        </p>
        {state.runs.length === 0 ? (
          <p className="mt-4 text-sm text-ash">
            No runs yet. A controller approves the bill, then the AP clerk
            processes its invoice here.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {state.runs.map((row, index) => {
              const record = (
                <PurchaseRun
                  {...row}
                  canStop={row.run.requestedBy === meId || !state.canRun}
                  canTest={state.canRun && row.run.requestedBy === meId}
                />
              );
              return index === 0 || active(row.run.status) ? (
                <div key={row.run._id}>{record}</div>
              ) : (
                <details
                  key={row.run._id}
                  className="rounded-tile border border-line p-3"
                >
                  <summary className="cursor-pointer text-sm">
                    {row.run.snapshot.vendorName} ·{" "}
                    {money(row.run.snapshot.amountCents)} ·{" "}
                    {STATUS[row.run.status]?.label ?? row.run.status} ·{" "}
                    {dateTime(row.run.createdAt)}
                  </summary>
                  <div className="mt-3">{record}</div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function PurchaseRun({
  run,
  requesterName,
  receipt,
  canStop,
  canTest,
}: {
  run: Doc<"purchaseRuns">;
  requesterName: string;
  receipt: Doc<"purchaseReceipts"> | null;
  canStop: boolean;
  canTest: boolean;
}) {
  const cancel = useMutation(api.purchaseConsole.cancel);
  const testDefenses = useMutation(api.purchaseConsole.testDefenses);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const status = STATUS[run.status] ?? {
    label: run.status,
    tone: "muted" as const,
  };
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article
      className="min-w-0 rounded-tile border border-line p-4"
      aria-label={`Purchase run for ${run.snapshot.description}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium break-words">
            {run.snapshot.vendorName} · {money(run.snapshot.amountCents)}
          </h4>
          <p className="mt-1 text-sm break-words text-ash">
            {run.snapshot.description} · payee ••{run.snapshot.accountLast4}
          </p>
          <p className="mt-1 text-xs text-ash">
            Requested by {requesterName} · {dateTime(run.createdAt)}
          </p>
        </div>
        <div role="status">
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
      </div>
      {run.reason && (
        <p className="mt-3 text-sm leading-relaxed">{run.reason}</p>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Saved invoice source
        </summary>
        <p className="mt-2 text-xs text-ash">
          Untrusted document; stored at submission and never interpreted as
          payment authority.
        </p>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-tile bg-raised p-3 font-mono text-xs leading-relaxed">
          {run.sourceText}
        </pre>
        <p className="mt-2 break-all font-mono text-xs text-ash">
          SHA-256 {run.sourceSha256}
        </p>
      </details>
      {active(run.status) ? (
        <ExecutionSteps events={run.events} />
      ) : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Execution trace · {run.events.length} recorded steps
          </summary>
          <ExecutionSteps events={run.events} />
        </details>
      )}
      <p className="mt-4 text-xs text-ash">
        {run.modelCalls} model calls · {run.inputTokens.toLocaleString()} input
        / {run.outputTokens.toLocaleString()} output tokens · {run.model}
        {run.finishedAt !== undefined &&
          ` · ${((run.finishedAt - run.createdAt) / 1000).toFixed(1)} s from submission`}
      </p>
      {run.outcome?.ok && (
        <p className="mt-2 break-all text-xs text-ash">
          Payment record: {run.outcome.paymentId}
        </p>
      )}
      {receipt && (
        <div className="mt-4 border-t border-line pt-3">
          <PurchaseReceiptEvidence receipt={receipt} />
        </div>
      )}
      {!active(run.status) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-xs text-ash">
            This is the result at execution time. Later payment review or
            release appears in Held payments and the ledger.
          </p>
          <a
            className={BUTTON_SECONDARY}
            download={`sidecall-purchase-run-${run._id}.json`}
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ format: "sidecall.purchase-run.v1", run, receipt }, null, 2))}`}
          >
            Export run evidence
          </a>
        </div>
      )}
      {active(run.status) && canStop && (
        <div className="mt-4">
          <button
            className={BUTTON_SECONDARY}
            disabled={busy}
            onClick={() => void perform(() => cancel({ id: run._id }))}
          >
            {busy ? "Stopping…" : "Stop this run"}
          </button>
          <p className="mt-2 text-xs text-ash">
            An in-flight model call can still incur usage. Stopping cannot
            reverse a payment that already committed.
          </p>
        </div>
      )}
      {!active(run.status) && run.outcome?.ok && (
        <section
          className="mt-5 border-t border-line pt-4"
          aria-label="Execution boundary challenges"
        >
          <h5 className="text-sm font-medium">
            Challenge the payment controls
          </h5>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-ash">
            Run forged tool arguments through the same server guard used for
            Claude, then replay this actual request and compare its journal.
            These checks use no new model calls and measure these specific
            cases, not fraud detection accuracy.
          </p>
          {run.proof ? (
            <>
              <div className="mt-3">
                <Chip tone={run.proof.passed ? "ok" : "danger"}>
                  {run.proof.checks.filter((check) => check.passed).length} /{" "}
                  {run.proof.checks.length} checks passed
                </Chip>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {run.proof.checks.map((check) => (
                  <li key={check.name} className="py-2 text-sm">
                    <p>
                      <span
                        className={check.passed ? "text-ok" : "text-danger"}
                      >
                        {check.passed ? "Passed" : "Failed"}
                      </span>{" "}
                      · {check.name}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ash">
                      {check.detail}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                Payment postings: {run.proof.paymentPostingCountBefore} →{" "}
                {run.proof.paymentPostingCountAfter} · Cash debited:{" "}
                {money(run.proof.paymentDebitCentsBefore)} →{" "}
                {money(run.proof.paymentDebitCentsAfter)}
              </p>
              <p className="mt-2 text-xs text-ash">
                Recorded {dateTime(run.proof.at)}. The journal comparison covers
                this payment only.
              </p>
            </>
          ) : canTest ? (
            <button
              className={`${BUTTON_SECONDARY} mt-3`}
              disabled={busy}
              onClick={() => void perform(() => testDefenses({ id: run._id }))}
            >
              {busy ? "Checking controls…" : "Run control challenges"}
            </button>
          ) : (
            <p className="mt-3 text-xs text-ash">
              The AP requester can run these checks after the payment request
              completes.
            </p>
          )}
        </section>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-danger">
          {message}
        </p>
      )}
    </article>
  );
}

function ExecutionSteps({ events }: { events: Doc<"purchaseRuns">["events"] }) {
  const toolTitle: Record<string, string> = {
    read_selected_bill: "Claude read the selected bill",
    request_payment: "Claude requested the selected payment",
    decline_purchase: "Claude chose not to request payment",
  };
  return (
    <ol
      className="mt-4 space-y-3 border-l border-line pl-4"
      aria-label="Recorded execution steps"
      aria-live="polite"
      aria-relevant="additions"
    >
      {events.map((event, index) => (
        <li key={`${index}-${event.at}`}>
          <p className="text-sm font-medium break-words">
            {index + 1}.{" "}
            {toolTitle[event.title] ??
              (event.kind === "decision"
                ? STATUS[event.title]?.label
                : undefined) ??
              event.title}
          </p>
          {event.kind === "tool" || event.kind === "tool_result" ? (
            <details className="mt-1 text-xs text-ash">
              <summary className="cursor-pointer">
                {event.kind === "tool"
                  ? `Tool: ${event.title}`
                  : "Saved bill returned to Claude"}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-tile bg-raised p-3 font-mono text-xs leading-relaxed">
                {event.detail}
              </pre>
            </details>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ash">
              {event.detail}
            </p>
          )}
          <p className="mt-1 text-xs text-ash">{dateTime(event.at)}</p>
        </li>
      ))}
    </ol>
  );
}
