// The active dashboard tab, kept in the URL hash (#tab-payments) so quick links are real links.
import { useEffect, useState } from "react";

export const TABS_ANCHOR = "dashboard-tabs";

function readHash(ids: readonly string[]): string | undefined {
  const id = window.location.hash.replace(/^#tab-/, "");
  return ids.includes(id) ? id : undefined;
}

function scrollToTabs() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(TABS_ANCHOR)
    ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function useTabs(ids: readonly string[], fallback: string) {
  const key = ids.join("|");
  const [active, setActive] = useState(() => readHash(ids) ?? fallback);
  useEffect(() => {
    const onHash = () => {
      const id = readHash(key.split("|"));
      if (id) setActive(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [key]);
  // A tab that no longer exists for this person (e.g. after switching roles) falls back.
  const current = ids.includes(active) ? active : fallback;
  const select = (id: string, scroll = false) => {
    setActive(id);
    window.history.replaceState(null, "", `#tab-${id}`);
    if (scroll) scrollToTabs();
  };
  return { active: current, select };
}

