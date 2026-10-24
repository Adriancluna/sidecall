// Temporary identity until Convex auth lands: pick who you are, and the id is passed as `actingUserId`.
// Once login exists this becomes the signed-in user and the picker goes away.
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ActingUserContext, useActingUser } from "./actingAsContext";

// The demo opens on the money moment: the AP clerk who requested the $480K payment (convex/seed.ts).
const DEMO_START_USER = "Jamie Chen";

export function ActingUserProvider({ children }: { children: ReactNode }) {
  const users = useQuery(api.blastRadius.listUsers, {});
  const [userId, setUserId] = useState<Id<"users">>();
  const user =
    users?.find((u) => u._id === userId) ??
    users?.find((u) => u.name === DEMO_START_USER) ??
    users?.[0];
  return (
    <ActingUserContext.Provider value={{ user, setUserId }}>
      {children}
    </ActingUserContext.Provider>
  );
}

const ROLE_LABEL: Record<Doc<"users">["role"], string> = {
  pe_partner: "PE firm",
  controller: "Controller",
  ap_clerk: "AP clerk",
  it: "IT",
};

export function ActingUserPicker() {
  const users = useQuery(api.blastRadius.listUsers, {});
  const companies = useQuery(api.blastRadius.listCompanies, {});
  const { user, setUserId } = useActingUser();
  const option = (u: Doc<"users">) => (
    <option key={u._id} value={u._id}>
      {u.name} · {ROLE_LABEL[u.role]}
    </option>
  );
  return (
    <label className="flex items-center gap-2 text-sm text-ash">
      Viewing as
      <select
        className="max-w-72 rounded-md border border-line bg-panel px-2 py-1.5 text-paper"
        value={user?._id ?? ""}
        onChange={(e) => setUserId(e.target.value as Id<"users">)}
      >
        {users?.filter((u) => !u.companyId).map(option)}
        {companies?.map((c) => (
          <optgroup key={c._id} label={c.name}>
            {users?.filter((u) => u.companyId === c._id).map(option)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
