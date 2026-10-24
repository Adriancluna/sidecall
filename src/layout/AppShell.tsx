import { useMemo, useState, type ReactNode } from "react";
import symbolUrl from "../../brand/logo/sidecall-symbol-small-amber.svg";
import type { CurrentUser } from "../auth/currentUser";
import { ROLE_LABEL } from "../auth/directory";
import { UserMenu } from "../auth/UserMenu";
import { DemoControls } from "../demo/DemoControls";
import { IS_STAGE, loadStage, saveStage } from "../demo/stage";
import { ShellSlotsContext, type ShellSlots } from "./shellSlots";

// proto/ux-vercel shell: a black left sidebar (whose desk this is, the page's tabs, the person
// switch at the bottom) and a 56px top bar (breadcrumb left, page name centred, simulator right).
// On phones the sidebar folds away: the tabs become a strip under the top bar.
export function AppShell({ me, children }: { me: CurrentUser; children: ReactNode }) {
  const [simOpen, setSimOpenState] = useState(() => loadStage("sim", IS_STAGE));
  const setSimOpen = (open: boolean) => {
    setSimOpenState(open);
    saveStage("sim", open);
  };
  // State setters are stable, so each slot's ref callback runs only on mount and unmount.
  const [nav, setNav] = useState<HTMLElement | null>(null);
  const [mobileNav, setMobileNav] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const slots = useMemo<ShellSlots>(() => ({ nav, mobileNav, title }), [nav, mobileNav, title]);
  const company = me.companyName ?? "Northpass Capital";

  return (
    <ShellSlotsContext.Provider value={slots}>
      <div className="min-h-screen md:grid md:grid-cols-[255px_minmax(0,1fr)]">
        <a
          href="#main"
          className="sr-only rounded-chip bg-paper px-3 py-2 font-medium text-graphite focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
        >
          Skip to main content
        </a>

        <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-graphite md:flex">
          <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
            <img src={symbolUrl} alt="Sidecall" width={20} height={20} className="size-5 shrink-0" />
            {/* Name over role, so long company names fit instead of truncating beside a badge. */}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-medium tracking-[-0.02em]">{company}</span>
              <span className="truncate text-xs text-ash">{ROLE_LABEL[me.role]}</span>
            </span>
          </div>
          <nav ref={setNav} aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-2 pt-2.5 pb-2" />
          <div className="border-t border-line p-2">
            <UserMenu me={me} stacked />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-line bg-graphite">
            <div className="flex h-14 items-center justify-between gap-3 px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:px-6">
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <img src={symbolUrl} alt="Sidecall" width={20} height={20} className="size-5 shrink-0 md:hidden" />
                <span className="hidden truncate font-medium text-paper sm:inline">{company}</span>
                <span aria-hidden className="hidden text-[#454545] sm:inline">/</span>
                <span className="hidden truncate text-ash sm:inline">{me.name}</span>
              </p>
              <p ref={setTitle} className="hidden truncate text-sm font-medium tracking-[-0.02em] text-paper md:block" />
              <div className="flex min-w-0 items-center justify-end gap-2">
                <button
                  type="button"
                  aria-expanded={simOpen}
                  aria-controls="simulator"
                  onClick={() => setSimOpen(!simOpen)}
                  className={`min-h-8 shrink-0 rounded-chip px-2.5 text-sm font-medium transition-colors duration-150 ${
                    simOpen ? "bg-raised text-paper ring-1 ring-line" : "text-ash hover:bg-hover hover:text-paper"
                  }`}
                >
                  Simulator
                </button>
                <div className="md:hidden">
                  <UserMenu me={me} />
                </div>
              </div>
            </div>
            <div ref={setMobileNav} className="border-t border-line px-4 py-2 md:hidden" />
          </header>
          {simOpen && <DemoControls />}
          <main id="main" className="mx-auto max-w-[1200px] px-4 pt-6 pb-24 md:px-6 md:pt-8">
            {children}
          </main>
        </div>
      </div>
    </ShellSlotsContext.Provider>
  );
}
