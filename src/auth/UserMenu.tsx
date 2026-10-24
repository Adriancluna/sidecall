// Header identity: who is signed in, a quick switch to another seeded person, and sign out.
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useCurrentUser } from "./currentUser";
import { ROLE_LABEL, useDirectory } from "./directory";
import { useSignInAs } from "./useSignInAs";

export function UserMenu() {
  const me = useCurrentUser();
  const directory = useDirectory();
  const { signOut } = useAuthActions();
  const signInAs = useSignInAs();
  const [busy, setBusy] = useState(false);

  const switchTo = async (email: string) => {
    setBusy(true);
    try {
      await signOut();
      await signInAs(email);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm text-ash">
      <label className="flex items-center gap-2">
        Signed in as
        <select
          className="max-w-72 rounded-md border border-line bg-panel px-2 py-1.5 text-paper"
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
