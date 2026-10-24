// Small shared building blocks for the panels.
import type { ReactNode } from "react";
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
    <section className="rounded-tile border border-line bg-panel p-5 md:p-6">
      {(title || aside) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="text-base font-semibold text-paper">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = keyof typeof TONE;

const TONE = {
  danger: "border-danger/45 bg-danger/10 text-danger",
  amber: "border-amber/45 bg-amber/10 text-amber",
  ok: "border-ok/45 bg-ok/10 text-ok",
  muted: "border-line bg-graphite text-ash",
} as const;

// The label carries the meaning; the dot only repeats it, so status is never colour alone.
export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[tone]}`}
    >
      {tone !== "muted" && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// A status chip from a labels.ts entry.
export function LookChip({ look }: { look: Look }) {
  return <Chip tone={look.tone}>{look.label}</Chip>;
}

// A resolved exposure keeps its urgency as history, greyed out, so red always means "still open".
export function UrgencyChip({ urgency, resolved }: { urgency: keyof typeof URGENCY; resolved: boolean }) {
  if (resolved) return <Chip tone="muted">{URGENCY[urgency].label} · resolved</Chip>;
  return <LookChip look={URGENCY[urgency]} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ash">{children}</p>;
}

// The line above a page headline: what state this is in, in words.
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ash">{children}</div>;
}

// A label over a value, for the fact rows under a headline.
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ash">{label}</dt>
      <dd className="mt-1 text-sm leading-snug text-paper">{children}</dd>
    </div>
  );
}

// Placeholder with the hero's footprint, so the page doesn't jump when data lands.
export function HeroSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="h-4 w-56 rounded bg-panel motion-safe:animate-pulse" />
      <div className="h-14 w-full max-w-2xl rounded bg-panel motion-safe:animate-pulse" />
      <div className="h-48 w-full rounded-tile bg-panel motion-safe:animate-pulse" />
    </div>
  );
}
