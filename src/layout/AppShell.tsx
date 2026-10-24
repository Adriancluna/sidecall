import type { ReactNode } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import type { CurrentUser } from "../auth/currentUser";
import { ROLE_LABEL } from "../auth/directory";
import { UserMenu } from "../auth/UserMenu";
import { DemoControls } from "../demo/DemoControls";

// Full-width page: who you are on top, the data leak simulator under it, then the dashboard.
export function AppShell({ me, children }: { me: CurrentUser; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-md bg-amber px-3 py-2 font-semibold text-graphite focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to main content
      </a>
      <header className="top-0 z-10 border-b border-line bg-graphite/95 backdrop-blur md:sticky">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 md:px-8 xl:px-12">
          <div className="flex min-w-0 items-center gap-4">
            <img src={logoUrl} alt="Sidecall" width={132} height={32} className="h-8 w-auto" />
            <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
            <p className="min-w-0 truncate text-sm">
              <span className="font-medium">{me.companyName ?? "Northpass Capital"}</span>
              <span className="hidden text-ash sm:inline"> · {ROLE_LABEL[me.role]} view</span>
            </p>
          </div>
          <UserMenu me={me} />
        </div>
        <DemoControls />
      </header>
      <main id="main" className="px-4 py-6 md:px-8 md:py-8 xl:px-12">
        {children}
      </main>
    </div>
  );
}
