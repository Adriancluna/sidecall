import { useAuthActions } from "@convex-dev/auth/react";
import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { useEffect } from "react";
import { api } from "../convex/_generated/api";
import { CurrentUserContext } from "./auth/currentUser";
import { SignInScreen } from "./auth/SignInScreen";
import { AppShell } from "./layout/AppShell";
import { CompanyView } from "./panels/CompanyView";
import { PortfolioView } from "./panels/PortfolioView";
import { Empty } from "./panels/ui";

// The PE firm sees the whole portfolio; anyone at a portfolio company sees only their own company.
function SignedIn() {
  const me = useQuery(api.access.me);
  const { signOut } = useAuthActions();

  // Signed in, but the account no longer links to a person (e.g. after a demo reset): start over.
  useEffect(() => {
    if (me === null) void signOut();
  }, [me, signOut]);

  if (!me) return <Empty>Loading…</Empty>;
  return (
    <CurrentUserContext.Provider value={me}>
      <AppShell>
        {me.role === "pe_partner" || !me.companyId ? (
          <PortfolioView actingUserId={me._id} />
        ) : (
          // key: switching people starts with clean local state (no stale refusal or note)
          <CompanyView key={me._id} companyId={me.companyId} actingUser={me} />
        )}
      </AppShell>
    </CurrentUserContext.Provider>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <main className="p-8">
          <Empty>Loading…</Empty>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <SignedIn />
      </Authenticated>
    </>
  );
}
