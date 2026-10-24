// Invite-only sign-in: email + password, plus one-click seats for the demo. The four seats that
// carry the story come first, each saying what that person will see; everyone else follows.
import { useState, type FormEvent } from "react";
import logoUrl from "../../brand/logo/sidecall-horizontal-dark.svg";
import { Empty } from "../panels/ui";
import { BUTTON_PRIMARY, FIELD } from "../panels/styles";
import { ROLE_LABEL, useDirectory } from "./directory";
import { DEMO_PASSWORD, DEMO_START_EMAIL, useSignInAs } from "./useSignInAs";

// The demo path, in order (docs/demo-script.md). Shown only if the person is seeded.
const SEATS = [
  {
    email: DEMO_START_EMAIL,
    sees: "Requested the $480,000 payroll payment. Sees why it's held, and can't release it.",
  },
  {
    email: "rosa.alvarez@summithomehealth.example",
    sees: "Calls the vendor at the number on file, then releases or rejects.",
  },
  {
    email: "jordan.ames@northpasscapital.example",
    sees: "Sees every exposed company, every hold and the vendor letter. Never releases.",
  },
  {
    email: "sam.kowalski@cedarridge.example",
    sees: "Shares a login with the IT contractor. Gets the steps to fix it, in order.",
  },
] as const;

const errorText = (err: unknown) =>
  err instanceof Error && /portfolio team/.test(err.message)
    ? "That email isn't on a portfolio team. Ask your admin for access."
    : "Sign-in failed. Check the email and password.";

export function SignInScreen() {
  const signInAs = useSignInAs();
  const directory = useDirectory();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = pending !== undefined;

  const run = async (targetEmail: string, targetPassword?: string) => {
    setPending(targetEmail);
    setError(undefined);
    try {
      await signInAs(targetEmail, targetPassword);
    } catch (err) {
      setError(errorText(err));
      setPending(undefined);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(email.trim().toLowerCase(), password);
  };

  const people = (directory ?? []).flatMap((g) => g.people.map((p) => ({ ...p, company: g.label })));
  const seats = SEATS.flatMap((s) => {
    const person = people.find((p) => p.email === s.email);
    return person ? [{ ...s, person }] : [];
  });
  const featured = new Set<string>(seats.map((s) => s.email));
  const rest = (directory ?? [])
    .map((g) => ({ ...g, people: g.people.filter((p) => p.email && !featured.has(p.email)) }))
    .filter((g) => g.people.length > 0);

  return (
    <main className="mx-auto grid min-h-screen max-w-[1280px] content-start gap-12 px-4 py-10 md:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:content-center lg:gap-x-16 lg:gap-y-10 lg:py-16">
      <section className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
        <img src={logoUrl} alt="Sidecall" width={166} height={40} className="h-10 w-auto" />
        <h1 className="mt-10 text-headline font-semibold text-balance">
          One vendor is compromised. Which sister companies genuinely share it?
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-ash">
          Sidecall warns only the portfolio companies that share what was compromised, and holds their payments to it
          until a person verifies by phone.
        </p>
      </section>

      <section aria-labelledby="seats-title" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
        <h2 id="seats-title" className="text-lg font-semibold">
          Take a seat
        </h2>
        <p className="mt-1 text-sm text-ash">One click signs you in as that person. Each sees only their own company.</p>
        {directory === undefined ? (
          <div className="mt-5">
            <Empty>Loading the portfolio…</Empty>
          </div>
        ) : directory.length === 0 ? (
          <div className="mt-5">
            <Empty>No one is seeded yet. Run the seed, then reload.</Empty>
          </div>
        ) : (
          <>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2">
              {seats.map(({ email: seatEmail, sees, person }, i) => {
                const start = seatEmail === DEMO_START_EMAIL;
                return (
                  <li key={seatEmail}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(seatEmail)}
                      className={`group flex h-full w-full flex-col rounded-tile border p-4 text-left transition-colors hover:bg-panel disabled:cursor-wait md:p-5 ${
                        start ? "border-amber/70 bg-panel" : "border-line"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2 text-xs font-medium text-ash">
                        <span>
                          <span className="tabular-nums">{i + 1}</span> · {ROLE_LABEL[person.role]}
                        </span>
                        {start && <span className="font-semibold text-amber">Start here</span>}
                      </span>
                      <span className="mt-3 text-lg font-semibold tracking-tight">
                        {person.name.replace(/\s*\(.*\)$/, "")}
                      </span>
                      <span className="text-sm text-ash">{person.company === "PE firm" ? "Northpass Capital" : person.company}</span>
                      <span className="mt-3 text-sm leading-relaxed text-paper/90">{sees}</span>
                      <span className="mt-4 text-sm font-semibold text-amber group-hover:underline group-disabled:text-ash">
                        {pending === seatEmail ? "Signing in…" : `Sign in as ${person.name.split(" ")[0]} →`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <details className="mt-8">
              <summary className="text-sm font-medium text-ash">Everyone else in the portfolio</summary>
              <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((group) => (
                  <div key={group.label} className="min-w-0">
                    <h3 className="mb-1.5 text-xs font-medium text-ash">{group.label}</h3>
                    <ul className="space-y-0.5">
                      {group.people.map((p) => (
                        <li key={p._id}>
                          <button
                            type="button"
                            disabled={busy || !p.email}
                            onClick={() => p.email && void run(p.email)}
                            className="w-full rounded-chip px-2 py-1.5 text-left text-sm hover:bg-panel disabled:opacity-50"
                          >
                            {pending === p.email ? "Signing in…" : p.name}{" "}
                            <span className="text-ash">· {ROLE_LABEL[p.role]}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </section>
      <form
        onSubmit={onSubmit}
        className="max-w-sm space-y-4 border-t border-line pt-8 lg:col-start-1 lg:row-start-2 lg:self-start"
      >
        <h2 className="font-semibold">Or sign in with your work email</h2>
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
            className={`mt-1.5 w-full ${FIELD}`}
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
            className={`mt-1.5 w-full ${FIELD}`}
          />
        </label>
        <button type="submit" disabled={busy} className={`w-full ${BUTTON_PRIMARY}`}>
          {pending !== undefined && pending === email.trim().toLowerCase() ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <p className="text-xs text-ash">
          Simulated portfolio. Demo password for every seeded person:{" "}
          <span className="font-mono text-paper">{DEMO_PASSWORD}</span>
        </p>
      </form>
    </main>
  );
}
