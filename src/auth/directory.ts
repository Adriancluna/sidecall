// Seeded people grouped by company, for the "Sign in as" pickers (public directory data).
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export const ROLE_LABEL: Record<Doc<"users">["role"], string> = {
  pe_partner: "PE firm",
  controller: "Controller",
  ap_clerk: "AP clerk",
  it: "IT",
};

export type DirectoryGroup = { label: string; people: Doc<"users">[] };

export function useDirectory(): DirectoryGroup[] | undefined {
  const users = useQuery(api.blastRadius.listUsers, {});
  const companies = useQuery(api.blastRadius.listCompanies, {});
  if (!users || !companies) return undefined;
  return [
    { label: "PE firm", people: users.filter((u) => !u.companyId) },
    ...companies.map((c) => ({
      label: c.name,
      people: users.filter((u) => u.companyId === c._id),
    })),
  ].filter((g) => g.people.length > 0);
}
