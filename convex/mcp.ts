// MCP over Streamable HTTP (JSON responses only: no SSE, no sessions). An AI assistant connects
// with a bearer token (convex/agents.ts) and gets read-only tools scoped to the company of the
// person it acts for. There is no release or reject tool: releasing money stays a human action.
//   claude mcp add --transport http sidecall https://<deployment>.convex.site/mcp \
//     --header "Authorization: Bearer <token>"
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { sha256Hex } from "./agents";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const DEFAULT_VERSION = "2025-06-18";
const MAX_BODY_BYTES = 64 * 1024;

const INSTRUCTIONS =
  "Sidecall holds payments to vendors under an active security incident until a person verifies them. You can list and explain held payments for your company, list its bills, and request payment of a bill as its AP clerk (a request to a vendor under an incident is held). A safe, unchanged bill within an explicit controller purchasing approval can settle automatically in the demo ledger. You cannot release or reject held payments: a controller other than the requester must call the vendor at the number on file and decide in Sidecall.";

const TOOLS = [
  {
    name: "list_held_payments",
    description:
      "List payments at your company that Sidecall held because of a vendor security incident, with status and hold reasons.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["held", "paid", "rejected"] } },
      additionalProperties: false,
    },
  },
  {
    name: "explain_hold",
    description:
      "Explain why one payment is held: reasons, any recent bank-detail change, the audit trail, and who must act next. Read-only.",
    inputSchema: {
      type: "object",
      properties: { paymentId: { type: "string" } },
      required: ["paymentId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_bills",
    description: "List your company's bills and whether each already has a payment.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "request_payment",
    description:
      "Request payment of one bill, as the AP clerk you act for. If the vendor is under an active security incident the payment is held until a controller verifies it. An unchanged bill covered by a controller purchasing approval can settle automatically within its limits in the demo ledger; this is not a live payment-network transaction.",
    inputSchema: {
      type: "object",
      properties: { billId: { type: "string" } },
      required: ["billId"],
      additionalProperties: false,
    },
  },
] as const;

type RpcId = string | number | null;
type Agent = { agentId: Id<"agents">; name: string; tools: string[]; companyId: Id<"companies"> };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rpcResult = (id: RpcId, result: unknown) => json(200, { jsonrpc: "2.0", id, result });
const rpcError = (status: number, id: RpcId, code: number, message: string) =>
  json(status, { jsonrpc: "2.0", id, error: { code, message } });
const textContent = (text: string, isError = false) => ({ content: [{ type: "text", text }], ...(isError ? { isError } : {}) });

async function callTool(ctx: ActionCtx, agent: Agent, name: string, args: Record<string, unknown>) {
  if (name === "list_held_payments") {
    const status = args.status;
    if (status !== undefined && status !== "held" && status !== "paid" && status !== "rejected") {
      return { result: textContent('status must be "held", "paid" or "rejected".', true), ok: false, summary: "Bad status." };
    }
    const rows = await ctx.runQuery(internal.agents.listHeldPayments, { agentId: agent.agentId, status });
    return {
      result: textContent(JSON.stringify(rows, null, 2)),
      ok: true,
      summary: `${rows.length} payment(s) listed.`,
    };
  }
  if (name === "list_bills") {
    const bills = await ctx.runQuery(internal.agents.listBills, { agentId: agent.agentId });
    return { result: textContent(JSON.stringify(bills, null, 2)), ok: true, summary: `${bills.length} bill(s) listed.` };
  }
  if (name === "request_payment") {
    const billId = typeof args.billId === "string" ? args.billId : "";
    // Audited inside the mutation, in the same transaction as the request.
    const out = await ctx.runMutation(internal.agents.requestPayment, { agentId: agent.agentId, billId });
    return { result: textContent(JSON.stringify(out, null, 2), !out.ok), ok: out.ok, summary: "", logged: true };
  }
  // explain_hold
  const paymentId = typeof args.paymentId === "string" ? args.paymentId : "";
  const explanation = paymentId
    ? await ctx.runQuery(internal.agents.explainHold, { agentId: agent.agentId, paymentId })
    : null;
  if (!explanation) return { result: textContent("Payment not found.", true), ok: false, summary: "Payment not found." };
  return {
    result: textContent(JSON.stringify(explanation, null, 2)),
    ok: true,
    summary: `Explained a ${explanation.status} ${explanation.amount} payment to ${explanation.vendorName}.`,
    paymentId: explanation.paymentId,
    incidentId: explanation.incidentId ?? undefined,
  };
}

export const mcpHandler = httpAction(async (ctx, req) => {
  // 1. Browsers send Origin; MCP clients don't. Refuse cross-site calls (DNS rebinding guard).
  if (req.headers.get("Origin")) return new Response("Forbidden", { status: 403 });

  // 2. Bearer token → agent.
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const who = token ? await ctx.runQuery(internal.agents.authenticate, { tokenHash: await sha256Hex(token) }) : null;
  if (!who) return json(401, { error: "invalid agent token" });
  const agent: Agent = who;

  // 3–4. Parse one JSON-RPC message.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(400, null, -32700, "Parse error");
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return rpcError(400, null, -32700, "Parse error");
  }
  if (Array.isArray(message)) return rpcError(400, null, -32600, "Batching is not supported");
  if (typeof message !== "object" || message === null) return rpcError(400, null, -32600, "Invalid Request");
  const { id, method, params } = message as { id?: RpcId; method?: unknown; params?: Record<string, unknown> };

  // 5. Notifications (no id) get no body.
  if (id === undefined) return new Response(null, { status: 202 });
  if (typeof method !== "string") return rpcError(400, id, -32600, "Invalid Request");

  // 6. Protocol version header, when sent, must be one we speak.
  const headerVersion = req.headers.get("MCP-Protocol-Version");
  if (headerVersion && !PROTOCOL_VERSIONS.includes(headerVersion)) {
    return rpcError(400, id, -32600, `Unsupported MCP-Protocol-Version ${headerVersion}`);
  }

  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : DEFAULT_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "sidecall", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS.filter((t) => agent.tools.includes(t.name)) });
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name) || !agent.tools.includes(name)) {
        await ctx.runMutation(internal.agents.logCall, {
          agentId: agent.agentId,
          companyId: agent.companyId,
          tool: name || "(none)",
          ok: false,
          summary: "Tool not available to this agent.",
        });
        return rpcError(200, id, -32602, `Unknown tool: ${name}`);
      }
      const out = await callTool(ctx, agent, name, args);
      if ("logged" in out) return rpcResult(id, out.result);
      await ctx.runMutation(internal.agents.logCall, {
        agentId: agent.agentId,
        companyId: agent.companyId,
        tool: name,
        ok: out.ok,
        summary: out.summary,
        paymentId: "paymentId" in out ? out.paymentId : undefined,
        incidentId: "incidentId" in out ? out.incidentId : undefined,
      });
      return rpcResult(id, out.result);
    }
    default:
      return rpcError(200, id, -32601, "Method not found");
  }
});

export const mcpMethodNotAllowed = httpAction(async () =>
  new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
);
