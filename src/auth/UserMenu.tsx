// Header identity: who is signed in, a quick switch to another seeded person, and sign out.
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import type { CurrentUser } from "./currentUser";
import { ROLE_LABEL, useDirectory } from "./directory";
import { BUTTON_QUIET } from "../panels/styles";
import { useSwitchTo } from "./useSignInAs";

// stacked: the sidebar footer (account row with a person switch, sign out beside it).
export function UserMenu({ me, stacked = false }: { me: CurrentUser; stacked?: boolean }) {
  const directory = useDirectory();
  const { signOut } = useAuthActions();
  const switchToPerson = useSwitchTo();
  const [busy, setBusy] = useState(false);

  const switchTo = async (email: string) => {
    setBusy(true);
    try {
      await switchToPerson(email);
    } finally {
      setBusy(false);
    }
  };

  const options = directory?.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.people.map(
        (p) =>
          p.email && (
            <option key={p._id} value={p.email}>
              {p.name}, {ROLE_LABEL[p.role]}
            </option>
          ),
      )}
    </optgroup>
  ));

  if (stacked) {
    // Sidebar footer, Vercel's account row: initials, name over role, the up-down chevrons. The native
    // select sits invisibly on top, so picking a person still uses the OS list and the keyboard.
    const name = (me.name ?? "").replace(/\s*\(.*\)$/, "");
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <div className="flex items-center gap-1">
        <label className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-tile px-2 py-1.5 transition-colors duration-150 focus-within:shadow-[0_0_0_2px_var(--color-panel),0_0_0_4px_var(--color-link)] hover:bg-hover">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-medium text-paper ring-1 ring-line">
            {initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-paper">{name}</span>
            <span className="truncate text-xs text-ash">{ROLE_LABEL[me.role]}</span>
          </span>
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ash" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
          </svg>
          <select
            aria-label="Signed in as. Switch person"
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-wait"
            value={me.email ?? ""}
            disabled={busy}
            onChange={(e) => void switchTo(e.target.value)}
          >
            {options}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="grid size-9 shrink-0 place-items-center rounded-tile text-ash transition-colors duration-150 hover:bg-hover hover:text-paper"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 13H3.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H6M10.5 11l3-3-3-3M13.5 8H6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 shrink items-center gap-1 text-sm text-ash sm:gap-2">
      <label className="flex min-w-0 items-center gap-2">
        <span className="sr-only">Signed in as</span>
        <select
          className="min-h-9 w-full max-w-[11rem] min-w-0 truncate rounded-chip bg-panel py-1.5 pr-7 pl-3 text-paper ring-1 ring-line hover:ring-[#454545] disabled:text-ash sm:max-w-xs"
          value={me.email ?? ""}
          disabled={busy}
          onChange={(e) => void switchTo(e.target.value)}
        >
          {options}
        </select>
      </label>
      <button
        type="button"
        onClick={() => void signOut()}
        className={`shrink-0 ${BUTTON_QUIET}`}
      >
        Sign out
      </button>
    </div>
  );
}
