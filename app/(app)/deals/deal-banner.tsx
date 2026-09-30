"use client";

import { useEffect, useRef, useState } from "react";
import type { BannerSource } from "@/lib/deal-banner";
import type { DealCoverFacts } from "@/lib/deal-cover";
import { DealCover } from "./deal-cover";
import { MarketCaption } from "./market-caption";
import { previewStyle } from "@/lib/photo-preview";
import { focusStyle } from "@/lib/photo-focus";

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
 *
 * A market photograph (#438, the pipeline's cards only) names its market on
 * the picture, over a shade at the foot, with its photographer and licence:
 * it is the place the deal is in, never passed off as the building.
 *
 * A photograph not yet looked for in the deal's memorandum (`pending`,
 * #440) is asked for over the next picture and fades in when it loads.
 *
 * Where the surface passes a `cover` (the pipeline, #442), the deal's cover
 * takes the blank plate's place: its gradient, its building type, its place.
 *
 * A picture shows only once it has loaded whole (#446), fading in over the
 * deal's cover without its words (or the plain plate): a photograph drawn
 * as it arrives shows its progressive scans, blurred, and a slow one an
 * empty frame, where a listing's cards never show either. The first cards
 * on the page (`priority`) are asked for at once and ahead of the rest.
 *
 * Over the deal's own photograph, the card counts the photographs its deal
 * page holds (`photos`, #448) — the cover and the memorandum's others —
 * the way a listing's card says there are more inside.
 *
 * And the card flips through them (#450, `slides` and `slide`, the card's
 * own arrows and swipe): the photograph asked for is laid over the lead
 * one and fades in once whole, credited with its own page; one that fails
 * leaves the lead photograph on screen. The card is told whether the
 * deal's own photograph is the picture on screen (`onPhoto`), so it offers
 * the others only over it.
 *
 * The card crops every photograph to its shape, so a stored one with a
 * point of interest (lib/photo-focus) is held there, its preview with it,
 * rather than at its centre.
 */
export function DealBanner({
  sources,
  label,
  className = "",
  aspect = "16/9",
  flush = false,
  sizes,
  shade = false,
  cover = null,
  priority = false,
  photos = 0,
  slides = [],
  slide = 0,
  onPhoto,
  onSlideGone,
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
  /** what the frame shows when no picture is left: the deal's cover
   *  (lib/deal-cover) where the surface has one, the blank plate otherwise */
  cover?: DealCoverFacts | null;
  /** one of the first cards on screen: fetched at once, ahead of the rest */
  priority?: boolean;
  /** how many photographs the deal page holds, counted over the deal's own
   *  photograph where there is more than one */
  photos?: number;
  /** the deal's other photographs, each pinned to its route with its own
   *  credit, shown over its own photograph when `slide` asks (#450) */
  slides?: BannerSource[];
  /** which photograph to show: 0 the lead one, n the nth of `slides` */
  slide?: number;
  /** told whether the deal's own photograph is the picture on screen */
  onPhoto?: (shown: boolean) => void;
  /** told of another photograph that failed to load, by its route */
  onSlideGone?: (src: string) => void;
}) {
  // A photograph nobody has looked for yet (`pending`, #440) is asked for
  // OVER the next picture, which shows at once; it fades in the moment it
  // loads and is dropped if there is none. The memorandum is searched while
  // the reader looks at the market or the site, never at an empty frame.
  const lift = sources[0]?.pending ? sources[0] : null;
  const rest = lift ? sources.slice(1) : sources;
  const [at, setAt] = useState(0);
  // Which source has loaded whole: the picture fades in only then.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [lifted, setLifted] = useState<"trying" | "shown" | "gone">("trying");
  const ref = useRef<HTMLImageElement>(null);
  const liftRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A picture that settled before hydration fired its event unheard.
    const img = ref.current;
    if (!img?.complete) return;
    if (img.naturalWidth === 0) setAt((i) => i + 1);
    else setLoaded(img.currentSrc || img.src);
  }, [at]);
  useEffect(() => {
    // A picture that settled before hydration fired its event unheard.
    const img = liftRef.current;
    if (img?.complete) setLifted(img.naturalWidth > 0 ? "shown" : "gone");
  }, []);
  // The other photographs (#450): which has loaded whole, and which failed.
  const [slideLoaded, setSlideLoaded] = useState<string | null>(null);
  const [slideGone, setSlideGone] = useState<ReadonlySet<string>>(new Set());
  const photoOnScreen = (lifted === "shown" ? lift : rest[at])?.kind === "photo";
  useEffect(() => {
    onPhoto?.(photoOnScreen);
  }, [photoOnScreen, onPhoto]);

  const base = rest[at];
  const baseLoaded = !!base && loaded !== null && loaded.endsWith(base.src);
  const shown = !!lift && lifted === "shown";
  const trying = !!lift && lifted === "trying";
  const shape = aspect === "16/10" ? "aspect-[16/10]" : "aspect-[16/9]";
  const altOf = (s: BannerSource) =>
    s.alt ??
    (s.kind === "photo"
      ? `Photograph of ${label}`
      : s.kind === "streetview"
        ? `Street view of ${label}`
        : `Aerial photograph of ${label}`);
  const overlay = lift && (trying || shown) && (
    // eslint-disable-next-line @next/next/no-img-element -- the deal's own picture route, auth-scoped, with its own cache headers
    <img
      ref={liftRef}
      src={lift.src}
      alt={shown ? altOf(lift) : ""}
      aria-hidden={shown ? undefined : true}
      data-lift={lift.kind}
      width={640}
      height={aspect === "16/10" ? 400 : 360}
      sizes={sizes}
      loading="lazy"
      decoding="async"
      onLoad={() => setLifted("shown")}
      onError={() => setLifted("gone")}
      className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out motion-safe:group-hover:scale-[1.03] ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    />
  );

  if (!base && !shown && cover) {
    // The deal's cover (#442): never a map, never another building. A
    // memorandum's photograph still being looked for is asked for over it.
    return (
      <div className={`relative ${flush ? "" : "overflow-hidden rounded-lg"} ${className}`} data-deal-banner="cover">
        <DealCover cover={cover} label={label} className={`${shape} w-full`} />
        {overlay}
      </div>
    );
  }
  if (!base && !shown) {
    return (
      <div
        aria-hidden={overlay ? undefined : true}
        data-deal-banner="blank"
        className={`relative flex ${shape} items-center justify-center overflow-hidden ${
          flush ? "" : "rounded-lg border border-dashed border-line"
        } bg-faint text-muted/60 ${className}`}
      >
        <svg
          aria-hidden
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
        {overlay}
      </div>
    );
  }
  // The picture on screen, whose credit and caption the card wears: the
  // lifted photograph once it has loaded, the next picture until then.
  const onScreen = shown ? lift! : base!;
  // The other photograph asked for (#450), over the deal's own photograph
  // only; its credit once it is whole on screen.
  const asked = !shown && onScreen.kind === "photo" && slide > 0 ? (slides[slide - 1] ?? null) : null;
  const other = asked && !slideGone.has(asked.src) ? asked : null;
  const otherLoaded = !!other && slideLoaded === other.src;
  const credit = other && otherLoaded ? other.credit : onScreen.credit;
  return (
    <div
      className={`relative overflow-hidden ${flush ? "" : "rounded-lg"} bg-faint ${className}`}
      data-deal-banner={onScreen.kind}
    >
      {/* What holds the frame while the picture loads: the photograph's own
          blur-up preview where the cache has one (#463) — its colours at
          once, the way a listing's card arrives — else the deal's cover,
          without its words, or the plain plate. */}
      {base?.preview ? (
        <span aria-hidden data-preview="banner" className="absolute inset-0" style={previewStyle(base.preview, base.focus)} />
      ) : cover ? (
        <DealCover cover={cover} label={label} words={false} className="absolute inset-0 h-full w-full" />
      ) : null}
      {base ? (
        /* eslint-disable-next-line @next/next/no-img-element -- proxied,
           auth-scoped routes with their own cache headers; next/image adds
           nothing over them */
        <img
          key={base.src}
          ref={ref}
          src={base.src}
          alt={shown ? "" : altOf(base)}
          aria-hidden={shown ? true : undefined}
          width={640}
          height={aspect === "16/10" ? 400 : 360}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onLoad={(e) => setLoaded(e.currentTarget.currentSrc || e.currentTarget.src)}
          onError={() => setAt((i) => i + 1)}
          // The card crops the photograph: held at its subject, not its centre.
          style={focusStyle(base.focus)}
          className={`relative ${shape} w-full object-cover transition-[opacity,transform] duration-500 ease-out motion-safe:group-hover:scale-[1.03] ${
            baseLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : (
        <span aria-hidden className={`block ${shape} w-full`} />
      )}
      {other ? (
        /* eslint-disable-next-line @next/next/no-img-element -- the deal's own picture route, auth-scoped */
        <img
          key={other.src}
          src={other.src}
          alt={otherLoaded ? (other.alt ?? `Photograph of ${label}`) : ""}
          aria-hidden={otherLoaded ? undefined : true}
          data-slide={slide}
          width={640}
          height={aspect === "16/10" ? 400 : 360}
          sizes={sizes}
          decoding="async"
          onLoad={() => setSlideLoaded(other.src)}
          onError={() => {
            setSlideGone((g) => new Set(g).add(other.src));
            onSlideGone?.(other.src);
          }}
          style={focusStyle(other.focus)}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out motion-safe:group-hover:scale-[1.03] ${
            otherLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
      {overlay}
      {shade && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/30 to-transparent" />
      )}
      {onScreen.marker && (
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
      {onScreen.kind === "photo" && photos > 1 ? (
        <span
          data-picture="photo-count"
          className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3 w-3">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {other ? (
            <span>{`${slide + 1} / ${photos}`}</span>
          ) : (
            <>
              <span>{photos}</span>
              <span className="sr-only">{" photographs"}</span>
            </>
          )}
        </span>
      ) : null}
      {onScreen.kind === "market" && onScreen.market ? (
        // The market's photograph (#438) says so on its face: the market
        // named over a shade at the foot, so a skyline never passes for the
        // building, and its photographer and licence beside it.
        <MarketCaption market={onScreen.market} credit={onScreen.credit} />
      ) : (
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white">
          {credit}
        </span>
      )}
    </div>
  );
}
