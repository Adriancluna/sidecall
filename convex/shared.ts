// Small helpers and limits shared across the backend. No Convex functions here.

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

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

// Per-call cache for reads that repeat across rows (the same company, vendor or user on many
// rows). Caches the promise, so lookups started in parallel share one read.
export function memo<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const cache = new Map<K, Promise<V>>();
  return (key) => {
    let hit = cache.get(key);
    if (!hit) cache.set(key, (hit = load(key)));
    return hit;
  };
}
