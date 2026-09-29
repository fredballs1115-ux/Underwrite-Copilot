"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** One picture the viewer can show: a view of the property at its size. */
export interface ViewerFrame {
  id: string;
  /** the view's name, as the filmstrip says it */
  label: string;
  /** the picture at the viewer's size */
  src: string;
  /** a layer drawn over it in the same frame (FEMA's zones), if any */
  over?: string;
  alt: string;
  /** who the picture is credited to, exactly as its view credits it */
  credit: string;
  /** the filmstrip's picture of the view, for the strip along the foot */
  thumb: string;
  /** the strip's layer over it, as the filmstrip draws it (FEMA's zones) */
  thumbOver?: string;
  /** a ring at the frame's centre: the building, on an overhead of a
   *  street address (never a neighbourhood placement's centre) */
  ring?: boolean;
}

/**
 * The building full screen (#445), the way a listing shows its photographs:
 * the deal page's picture opened over the page, one view at a time, at the
 * largest size the site holds it, with its credit under it, the arrows (and
 * a swipe on a phone) stepping between the views, and the views' own
 * pictures along the foot. Esc, the close button or a click on the dark
 * closes it and gives the focus back to what opened it; while it is open
 * the focus stays inside it and the page behind does not scroll.
 *
 * It draws only the views the page already has, each with the credit its
 * own view carries, so a picture never changes hands on the way in.
 */
export function PhotoViewer(props: ViewerProps) {
  // Over the whole page, whatever the picture sits inside: a transformed
  // ancestor would otherwise hold a fixed layer to its own box.
  return createPortal(<PhotoViewerBody {...props} />, document.body);
}

interface ViewerProps {
  frames: ViewerFrame[];
  /** which frame opens first */
  start?: number;
  /** what the dialog is called: the property's own line */
  title: string;
  onClose: () => void;
}

/** The viewer itself, drawn where the portal puts it (and where the render
 *  tests draw it, with no page to portal into). */
export function PhotoViewerBody({ frames, start = 0, title, onClose }: ViewerProps) {
  const [at, setAt] = useState(Math.min(Math.max(start, 0), frames.length - 1));
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeFrom = useRef<number | null>(null);

  // A picture that fails to load leaves the viewer rather than showing a
  // broken frame; the last one standing closes it.
  const shown = frames.filter((f) => !gone.has(f.id));
  const n = shown.length;
  const index = n > 0 ? Math.min(at, n - 1) : 0;
  const frame = shown[index];
  const step = (d: number) => setAt((i) => (n > 0 ? (Math.min(i, n - 1) + d + n) % n : 0));

  useEffect(() => {
    // Opened: the focus moves in and the page behind stops scrolling;
    // closed: both are given back as they were.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    if (n === 0) onClose();
  }, [n, onClose]);

  if (!frame) return null;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Tab") {
      // The focus stays inside the viewer while it is open.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  const fail = (id: string) => setGone((g) => new Set(g).add(id));

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-viewer-title"
      data-photo-viewer
      onKeyDown={onKeyDown}
      onTouchStart={(e) => {
        swipeFrom.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const from = swipeFrom.current;
        const to = e.changedTouches[0]?.clientX;
        swipeFrom.current = null;
        if (from == null || to == null || Math.abs(to - from) < 40) return;
        step(to < from ? 1 : -1);
      }}
      className="fixed inset-0 z-[60] flex flex-col text-white print:hidden"
    >
      {/* The dark behind the picture closes the viewer, as the palette's does. */}
      <button type="button" aria-label="Close the pictures" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/95" />

      <div className="relative flex items-center justify-between gap-3 px-4 py-3">
        <h2 id="photo-viewer-title" className="min-w-0 truncate text-sm font-semibold">
          {title}
        </h2>
        <p className="shrink-0 text-xs text-white/80" aria-live="polite">
          {frame.label} · {index + 1} of {n}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="h-4 w-4">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {/* Clicks around the picture fall through to the dark behind it. */}
      <div className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
        <figure className="pointer-events-auto relative m-0 flex max-h-full flex-col items-center">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- the view's own proxied route, with its own cache headers */}
            <img
              key={frame.id}
              src={frame.src}
              alt={frame.alt}
              data-viewer-frame={frame.id}
              onError={() => fail(frame.id)}
              className="block h-auto max-h-[calc(100dvh-11rem)] w-auto max-w-[calc(100vw-1rem)] rounded-md bg-white/5 object-contain sm:max-w-[calc(100vw-8rem)]"
            />
            {frame.over ? (
              // eslint-disable-next-line @next/next/no-img-element -- FEMA's zones, asked for the same frame
              <img
                key={`${frame.id}-over`}
                src={frame.over}
                alt=""
                aria-hidden
                onError={() => fail(frame.id)}
                className="pointer-events-none absolute inset-0 h-full w-full rounded-md"
              />
            ) : null}
            {frame.ring ? (
              <span
                aria-hidden
                data-picture="viewer-ring"
                className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35),0_1px_6px_rgba(0,0,0,0.45)]"
              />
            ) : null}
          </div>
          <figcaption className="mt-2 max-w-full truncate text-center text-[11px] text-white/80">{frame.credit}</figcaption>
        </figure>

        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous picture"
              className="pointer-events-auto absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:left-4"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next picture"
              className="pointer-events-auto absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:right-4"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

      {n > 1 ? (
        <div role="group" aria-label="Pictures" className="relative flex justify-center gap-2 overflow-x-auto px-4 pb-4 pt-2">
          {shown.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAt(i)}
              aria-pressed={i === index}
              aria-label={f.label}
              className={`relative h-12 w-20 shrink-0 overflow-hidden rounded-md border transition ${
                i === index ? "border-white ring-2 ring-white" : "border-white/20 opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the filmstrip's own URL, already cached by the page */}
              <img src={f.thumb} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
              {f.thumbOver ? (
                // eslint-disable-next-line @next/next/no-img-element -- the filmstrip's own layer, already cached
                <img src={f.thumbOver} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
