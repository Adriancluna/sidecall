import type { ReactNode } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import symbolUrl from "../../brand/logo/sidecall-symbol-small-amber.svg";
import type { CurrentUser } from "../auth/currentUser";
import { ROLE_LABEL } from "../auth/directory";
import { UserMenu } from "../auth/UserMenu";
import { DemoControls } from "../demo/DemoControls";

// The demo simulator sits above the product and scrolls away; the product header stays put.
// One header row: who you are on the left, who you're signed in as on the right.
export function AppShell({ me, children }: { me: CurrentUser; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-chip bg-amber px-3 py-2 font-semibold text-graphite focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to main content
      </a>
      <DemoControls />
      <header className="sticky top-0 z-10 border-b border-line bg-graphite/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <img src={symbolUrl} alt="Sidecall" width={28} height={28} className="size-7 shrink-0 sm:hidden" />
            <img src={logoUrl} alt="Sidecall" width={124} height={30} className="hidden h-[30px] w-auto shrink-0 sm:block" />
            <span className="hidden h-7 w-px shrink-0 bg-line sm:block" aria-hidden />
            {/* Phones: the hero names the company; the header keeps room for the person switch. */}
            <div className="hidden min-w-0 leading-tight sm:block">
              <p className="truncate text-sm font-semibold">{me.companyName ?? "Northpass Capital"}</p>
              <p className="truncate text-xs text-ash">{ROLE_LABEL[me.role]} view</p>
            </div>
          </div>
          <UserMenu me={me} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-4 pt-8 pb-24 md:px-8 md:pt-12">
        {children}
      </main>
    </div>
  );
}
