"use client";

import { useState } from "react";

/**
 * The building from above, at the top of the shared screen. Served by the
 * token-scoped /api/share/[token]/aerial, which answers 404 when the link
 * is dead, the deal has no address, or nothing frames — then the whole
 * figure removes itself (caption included), the rule `DealThumb` and
 * `AerialImg` apply, so the reader never meets a broken-image glyph or a
 * credit line under an empty frame.
 */
export function ShareAerial({ src, place }: { src: string; place: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-line bg-faint">
      {/* eslint-disable-next-line @next/next/no-img-element -- a proxied
          route that sets its own cache headers; next/image would add a
          second cache layer over it */}
      <img
        src={src}
        alt={`Aerial view of ${place}`}
        width={960}
        height={400}
        decoding="async"
        onError={() => setGone(true)}
        className="aspect-[12/5] w-full object-cover"
      />
      <figcaption className="px-3 py-1.5 text-[11px] text-muted">
        {place} · aerial imagery: USGS The National Map (public domain)
      </figcaption>
    </figure>
  );
}
