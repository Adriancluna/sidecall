// Presenter mode (/?stage): the 9 demo beats from CLAUDE.md "Demo story", who to be at each,
// and one click to become that person. Not shown to judges.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { useSwitchTo } from "../auth/useSignInAs";

const JAMIE = {
  name: "Jamie Chen",
  email: "jamie.chen@summithomehealth.example",
};
const ROSA = {
  name: "Rosa Alvarez",
  email: "rosa.alvarez@summithomehealth.example",
};
const JORDAN = {
  name: "Jordan Ames",
  email: "jordan.ames@northpasscapital.example",
};
const KWAME = {
  name: "Kwame Mensah",
  email: "kwame.mensah@summithomehealth.example",
};

type Person = typeof JAMIE;
type Beat = { title: string; say: string; as: Person; tip?: string };

const BEATS: Beat[] = [
  {
    title: "The portfolio",
    say: "A PE firm owns 8 companies. Several share a payroll vendor and an IT contractor, and nobody connects the dots.",
    as: JAMIE,
    tip: "Reset first so the bank-change dates are fresh.",
  },
  {
    title: "Fire the incident",
    say: "The shared payroll vendor is compromised. One webhook call.",
    as: JAMIE,
    tip: "Click Fire incident in the header.",
  },
  {
    title: "The money moment",
    say: "Summit was about to pay $480,000 to an account changed by email two days before the breach. It's held until verified.",
    as: JAMIE,
  },
  {
    title: "New requests are caught too",
    say: "Jamie requests the $38K November bill to the same vendor. It's held and flagged the moment it's requested, not just what was already in flight.",
    as: JAMIE,
    tip: "Bills to pay → Request payment on the $38,000 bill.",
  },
  {
    title: "It reached their Slack (optional)",
    say: "Nobody had to have the dashboard open: the same warning already went to Summit's #summit-finance channel. Here it's simulated so the demo doesn't depend on Wi-Fi.",
    as: JAMIE,
    tip: "Scroll to Notifications → Outbox.",
  },
  {
    title: "Requester refused, controller verifies",
    say: "Jamie requested it, so Jamie can't release it. Rosa calls the number on file, notes what the vendor said, then releases or rejects. Cash moves only on release.",
    as: ROSA,
    tip: "First try Release as Jamie (refused), then switch to Rosa.",
  },
  {
    title: "Zoom out",
    say: "3 companies exposed, 4,200 people behind them, $650K in payments held: the $612K in flight plus the new $38K request.",
    as: JORDAN,
    tip: '$650K while Rosa\'s payment is still held ($612K if you skipped the $38K request); after her release it drops to $170K with "$480,000 released after verification".',
  },
  {
    title: "A new acquisition (optional)",
    say: "A new acquisition closes today. Here's its AP export: it already pays Brightline at the 7731 account. Import, and its payments are held on the spot: 4 companies, 4,650 people.",
    as: JORDAN,
    tip: "Onboard card → Use sample files → point at the red warning → Import. Sign in as Daniel Okoro (Lakeside controller) to show the holds. Reset removes Lakeside.",
  },
  {
    title: "Evidence",
    say: "Click a company: reasons, confidence, its held payments. Inferred links are labelled candidate.",
    as: JORDAN,
  },
  {
    title: "Discipline (optional)",
    say: "A shared Ironclad login leaks. Summit uses Ironclad too, but with its own login, so Summit gets no alert. Same vendor isn't the same weakness.",
    as: JAMIE,
    tip: 'Pick "Ironclad shared login leaked" in the header, Fire, stay as Jamie: no new alert. Switch to Jordan and use the Incident menu to compare.',
  },
  {
    title: "Tailored alerts + vendor letter",
    say: "Urgent where a credential is shared, advisory where it's only the same vendor. One letter to the vendor fixes it for everyone.",
    as: JORDAN,
  },
  {
    title: "Convex guarantees",
    say: "Replay the webhook: nothing duplicates. Two people acknowledge at once: exactly one wins.",
    as: JAMIE,
    tip: `Open a second tab with ?stage, sign in there as ${KWAME.name}, click Acknowledge in both tabs.`,
  },
  {
    title: "Contained",
    say: "The vendor fixed it and confirmed by phone. The firm marks the incident contained, with a note, and it's on the record.",
    as: JORDAN,
    tip: "Containment card: say what was fixed and how it was confirmed, then Mark contained.",
  },
  {
    title: "Scorecard",
    say: "Caught, missed and false holds against the planted answer key.",
    as: JORDAN,
  },
];

export function PresenterPanel() {
  const me = useQuery(api.access.me);
  const switchTo = useSwitchTo();
  // Collapsed on phones so it doesn't cover the app; open on laptops.
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const become = async (person: Person) => {
    setBusy(true);
    setError(undefined);
    try {
      await switchTo(person.email);
    } catch {
      setError(`Couldn't sign in as ${person.name}. Reset, then try again.`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-20 rounded-full border border-amber bg-graphite px-4 py-2 text-sm font-semibold text-amber shadow-lg"
      >
        Presenter · beat {current + 1}/{BEATS.length}
      </button>
    );
  }

  return (
    <aside
      aria-label="Presenter steps"
      className="fixed right-4 bottom-4 z-20 max-h-[70vh] w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-amber/60 bg-graphite p-4 shadow-2xl"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber">Presenter</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ash hover:text-paper"
        >
          Hide
        </button>
      </header>
      <ol className="space-y-2">
        {BEATS.map((beat, i) => {
          const isCurrent = i === current;
          const isMe = me?.email === beat.as.email;
          return (
            <li
              key={beat.title}
              className={`rounded-lg border p-3 ${isCurrent ? "border-amber bg-panel" : "border-line"}`}
            >
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-current={isCurrent ? "step" : undefined}
                className="w-full text-left text-sm font-medium"
              >
                {i + 1}. {beat.title}
              </button>
              {isCurrent && (
                <div className="mt-2 space-y-2 text-sm">
                  <p>{beat.say}</p>
                  {beat.tip && <p className="text-ash">{beat.tip}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {isMe ? (
                      <span className="text-ok">
                        Signed in as {beat.as.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void become(beat.as)}
                        className="rounded-md bg-amber px-3 py-1 font-semibold text-graphite disabled:opacity-50"
                      >
                        Sign in as {beat.as.name}
                      </button>
                    )}
                    {i < BEATS.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setCurrent(i + 1)}
                        className="rounded-md border border-line px-3 py-1 hover:border-ash"
                      >
                        Next beat
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </aside>
  );
}
