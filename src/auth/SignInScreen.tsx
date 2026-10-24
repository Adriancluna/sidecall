// Invite-only sign-in: email + password, plus a one-click "Sign in as" list for the demo.
import { useState, type FormEvent } from "react";
import logoUrl from "../../brand/logo/sidecall-stacked-dark.svg";
import { Card, Empty } from "../panels/ui";
import { ROLE_LABEL, useDirectory } from "./directory";
import { DEMO_PASSWORD, useSignInAs } from "./useSignInAs";

// The demo opens on the money moment: the AP clerk who requested the $480K payment (convex/seed.ts).
const DEMO_START_EMAIL = "jamie.chen@summithomehealth.example";

const errorText = (err: unknown) =>
  err instanceof Error && /portfolio team/.test(err.message)
    ? "That email isn't on a portfolio team. Ask your admin for access."
    : "Sign-in failed. Check the email and password.";

export function SignInScreen() {
  const signInAs = useSignInAs();
  const directory = useDirectory();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (targetEmail: string, targetPassword?: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await signInAs(targetEmail, targetPassword);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(email.trim().toLowerCase(), password);
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl content-center gap-8 px-4 py-12 md:px-6 lg:grid-cols-[320px_1fr]">
      <section>
        <img
          src={logoUrl}
          alt="Sidecall"
          width={120}
          height={96}
          className="mb-8 h-24 w-auto"
        />
        <form onSubmit={onSubmit} className="space-y-3">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <label className="block text-sm text-ash">
            Work email
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-paper"
            />
          </label>
          <label className="block text-sm text-ash">
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-paper"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-amber px-3 py-2 text-sm font-semibold text-graphite disabled:opacity-50"
          >
            Sign in
          </button>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <p className="text-xs text-ash">
            Demo password for every seeded person:{" "}
            <span className="font-mono">{DEMO_PASSWORD}</span>
          </p>
        </form>
      </section>

      <Card title="Sign in as">
        {directory === undefined ? (
          <Empty>Loading the portfolio…</Empty>
        ) : directory.length === 0 ? (
          <Empty>No one is seeded yet. Run the seed, then reload.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {directory.map((group) => (
              <div key={group.label}>
                <h2 className="mb-1 text-xs font-semibold text-ash">
                  {group.label}
                </h2>
                <ul className="space-y-1">
                  {group.people.map((p) => (
                    <li key={p._id}>
                      <button
                        type="button"
                        disabled={busy || !p.email}
                        onClick={() => p.email && void run(p.email)}
                        className={`w-full rounded-md border px-2 py-1 text-left text-sm hover:border-ash disabled:opacity-50 ${
                          p.email === DEMO_START_EMAIL
                            ? "border-amber"
                            : "border-line"
                        }`}
                      >
                        {p.name}{" "}
                        <span className="text-ash">· {ROLE_LABEL[p.role]}</span>
                        {p.email === DEMO_START_EMAIL && (
                          <span className="text-amber"> · start here</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
