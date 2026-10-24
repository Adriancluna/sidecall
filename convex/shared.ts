// Small helpers and limits shared across the backend. No Convex functions here.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Fan-out reads are bounded: one incident reaches at most this many linked companies and
// payments, everywhere that reads its rows. Far above a PE portfolio.
export const MAX_FANOUT = 500;

// 48_000_000 → "$480,000"
export const formatUsd = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

export const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

// Sign-in links a person by exact email, so the seed and the AP import must build it the same way.
// "Jamie Chen" at summithomehealth.example → jamie.chen@summithomehealth.example
export const demoEmail = (name: string, domain: string) =>
  `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@${domain}`;
