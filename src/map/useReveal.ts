// Assembles the map once per incident (~1.2 s): vendor, then lines drawn outward, then exposed tiles and their money.
// Web Animations API on data-reveal marks; nothing sweeps or pulses (no radar), and reduced motion skips it all.
import { useEffect, useRef } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { MapLayout } from "./layout";

const EASE = "cubic-bezier(.2,.7,.2,1)";
const STEP = 90;

export function useReveal(incidentId: Id<"incidents">, layout: MapLayout) {
  const svg = useRef<SVGSVGElement>(null);
  const revealed = useRef<Id<"incidents">>(undefined);
  const anims = useRef<Animation[]>([]);
  const count = layout.tiles.length;

  // Stop on unmount, and forget the incident so a remount (or StrictMode's rehearsal) plays it again.
  useEffect(
    () => () => {
      anims.current.forEach((a) => a.cancel());
      anims.current = [];
      revealed.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const root = svg.current;
    if (!root || revealed.current === incidentId) return;
    revealed.current = incidentId;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const run = (
      el: Element,
      keyframes: Keyframe[],
      delay: number,
      duration: number,
    ) =>
      anims.current.push(
        el.animate(keyframes, {
          delay,
          duration,
          easing: EASE,
          fill: "backwards",
        }),
      );
    const fade = (el: Element) => [
      { opacity: 0 },
      { opacity: Number(el.getAttribute("opacity") ?? 1) },
    ];
    const at = (el: Element) =>
      150 + STEP * Number(el.getAttribute("data-order") ?? 0);

    for (const el of root.querySelectorAll('[data-reveal="centre"]')) {
      run(el, [{ opacity: 0 }, { opacity: 1 }], 0, 250);
    }
    for (const el of root.querySelectorAll('[data-reveal="line"]')) {
      const line = el.querySelector("[data-draw]");
      if (line) {
        run(
          line,
          [
            { strokeDasharray: "1 1", strokeDashoffset: 1 },
            { strokeDasharray: "1 1", strokeDashoffset: 0 },
          ],
          at(el),
          350,
        );
      } else {
        run(el, [{ opacity: 0 }, { opacity: 1 }], at(el), 350);
      }
      const label = el.querySelector("text");
      if (label)
        run(label, [{ opacity: 0 }, { opacity: 1 }], at(el) + 300, 250);
    }
    for (const el of root.querySelectorAll('[data-reveal="tile"]')) {
      run(el, fade(el), at(el) + 250, 250);
      for (const badge of el.querySelectorAll('[data-reveal="badge"]')) {
        run(badge, [{ opacity: 0 }, { opacity: 1 }], at(el) + 400, 220);
      }
    }
    const end = 150 + STEP * count + 350;
    for (const el of root.querySelectorAll('[data-reveal="quiet"]')) {
      run(el, fade(el), end, 300);
    }
  }, [incidentId, count]);

  return svg;
}
