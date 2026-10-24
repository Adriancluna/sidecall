// The signed-in person, from api.access.me. Every panel reads identity from here.
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext } from "react";
import type { api } from "../../convex/_generated/api";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.access.me>>;

export const CurrentUserContext = createContext<CurrentUser | undefined>(
  undefined,
);

export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used while signed in");
  return user;
}
