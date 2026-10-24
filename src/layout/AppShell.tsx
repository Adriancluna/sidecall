import type { ReactNode } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import type { CurrentUser } from "../auth/currentUser";
import { UserMenu } from "../auth/UserMenu";
import { DemoControls } from "../demo/DemoControls";

export function AppShell({
  me,
  children,
}: {
  me: CurrentUser;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-md bg-amber px-3 py-2 font-semibold text-graphite focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 border-b border-line bg-graphite/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-6">
          <img
            src={logoUrl}
            alt="Sidecall"
            width={132}
            height={32}
            className="h-8 w-auto"
          />
          <DemoControls />
          <UserMenu me={me} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
