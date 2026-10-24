// Tabs for everything below the hero. The active tab lives in the URL hash (#tab-payments), so a
// tab can be linked, opened in a new tab, and the back button works.
// proto/ux-vercel: the tab list renders in the shell's left sidebar (desktop) or the strip under
// the top bar (phones), and the active tab's name sits centred in the top bar.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsDesktop, useShellSlots } from "./shellSlots";
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
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
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
  const tablist = (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onKeyDown={onKeyDown}
      className={vertical ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto [scrollbar-width:none]"}
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
  return (
    <section id={TABS_ANCHOR} className="scroll-mt-14">
      {navSlot ? createPortal(tablist, navSlot) : tablist}
      {slots.title && createPortal(current.label, slots.title)}
      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        tabIndex={0}
        className="rounded-tile pt-8 focus-visible:outline-offset-4"
      >
        {current.content()}
      </div>
    </section>
  );
}
