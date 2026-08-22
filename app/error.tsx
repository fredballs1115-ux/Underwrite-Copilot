"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-segment boundary for everything outside the signed-in shell (landing,
// /demo, /why, /login, legal pages). Renders INSIDE the root layout, so the
// palette and fonts are live — unlike global-error, which only catches what
// this one can't (root-layout failures) and must inline everything.
// `unstable_retry` re-fetches the segment (Next 16.2 convention) — `reset`
// alone would replay the same failed render from cache.
export default function RouteError({
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
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div
          aria-hidden
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-kill/10 text-xl font-bold text-kill"
        >
          !
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          Something went wrong.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The page hit an unexpected error. Try again — if it keeps happening,
          email{" "}
          <a
            href="mailto:underwritecopilot.support@gmail.com"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            underwritecopilot.support@gmail.com
          </a>
          .
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted/70">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {retry && (
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          )}
          <Link
            href="/"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-faint"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
