import { ActingUserProvider } from "./demo/ActingAs";
import { useActingUser } from "./demo/actingAsContext";
import { AppShell } from "./layout/AppShell";
import { CompanyView } from "./panels/CompanyView";
import { PortfolioView } from "./panels/PortfolioView";

// The PE firm sees the whole portfolio; anyone at a portfolio company sees only their own company.
function CurrentView() {
  const { user } = useActingUser();
  if (!user) return null;
  return user.role === "pe_partner" || !user.companyId ? (
    <PortfolioView />
  ) : (
    // key: switching who you act as starts with clean local state (no stale refusal or note)
    <CompanyView key={user._id} companyId={user.companyId} actingUser={user} />
  );
}

export default function App() {
  return (
    <ActingUserProvider>
      <AppShell>
        <CurrentView />
      </AppShell>
    </ActingUserProvider>
  );
}
