"use client";

import { useEffect } from "react";
import Link from "next/link";

// Boundary for the signed-in pages: an error in one page keeps the shell —
// nav, palette, the rest of the product — and offers a real retry.
// `unstable_retry` re-fetches the segment (Next 16.2 convention).
export default function AppError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const retry = unstable_retry ?? reset;

  return (
    <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
      <div
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-kill/10 text-xl font-bold text-kill"
      >
        !
      </div>
      <p className="mt-5 text-base font-semibold tracking-tight">
        This page hit an unexpected error.
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        Your deals and data are fine — this is a rendering hiccup, not a data
        loss. Try again, or jump back to the pipeline. Persisting? Email{" "}
        <a
          href="mailto:underwritecopilot.support@gmail.com"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          underwritecopilot.support@gmail.com
        </a>
        {error.digest ? (
          <>
            {" "}
            with error ID <span className="font-mono text-xs">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {retry && (
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Try again
          </button>
        )}
        <Link
          href="/deals"
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
        >
          Back to the pipeline
        </Link>
      </div>
    </div>
  );
}
