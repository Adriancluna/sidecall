#!/usr/bin/env node
// Role 4: the DNS detector over one real PE firm's public portfolio list, reported as totals.
//
//   node scripts/dns/portfolio.mjs [scripts/dns/portfolio_domains.json]
//
// Reads { source, retrieved, domains: [...] } and writes scripts/dns/portfolio_report.json:
// how many sibling companies point at each vendor, and which unrecognized mail/SPF/TXT hosts
// two or more siblings share. Passive public DNS only (resolve.mjs). The report names no
// company and no domain: a shared vendor is reachability, a candidate link, never a shared
// credential or a weakness, and the pitch never says a real company is exposed.
import { readFileSync, writeFileSync } from "node:fs";
import { detect, spfIncludes } from "./detect.mjs";
import { fetchRecords } from "./resolve.mjs";
import { VENDORS } from "./vendors.mjs";

const input = process.argv[2] ?? "scripts/dns/portfolio_domains.json";
const out = new URL("portfolio_report.json", import.meta.url);
const list = JSON.parse(readFileSync(input, "utf8"));
const domains = [
  ...new Set(
    list.domains.map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, ""),
    ),
  ),
];

const clean = (host) => host.toLowerCase().replace(/\.$/, "");
const endsWithAny = (host, suffixes = []) =>
  suffixes.some((s) => host === s || host.endsWith(`.${s}`));
const known = (kind, value) => VENDORS.some((v) => endsWithAny(value, v[kind]));
const knownToken = (t) =>
  VENDORS.some((v) => (v.txt ?? []).some((p) => t.startsWith(p)));
// Mail host → its provider's domain (aspmx.l.example.com → example.com; keeps co.uk-style).
const provider = (host) => {
  const parts = host.split(".");
  const n = parts.at(-2)?.length <= 3 && parts.at(-1).length === 2 ? 3 : 2;
  return parts.slice(-n).join(".");
};
// Verification tokens name the vendor (acme-site-verification=…); keep the name only.
const TOKEN = /^([a-z0-9_.-]*(?:verification|verify)[a-z0-9_-]*)[=:]/i;

const byVendor = new Map(); // vendor → Set(domain)
const unknown = new Map(); // "kind|host" → Set(domain)
const note = (map, key, domain) =>
  map.set(key, (map.get(key) ?? new Set()).add(domain));
let resolved = 0;

for (const domain of domains) {
  const records = await fetchRecords(domain);
  const found = detect(domain, records).filter((f) => !f.assetName);
  if (records.mx.length || records.txt.length) resolved++;
  for (const f of found) note(byVendor, f.vendor, domain);

  for (const host of records.mx.map(clean)) {
    const p = provider(host);
    if (!known("mx", host) && p !== domain) note(unknown, `MX|${p}`, domain);
  }
  for (const inc of spfIncludes(records.txt)) {
    if (!known("spf", inc) && !inc.endsWith(domain))
      note(unknown, `SPF include|${inc}`, domain);
  }
  for (const t of records.txt) {
    const m = t.match(TOKEN);
    if (m && !knownToken(t)) note(unknown, `TXT token|${m[1]}`, domain);
  }
  console.log(
    `${domain}: ${[...new Set(found.map((f) => f.vendor))].join(", ") || "no known vendors"}`,
  );
}

if (resolved === 0) {
  console.error(
    "No domain returned any records: DNS lookups probably failed. Not writing the report.",
  );
  process.exit(1);
}

const count = (map) =>
  [...map]
    .map(([key, set]) => [key, set.size])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const vendors = count(byVendor).map(([vendor, companies]) => ({
  vendor,
  companies,
}));
const sharedUnrecognized = count(unknown)
  .filter(([, n]) => n >= 2)
  .map(([key, companies]) => {
    const [kind, host] = key.split("|");
    return { kind, host, companies };
  });
// Tools that hold admin reach into a company (devices, remote access, logins, passwords,
// money). Several siblings on one of these is the pattern Sidecall cares about, still only a
// candidate: each company has its own account unless someone confirms otherwise.
const HIGH_TRUST = [
  ["TXT token|jamf-site-verification", "Jamf", "device management"],
  ["TXT token|logmein-verification-code", "LogMeIn", "remote access"],
  ["TXT token|teamviewer-sso-verification", "TeamViewer", "remote access"],
  ["TXT token|duo_sso_verification", "Duo", "login and MFA"],
  ["Okta", "Okta", "login and MFA"],
  ["Auth0", "Auth0", "login and MFA"],
  ["OneLogin", "OneLogin", "login and MFA"],
  ["TXT token|1password-site-verification", "1Password", "password manager"],
  ["SPF include|sent-via.netsuite.com", "NetSuite", "finance and AP"],
];
const highTrust = HIGH_TRUST.map(([key, tool, kind]) => ({
  tool,
  kind,
  companies: (byVendor.get(key) ?? unknown.get(key))?.size ?? 0,
}))
  .filter((t) => t.companies >= 2)
  .sort((a, b) => b.companies - a.companies || a.tool.localeCompare(b.tool));
// Siblings that share at least one recognized vendor with at least one other sibling.
const sharing = new Set(
  [...byVendor.values()].filter((s) => s.size >= 2).flatMap((s) => [...s]),
);

const N = resolved;
const top = vendors.slice(0, 3).map((v) => `${v.companies} on ${v.vendor}`);
const report = {
  _comment:
    "Totals only, from public DNS (MX, SPF, TXT, a few CNAMEs). Reachability: who these companies point at, never a shared credential or a weakness. Names no company or domain; rerun portfolio.mjs to reproduce.",
  source: list.source,
  retrieved: list.retrieved,
  scannedAt: new Date().toISOString(),
  companiesListed: domains.length,
  companiesWithRecords: N,
  companiesSharingAVendor: sharing.size,
  highTrust,
  vendors,
  sharedUnrecognized,
  line: `Of ${N} companies in one real PE portfolio, public DNS shows ${top.join(", ")}${
    highTrust.length
      ? `, and ${highTrust
          .slice(0, 3)
          .map(
            (t) => `${t.companies} with the same ${t.kind} vendor (${t.tool})`,
          )
          .join(", ")}`
      : ""
  }. Same vendor isn't the same weakness: each one is a candidate link until a company confirms what it actually shares.`,
};
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(
  `\nportfolio_report.json: ${N} of ${domains.length} domains resolved`,
);
if (highTrust.length) console.log("High-trust tools on 2+ siblings:");
for (const t of highTrust)
  console.log(`  ${t.companies}  ${t.tool} (${t.kind})`);
for (const v of vendors) console.log(`  ${v.companies}  ${v.vendor}`);
if (sharedUnrecognized.length) console.log("Shared, not in vendors.mjs:");
for (const u of sharedUnrecognized)
  console.log(`  ${u.companies}  ${u.kind} ${u.host}`);
console.log(`\n${report.line}`);
