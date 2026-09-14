"use client";

import { useState } from "react";

/**
 * The building's own picture, at list-row size — its "logo", in the sense
 * that every deal is recognisable by the place it actually is.
 *
 * Served by /api/deals/[id]/image, which returns the BEST real picture
 * available: the Street View photograph of the building front where there's
 * a key and Google has coverage, the USGS aerial of the site otherwise. So
 * this row upgrades from an overhead shot to a photo of the actual building
 * the moment GOOGLE_MAPS_API_KEY is configured — no code change, no
 * re-import of the deal.
 *
 * The slot is always the same size from `sm` up: a deal with no address, or
 * one whose picture 404s (nothing geocodes, every source failed), shows a
 * blank plate in its place rather than nothing — a row with a picture and a
 * row without used to start their names at different x, and a column of
 * names that does not line up reads as a mistake.
 *
 * Lazy by design: a long pipeline must not fire a geocode for every row the
 * reader never scrolls to.
 */
export function DealThumb({ dealId, hasAddress = true }: { dealId: string; hasAddress?: boolean }) {
  const [gone, setGone] = useState(false);
  if (!hasAddress || gone) {
    return (
      <span
        aria-hidden
        data-deal-thumb="blank"
        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-faint text-muted/60 sm:flex"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
        </svg>
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- proxied,
       auth-scoped route; next/image can't add anything over a route that
       already sets its own cache headers */
    <img
      src={`/api/deals/${dealId}/image?w=96&h=96`}
      alt=""
      aria-hidden
      data-deal-thumb="photo"
      width={96}
      height={96}
      loading="lazy"
      decoding="async"
      onError={() => setGone(true)}
      className="hidden h-9 w-9 shrink-0 rounded-md border border-line bg-faint object-cover sm:block"
    />
  );
}
