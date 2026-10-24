import { createContext, useContext } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type ActingUser = {
  user: Doc<"users"> | undefined;
  setUserId: (id: Id<"users">) => void;
};

export const ActingUserContext = createContext<ActingUser | undefined>(
  undefined,
);

export function useActingUser(): ActingUser {
  const ctx = useContext(ActingUserContext);
  if (!ctx)
    throw new Error("useActingUser must be used inside <ActingUserProvider>");
  return ctx;
}
