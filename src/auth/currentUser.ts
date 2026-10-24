// The signed-in person, from api.access.me.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.access.me>>;
