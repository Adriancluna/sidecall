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
import { Card, Empty, LookChip } from "./ui";

type Scope = "company" | "firm";
type Kind = "slack" | "discord" | "webhook";
type Event = "alert" | "hold" | "escalation" | "incident" | "contained";

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

  const act = async (
    run: () => Promise<{ ok: boolean; reason?: string }>,
    done: string,
  ) => {
    setMessage((await refusalOf(run)) ?? done);
  };

  const mine = channels?.filter((c) => c.scope === scope);
  return (
    <Card title="Notifications">
      <p className="mb-3 text-xs text-ash">
        Warnings also go to the team's own channels. On this deployment they're
        recorded as <span className="text-amber">simulated</span> and not
        actually sent.
      </p>
      {mine === undefined ? (
        <Empty>Loading…</Empty>
      ) : mine.length === 0 ? (
        <Empty>No channels connected.</Empty>
      ) : (
        <ul className="mb-3 space-y-2">
          {mine.map((c) => (
            <li
              key={c._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-graphite px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{c.label}</span>{" "}
                <span className="text-xs text-ash">
                  {c.kind} · {c.target} · {c.events.join(", ")}
                </span>
              </div>
              {c.canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void act(
                        () => sendTest({ channelId: c._id }),
                        "Test queued.",
                      )
                    }
                    className="rounded-md border border-line px-2 py-1 text-xs hover:border-ash"
                  >
                    Send test
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(`Disconnect ${c.label}?`) &&
                      void act(
                        () => removeChannel({ channelId: c._id }),
                        "Disconnected.",
                      )
                    }
                    className="rounded-md border border-line px-2 py-1 text-xs hover:border-ash"
                  >
                    Remove
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

  const field =
    "rounded-md border border-line bg-graphite px-2 py-1.5 text-sm text-paper";
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ash">Connect a channel</summary>
      <form onSubmit={(e) => void submit(e)} className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`kind-${scope}`}>
            Kind
          </label>
          <select
            id={`kind-${scope}`}
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className={field}
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
            placeholder="#finance-alerts"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${field} min-w-0 flex-1`}
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
          className={`${field} w-full`}
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
              {ev}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={busy || events.length === 0}
          className="rounded-md bg-amber px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-amber/90 disabled:opacity-50"
        >
          Connect
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
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ash uppercase">
        Outbox{rows ? ` · ${rows.length}` : ""}
      </h3>
      {rows === undefined ? (
        <Empty>Loading…</Empty>
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
                <span className="font-mono text-xs">{r.event}</span>
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
