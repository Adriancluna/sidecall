export function deliver(options: {
  origin: string;
  secret: string | undefined;
  command: { version: number; companyId: string; commandId: string; target: string; incidentId: string;
    action: string; policyVersion: number; pauseCommandId?: string };
  statusOnly?: boolean;
  allowLoopback?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): Promise<
  | { delivery: "authenticated_receipt"; http: number; receipt: unknown }
  | { delivery: "unknown"; commandId: string; reason: string }
>;
