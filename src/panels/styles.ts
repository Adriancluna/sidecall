// Shared class strings for controls, so buttons and fields look the same everywhere.
// Geist buttons (Vercel style). Primary is inverted (paper on black), secondary is a dark
// surface with a 1px ring, both 14px/500 at 36px; the hero's one decision gets 40px.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-chip font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed";
const SIZE = "min-h-9 px-3 py-1.5 text-sm";
const SIZE_LG = "min-h-10 px-4 py-2 text-base";
const PRIMARY = "bg-paper text-graphite hover:bg-paper/85 disabled:bg-raised disabled:text-[#8f8f8f] disabled:ring-1 disabled:ring-line";
const SECONDARY =
  "bg-panel text-paper ring-1 ring-line hover:bg-raised disabled:bg-raised disabled:text-[#8f8f8f]";

export const BUTTON_PRIMARY = `${BASE} ${SIZE} ${PRIMARY}`;
export const BUTTON_SECONDARY = `${BASE} ${SIZE} ${SECONDARY}`;
export const BUTTON_PRIMARY_LG = `${BASE} ${SIZE_LG} ${PRIMARY}`;
export const BUTTON_SECONDARY_LG = `${BASE} ${SIZE_LG} ${SECONDARY}`;
export const BUTTON_QUIET = `${BASE} ${SIZE} text-ash hover:bg-hover hover:text-paper disabled:bg-transparent`;
// A quiet in-page link ("2 more held payments").
export const LINK = "text-sm font-medium text-link underline-offset-4 transition-colors hover:underline";
export const FIELD =
  "min-h-9 rounded-chip bg-panel px-3 py-2 text-sm text-paper ring-1 ring-line placeholder:text-[#8f8f8f] hover:ring-[#454545] focus:ring-ash";
