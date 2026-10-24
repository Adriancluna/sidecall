// Turn Convex/network errors into text a person can act on. ConvexError carries the backend's
// own message in `data`; anything else gets a generic line (details stay in the console).
import { ConvexError } from "convex/values";

const SESSION_ENDED = /Not signed in|Unknown user|Unauthenticated/i;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : "");

export const isSessionEnded = (err: unknown) =>
  SESSION_ENDED.test(messageOf(err));

export function friendlyError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    if (typeof data === "string") return data;
  }
  const message = messageOf(err);
  if (isSessionEnded(err)) return "Your session ended. Sign in again.";
  // Our own errors (e.g. the webhook's JSON error) are readable; Convex server dumps are not.
  if (message && !/\[CONVEX|Request ID|Server Error/.test(message))
    return message;
  return "Something went wrong. Try again.";
}

// Mutations answer { ok: false, reason } for expected refusals (segregation of duties, bad notes).
// Returns the text to show: the refusal, a friendly error, or undefined when it went through.
export async function refusalOf(
  run: () => Promise<{ ok: boolean; reason?: string }>,
): Promise<string | undefined> {
  try {
    const res = await run();
    return res.ok ? undefined : (res.reason ?? "Refused.");
  } catch (err) {
    return friendlyError(err);
  }
}
