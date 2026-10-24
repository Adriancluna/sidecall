// Shared class strings for controls, so buttons and fields look the same everywhere.
// One button shape, 36px minimum height (readable from the back of a room, a fair touch target);
// the hero's one decision gets the large size. Disabled reads as "not yet" (neutral grey), never
// as a faded amber that looks broken on a projector.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-chip whitespace-nowrap transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0";
const SIZE = "min-h-9 px-3.5 py-1.5 text-sm";
const SIZE_LG = "min-h-11 px-5 py-2 text-base";
const PRIMARY = "font-semibold bg-amber text-graphite hover:bg-[#f7b443] disabled:bg-raised disabled:text-ash";
const SECONDARY =
  "border border-line font-semibold text-paper hover:border-ash hover:bg-raised disabled:border-line disabled:bg-transparent disabled:text-ash";

export const BUTTON_PRIMARY = `${BASE} ${SIZE} ${PRIMARY}`;
export const BUTTON_SECONDARY = `${BASE} ${SIZE} ${SECONDARY}`;
export const BUTTON_PRIMARY_LG = `${BASE} ${SIZE_LG} ${PRIMARY}`;
export const BUTTON_SECONDARY_LG = `${BASE} ${SIZE_LG} ${SECONDARY}`;
export const BUTTON_QUIET = `${BASE} ${SIZE} font-medium text-ash hover:bg-raised hover:text-paper disabled:bg-transparent`;
// A quiet in-page link ("2 more held payments").
export const LINK = "text-sm font-medium text-ash underline-offset-4 transition-colors hover:text-paper hover:underline";
export const FIELD =
  "rounded-chip border border-line bg-graphite px-3 py-2 text-sm text-paper placeholder:text-ash/70 hover:border-ash/60 focus:border-ash";
