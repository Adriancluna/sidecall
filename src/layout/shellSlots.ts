// Where the shell lets a page put its navigation: the left sidebar (desktop) or the strip under the
// top bar (phones), plus the page name centred in the top bar. AppShell fills these; Tabs portals in.
import { createContext, useContext, useSyncExternalStore } from "react";

export type ShellSlots = { nav: HTMLElement | null; mobileNav: HTMLElement | null; title: HTMLElement | null };

export const ShellSlotsContext = createContext<ShellSlots>({ nav: null, mobileNav: null, title: null });

export const useShellSlots = () => useContext(ShellSlotsContext);

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
