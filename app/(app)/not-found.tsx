import type { Metadata } from "next";
import Link from "next/link";
import { DealCover } from "./deals/deal-cover";
import { coverFor } from "@/lib/deal-cover";

// A 404 is never to be indexed (the root not-found's rule).
export const metadata: Metadata = { robots: { index: false } };

/** The drawing the page wears: the deal covers' own empty, staked parcel
 *  under a fixed sky — plainly an illustration, never a building. */
const NOT_FOUND_COVER = coverFor({ seed: "not-found", assetClass: "land" });

/**
 * A deal page's `notFound()` (a deleted deal, a mistyped id, a deal the
 * reader's account or team cannot open) lands here, inside the signed-in
 * shell — the sidebar, the palette and the way back stay — where it had
 * fallen to the site's full-screen 404. It says what is known: no deal or
 * page this account can open is at the link. Row-level security answers a
 * deal that is not the reader's exactly as one that is gone, so the page
 * never says which.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-surface text-center shadow-card">
      <DealCover cover={NOT_FOUND_COVER} label="An empty lot" words={false} className="aspect-[16/7] w-full" />
      <div className="p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Nothing at this link.</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          No deal or page this account can open is here. It may have been
          deleted, or it may belong to someone else.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/deals"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Back to the pipeline
          </Link>
        </div>
      </div>
    </div>
  );
}
