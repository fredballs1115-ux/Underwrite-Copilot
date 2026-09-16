"use client";

import { useState } from "react";

/**
 * A photograph that knows how to be absent. The imagery route answers 404
 * when no source can produce the picture (no key, a provider down, a
 * place it cannot frame); a plain <img> would then paint the browser's
 * broken-image glyph and its alt text across the tile. This one removes
 * itself, and the tile's label and background carry on — the same rule
 * `DealThumb` applies to a pipeline row's thumbnail.
 */
export function AerialImg({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a proxied route
       that sets its own immutable cache headers; next/image would add a
       second cache layer over it */
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setGone(true)}
      className={className}
    />
  );
}
