// Where the shell lets a page put its navigation: the left sidebar (desktop) or the strip under the
// top bar (phones). AppShell fills these; Tabs portals in.
import { createContext, useContext, useSyncExternalStore } from "react";

export type ShellSlots = { nav: HTMLElement | null; mobileNav: HTMLElement | null };

export const ShellSlotsContext = createContext<ShellSlots>({ nav: null, mobileNav: null });

export const useShellSlots = () => useContext(ShellSlotsContext);

// The current page's title, so a card can skip repeating it ("Ledger" under the "Ledger" page title).
export const PageTitleContext = createContext<string | undefined>(undefined);

const DESKTOP = "(min-width: 768px)";

export function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
  );
}
