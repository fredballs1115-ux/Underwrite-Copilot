"use client";

import { useEffect, useRef, useState } from "react";
import type { DealCard } from "./(app)/deals/pipeline";

// The pipeline's card (deal-tile.tsx, with its banner, its cover drawing and
// its tags) is a chunk of its own on the homepage, asked for as the
// "Your pipeline" section nears the screen or a pointer or focus reaches it,
// as the walkthrough's tabs are (landing-interactive's `loadWalkthrough`):
// drawn in the page's first load it added about 100 KB of script to every
// visit for a card far down the page.
type Tile = typeof import("./(app)/deals/deal-tile");
let tile: Tile | null = null;
let tileLoad: Promise<Tile> | null = null;

/** Loads the card's module, once (exported for the render test). */
export function loadSampleTile(): Promise<Tile> {
  tileLoad ??= import("./(app)/deals/deal-tile").then((m) => (tile = m));
  return tileLoad;
}

/**
 * The sample's pipeline card on the homepage (app/sample-pipeline-card.tsx
 * builds it on the server): the pipeline's own `DealTilePreview` once its
 * chunk lands, and the card's shape in the site's shimmer until then,
 * hidden from a screen reader — the card arrives well before a reader
 * scrolling or tabbing down the page reaches it.
 */
export function SamplePipelineCardLazy({ card, today }: { card: DealCard; today: string }) {
  const [t, setT] = useState<Tile | null>(tile);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (t) return;
    let live = true;
    const load = () =>
      void loadSampleTile().then((m) => {
        if (live) setT(m);
      });
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        live = false;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [t]);

  if (t) {
    return (
      <t.DealTilePreview
        d={card}
        href="/demo"
        title="Open the sample deal"
        note="Sample deal"
        todayIso={today}
        className="grid w-full max-w-[20rem]"
        // Far down the page: no preload, no high priority, asked for as it
        // nears the screen.
        lazy
      />
    );
  }
  const want = () => void loadSampleTile().then((m) => setT(m));
  return (
    <div ref={box} onPointerEnter={want} className="w-full max-w-[20rem]" data-qa="sample-card-loading">
      <div aria-hidden className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="skeleton aspect-[16/10] w-full" />
        <div className="px-4 pt-3.5">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="skeleton h-2.5 w-10 rounded" />
              <div className="skeleton mt-1.5 h-4 w-14 rounded" />
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-faint/60 px-4 py-2">
          <div className="skeleton h-3 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}
