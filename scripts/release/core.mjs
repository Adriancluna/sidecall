import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export class ProofError extends Error {}
export function requireProof(condition, message) { if (!condition) throw new ProofError(message); }

// Re-read the on-disk target before every operation. This runner only knows Pegasus's DEV.
export function createOwnedDev({ argv, cwd = process.cwd(), env = process.env }) {
  requireProof(argv?.length === 2 && argv[0] === "--deployment" && argv[1] === "tangible-koala-842",
    "Explicit Pegasus DEV selection is required.");
  let local;
  try { local = parseEnv(readFileSync(resolve(cwd, ".env.local"), "utf8")); }
  catch { throw new ProofError("A readable .env.local is required; contents withheld."); }
  for (const key of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"])
    requireProof(!env[key] && !local[key], "Deployment credentials and self-hosted overrides are refused.");
  requireProof(local.CONVEX_DEPLOYMENT === "dev:tangible-koala-842" && local.VITE_CONVEX_URL === "https://tangible-koala-842.convex.cloud",
    "Local selector and cloud URL must both identify Pegasus DEV.");
  for (const key of ["CONVEX_DEPLOYMENT", "VITE_CONVEX_URL"])
    requireProof(!env[key] || env[key] === local[key], "Process and local deployment selectors disagree.");
  return { deployment: "tangible-koala-842" };
}

export function redact(value, secrets = []) {
  const clean = (v, key = "") => {
    if (/^(authorization|token|tokenHash|accessToken|refreshToken|apiKey|password|x-api-key)$/i.test(key)) return "[REDACTED]";
    if (typeof v === "string") {
      let text = v;
      for (const secret of secrets.filter(s => typeof s === "string" && s.length > 0)) text = text.split(secret).join("[REDACTED]");
      return text.replace(/sc_(?:agent|detector|test)_[a-f0-9]{32,}/gi, "[REDACTED]")
        .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]")
        .replace(/Bearer\s+[^\s"\\]+/gi, "Bearer [REDACTED]")
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");
    }
    if (Array.isArray(v)) return v.map(item => clean(item));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, clean(item, k)]));
    return v;
  };
  return clean(value);
}

export async function withCleanup(work, cleanup, failures) {
  try { return await work(); }
  finally {
    for (const task of cleanup.slice().reverse()) {
      try { await task(); }
      catch { failures.push("An issued rehearsal credential or approval could not be revoked/verified."); }
    }
  }
}
