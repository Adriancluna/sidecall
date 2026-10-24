import { useState, type ReactNode } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import symbolUrl from "../../brand/logo/sidecall-symbol-small-amber.svg";
import type { CurrentUser } from "../auth/currentUser";
import { ROLE_LABEL } from "../auth/directory";
import { UserMenu } from "../auth/UserMenu";
import { DemoControls } from "../demo/DemoControls";
import { IS_STAGE, loadStage, saveStage } from "../demo/stage";

// One sticky header line: whose desk this is on the left; the simulator switch and the person
// switch on the right. The simulator is demo tooling, so it stays folded away (remembered per tab)
// unless the presenter opens it; on /?stage it starts open as one slim row that scrolls away.
export function AppShell({ me, children }: { me: CurrentUser; children: ReactNode }) {
  const [simOpen, setSimOpenState] = useState(() => loadStage("sim", IS_STAGE));
  const setSimOpen = (open: boolean) => {
    setSimOpenState(open);
    saveStage("sim", open);
  };
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-chip bg-amber px-3 py-2 font-semibold text-graphite focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-graphite">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <img src={symbolUrl} alt="Sidecall" width={28} height={28} className="size-7 shrink-0 sm:hidden" />
            <img src={logoUrl} alt="Sidecall" width={116} height={28} className="hidden h-7 w-auto shrink-0 sm:block" />
            <span className="hidden h-6 w-px shrink-0 bg-line sm:block" aria-hidden />
            {/* Phones: the hero names the company; the header keeps room for the person switch. */}
            <p className="hidden min-w-0 items-baseline gap-2 text-sm sm:flex">
              <span className="truncate font-semibold">{me.companyName ?? "Northpass Capital"}</span>
              <span className="shrink-0 text-ash">{ROLE_LABEL[me.role]}</span>
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              aria-expanded={simOpen}
              aria-controls="simulator"
              onClick={() => setSimOpen(!simOpen)}
              className={`min-h-9 shrink-0 rounded-chip px-2.5 text-sm font-medium transition-colors ${
                simOpen ? "bg-raised text-paper" : "text-ash hover:bg-raised hover:text-paper"
              }`}
            >
              Simulator
            </button>
            <UserMenu me={me} />
          </div>
        </div>
      </header>
      {simOpen && <DemoControls />}
      <main id="main" className="mx-auto max-w-[1440px] px-4 pt-6 pb-24 md:px-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
