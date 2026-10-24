/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as blastRadius from "../blastRadius.js";
import type * as crons from "../crons.js";
import type * as findings from "../findings.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as incidents from "../incidents.js";
import type * as investigationLogic from "../investigationLogic.js";
import type * as investigations from "../investigations.js";
import type * as ledger from "../ledger.js";
import type * as mcp from "../mcp.js";
import type * as notifications from "../notifications.js";
import type * as notify from "../notify.js";
import type * as ops from "../ops.js";
import type * as payments from "../payments.js";
import type * as responseEvidence from "../responseEvidence.js";
import type * as responses from "../responses.js";
import type * as sandbox from "../sandbox.js";
import type * as scoring from "../scoring.js";
import type * as seed from "../seed.js";
import type * as shared from "../shared.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agents: typeof agents;
  ai: typeof ai;
  alerts: typeof alerts;
  auth: typeof auth;
  blastRadius: typeof blastRadius;
  crons: typeof crons;
  findings: typeof findings;
  http: typeof http;
  imports: typeof imports;
  incidents: typeof incidents;
  investigationLogic: typeof investigationLogic;
  investigations: typeof investigations;
  ledger: typeof ledger;
  mcp: typeof mcp;
  notifications: typeof notifications;
  notify: typeof notify;
  ops: typeof ops;
  payments: typeof payments;
  responseEvidence: typeof responseEvidence;
  responses: typeof responses;
  sandbox: typeof sandbox;
  scoring: typeof scoring;
  seed: typeof seed;
  shared: typeof shared;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
