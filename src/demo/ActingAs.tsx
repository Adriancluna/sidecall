// Temporary identity until Convex auth lands: pick who you are, and the id is passed as `actingUserId`.
// Once login exists this becomes the signed-in user and the picker goes away.
import { useState, type ReactNode } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useCompanies, useUsers } from "./mockBackend";
import { ActingUserContext, useActingUser } from "./actingAsContext";

export function ActingUserProvider({ children }: { children: ReactNode }) {
  const users = useUsers();
  const [userId, setUserId] = useState<Id<"users">>();
  const user = users?.find((u) => u._id === userId) ?? users?.[0];
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
  const users = useUsers();
  const companies = useCompanies();
  const { user, setUserId } = useActingUser();
  const label = (u: Doc<"users">) => {
    const company = companies?.find((c) => c._id === u.companyId)?.name;
    return `${u.name} · ${ROLE_LABEL[u.role]}${company ? ` · ${company}` : ""}`;
  };
  return (
    <label className="flex items-center gap-2 text-sm text-ash">
      Viewing as
      <select
        className="rounded-md border border-line bg-panel px-2 py-1.5 text-paper"
        value={user?._id ?? ""}
        onChange={(e) => setUserId(e.target.value as Id<"users">)}
      >
        {users?.map((u) => (
          <option key={u._id} value={u._id}>
            {label(u)}
          </option>
        ))}
      </select>
    </label>
  );
}
