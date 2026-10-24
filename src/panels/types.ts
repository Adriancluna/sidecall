// Row shapes inferred from Adrian's Convex queries, so the UI breaks at compile time if they change.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type HeldPaymentRow = FunctionReturnType<
  typeof api.payments.getHeldPayments
>[number];

export type BlastRadius = NonNullable<
  FunctionReturnType<typeof api.blastRadius.getBlastRadius>
>;
