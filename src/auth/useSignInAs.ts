import { useAuthActions } from "@convex-dev/auth/react";

// Shared password for the seeded demo users (CONTRACT.md "Sign-in"). Simulated people only.
export const DEMO_PASSWORD = "sidecall-demo";

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
