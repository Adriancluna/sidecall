// The blast radius as a list: the map on phones, and everywhere with ?map=grid (the stage fallback).
import type { Id } from "../../convex/_generated/dataModel";
import type { MapNode, Tone } from "./copy";
import type { MapLayout } from "./layout";

const BORDER: Record<Tone, string> = {
  danger: "border-danger",
  amber: "border-amber",
  ok: "border-ok",
  paper: "border-paper/60 border-dashed",
  ash: "border-line",
};
const TEXT: Record<Tone, string> = {
  danger: "text-danger",
  amber: "text-amber",
  ok: "text-ok",
  paper: "text-paper",
  ash: "text-ash",
};

export function MapList({
  layout,
  selected,
  noted,
  onPick,
}: {
  layout: MapLayout;
  selected?: Id<"companies">;
  noted?: Id<"companies">;
  onPick: (node: MapNode) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {layout.tiles.map((t) => {
        const id = t.node.companyId;
        const active = selected === id || noted === id;
        const name = t.lines
          .filter((l) => l.kind === "name")
          .map((l) => l.text)
          .join(" ");
        return (
          <li key={id}>
            <button
              type="button"
              aria-pressed={selected === id}
              onClick={() => onPick(t.node)}
              className={`w-full rounded-lg border-2 bg-graphite p-3 text-left transition-colors ${
                active
                  ? "ring-2 ring-amber ring-offset-2 ring-offset-panel"
                  : ""
              } ${BORDER[t.node.relation === "unrelated" ? "ash" : t.tone]} ${
                t.node.relation === "unrelated" ? "opacity-50" : ""
              }`}
            >
              <span className="block font-semibold">{name}</span>
              {t.lines
                .filter((l) => l.kind !== "name")
                .map((l, i) =>
                  l.kind === "badge" ? (
                    <span
                      key={i}
                      className={`mt-1.5 mr-1.5 inline-block rounded-full border px-2 py-0.5 text-sm font-semibold tabular-nums ${
                        l.tone === "ok"
                          ? "border-ok text-ok"
                          : "border-amber text-amber"
                      }`}
                    >
                      {l.text}
                    </span>
                  ) : (
                    <span
                      key={i}
                      className={`block text-xs ${
                        l.kind === "status" ? "font-semibold" : ""
                      } ${TEXT[l.tone]}`}
                    >
                      {l.text}
                    </span>
                  ),
                )}
              <span className="mt-1 block text-xs text-ash">
                {t.node.headcount.toLocaleString()} people
              </span>
            </button>
          </li>
        );
      })}
      {layout.hiddenUnrelated && (
        <li className="text-sm text-ash sm:col-span-2">
          + {layout.hiddenUnrelated.count.toLocaleString()} other companies, not
          linked
        </li>
      )}
    </ul>
  );
}
