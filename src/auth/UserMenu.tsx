// Header identity: who is signed in, a quick switch to another seeded person, and sign out.
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import type { CurrentUser } from "./currentUser";
import { ROLE_LABEL, useDirectory } from "./directory";
import { BUTTON_QUIET } from "../panels/styles";
import { useSwitchTo } from "./useSignInAs";

// stacked: the sidebar footer (full-width switch over Sign out).
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

  return (
    <div
      className={`flex min-w-0 shrink text-sm text-ash ${stacked ? "flex-col items-stretch gap-1" : "items-center gap-1 sm:gap-2"}`}
    >
      <label className="flex min-w-0 items-center gap-2">
        <span className="sr-only">Signed in as</span>
        <select
          className={`min-h-9 w-full min-w-0 truncate rounded-chip bg-panel py-1.5 pr-7 pl-3 text-paper ring-1 ring-line hover:ring-[#454545] disabled:text-ash ${stacked ? "" : "max-w-[11rem] sm:max-w-xs"}`}
          value={me.email ?? ""}
          disabled={busy}
          onChange={(e) => void switchTo(e.target.value)}
        >
          {directory?.map((group) => (
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
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => void signOut()}
        className={`shrink-0 ${BUTTON_QUIET} ${stacked ? "justify-start" : ""}`}
      >
        Sign out
      </button>
    </div>
  );
}
