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
}: {
  sources: BannerSource[];
  /** the deal's name, for the picture's alt text */
  label: string;
  className?: string;
}) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setAt((i) => i + 1);
  }, [at]);

  const s = sources[at];
  if (!s) {
    return (
      <div
        aria-hidden
        data-deal-banner="blank"
        className={`flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed border-line bg-faint text-muted/60 ${className}`}
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
    <div className={`relative overflow-hidden rounded-lg bg-faint ${className}`} data-deal-banner={s.kind}>
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
          auth-scoped routes with their own cache headers; next/image adds
          nothing over them */}
      <img
        key={s.src}
        ref={ref}
        src={s.src}
        alt={alt}
        width={640}
        height={360}
        loading="lazy"
        decoding="async"
        onError={() => setAt((i) => i + 1)}
        className="aspect-[16/9] w-full object-cover"
      />
      <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white">
        {s.credit}
      </span>
    </div>
  );
}
