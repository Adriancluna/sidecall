#!/usr/bin/env node
// Role 4: DNS vendor detection.
//
//   node scripts/dns/scan.mjs              # both outputs below
//   node scripts/dns/scan.mjs --seed-only  # only data/dns_links.json (no network)
//
// 1. Real: looks up MX, TXT (SPF + verification tokens) and a few CNAMEs for each domain in
//    scripts/dns/domains.json over DNS-over-HTTPS (dns.google; falls back to the system
//    resolver), and writes data/dns_findings.json: [{ domain, vendor, record, evidence }].
// 2. Seed: runs the same detector over the simulated records of the fictional seed domains
//    (scripts/dns/seed_records.json) and writes data/dns_links.json:
//    [{ companyDomain, assetName, detail }] (CONTRACT.md "DNS links"), never to a demo
//    incident asset.
import { readFileSync, writeFileSync } from "node:fs";
import { detect } from "./detect.mjs";
import { fetchRecords } from "./resolve.mjs";
import { DEMO_INCIDENT_ASSETS } from "./vendors.mjs";

const here = (p) => new URL(p, import.meta.url);
const data = (p) => new URL(`../../data/${p}`, import.meta.url);
const write = (url, value) =>
  writeFileSync(url, JSON.stringify(value, null, 2) + "\n");

// ---- Seed: simulated records → dns_links.json ----
const seed = JSON.parse(
  readFileSync(here("seed_records.json"), "utf8"),
).domains;
const links = new Map();
for (const [domain, records] of Object.entries(seed)) {
  for (const f of detect(domain, records)) {
    if (!f.assetName) continue;
    if (DEMO_INCIDENT_ASSETS.includes(f.assetName)) {
      console.error(
        `Kept out: ${domain} → ${f.assetName} (would change the demo headline)`,
      );
      continue;
    }
    const key = `${domain}|${f.assetName}`;
    const link = links.get(key) ?? {
      companyDomain: domain,
      assetName: f.assetName,
      details: [],
    };
    link.details.push(f.detail);
    links.set(key, link);
  }
}
const dnsLinks = [...links.values()].map(
  ({ companyDomain, assetName, details }) => ({
    companyDomain,
    assetName,
    detail: details.join(" · "),
  }),
);
write(data("dns_links.json"), dnsLinks);
console.log(
  `dns_links.json: ${dnsLinks.length} candidate links (simulated records)`,
);
for (const l of dnsLinks)
  console.log(`  ${l.companyDomain} → ${l.assetName}: ${l.detail}`);

if (process.argv.includes("--seed-only")) process.exit(0);

// ---- Real: live DNS → dns_findings.json ----
const domains = JSON.parse(readFileSync(here("domains.json"), "utf8")).domains;
const findings = [];
for (const domain of domains) {
  const records = await fetchRecords(domain);
  const found = detect(domain, records).filter((f) => !f.assetName);
  for (const f of found)
    findings.push({
      domain,
      vendor: f.vendor,
      record: f.record,
      evidence: f.evidence,
    });
  console.log(
    `${domain}: ${[...new Set(found.map((f) => f.vendor))].join(", ") || "no known vendors"}`,
  );
}
if (findings.length === 0) {
  console.error(
    "No findings at all: DNS lookups probably failed. Not overwriting data/dns_findings.json.",
  );
  process.exit(1);
}
write(data("dns_findings.json"), findings);
console.log(
  `dns_findings.json: ${findings.length} findings across ${domains.length} real domains`,
);
