"use client";

import { useEffect, useState } from "react";
import { DealAvatar } from "@/app/(app)/deal-avatar";

/**
 * The deal, kept in view (#437). Once the header's name, call and figures
 * (`DealHero`'s facts block) scroll away, a slim bar holds the building's
 * picture, its name, the call and the two figures the deal is read by — the
 * way a listing keeps its price and its address in reach once its
 * photographs are behind the reader — and its name takes the reader back to
 * the top. At the top of the window on a wide screen; at the foot on a
 * phone, clear of the app's own sticky top bar and under the thumb.
 *
 * It watches the facts block (`data-deal-hero-facts`) with an
 * IntersectionObserver, never the whole header: the deal-kind panels sit
 * inside the header, so a hotel sold at auction, five panels deep, kept the
 * bar hidden for 2,800px of a phone after its figures had gone (research
 * pass 36). It
 * shows once the block is ABOVE what the reader can see — under a phone's
 * own top bar counts as gone — and never while the block is still below the
 * fold, as on a short landscape screen. In view, the bar hides; hidden, it
 * is inert and out of the accessibility tree, so a screen reader or a Tab
 * key never meets a second copy of the header.
 */
export function DealStickyBar({
  dealId,
  name,
  chip,
  figures,
}: {
  dealId: string;
  name: string;
  /** the call, in the header's own colours; `note` where it is the
   *  previous screen's (a re-screen running, or one that failed first) */
  chip?: { label: string; cls: string; note?: string } | null;
  /** the price and the cap (or a plan deal's yield on cost), as the header
   *  prints them — a price range drawn short, the range as stated in its
   *  title (`priceFigureOf`) */
  figures: { label: string; value: string; title?: string }[];
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const facts = document.querySelector("[data-deal-hero-facts]");
    if (!facts || typeof IntersectionObserver === "undefined") return;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io?.disconnect();
      // The app's top bar (a phone's, `md:hidden`) covers the top of the
      // window: figures under it are out of sight already.
      const covered = Math.round(document.querySelector("[data-app-topbar]")?.getBoundingClientRect().height ?? 0);
      io = new IntersectionObserver(
        ([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? covered)),
        { rootMargin: `${-covered}px 0px 0px 0px`, threshold: 0 },
      );
      io.observe(facts);
    };
    watch();
    // The top bar comes and goes at `md`: measured again when the window
    // crosses it (a phone turned on its side).
    const wide = window.matchMedia?.("(min-width: 48rem)");
    wide?.addEventListener?.("change", watch);
    return () => {
      io?.disconnect();
      wide?.removeEventListener?.("change", watch);
    };
  }, []);

  return (
    <div
      data-deal-sticky
      aria-hidden={!shown}
      inert={!shown}
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 shadow-float backdrop-blur transition-transform duration-200 print:hidden md:bottom-auto md:left-60 md:top-0 md:border-b md:border-t-0 ${
        shown ? "translate-y-0" : "translate-y-full md:-translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-2 sm:px-8">
        <DealAvatar dealId={dealId} />
        <button
          type="button"
          // Focus goes to the deal's title as the page returns to it: the bar
          // turns inert once the header is back in view, and focus left in it
          // dropped to the page (research pass 33). A reader who asked for
          // less motion jumps rather than glides.
          onClick={() => {
            const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
            document.getElementById("deal-title")?.focus({ preventScroll: true });
          }}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-brand"
        >
          <span className="sr-only">Back to the top: </span>
          {name}
        </button>
        {chip ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`} title={chip.note}>
            {chip.label}
            {chip.note ? <span className="sr-only">, the previous screen&apos;s call</span> : null}
          </span>
        ) : null}
        {figures.map((f) => (
          <span key={f.label} className="hidden shrink-0 items-baseline gap-1.5 text-xs md:inline-flex">
            <span className="text-muted">{f.label}</span>
            <span className="font-mono font-semibold tabular-nums" title={f.title}>
              {f.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
