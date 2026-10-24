import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// The demo button calls this from the browser, so allow cross-origin POSTs.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
    let body: unknown;
    try {
      body = await req.json();
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

export default http;
