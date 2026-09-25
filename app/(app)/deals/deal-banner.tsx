"use client";

import { useEffect, useRef, useState } from "react";
import type { BannerSource } from "@/lib/deal-banner";

/**
 * The building's picture at card size (#418) — the compare page's columns.
 *
 * The sources come from `bannerSources` (lib/deal-banner), each pinned to
 * one route, so the credit on the corner is exactly the picture on screen.
 * When one fails the next is tried and the credit follows it; when every
 * one has failed — or the deal has no address and no photograph — a blank
 * plate with the building mark holds the slot, so the columns keep their
 * shape rather than starting their names at different heights.
 *
 * A picture that failed before the page hydrated fired its `error` event
 * with no listener attached, so the effect checks on mount (and after each
 * switch): a finished load with no pixels is a failure too.
 */
export function DealBanner({
  sources,
  label,
  className = "",
  aspect = "16/9",
  flush = false,
  sizes,
  shade = false,
}: {
  sources: BannerSource[];
  /** the deal's name, for the picture's alt text */
  label: string;
  className?: string;
  /** the frame's shape: the compare page's columns are 16:9, the
   *  pipeline's cards 16:10 (#428) */
  aspect?: "16/9" | "16/10";
  /** inside a card that rounds its own corners: no rounding, no border */
  flush?: boolean;
  /** the <img>'s sizes hint, where the surface knows its column width */
  sizes?: string;
  /** a soft shade across the top of a picture, under the chips a card sets
   *  there, so a white roof never swallows them — over a picture only,
   *  never over the blank plate */
  shade?: boolean;
}) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setAt((i) => i + 1);
  }, [at]);

  const s = sources[at];
  const shape = aspect === "16/10" ? "aspect-[16/10]" : "aspect-[16/9]";
  if (!s) {
    return (
      <div
        aria-hidden
        data-deal-banner="blank"
        className={`flex ${shape} items-center justify-center ${
          flush ? "" : "rounded-lg border border-dashed border-line"
        } bg-faint text-muted/60 ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
        </svg>
      </div>
    );
  }
  const alt =
    s.kind === "photo"
      ? `Photograph of ${label}`
      : s.kind === "streetview"
        ? `Street view of ${label}`
        : `Aerial photograph of ${label}`;
  return (
    <div className={`relative overflow-hidden ${flush ? "" : "rounded-lg"} bg-faint ${className}`} data-deal-banner={s.kind}>
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
          auth-scoped routes with their own cache headers; next/image adds
          nothing over them */}
      <img
        key={s.src}
        ref={ref}
        src={s.src}
        alt={alt}
        width={640}
        height={aspect === "16/10" ? 400 : 360}
        sizes={sizes}
        loading="lazy"
        decoding="async"
        onError={() => setAt((i) => i + 1)}
        className={`${shape} w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]`}
      />
      {shade && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/30 to-transparent" />
      )}
      {s.marker && (
        // The building, at the overhead's centre: a white ring with a dark
        // halo, legible over a roof or a road alike.
        <span
          aria-hidden
          data-picture="banner-pin"
          className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35),0_1px_6px_rgba(0,0,0,0.45)]"
        >
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </span>
      )}
      <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white">
        {s.credit}
      </span>
    </div>
  );
}
