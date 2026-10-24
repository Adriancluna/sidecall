// Small shared building blocks for the panels.
import type { ReactNode } from "react";

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
    <section className="rounded-xl border border-line bg-panel p-5">
      {(title || aside) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold tracking-wide text-ash uppercase">
              {title}
            </h2>
          )}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

const TONE = {
  danger: "border-danger/40 bg-danger/10 text-danger",
  amber: "border-amber/40 bg-amber/10 text-amber",
  ok: "border-ok/40 bg-ok/10 text-ok",
  muted: "border-line bg-graphite text-ash",
} as const;

export function Chip({
  tone,
  children,
}: {
  tone: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ash">{children}</p>;
}
