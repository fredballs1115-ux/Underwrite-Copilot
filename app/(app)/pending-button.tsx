"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Submit button that shows what's happening the moment it's clicked —
 * spinner + progress label while its form's server action runs, and locked
 * against double-submits. Must live inside the <form> it submits.
 */
export function PendingButton({
  children,
  pendingLabel,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  /** label swapped in while submitting, e.g. "Uploading your OM…" */
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  // While it saves the button stays focusable — aria-disabled, a second
  // press refused here — and its pending words are said once: a focused
  // button that disables itself sends focus to the page, and "Uploading
  // your OM…" was never heard (research pass 33).
  return (
    <>
      <button
        type="submit"
        disabled={disabled}
        aria-disabled={pending || undefined}
        onClick={pending ? (e) => e.preventDefault() : undefined}
        aria-busy={pending}
        className={`inline-flex items-center justify-center gap-2 ${className} disabled:cursor-not-allowed ${
          pending ? "cursor-progress opacity-80" : "disabled:opacity-50"
        }`}
      >
        {pending && (
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      {pendingLabel ? (
        <span role="status" className="sr-only">
          {pending ? pendingLabel : ""}
        </span>
      ) : null}
    </>
  );
}
