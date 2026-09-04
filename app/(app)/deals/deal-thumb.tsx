"use client";

import { useState } from "react";

/**
 * A real aerial photograph of the deal's site, at list-row size.
 *
 * The pipeline was 100% text — every row identical, nothing to recognise a
 * deal by. This is the smallest honest fix: the actual site, not an icon
 * standing in for one. Served by /api/deals/[id]/aerial (USGS, public domain,
 * no API key), which 404s when the deal has no address or nothing geocodes —
 * and then this collapses to nothing rather than to a placeholder graphic.
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
      src={`/api/deals/${dealId}/aerial?w=96&h=96`}
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
