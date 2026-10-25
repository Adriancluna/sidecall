// Where Sidecall's warnings go outside the app (docs/specs/notifications.md): connected channels
// (Slack / Discord / webhook, URLs masked by the backend) and the outbox of what was sent.
// With NOTIFY_LIVE off (default, stage rule) messages end "simulated" and never leave Convex.
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError, refusalOf } from "../layout/errors";
import { dateTime } from "./format";
import { OUTBOX_STATUS } from "./labels";
import { Card, Empty, LookChip, Skeleton } from "./ui";
import { BUTTON_PRIMARY, BUTTON_QUIET, BUTTON_SECONDARY, FIELD } from "./styles";

type Scope = "company" | "firm";
type Kind = "slack" | "discord" | "webhook";
type Event = "alert" | "hold" | "escalation" | "incident" | "contained";

const EVENT_LABEL: Record<string, string> = {
  alert: "Alerts",
  hold: "Holds",
  escalation: "Escalations",
  incident: "Incidents",
  contained: "Containment",
  test: "Test",
};
const KIND_LABEL: Record<Kind, string> = { slack: "Slack", discord: "Discord", webhook: "Webhook" };

const EVENTS: Record<Scope, Event[]> = {
  company: ["alert", "hold", "escalation"],
  firm: ["incident", "contained"],
};

type Props = {
  scope: Scope;
  canManage: boolean; // company controller, or the PE partner for firm channels
  incidentId?: Id<"incidents">;
};

export function NotificationsPanel({ scope, canManage, incidentId }: Props) {
  const channels = useQuery(api.notifications.listChannels, {});
  const removeChannel = useMutation(api.notifications.removeChannel);
  const sendTest = useMutation(api.notifications.sendTest);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const act = async (
    key: string,
    run: () => Promise<{ ok: boolean; reason?: string }>,
    done: string,
  ) => {
    setBusy(key);
    setMessage((await refusalOf(run)) ?? done);
    setBusy(undefined);
  };

  const mine = channels?.filter((c) => c.scope === scope);
  return (
    <Card title="Notifications">
      <p className="mb-4 max-w-prose text-sm text-ash">
        Warnings also go to the team's own channels. On this deployment they're
        recorded as simulated and not actually sent.
      </p>
      {mine === undefined ? (
        <Skeleton rows={2} />
      ) : mine.length === 0 ? (
        <Empty>No channels connected.</Empty>
      ) : (
        <ul className="mb-4 divide-y divide-line border-y border-line">
          {mine.map((c) => (
            <li
              key={c._id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{c.label}</span>{" "}
                <span className="text-ash">
                  {KIND_LABEL[c.kind]}, {c.target}.{" "}
                  {c.events.map((ev) => EVENT_LABEL[ev] ?? ev).join(", ")}
                </span>
              </div>
              {c.canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== undefined}
                    onClick={() =>
                      void act(
                        `${c._id}-test`,
                        () => sendTest({ channelId: c._id }),
                        "Test queued.",
                      )
                    }
                    className={BUTTON_SECONDARY}
                  >
                    {busy === `${c._id}-test` ? "Sending…" : "Send test"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== undefined}
                    onClick={() =>
                      window.confirm(`Disconnect ${c.label}?`) &&
                      void act(
                        `${c._id}-remove`,
                        () => removeChannel({ channelId: c._id }),
                        "Disconnected.",
                      )
                    }
                    className={BUTTON_QUIET}
                  >
                    {busy === `${c._id}-remove` ? "Removing…" : "Remove"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && <AddChannel scope={scope} onDone={setMessage} />}
      {message && (
        <p role="status" className="mt-2 text-sm text-ash">
          {message}
        </p>
      )}
      <Outbox incidentId={incidentId} />
    </Card>
  );
}

function AddChannel({
  scope,
  onDone,
}: {
  scope: Scope;
  onDone: (m: string) => void;
}) {
  const addChannel = useMutation(api.notifications.addChannel);
  const [kind, setKind] = useState<Kind>("slack");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Event[]>(EVENTS[scope]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await addChannel({
        scope,
        kind,
        label: label.trim(),
        url: url.trim(),
        events,
      });
      if (res.ok) {
        setLabel("");
        setUrl("");
        onDone("Channel connected.");
      } else {
        onDone(res.reason);
      }
    } catch (err) {
      onDone(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="text-sm">
      <summary className="text-ash">Connect a channel</summary>
      <form onSubmit={(e) => void submit(e)} className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`kind-${scope}`}>
            Kind
          </label>
          <select
            id={`kind-${scope}`}
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className={FIELD}
          >
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
            <option value="webhook">Webhook</option>
          </select>
          <label className="sr-only" htmlFor={`label-${scope}`}>
            Label
          </label>
          <input
            id={`label-${scope}`}
            name="label"
            required
            autoComplete="off"
            placeholder="#finance-alerts"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${FIELD} min-w-0 flex-1`}
          />
        </div>
        <label className="sr-only" htmlFor={`url-${scope}`}>
          Webhook URL
        </label>
        <input
          id={`url-${scope}`}
          name="webhookUrl"
          type="url"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="https://hooks.slack.com/services/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={`${FIELD} w-full`}
        />
        <fieldset className="flex flex-wrap gap-3 text-xs text-ash">
          <legend className="sr-only">Events</legend>
          {EVENTS[scope].map((ev) => (
            <label key={ev} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={(e) =>
                  setEvents(
                    e.target.checked
                      ? [...events, ev]
                      : events.filter((x) => x !== ev),
                  )
                }
              />
              {EVENT_LABEL[ev] ?? ev}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={busy || events.length === 0}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
    </details>
  );
}

function Outbox({ incidentId }: { incidentId?: Id<"incidents"> }) {
  const rows = useQuery(
    api.notifications.listOutbox,
    incidentId ? { incidentId } : {},
  );
  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 className="mb-2 font-semibold">Outbox</h3>
      {rows === undefined ? (
        <Skeleton rows={2} />
      ) : rows.length === 0 ? (
        <Empty>Nothing sent yet.</Empty>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r._id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ash">
                  {dateTime(r.createdAt)}
                </span>
                <span className="font-medium">{r.channelLabel}</span>
                <span className="text-xs text-ash">{r.event.charAt(0).toUpperCase() + r.event.slice(1)}</span>
                <LookChip look={OUTBOX_STATUS[r.status]} />
              </div>
              <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-ash">
                {r.text}
              </p>
              {r.error && <p className="text-xs text-danger">{r.error}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
