"use client";

import { useEffect, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from "react";

/**
 * Where a sideways scroller has more to show: before its left edge, past its
 * right. Null until the browser has measured it, so the server's markup and
 * the first frame agree; a caller decides what an unmeasured row shows.
 */
export type ScrollEdges = { before: boolean; after: boolean };

export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges | null {
  const [edges, setEdges] = useState<ScrollEdges | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { before: el.scrollLeft > 1, after: el.scrollLeft < max - 1 };
      setEdges((was) => (was && was.before === next.before && was.after === next.after ? was : next));
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    for (const child of Array.from(el.children)) ro?.observe(child);
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
    };
  }, [ref]);
  return edges;
}

/**
 * The drawn edge of a row that scrolls sideways: a fade into the row's own
 * background with a chevron pointing the way the rest lies. Drawn OVER the
 * row, never as a mask on it (a mask would clip a panel that opens out of
 * the row, and it fades the content to nothing, which reads as the end of
 * the row rather than more of it). Hidden from a screen reader, who meets
 * every item in the row in order whatever the scroll.
 */
export function EdgeFade({
  side,
  on,
  tone,
  tall = false,
  className = "",
}: {
  side: "start" | "end";
  on: boolean;
  /** the background the row sits on, as a CSS colour */
  tone: string;
  /** a table taller than a screen: the chevron rides at the middle of the
   *  window while the table passes, where centred in the table it sat a
   *  screen below the rows a reader was looking at */
  tall?: boolean;
  className?: string;
}) {
  const end = side === "end";
  const chevron = (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-muted ${end ? "" : "rotate-180"}`} fill="none">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <span
      aria-hidden
      data-edge-fade={side}
      className={`pointer-events-none absolute inset-y-0 flex w-8 transition-opacity duration-150 ${end ? "right-0" : "left-0"} ${
        tall ? `flex-col justify-start ${end ? "items-end" : "items-start"}` : `items-center ${end ? "justify-end" : "justify-start"}`
      } ${on ? "opacity-100" : "opacity-0"} ${className}`}
      style={{ backgroundImage: `linear-gradient(to ${end ? "right" : "left"}, transparent, ${tone} 70%)` }}
    >
      {tall ? (
        <span className="sticky top-[50vh] my-3 flex">{chevron}</span>
      ) : (
        chevron
      )}
    </span>
  );
}

/**
 * A wide table or row that scrolls sideways inside its card on a phone,
 * with its edges drawn where there is more to see (`EdgeFade`). A control
 * the keyboard lands on is scrolled clear of the fade (`scroll-px-8`).
 */
export function ScrollX({
  children,
  className = "",
  tone = "var(--color-surface)",
  tall = false,
  scrollRef,
}: {
  children: ReactNode;
  className?: string;
  /** the background the scroller sits on, as a CSS colour */
  tone?: string;
  /** a table that can run taller than a screen (`EdgeFade`'s `tall`) */
  tall?: boolean;
  /** the scroller, for a caller that moves it itself */
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const own = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? own;
  const edges = useScrollEdges(ref);
  const reveal = (e: FocusEvent<HTMLDivElement>) => {
    const strip = e.currentTarget;
    const target = e.target as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth || !target.matches(":focus-visible")) return;
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div className={`relative min-w-0 ${className}`}>
      <div ref={ref} onFocus={reveal} className="overflow-x-auto scroll-px-8">
        {children}
      </div>
      <EdgeFade side="start" on={!!edges?.before} tone={tone} tall={tall} />
      <EdgeFade side="end" on={!!edges?.after} tone={tone} tall={tall} />
    </div>
  );
}
