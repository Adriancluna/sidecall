// Role 4's data/dns_findings.json: vendor detection run on REAL public domains (DNS MX / SPF /
// TXT / CNAME). Read as text at build time; a malformed or missing-shape file yields no rows.
import raw from "../../data/dns_findings.json?raw";

type Finding = {
  domain: string;
  vendor: string;
  record: string;
  evidence: string;
};
type DomainFindings = {
  domain: string;
  vendors: { vendor: string; records: string[] }[];
};

const isFinding = (f: unknown): f is Finding =>
  typeof f === "object" &&
  f !== null &&
  ["domain", "vendor", "record", "evidence"].every(
    (k) => typeof (f as Record<string, unknown>)[k] === "string",
  );

function parse(text: string): DomainFindings[] {
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    const byDomain = new Map<string, Map<string, Set<string>>>();
    for (const f of data.filter(isFinding)) {
      const vendors = byDomain.get(f.domain) ?? new Map<string, Set<string>>();
      vendors.set(f.vendor, (vendors.get(f.vendor) ?? new Set()).add(f.record));
      byDomain.set(f.domain, vendors);
    }
    return [...byDomain].map(([domain, vendors]) => ({
      domain,
      vendors: [...vendors].map(([vendor, records]) => ({
        vendor,
        records: [...records].sort(),
      })),
    }));
  } catch {
    return [];
  }
}

export const dnsFindings = parse(raw);
