import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

// Shared password for the seeded demo users (CONTRACT.md "Sign-in"). Simulated people only.
export const DEMO_PASSWORD = "sidecall-demo";
// The demo opens on the money moment: the AP clerk who requested the $480K payment (convex/seed.ts).
export const DEMO_START_EMAIL = "jamie.chen@summithomehealth.example";

// First sign-in for an email has to create the password account, so fall back to signUp.
// The backend is invite-only: an email that isn't a seeded user is refused either way.
export function useSignInAs() {
  const { signIn } = useAuthActions();
  return async (email: string, password = DEMO_PASSWORD) => {
    try {
      await signIn("password", { email, password, flow: "signIn" });
    } catch {
      await signIn("password", { email, password, flow: "signUp" });
    }
  };
}

// Switch to another seeded person: end the current session first, then sign in as them.
export function useSwitchTo() {
  const { signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const signInAs = useSignInAs();
  return async (email: string) => {
    if (isAuthenticated) await signOut();
    await signInAs(email);
  };
}
