"use client";

import { useEffect, useRef, useState } from "react";
import type { BannerSource } from "@/lib/deal-banner";
import type { DealCoverFacts } from "@/lib/deal-cover";
import { DealCover } from "./deal-cover";

/**
 * The building's picture at list-row size — its "logo", in the sense that
 * every deal is recognisable by the place it actually is.
 *
 * It tries the card's own pictures, best first, each pinned to one source
 * (`bannerSources` at the THUMB frame, lib/deal-banner): the building's own
 * photograph (the cover of its memorandum, or the picture the reader put on
 * the deal), then Street View where there's a key and Google has coverage.
 * It used to ask one route for "the best picture", which fell to the USGS
 * overhead for every deal without a photograph, so a reader on the list saw
 * a column of little maps (#442). Where no photograph answers, the deal's
 * cover (lib/deal-cover) holds the slot: its gradient and its building type,
 * never a map and never another building. A memorandum nobody has looked in
 * yet is searched over the cover, and its photograph fades in when found.
 *
 * A photograph shows only once it has loaded whole, fading in over the
 * deal's cover (#446), never half-drawn.
 *
 * The slot is always the same size — 56px on a phone, 48px from `sm` —
 * so the names down the list start at one x. Lazy, so a long pipeline asks
 * for no picture the reader never scrolls to. A picture that failed before
 * the page hydrated fired its `error` with no listener attached, so the
 * effect checks on mount: a finished load with no pixels is a failure too.
 */
export function DealThumb({
  sources,
  cover = null,
  label,
}: {
  sources: BannerSource[];
  /** the deal's cover, where no photograph answers */
  cover?: DealCoverFacts | null;
  /** the deal's name, for the picture's title */
  label: string;
}) {
  const lift = sources[0]?.pending ? sources[0] : null;
  const rest = lift ? sources.slice(1) : sources;
  const [at, setAt] = useState(0);
  // Which source has loaded whole: the picture fades in only then (#446).
  const [loaded, setLoaded] = useState<string | null>(null);
  const [lifted, setLifted] = useState<"trying" | "shown" | "gone">("trying");
  const ref = useRef<HTMLImageElement>(null);
  const liftRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    if (img.naturalWidth === 0) setAt((i) => i + 1);
    else setLoaded(img.currentSrc || img.src);
  }, [at]);
  useEffect(() => {
    const img = liftRef.current;
    if (img?.complete) setLifted(img.naturalWidth > 0 ? "shown" : "gone");
  }, []);

  const box = "relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg sm:h-12 sm:w-12";
  const base = rest[at];
  const baseLoaded = !!base && loaded !== null && loaded.endsWith(base.src);
  const shown = !!lift && lifted === "shown";
  const overlay = lift && lifted !== "gone" && (
    // eslint-disable-next-line @next/next/no-img-element -- the deal's own picture route, auth-scoped, with its own cache headers
    <img
      ref={liftRef}
      src={lift.src}
      alt=""
      aria-hidden
      title={shown ? `${label}: ${lift.credit}` : undefined}
      data-lift={lift.kind}
      width={96}
      height={96}
      loading="lazy"
      decoding="async"
      onLoad={() => setLifted("shown")}
      onError={() => setLifted("gone")}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
    />
  );

  if (!base && !shown) {
    if (cover) {
      return (
        <span aria-hidden data-deal-thumb="cover" className={box}>
          <DealCover cover={cover} label={label} size="thumb" className="h-full w-full" />
          {overlay}
        </span>
      );
    }
    return (
      <span
        aria-hidden
        data-deal-thumb="blank"
        className={`${box} flex items-center justify-center border border-dashed border-line bg-faint text-muted/60`}
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
        {overlay}
      </span>
    );
  }
  return (
    <span aria-hidden data-deal-thumb="photo" className={`${box} border border-line bg-faint`}>
      {/* The deal's cover holds the slot until the photograph has loaded
          whole (#446), so a row never shows a half-drawn picture. */}
      {cover ? <DealCover cover={cover} label={label} size="thumb" className="absolute inset-0 h-full w-full" /> : null}
      {base ? (
        /* eslint-disable-next-line @next/next/no-img-element -- proxied,
           auth-scoped routes with their own cache headers */
        <img
          key={base.src}
          ref={ref}
          src={base.src}
          alt=""
          title={shown ? undefined : `${label}: ${base.credit}`}
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          onLoad={(e) => setLoaded(e.currentTarget.currentSrc || e.currentTarget.src)}
          onError={() => setAt((i) => i + 1)}
          className={`relative h-full w-full object-cover transition-opacity duration-500 ${baseLoaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {overlay}
    </span>
  );
}
