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
 * 404 (no address, nothing geocodes, every source failed) collapses this to
 * nothing rather than to a placeholder graphic.
 *
 * Lazy by design: a long pipeline must not fire a geocode for every row the
 * reader never scrolls to.
 */
export function DealThumb({ dealId }: { dealId: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- proxied,
       auth-scoped route; next/image can't add anything over a route that
       already sets its own cache headers */
    <img
      src={`/api/deals/${dealId}/image?w=96&h=96`}
      alt=""
      aria-hidden
      width={96}
      height={96}
      loading="lazy"
      decoding="async"
      onError={() => setGone(true)}
      className="hidden h-9 w-9 shrink-0 rounded-md border border-line bg-faint object-cover sm:block"
    />
  );
}
