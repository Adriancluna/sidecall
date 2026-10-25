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
import type * as demoResetReceiver from "../demoResetReceiver.js";
import type * as detectors from "../detectors.js";
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
import type * as paymentLookup from "../paymentLookup.js";
import type * as paymentRecovery from "../paymentRecovery.js";
import type * as paymentVerification from "../paymentVerification.js";
import type * as paymentVerificationLab from "../paymentVerificationLab.js";
import type * as payments from "../payments.js";
import type * as purchaseConsole from "../purchaseConsole.js";
import type * as purchaseConsoleLogic from "../purchaseConsoleLogic.js";
import type * as purchaseConsoleTypes from "../purchaseConsoleTypes.js";
import type * as purchaseLab from "../purchaseLab.js";
import type * as purchaseLimits from "../purchaseLimits.js";
import type * as purchaseTypes from "../purchaseTypes.js";
import type * as purchases from "../purchases.js";
import type * as receiverModel from "../receiverModel.js";
import type * as receiverTransport from "../receiverTransport.js";
import type * as responseEvidence from "../responseEvidence.js";
import type * as responseReceiver from "../responseReceiver.js";
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
  demoResetReceiver: typeof demoResetReceiver;
  detectors: typeof detectors;
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
  paymentLookup: typeof paymentLookup;
  paymentRecovery: typeof paymentRecovery;
  paymentVerification: typeof paymentVerification;
  paymentVerificationLab: typeof paymentVerificationLab;
  payments: typeof payments;
  purchaseConsole: typeof purchaseConsole;
  purchaseConsoleLogic: typeof purchaseConsoleLogic;
  purchaseConsoleTypes: typeof purchaseConsoleTypes;
  purchaseLab: typeof purchaseLab;
  purchaseLimits: typeof purchaseLimits;
  purchaseTypes: typeof purchaseTypes;
  purchases: typeof purchases;
  receiverModel: typeof receiverModel;
  receiverTransport: typeof receiverTransport;
  responseEvidence: typeof responseEvidence;
  responseReceiver: typeof responseReceiver;
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

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
