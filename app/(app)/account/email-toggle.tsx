"use client";

import { setEmailPrefs } from "./actions";

/** Accessible switch for the analysis-ready email — submits on toggle, the
 *  server action persists and the page re-renders with the new state. */
export function EmailToggle({ enabled }: { enabled: boolean }) {
  return (
    <form action={setEmailPrefs}>
      <input type="hidden" name="value" value={enabled ? "off" : "on"} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label="Email me when an analysis finishes"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
          enabled ? "bg-brand" : "bg-line"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </form>
  );
}
