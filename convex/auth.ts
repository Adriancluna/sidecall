// Convex Auth: email + password. Invite-only: a sign-in links to an existing person in
// `users` by email. Unknown emails are refused, so nobody can create a role for themselves.
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(genericCtx, args) {
      if (args.existingUserId) return args.existingUserId;
      const ctx = genericCtx as unknown as MutationCtx;
      const email = args.profile.email?.trim().toLowerCase();
      const user = email
        ? await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", email))
            .unique()
        : null;
      if (!user) {
        throw new ConvexError("That email isn't on a portfolio team. Ask your admin for access.");
      }
      return user._id;
    },
  },
});
