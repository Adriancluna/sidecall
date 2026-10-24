import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { SCENARIOS } from "./seed";
import { mcpHandler, mcpMethodNotAllowed } from "./mcp";
import { toHex } from "./shared";
import { parseFinding } from "./findings";
import { isPresenter } from "./access";
import { sandboxAccess } from "./sandbox";
import { sha256Hex } from "./agents";

const http = httpRouter();
http.route({ path: "/sandbox/resource", method: "GET", handler: sandboxAccess });

// Convex Auth sign-in endpoints (JWT issuance, JWKS).
auth.addHttpRoutes(http);

// The demo button calls this from the browser, so allow cross-origin POSTs.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Sidecall-Signature, X-Sidecall-Presenter",
};

// Legacy senders sign the raw body: X-Sidecall-Signature: sha256=<hex HMAC-SHA256 with
// INCIDENT_WEBHOOK_SECRET>. Named detectors use their scoped bearer credential instead.
// Unsigned requests are accepted only for the built-in demo
// scenarios, and only on deployments with DEMO_MODE=true (the stage button).
const SIGNATURE_HEADER = "X-Sidecall-Signature";
const MAX_BODY_BYTES = 32 * 1024;

// Stop consuming at the byte limit; reading the complete text first does not bound memory.
async function readIncidentBody(req: Request): Promise<string | null> {
  if (Number(req.headers.get("Content-Length")) > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
// The stage's presenter key (see access.ts isPresenter), for unsigned demo scenarios.
const PRESENTER_HEADER = "X-Sidecall-Presenter";

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

// The built-in scenario an unsigned stage request names, if any. Matched on id + asset only:
// the stored scenario (reporter, summary, finding) is what runs, so an unsigned body can't
// smuggle in its own text.
function demoScenario(externalId: string, assetName: string) {
  return Object.values(SCENARIOS).find((s) => s.externalId === externalId && s.assetName === assetName);
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
    let rawBody: string | null;
    try { rawBody = await readIncidentBody(req); }
    catch { return json(400, { error: "body must be valid UTF-8" }); }
    if (rawBody === null) return json(413, { error: "body is larger than 32 KB" });
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "body must be JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json(400, { error: "body must be an object" });
    }
    const raw = body as Record<string, unknown>;
    if (raw.assessment !== undefined && raw.assessment !== "observation" && raw.assessment !== "confirmed") {
      return json(400, { error: "assessment must be observation or confirmed" });
    }
    const evidenceRefs = raw.evidenceRefs ?? [];
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 20 || evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 300)) {
      return json(400, { error: "evidenceRefs must contain at most 20 nonempty reference strings of at most 300 characters" });
    }

    // Optional validated red-team finding (our schema, convex/findings.ts). It fills in the
    // incident fields the sender left out and must agree with any it gave.
    const parsed = raw.finding === undefined ? null : parseFinding(raw.finding, Date.now());
    if (parsed && "error" in parsed) return json(400, { error: parsed.error });

    const fields = {
      externalId: optionalString(raw.externalId),
      assetName: optionalString(raw.assetName),
      reportedByDomain: optionalString(raw.reportedByDomain),
      summary: optionalString(raw.summary),
    };
    if (Object.values(fields).includes(null)) {
      return json(400, { error: "externalId, assetName, reportedByDomain and summary must be strings" });
    }
    if ((fields.externalId?.length ?? 0) > 200 || (fields.assetName?.length ?? 0) > 200 ||
        (fields.reportedByDomain?.length ?? 0) > 253 || (fields.summary?.length ?? 0) > 4000) {
      return json(400, { error: "incident identifier, asset, reporter or summary exceeds its field limit" });
    }
    if (
      parsed &&
      ((fields.assetName && fields.assetName !== parsed.assetName) ||
        (fields.reportedByDomain && fields.reportedByDomain !== parsed.organizationDomain))
    ) {
      return json(400, { error: "scope and reporter disagree: assetName and reportedByDomain must match the finding" });
    }
    const externalId = fields.externalId || (parsed ? `${parsed.finding.source}:${parsed.finding.findingId}` : "");
    const assetName = fields.assetName || parsed?.assetName || "";
    if (!externalId.trim() || !assetName.trim() || externalId.length > 200 || assetName.length > 200) {
      return json(400, {
        error: "expected { externalId: string, assetName: string, reportedByDomain?: string, summary?: string, finding?: object }",
      });
    }

    // Supplying a detector credential chooses this path exclusively: no HMAC/demo fallback.
    const authorization = req.headers.get("Authorization");
    if (authorization !== null) {
      if (!/^Bearer sc_detector_[a-f0-9]{64}$/.test(authorization))
        return json(401, { error: "Invalid or inactive detector credential." });
      const result = await ctx.runMutation(internal.detectors.ingest, {
        tokenHash: await sha256Hex(authorization.slice(7)),
        report: { externalId, assetName, reportedByDomain: fields.reportedByDomain || parsed?.organizationDomain,
          summary: fields.summary || undefined, finding: parsed?.finding,
          assessment: raw.assessment, evidenceRefs },
      });
      if (!result.ok) {
        const response = json(result.status, { error: result.error });
        if ("retryAfter" in result && result.retryAfter !== undefined)
          response.headers.set("Retry-After", String(Math.max(1, result.retryAfter)));
        return response;
      }
      return json(200, { incidentId: result.incidentId, duplicate: result.duplicate,
        correlated: result.correlated, assessment: result.assessment });
    }

    const signed = await hasValidSignature(req, rawBody);
    const demo = env.DEMO_MODE === "true" ? demoScenario(externalId, assetName) : undefined;
    if (!signed && !demo) {
      return json(401, { error: `missing or invalid ${SIGNATURE_HEADER}` });
    }
    if (!signed && !isPresenter(req.headers.get(PRESENTER_HEADER))) {
      return json(401, { error: "demo scenarios are presenter-only on this deployment" });
    }

    const result = await ctx.runMutation(
      internal.incidents.recordIncident,
      signed
        ? {
            transport: "legacy_hmac" as const,
            externalId,
            assetName,
            reportedByDomain: fields.reportedByDomain || parsed?.organizationDomain,
            summary: fields.summary || undefined,
            finding: parsed?.finding,
            // HMAC authenticates a sender, not its conclusions. The operator must separately
            // enroll a detector for automatic response; generic signed signals stay observations.
            assessment: env.INCIDENT_AUTO_RESPONSE === "true" && raw.assessment === "confirmed" && evidenceRefs.length > 0
              ? "confirmed" : "observation",
            evidenceRefs,
          }
        : demo!,
    );
    if (!result.ok) {
      if ("status" in result) {
        const response = json(result.status, { error: result.error });
        response.headers.set("Retry-After", String(Math.max(1, result.retryAfter)));
        return response;
      }
      return json(404, { error: result.error });
    }
    return json(200, { incidentId: result.incidentId, duplicate: result.duplicate, correlated: result.correlated });
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
