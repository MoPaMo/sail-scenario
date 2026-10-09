"use client";

import { useState } from "react";

export function CopyLinkButton({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
    >
      {copied ? "Link copied" : label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      Print card
    </button>
  );
}
