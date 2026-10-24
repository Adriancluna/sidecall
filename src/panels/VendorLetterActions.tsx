// Copy the vendor letter, or open it in the presenter's email client (no address prefilled:
// the vendor's security contact isn't in our data).
import { useState } from "react";
import { BUTTON_SECONDARY } from "./styles";

type Props = { vendorName: string; body: string };

export function VendorLetterActions({ vendorName, body }: Props) {
  const [copied, setCopied] = useState<"ok" | "failed">();
  const subject = `Open security incident at ${vendorName}: one coordinated request from our portfolio`;
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied("ok");
    } catch {
      setCopied(copyWithSelection(body) ? "ok" : "failed");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {copied && (
        <span role="status" className="text-xs text-ash">
          {copied === "ok" ? "Copied" : "Copy failed, select the text instead"}
        </span>
      )}
      <button type="button" onClick={() => void copy()} className={BUTTON_SECONDARY}>
        Copy
      </button>
      <a href={mailto} className={BUTTON_SECONDARY}>
        Open in email
      </a>
    </div>
  );
}

// Fallback for browsers that block the Clipboard API (embedded views, older Safari).
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
