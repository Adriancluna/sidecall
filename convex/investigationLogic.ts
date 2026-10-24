// Documents are evidence, never commands. This module has no tool, network or database access.
export type Extraction = {
  vendorName: string | null;
  invoiceNumber: string | null;
  amountCents: number | null;
  accountLast4: string | null;
  evidence: { field: string; quote: string }[];
  problems: string[];
};
export const normalizeVendor = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|plc|gmbh|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function amountInCents(raw: string): number | null {
  const value = raw.trim().replace(/^\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

// Predictable offline path accepts labelled plain text, not arbitrary PDF/OCR claims.
export function extractStructuredText(source: string): Extraction {
  const evidence: Extraction["evidence"] = [];
  const problems: string[] = [];
  function field(name: string, aliases: string) {
    const re = new RegExp(`^(?:${aliases})\\s*:\\s*(.+)$`, "gim");
    const matches = [...source.matchAll(re)];
    const values = [...new Set(matches.map((m) => m[1].trim()))];
    if (values.length > 1)
      problems.push(`Conflicting ${name} values in the supplied documents.`);
    if (values.length !== 1) return null;
    evidence.push({ field: name, quote: matches[0][0] });
    return values[0];
  }
  const vendorName = field("vendor", "vendor|supplier|vendor name");
  const invoiceNumber = field(
    "invoice",
    "invoice|invoice number|invoice no\\.?",
  );
  const amount = field("amount", "amount|amount due|total");
  const account = field(
    "account",
    "account|bank account|new account|account ending",
  );
  const amountCents = amount ? amountInCents(amount) : null;
  const accountLast4 =
    account && /^(?:[*•xX\s-]*)(\d{4})$/.test(account)
      ? account.match(/(\d{4})$/)![1]
      : null;
  if (amount && amountCents === null)
    problems.push(
      "Amount must be a positive USD amount with at most two decimals.",
    );
  if (account && accountLast4 === null)
    problems.push(
      "Use a masked account ending in exactly four digits; full bank details are not needed.",
    );
  return {
    vendorName,
    invoiceNumber,
    amountCents,
    accountLast4,
    evidence,
    problems,
  };
}

// The model may propose literal spans only. Even accepted extraction cannot authorize a change.
export function validateModelSpans(source: string, raw: unknown): Extraction {
  const result: Extraction = {
    vendorName: null,
    invoiceNumber: null,
    amountCents: null,
    accountLast4: null,
    evidence: [],
    problems: [],
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid extraction");
  const spans = raw as Record<string, unknown>;
  for (const field of ["vendor", "invoice", "amount", "account"] as const) {
    const quote = spans[field];
    if (quote === null || quote === undefined) continue;
    if (
      typeof quote !== "string" ||
      !quote.trim() ||
      quote.length > 200 ||
      !source.includes(quote)
    )
      throw new Error("Extraction is not backed by the source");
    result.evidence.push({ field, quote });
    if (field === "vendor") result.vendorName = quote.trim();
    if (field === "invoice") result.invoiceNumber = quote.trim();
    if (field === "amount") result.amountCents = amountInCents(quote);
    if (field === "account" && /^(?:[*•xX\s-]*)(\d{4})$/.test(quote))
      result.accountLast4 = quote.match(/(\d{4})$/)![1];
  }
  return result;
}

export function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}
