// The dashboard's pages. The active page lives in the URL hash (#tab-payments), so a page can be
// linked, opened in a new tab, and the back button works.
// proto/ux-vercel: the page list renders in the shell's left sidebar (desktop) or the strip under
// the top bar (phones). Each page opens with its own title (Render's structure); the lead page
// opens with the hero instead, so the hero is shown once, not above every page.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PageTitleContext, useIsDesktop, useShellSlots } from "./shellSlots";
import { TABS_ANCHOR } from "./useTabs";

export type TabDef = {
  id: string;
  label: string;
  count?: number | string;
  content: () => ReactNode;
};

const PREV = new Set(["ArrowLeft", "ArrowUp"]);
const NEXT = new Set(["ArrowRight", "ArrowDown"]);

export function Tabs({
  tabs,
  active,
  onSelect,
  label,
  lead,
  leadTab,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
  // The hero, shown only on its own page (leadTab) in place of the page title.
  lead?: ReactNode;
  leadTab?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const slots = useShellSlots();
  const isDesktop = useIsDesktop();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern), both orientations.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === current.id);
    const next =
      NEXT.has(e.key) ? (i + 1) % tabs.length
      : PREV.has(e.key) ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next === -1) return;
    e.preventDefault();
    onSelect(tabs[next].id);
    refs.current.get(tabs[next].id)?.focus();
  };

  const vertical = isDesktop && slots.nav !== null;
  // Phones: keep the active tab in view in the scrolling strip.
  useEffect(() => {
    if (!vertical) refs.current.get(current.id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [vertical, current.id]);
  const tablist = (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onKeyDown={onKeyDown}
      className={
        vertical ? "flex flex-col gap-0.5"
        : "flex gap-1 overflow-x-auto pr-8 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none]"
      }
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
            className={`flex h-9 shrink-0 items-center gap-2 rounded-tile text-sm whitespace-nowrap transition-colors duration-150 ${
              vertical ? "w-full justify-between pr-2 pl-2.5" : "px-3"
            } ${selected ? "bg-[#1f1f1f] font-medium text-paper" : "text-ash hover:bg-hover hover:text-paper"}`}
          >
            <span className="truncate">{t.label}</span>
            {t.count !== undefined && t.count !== 0 && (
              <span className="rounded-full bg-raised px-1.5 text-[11px] leading-5 font-medium tracking-[0.2px] text-paper tabular-nums ring-1 ring-line">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const navSlot = vertical ? slots.nav : slots.mobileNav;
  const showsLead = lead !== undefined && current.id === leadTab;
  return (
    <section>
      {navSlot ? createPortal(tablist, navSlot) : tablist}
      {showsLead ? (
        <div className="mb-14">{lead}</div>
      ) : (
        <h1 className="mb-8 text-[32px] leading-9 font-medium tracking-[-0.02em] text-balance">{current.label}</h1>
      )}
      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        data-anchor={TABS_ANCHOR}
        aria-labelledby={`tab-${current.id}`}
        tabIndex={0}
        className="scroll-mt-20 rounded-tile focus-visible:outline-offset-4"
      >
        <PageTitleContext.Provider value={showsLead ? undefined : current.label}>{current.content()}</PageTitleContext.Provider>
      </div>
    </section>
  );
}
