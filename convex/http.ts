import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { SCENARIOS } from "./seed";
import { mcpHandler, mcpMethodNotAllowed } from "./mcp";
import { toHex } from "./shared";

const http = httpRouter();

// Convex Auth sign-in endpoints (JWT issuance, JWKS).
auth.addHttpRoutes(http);

// The demo button calls this from the browser, so allow cross-origin POSTs.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Sidecall-Signature",
};

// Real senders sign the raw body: X-Sidecall-Signature: sha256=<hex HMAC-SHA256 with
// INCIDENT_WEBHOOK_SECRET>. Unsigned requests are accepted only for the built-in demo
// scenarios, and only on deployments with DEMO_MODE=true (the stage button).
const SIGNATURE_HEADER = "X-Sidecall-Signature";

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return toHex(signature);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hasValidSignature(req: Request, rawBody: string): Promise<boolean> {
  const header = req.headers.get(SIGNATURE_HEADER);
  const secret = env.INCIDENT_WEBHOOK_SECRET;
  if (!header || !secret) return false;
  const expected = `sha256=${await hmacSha256Hex(secret, rawBody)}`;
  return constantTimeEqual(header, expected);
}

function isDemoScenario(externalId: string, assetName: string): boolean {
  return Object.values(SCENARIOS).some(
    (s) => s.externalId === externalId && s.assetName === assetName,
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : null; // null = wrong type
}

http.route({
  path: "/incident",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const rawBody = await req.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "body must be JSON" });
    }
    if (typeof body !== "object" || body === null) {
      return json(400, { error: "body must be an object" });
    }
    const raw = body as Record<string, unknown>;
    const { externalId, assetName } = raw;
    const reportedByDomain = optionalString(raw.reportedByDomain);
    const summary = optionalString(raw.summary);
    if (
      typeof externalId !== "string" ||
      externalId.length === 0 ||
      typeof assetName !== "string" ||
      assetName.length === 0 ||
      reportedByDomain === null ||
      summary === null
    ) {
      return json(400, {
        error: "expected { externalId: string, assetName: string, reportedByDomain?: string, summary?: string }",
      });
    }

    const signed = await hasValidSignature(req, rawBody);
    const demo = env.DEMO_MODE === "true" && isDemoScenario(externalId, assetName);
    if (!signed && !demo) {
      return json(401, { error: `missing or invalid ${SIGNATURE_HEADER}` });
    }

    const result = await ctx.runMutation(internal.incidents.recordIncident, {
      externalId,
      assetName,
      reportedByDomain,
      summary,
    });
    if (!result.ok) return json(404, { error: result.error });
    return json(200, { incidentId: result.incidentId, duplicate: result.duplicate });
  }),
});

http.route({
  path: "/incident",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

// MCP agent access (convex/mcp.ts). No CORS: MCP clients aren't browsers.
http.route({ path: "/mcp", method: "POST", handler: mcpHandler });
http.route({ path: "/mcp", method: "GET", handler: mcpMethodNotAllowed });
http.route({ path: "/mcp", method: "DELETE", handler: mcpMethodNotAllowed });

export default http;
