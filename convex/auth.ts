// Convex Auth: email + password. Invite-only: a sign-in links to an existing person in
// `users` by email. Unknown emails are refused, so nobody can create a role for themselves.
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";

// Every person is simulated, so demo accounts share one password, shown on the sign-in screen.
// Enforcing it at sign-up stops a first sign-in with another password from locking that
// person to it (which would break the stage quick-pick until a Reset).
export const DEMO_PASSWORD = "sidecall-demo";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      validatePasswordRequirements(password: string) {
        if (password !== DEMO_PASSWORD) {
          throw new ConvexError("Demo accounts use the shared demo password shown on the sign-in screen.");
        }
      },
    }),
  ],
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
