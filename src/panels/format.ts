export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Times read in UTC everywhere, like the backend's "What to check" text ("after Oct 24, 08:12 UTC").
export const dateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

export const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Backend codes ("phone_call", "same_vendor_only") as words.
export const humanize = (code: string) => code.replace(/_/g, " ");

// "Brightline Payroll" for an asset named after its vendor, else "Ironclad IT Services: shared admin account".
export const assetTitle = (vendorName: string, assetName: string) =>
  vendorName.toLowerCase().startsWith(assetName.toLowerCase()) ? vendorName : `${vendorName}: ${assetName}`;
