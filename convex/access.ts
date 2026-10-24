// Who is looking, and what they may see. Until login lands the client passes
// actingUserId (the demo user switcher). TODO(auth): resolve the user from ctx.auth here
// instead, by tokenIdentifier, and every caller stays the same.
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type Viewer =
  | { user: Doc<"users">; firm: true } // PE firm: sees every company, never decides payments
  | { user: Doc<"users">; firm: false; companyId: Id<"companies"> };

export async function getViewer(
  ctx: Pick<QueryCtx, "db">,
  actingUserId: Id<"users">,
): Promise<Viewer> {
  const user = await ctx.db.get("users", actingUserId);
  if (!user) throw new ConvexError("Unknown user");
  if (user.role === "pe_partner") return { user, firm: true };
  if (!user.companyId) throw new ConvexError("User has no company");
  return { user, firm: false, companyId: user.companyId };
}

export function canSeeCompany(viewer: Viewer, companyId: Id<"companies">): boolean {
  return viewer.firm || viewer.companyId === companyId;
}
