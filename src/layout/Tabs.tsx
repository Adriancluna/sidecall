// Tabs for everything below the hero. The active tab lives in the URL hash (#tab-payments), so a
// tab can be linked, opened in a new tab, and the back button works.
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
        className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] sm:gap-2"
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
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors ${
                selected
                  ? "border-amber text-paper"
                  : "border-transparent text-ash hover:border-line hover:text-paper"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count !== 0 && (
                <span
                  className={`rounded-chip px-1.5 py-px text-xs font-semibold tabular-nums ${
                    selected ? "bg-amber/15 text-amber" : "bg-panel text-ash"
                  }`}
                >
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
        className="pt-8 focus-visible:outline-none"
      >
        {current.content()}
      </div>
    </section>
  );
}
