// Turn Convex/network errors into text a person can act on. ConvexError carries the backend's
// own message in `data`; anything else gets a generic line (details stay in the console).
import { ConvexError } from "convex/values";

export const SESSION_ENDED = /Not signed in|Unknown user|Unauthenticated/i;

export function friendlyError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    if (typeof data === "string") return data;
  }
  const message = err instanceof Error ? err.message : "";
  if (SESSION_ENDED.test(message)) return "Your session ended. Sign in again.";
  if (/network|fetch|connection/i.test(message)) {
    return "Can't reach the server. Check the connection and try again.";
  }
  // Our own errors (e.g. the webhook's JSON error) are readable; Convex server dumps are not.
  if (message && !/\[CONVEX|Request ID|Server Error/.test(message))
    return message;
  return "Something went wrong. Try again.";
}
