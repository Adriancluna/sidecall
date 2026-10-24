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
import type * as ai from "../ai.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as blastRadius from "../blastRadius.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as payments from "../payments.js";
import type * as scoring from "../scoring.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  ai: typeof ai;
  alerts: typeof alerts;
  auth: typeof auth;
  blastRadius: typeof blastRadius;
  crons: typeof crons;
  http: typeof http;
  incidents: typeof incidents;
  payments: typeof payments;
  scoring: typeof scoring;
  seed: typeof seed;
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
