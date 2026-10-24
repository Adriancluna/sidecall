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
import { promises as dns } from "node:dns";
import { detect } from "./detect.mjs";
import { CNAME_SUBDOMAINS, DEMO_INCIDENT_ASSETS } from "./vendors.mjs";

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
const DOH = process.env.DNS_DOH_URL ?? "https://dns.google/resolve";
const TYPE = { MX: 15, TXT: 16, CNAME: 5 };

async function doh(name, type) {
  const res = await fetch(
    `${DOH}?name=${encodeURIComponent(name)}&type=${type}`,
    {
      headers: { accept: "application/dns-json" },
    },
  );
  if (!res.ok) throw new Error(`DoH ${res.status}`);
  const body = await res.json();
  return (body.Answer ?? [])
    .filter((a) => a.type === TYPE[type])
    .map((a) =>
      type === "TXT"
        ? a.data.replace(/^"|"$/g, "").replace(/" "/g, "")
        : a.data,
    );
}

async function system(name, type) {
  try {
    if (type === "MX")
      return (await dns.resolveMx(name)).map(
        (r) => `${r.priority} ${r.exchange}`,
      );
    if (type === "TXT")
      return (await dns.resolveTxt(name)).map((parts) => parts.join(""));
    return await dns.resolveCname(name);
  } catch (e) {
    if (["ENODATA", "ENOTFOUND"].includes(e.code)) return [];
    throw e;
  }
}

let useDoh = true;
async function lookup(name, type) {
  if (useDoh) {
    try {
      return await doh(name, type);
    } catch (e) {
      console.error(
        `DoH unavailable (${e.cause?.code ?? e.message}); using the system resolver`,
      );
      useDoh = false;
    }
  }
  return system(name, type);
}

const domains = JSON.parse(readFileSync(here("domains.json"), "utf8")).domains;
const findings = [];
for (const domain of domains) {
  const [mx, txt, ...cnames] = await Promise.all([
    lookup(domain, "MX"),
    lookup(domain, "TXT"),
    ...CNAME_SUBDOMAINS.map((sub) => lookup(`${sub}.${domain}`, "CNAME")),
  ]);
  const records = {
    mx: mx.map((r) => r.split(" ").pop()),
    txt,
    cname: Object.fromEntries(
      CNAME_SUBDOMAINS.map((sub, i) => [sub, cnames[i][0]]).filter(
        ([, target]) => target,
      ),
    ),
  };
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
