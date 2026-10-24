// Who is looking, and what they may see. Identity comes only from the signed-in Convex Auth
// session; no function accepts a user id from the client.
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type Viewer =
  | { user: Doc<"users">; firm: true } // PE firm: sees every company, never decides payments
  | { user: Doc<"users">; firm: false; companyId: Id<"companies"> };

export async function getViewer(
  ctx: Pick<QueryCtx, "db" | "auth">,
): Promise<Viewer> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not signed in");
  const user = await ctx.db.get("users", userId);
  if (!user) throw new ConvexError("Unknown user");
  if (user.role === "pe_partner") return { user, firm: true };
  if (!user.companyId) throw new ConvexError("User has no company");
  return { user, firm: false, companyId: user.companyId };
}

export function canSeeCompany(viewer: Viewer, companyId: Id<"companies">): boolean {
  return viewer.firm || viewer.companyId === companyId;
}

// The signed-in user, or null. The UI uses this to pick the PE or company view.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const company = user.companyId ? await ctx.db.get("companies", user.companyId) : null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email ?? null,
      role: user.role,
      companyId: user.companyId ?? null,
      companyName: company?.name ?? null,
    };
  },
});
