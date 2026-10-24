// Header identity: who is signed in, a quick switch to another seeded person, and sign out.
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useCurrentUser } from "./currentUser";
import { ROLE_LABEL, useDirectory } from "./directory";
import { useSwitchTo } from "./useSignInAs";

export function UserMenu() {
  const me = useCurrentUser();
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
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ash">
      <label className="flex min-w-0 items-center gap-2">
        Signed in as
        <select
          className="w-full max-w-72 min-w-0 rounded-md border border-line bg-panel px-2 py-1.5 text-paper"
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
                      {p.name} · {ROLE_LABEL[p.role]}
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
        className="rounded-md px-2 py-1.5 hover:text-paper"
      >
        Sign out
      </button>
    </div>
  );
}
