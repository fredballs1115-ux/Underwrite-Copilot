"use client";

import Link from "next/link";
import { useEffect } from "react";

// Error boundary for the signed-in app. A thrown error renders this instead of
// white-screening; `reset()` re-renders the segment to retry.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it in the server/client logs for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-kill/10 text-kill">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">
        Something went wrong.
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        This screen hit an unexpected error. Try again — if it keeps happening,
        head back to your pipeline.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Try again
        </button>
        <Link
          href="/deals"
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-faint"
        >
          Back to pipeline
        </Link>
      </div>
    </div>
  );
}
