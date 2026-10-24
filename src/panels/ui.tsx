// Small shared building blocks for the panels.
// Status reads as a word plus a small dot: filled for a live state, hollow for
// neutral or history. The word carries the meaning, so status is never colour alone.
import type { ReactNode } from "react";
import symbolUrl from "../../brand/logo/sidecall-symbol-small-amber.svg";
import { URGENCY, type Look } from "./labels";

export function Card({
  title,
  children,
  aside,
}: {
  title?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-tile border border-line bg-panel">
      {(title || aside) && (
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3 pr-3 pl-4">
          {title && <h2 className="text-sm font-medium tracking-[-0.02em] text-paper">{title}</h2>}
          {aside}
        </header>
      )}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export type Tone = keyof typeof TONE;

const TONE = {
  danger: "bg-[oklch(22.1%_0.0657_15.11)] text-danger",
  amber: "bg-[oklch(22.46%_0.0538_76.04)] text-amber",
  ok: "bg-[oklch(23.09%_0.0716_149.68)] text-ok",
  muted: "bg-raised text-ash",
} as const;

const TEXT = { danger: "text-danger", amber: "text-amber", ok: "text-ok", muted: "text-ash" } as const;

// A status dot.
export function Tile({ hollow = false, className = "size-2" }: { hollow?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${hollow ? "border-[1.5px] border-current" : "bg-current"} ${className}`}
    />
  );
}

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ${TONE[tone]}`}
    >
      <Tile hollow={tone === "muted"} />
      {children}
    </span>
  );
}

// A status chip from a labels.ts entry.
export function LookChip({ look }: { look: Look }) {
  return <Chip tone={look.tone}>{look.label}</Chip>;
}

// A resolved exposure reads "Resolved" (hollow, history), so red always means "still open".
export function UrgencyChip({ urgency, resolved }: { urgency: keyof typeof URGENCY; resolved: boolean }) {
  if (resolved) return <Chip tone="muted">Resolved</Chip>;
  return <LookChip look={URGENCY[urgency]} />;
}

// One quiet line above a hero: a tile, the state in words, then plain context.
export function StatusLine({ tone, state, children }: { tone: Tone; state: string; children?: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ash md:text-base">
      <span className={`inline-flex items-center gap-2 font-semibold ${TEXT[tone]}`}>
        <Tile hollow={tone === "muted"} className="size-2.5" />
        {state}
      </span>
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ash">{children}</p>;
}

// A label over a value, for the fact rows under a headline.
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ash">{label}</dt>
      <dd className="mt-1.5 text-sm leading-snug font-medium text-paper">{children}</dd>
    </div>
  );
}

// Placeholder rows with a list's footprint, so the page doesn't jump when data lands.
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={`h-4 rounded-tile bg-raised motion-safe:animate-pulse ${i % 3 === 2 ? "w-2/5" : i % 2 ? "w-4/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}

// Placeholder with the hero's footprint: the status line, the headline, the rail.
export function HeroSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:gap-x-16"
    >
      <span className="sr-only">Loading</span>
      <div className="space-y-5">
        <div className="h-4 w-56 rounded bg-panel motion-safe:animate-pulse" />
        <div className="h-20 w-full max-w-xl rounded bg-panel motion-safe:animate-pulse" />
        <div className="h-6 w-72 rounded bg-panel motion-safe:animate-pulse" />
      </div>
      <div className="h-64 rounded-tile bg-panel motion-safe:animate-pulse" />
    </div>
  );
}

// Before we know who you are: the mark, pulsing quietly, where the page will be.
export function MarkLoading() {
  return (
    <div role="status" aria-busy="true" className="grid min-h-[50vh] place-items-center">
      <img src={symbolUrl} alt="" width={32} height={32} className="size-8 motion-safe:animate-pulse" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
