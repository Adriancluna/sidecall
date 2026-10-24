// Shared class strings for controls, so buttons and fields look the same everywhere.
// Disabled reads as "not yet" (neutral), never as a faded amber that looks broken on a projector.
export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-chip bg-amber px-3.5 py-2 text-sm font-semibold text-graphite transition-colors hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:bg-raised disabled:text-ash disabled:active:translate-y-0";
export const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-chip border border-line px-3.5 py-2 text-sm font-medium text-paper transition-colors hover:border-ash hover:bg-raised active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0";
export const FIELD =
  "rounded-chip border border-line bg-graphite px-3 py-2 text-sm text-paper placeholder:text-ash/70 focus:border-ash";
