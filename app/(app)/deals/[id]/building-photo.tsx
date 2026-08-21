"use client";

import { useState } from "react";

// The deal's building photo (site-polish): Street View via our proxy route
// (key server-side, metadata-checked). The <img> 404s cleanly when there's
// no key or no imagery — onError collapses the block, leaving the existing
// address-only header exactly as it was. Required Google attribution renders
// ON the image, never cropped out.

export function BuildingPhoto({ dealId, alt }: { dealId: string; alt: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <figure className="relative mb-4 overflow-hidden rounded-xl border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
          auth-scoped, dynamically sized route; next/image adds nothing here */}
      <img
        src={`/api/deals/${dealId}/photo`}
        alt={alt}
        className="aspect-[16/9] w-full object-cover"
        loading="lazy"
        onError={() => setGone(true)}
      />
      <figcaption className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
        Street View imagery © Google
      </figcaption>
    </figure>
  );
}
