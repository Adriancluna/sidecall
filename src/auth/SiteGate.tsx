// A password screen in front of the whole demo site, so only people we give the password to reach
// the sign-in page. It runs in the browser, so it keeps casual visitors out; it is not a security
// boundary. Real protection stays in Convex: sign-in, per-company scoping and the presenter key.
// Only the SHA-256 of the password is in the bundle. Once entered, this browser remembers it.
import { useState, type FormEvent, type ReactNode } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import { BUTTON_PRIMARY_LG, FIELD } from "../panels/styles";

// sha256("sidecall-password")
const PASSWORD_SHA256 = "22bbe5fb5454cffd346eb8511ca11bae0327accbf3987c4a51dd8755226828eb";
const STORAGE_KEY = "sidecall-site-unlocked";

function remembered(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === PASSWORD_SHA256;
  } catch {
    return false;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SiteGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(remembered);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  if (unlocked) return <>{children}</>;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(undefined);
    const ok = (await sha256Hex(password.trim())) === PASSWORD_SHA256;
    setChecking(false);
    if (!ok) {
      setError("That password isn't right. Ask the Sidecall team for the demo password.");
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, PASSWORD_SHA256);
    } catch {
      // Storage blocked (private window): unlocked for this page only.
    }
    setUnlocked(true);
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-sm">
        <img src={logoUrl} alt="Sidecall" width={166} height={40} className="h-10 w-auto" />
        <h1 className="mt-8 text-2xl font-semibold text-balance">Enter the demo password</h1>
        <p className="mt-2 text-sm leading-relaxed text-ash">
          This is a private demo. Enter the password the Sidecall team gave you to continue.
        </p>
        <label htmlFor="site-password" className="mt-6 block text-sm font-medium">
          Password
        </label>
        <input
          id="site-password"
          name="site-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 w-full ${FIELD}`}
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={checking || password.trim() === ""} className={`mt-5 w-full ${BUTTON_PRIMARY_LG}`}>
          {checking ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
