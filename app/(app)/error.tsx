"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SUPPORT_EMAIL, pageErrorMailto } from "@/lib/support-link";

// Boundary for the signed-in pages: an error in one page keeps the shell —
// nav, palette, the rest of the product — and offers a real retry.
// `unstable_retry` re-fetches the segment (Next 16.2 convention).
//
// It says only what is known: the page did not load. A page lands here as
// much from a read that failed (the analytics and the tasks pages throw on
// one) as from its own markup, so it never says the reader's data is fine
// or calls the failure a rendering hiccup. The support link carries the
// page and the error ID (lib/support-link).
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
  const path = usePathname();

  return (
    <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
      <div
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-kill/10 text-xl font-bold text-kill"
      >
        !
      </div>
      <h1 className="mt-5 text-base font-semibold tracking-tight">
        This page could not load.
      </h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        Something failed while loading it. Try again, or go back to the
        pipeline.
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
      <p className="mx-auto mt-5 max-w-md text-xs text-muted">
        Still failing?{" "}
        <a
          href={pageErrorMailto({ path, digest: error.digest })}
          title={`Email ${SUPPORT_EMAIL}`}
          className="font-medium text-brand underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          Tell support
        </a>
        {error.digest ? (
          <>
            {" "}
            · error ID <span className="font-mono">{error.digest}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
