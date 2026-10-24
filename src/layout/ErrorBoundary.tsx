// Catches render-time errors (a Convex query that throws, e.g. after Reset or mid-deploy) so the
// page shows a way forward instead of going blank. Session errors sign the person out.
import { useAuthActions } from "@convex-dev/auth/react";
import { Component, useEffect, type ReactNode } from "react";
import { Card } from "../panels/ui";
import { SESSION_ENDED, friendlyError } from "./errors";

type State = { error: unknown };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error("Sidecall view crashed", error);
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const message = error instanceof Error ? error.message : "";
    return SESSION_ENDED.test(message) ? (
      <SessionEnded />
    ) : (
      <Crashed text={friendlyError(error)} />
    );
  }
}

function SessionEnded() {
  const { signOut } = useAuthActions();
  useEffect(() => {
    void signOut();
  }, [signOut]);
  return (
    <Notice text="Your session ended (the demo may have been reset). Taking you to sign-in…" />
  );
}

function Crashed({ text }: { text: string }) {
  return (
    <Notice text={text}>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 rounded-md bg-amber px-3 py-1.5 text-sm font-semibold text-graphite"
      >
        Reload
      </button>
    </Notice>
  );
}

function Notice({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 md:px-6">
      <Card>
        <p role="alert" className="text-sm">
          {text}
        </p>
        {children}
      </Card>
    </main>
  );
}
