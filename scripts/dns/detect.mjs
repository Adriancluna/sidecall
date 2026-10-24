// Role 4: turn a domain's DNS records into vendor findings. Pure, no I/O.
// records: { mx: string[], txt: string[], cname: { [subdomain]: string } }
import { VENDORS } from "./vendors.mjs";

const clean = (host) => host.toLowerCase().replace(/\.$/, "");
const endsWithAny = (host, suffixes = []) =>
  suffixes.some((s) => host === s || host.endsWith(`.${s}`));

export function spfIncludes(txt) {
  return txt
    .filter((t) => t.toLowerCase().startsWith("v=spf1"))
    .flatMap((t) =>
      [...t.matchAll(/\binclude:(\S+)/gi)].map((m) => clean(m[1])),
    );
}

// One finding per (vendor, record kind): { domain, vendor, assetName?, record, evidence, detail }.
export function detect(domain, records) {
  const findings = [];
  const add = (v, record, evidence, detail) => {
    if (findings.some((f) => f.vendor === v.vendor && f.record === record))
      return;
    findings.push({
      domain,
      vendor: v.vendor,
      ...(v.assetName ? { assetName: v.assetName } : {}),
      record,
      evidence,
      detail,
    });
  };
  const mx = (records.mx ?? []).map(clean);
  const includes = spfIncludes(records.txt ?? []);
  for (const v of VENDORS) {
    const host = mx.find((h) => endsWithAny(h, v.mx));
    if (host) add(v, "MX", host, `MX → ${host}`);
    const inc = includes.find((h) => endsWithAny(h, v.spf));
    if (inc) add(v, "SPF", `include:${inc}`, `SPF include:${inc}`);
    const token = (records.txt ?? []).find((t) =>
      (v.txt ?? []).some((p) => t.startsWith(p)),
    );
    if (token) {
      // Show only the token name, not the secret-looking value.
      const name = token.split(/[=:]/)[0];
      add(v, "TXT", name, `TXT ${name}`);
    }
    for (const [sub, target] of Object.entries(records.cname ?? {})) {
      const t = clean(target);
      if (endsWithAny(t, v.cname))
        add(
          v,
          "CNAME",
          `${sub}.${domain} → ${t}`,
          `CNAME ${sub}.${domain} → ${t}`,
        );
    }
  }
  return findings;
}
