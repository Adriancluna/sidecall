// Presenter mode (/?stage): the demo beats from CLAUDE.md "Demo story", who to be at each,
// and one click to become that person. Not shown to judges.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { DEMO_START_EMAIL, useSwitchTo } from "../auth/useSignInAs";
import { BUTTON_PRIMARY, BUTTON_QUIET, BUTTON_SECONDARY } from "../panels/styles";
import { loadStage, saveStage } from "./stage";

const JAMIE = { name: "Jamie Chen", email: DEMO_START_EMAIL };
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
    say: "A PE firm owns 14 companies. Several share a payroll vendor and an IT contractor, and nobody connects the dots.",
    as: JAMIE,
    tip: "Reset first so the bank-change dates are fresh.",
  },
  {
    title: "Fire the incident",
    say: "The shared payroll vendor is compromised. One webhook call.",
    as: JAMIE,
    tip: "Simulator (header): pick Brightline payroll breach, then Fire incident.",
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
    tip: "Bills to pay tab, then Request payment on the $38,000 bill.",
  },
  {
    title: "It reached their Slack (optional)",
    say: "Nobody had to have the dashboard open: the same warning already went to Summit's #summit-finance channel. Here it's simulated so the demo doesn't depend on Wi-Fi.",
    as: JAMIE,
    tip: "Slack & alerts out tab (Outbox).",
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
    tip: "Onboard tab: Use sample files, point at the red warning, then Import. Sign in as Daniel Okoro (Lakeside controller) to show the holds. Reset removes Lakeside.",
  },
  {
    title: "Evidence",
    say: "Click a company in the response list or on the map: reasons, confidence, its held payments. Inferred links are labelled candidate.",
    as: JORDAN,
  },
  {
    title: "Red-team finding, each company's own rule",
    say: "An AI red team proves a path at Pinecrest that ends at Ironclad's shared login. Cedar Ridge shares it and decided months ago: if it leaks, pause it. Sidecall paused it a tenth of a second after the report, logged, one click to undo. Granite Peak chose one click. Harborline only wants the warning. Summit has its own login: nothing happens there.",
    as: JORDAN,
    tip: 'Simulator: "Red-team finding (Ironclad login)", Fire. Point at "First step done at 1 of 3" in Response by company. Optional: sign in as Ben Carter and press Run now (2 of 3).',
  },
  {
    title: "Discipline (optional)",
    say: "A shared Ironclad login leaks. Summit uses Ironclad too, but with its own login, so Summit gets no alert. Same vendor isn't the same weakness.",
    as: JAMIE,
    tip: 'Simulator: pick "Ironclad shared login leaked", Fire, stay as Jamie: no new alert. Switch to Jordan and use the incident menu in the hero to compare.',
  },
  {
    title: "Tailored alerts + vendor letter",
    say: "Urgent where a credential is shared, advisory where it's only the same vendor. One letter to the vendor fixes it for everyone.",
    as: JORDAN,
    tip: "Alerts & letter tab: the tailored alerts, then the vendor letter under them.",
  },
  {
    title: "Convex guarantees",
    say: "Replay the webhook: nothing duplicates. Two people acknowledge at once: exactly one wins.",
    as: JAMIE,
    tip: `Open a second tab with ?stage, sign in there as ${KWAME.name}, click Acknowledge in both tabs (Kwame: in his hero; Jamie: Incident & evidence tab).`,
  },
  {
    title: "Contained",
    say: "The vendor fixed it and confirmed by phone. The firm marks the incident contained, with a note, and it's on the record.",
    as: JORDAN,
    tip: "Timeline & close-out tab, then Mark contained: say what was fixed and how it was confirmed.",
  },
  {
    title: "Scorecard",
    say: "Caught, missed and false holds against the planted answer key.",
    as: JORDAN,
    tip: "Proof tab.",
  },
];

export function PresenterPanel() {
  const me = useQuery(api.access.me);
  const switchTo = useSwitchTo();
  // Starts as a small pill so it never covers the product on the projector; remembered per tab.
  const [open, setOpenState] = useState(() => loadStage("open", false));
  const [current, setCurrentState] = useState(() => Math.min(loadStage("beat", 0), BEATS.length - 1));
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const setOpen = (v: boolean) => {
    setOpenState(v);
    saveStage("open", v);
  };
  const setCurrent = (i: number) => {
    setCurrentState(i);
    saveStage("beat", i);
    setShowAll(false);
  };

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
        aria-label={`Open presenter steps, beat ${current + 1} of ${BEATS.length}: ${BEATS[current].title}`}
        className="fixed bottom-3 left-3 z-20 flex min-h-9 max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ash ring-1 ring-line hover:bg-raised hover:text-paper"
      >
        <span className="font-medium text-paper tabular-nums">
          {current + 1}/{BEATS.length}
        </span>
        <span className="max-w-[14rem] truncate">{BEATS[current].title}</span>
      </button>
    );
  }

  const beat = BEATS[current];
  const isMe = me?.email === beat.as.email;
  return (
    <aside
      aria-label="Presenter steps"
      className="fixed bottom-3 left-3 z-20 max-h-[60vh] w-[min(340px,calc(100vw-1.5rem))] overflow-y-auto rounded-tile border border-line bg-panel p-4 shadow-[0_16px_24px_-8px_rgb(0_0_0/0.5)] text-sm leading-relaxed"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="min-h-9 text-sm font-medium text-paper"
        >
          Step {current + 1} of {BEATS.length} {showAll ? "▴" : "▾"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BUTTON_QUIET}>
          Hide
        </button>
      </header>
      {showAll ? (
        <ol className="space-y-1">
          {BEATS.map((b, i) => (
            <li key={b.title}>
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-current={i === current ? "step" : undefined}
                className={`w-full rounded-chip px-2 py-1 text-left ${i === current ? "bg-raised text-paper" : "text-ash hover:text-paper"}`}
              >
                {i + 1}. {b.title}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-2">
          <p className="text-base font-semibold">{beat.title}</p>
          <p>{beat.say}</p>
          {beat.tip && <p className="text-ash">{beat.tip}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isMe ? (
              <span className="text-ok">Signed in as {beat.as.name}</span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void become(beat.as)}
                className={BUTTON_PRIMARY}
              >
                {busy ? "Signing in…" : `Sign in as ${beat.as.name}`}
              </button>
            )}
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setCurrent(current - 1)}
                aria-label="Previous beat"
                className={BUTTON_SECONDARY}
              >
                Back
              </button>
              <button
                type="button"
                disabled={current === BEATS.length - 1}
                onClick={() => setCurrent(current + 1)}
                aria-label="Next beat"
                className={BUTTON_SECONDARY}
              >
                Next
              </button>
            </span>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
    </aside>
  );
}
