// Tabs for everything below the hero, plus "quick links" beside it that jump to a tab.
// The active tab lives in the URL hash (#tab-payments), so a quick link is a real link: it can be
// copied, opened in a new tab, and the back button works.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { TABS_ANCHOR } from "./useTabs";

export type TabDef = {
  id: string;
  label: string;
  count?: number | string;
  content: () => ReactNode;
};

export function Tabs({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === current.id);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next === -1) return;
    e.preventDefault();
    onSelect(tabs[next].id);
    refs.current.get(tabs[next].id)?.focus();
  };

  return (
    <section id={TABS_ANCHOR} className="scroll-mt-28">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => {
          const selected = t.id === current.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) refs.current.set(t.id, el);
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(t.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                selected
                  ? "border-amber text-paper"
                  : "border-transparent text-ash hover:text-paper"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count !== 0 && (
                <span className="rounded-full bg-graphite px-2 py-0.5 text-xs text-ash tabular-nums">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        tabIndex={0}
        className="pt-6 focus-visible:outline-none"
      >
        {current.content()}
      </div>
    </section>
  );
}

export type QuickLink = {
  tab: string;
  label: string;
  detail?: string;
  tone?: "danger" | "amber" | "ok";
};

const DETAIL_TONE = { danger: "text-danger", amber: "text-amber", ok: "text-ok" } as const;

// "Jump to" beside the hero: the details a person most often needs next, one click away.
export function QuickLinks({
  links,
  onPick,
}: {
  links: QuickLink[];
  onPick: (tab: string) => void;
}) {
  return (
    <nav aria-label="Jump to" className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-ash uppercase">
        Jump to
      </h2>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={`${l.tab}-${l.label}`}>
            <a
              href={`#tab-${l.tab}`}
              onClick={(e) => {
                e.preventDefault();
                onPick(l.tab);
              }}
              className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-graphite"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{l.label}</span>
                {l.detail && (
                  <span className={`block text-xs ${l.tone ? DETAIL_TONE[l.tone] : "text-ash"}`}>
                    {l.detail}
                  </span>
                )}
              </span>
              <span aria-hidden className="text-ash group-hover:text-paper">
                →
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
