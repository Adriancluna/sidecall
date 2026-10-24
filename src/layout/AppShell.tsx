import type { ReactNode } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import { UserMenu } from "../auth/UserMenu";
import { DemoControls } from "../demo/DemoControls";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-graphite/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <img
            src={logoUrl}
            alt="Sidecall"
            width={132}
            height={32}
            className="h-8 w-auto"
          />
          <DemoControls />
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
