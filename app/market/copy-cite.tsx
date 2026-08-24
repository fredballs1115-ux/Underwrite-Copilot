"use client";

import { useState } from "react";

/** One-click citation for a research figure — the number, its status, and
 *  its source in a paste-ready line. Clipboard access can be denied (older
 *  browsers, permissions policies); the button just stays quiet then. */
export function CopyCite({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          // clipboard unavailable — nothing sensible to do
        }
      }}
      className="mt-1.5 rounded border border-line px-1.5 py-px text-[10px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
      aria-live="polite"
    >
      {done ? "copied ✓" : "copy citation"}
    </button>
  );
}
