// Role 4: public DNS lookups for the DNS scripts. Passive only: every query goes to a public
// resolver (dns.google over HTTPS; falls back to the system resolver), never to the
// domain's own servers. These are the same MX/TXT lookups any mail server makes.
import { promises as dns } from "node:dns";
import { CNAME_SUBDOMAINS } from "./vendors.mjs";

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

// A domain's records in the shape detect() takes: { mx, txt, cname: { [sub]: target } }.
export async function fetchRecords(domain) {
  const [mx, txt, ...cnames] = await Promise.all([
    lookup(domain, "MX"),
    lookup(domain, "TXT"),
    ...CNAME_SUBDOMAINS.map((sub) => lookup(`${sub}.${domain}`, "CNAME")),
  ]);
  return {
    mx: mx.map((r) => r.split(" ").pop()),
    txt,
    cname: Object.fromEntries(
      CNAME_SUBDOMAINS.map((sub, i) => [sub, cnames[i][0]]).filter(
        ([, target]) => target,
      ),
    ),
  };
}
