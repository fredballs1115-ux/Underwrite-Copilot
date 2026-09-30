"use client";

import { useEffect, useRef, useState } from "react";
import { photoStyle } from "@/lib/photo-preview";
import type { PhotoFocus } from "@/lib/photo-focus";

/** One way to picture the building on the shared screen, pinned to one
 *  token-scoped route, with the credit that route's picture carries. */
export interface SharePictureSource {
  kind: "photo" | "aerial";
  src: string;
  credit: string;
  /** the photograph's blur-up preview (#463): painted until it loads */
  preview?: string | null;
  /** where the photograph's subject is (lib/photo-focus): the strip crops
   *  it to 12:5, held there rather than at its centre */
  focus?: PhotoFocus | null;
}

/**
 * The building at the top of the shared screen (#434): its OWN photograph
 * where the deal has one — the cover of its memorandum, or the one the
 * sender put on the deal — and the aerial otherwise, the order the sender's
 * own deal page leads with. It had been the aerial alone, so a partner or a
 * lender opening the link met the roofs of the block while the sender was
 * looking at the building.
 *
 * Each source is served by its own token-scoped route (lib/share-resolve
 * behind both), so the credit under the frame is always exactly the picture
 * in it; a source that fails hands over to the next and the credit follows,
 * and when none loads the whole figure removes itself, caption included, so
 * the reader never meets a broken-image glyph or a credit under an empty
 * frame. A picture that failed before the page hydrated fired its `error`
 * with nobody listening, so the effect checks on mount (and after each
 * switch), as `DealBanner` does.
 */
export function SharePicture({ sources, place }: { sources: SharePictureSource[]; place: string }) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setAt((i) => i + 1);
  }, [at]);

  const s = sources[at];
  if (!s) return null;
  return (
    <figure data-share-picture={s.kind} className="mt-5 overflow-hidden rounded-2xl border border-line bg-faint">
      {/* eslint-disable-next-line @next/next/no-img-element -- a proxied
          route that sets its own cache headers; next/image would add a
          second cache layer over it */}
      <img
        key={s.src}
        ref={ref}
        src={s.src}
        alt={s.kind === "photo" ? `Photograph of ${place}` : `Aerial view of ${place}`}
        width={960}
        height={400}
        decoding="async"
        onError={() => setAt((i) => i + 1)}
        style={photoStyle(s.preview, s.focus)}
        className="aspect-[12/5] w-full object-cover"
      />
      <figcaption className="px-3 py-1.5 text-[11px] text-muted">
        {place} · {s.credit}
      </figcaption>
    </figure>
  );
}
