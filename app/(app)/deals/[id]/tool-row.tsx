"use client";

import { useRef, type FocusEvent, type ReactNode } from "react";
import { EdgeFade, useScrollEdges } from "@/app/edge-fade";

/**
 * One of the deal header's two toolbar groups — the deal's tools, then its
 * state (offers due, the stage, the menu). Below `sm` each is ONE row that
 * scrolls sideways, faded at its right edge as the section tabs are
 * (deal-view's tab strip, 1.75rem): the tools had wrapped to three rows and
 * each control taken a row of its own, 251px of a phone before the first
 * panel (research pass 36). From `sm` the rows dissolve back into the one
 * wrapping toolbar they were (`sm:contents`), box for box.
 *
 * Every control stays a Tab stop with its own name. Chrome's focus leaves a
 * control the row shows only in part where it is (the 1031 chip showed 44px
 * of itself on a 390px phone), so one the keyboard lands on is brought into
 * view clear of the fade — the row's own scroll padding (`scroll-pr-8`) —
 * and the last control clears it at the row's end (`pr-8`). Only a
 * keyboard's focus (`:focus-visible`): a tap that moved the row between
 * press and release would lose its click.
 *
 * The fade is drawn OVER the row, never as a mask on it: the share panel
 * and the deal's menu open out of these rows, and a mask would clip them,
 * as an overflow-hidden card would (DealHero's card has none for that
 * reason). On a phone each opens across its row instead — the row, outside
 * the scroller, is their containing block (ShareControl, DealActions) — so
 * the scroll does not cut them off either.
 *
 * The fade is the public pages' `EdgeFade` (app/edge-fade): a chevron in it
 * says there is more, and it goes once the row is scrolled to its end. The
 * right one shows until the browser has measured the row, as it always did.
 */
/** The header's toolbar background (`bg-faint/50` on a surface card). */
const ROW_TONE = "color-mix(in oklab, var(--color-faint) 50%, var(--color-surface))";

export function ToolRow({ row, children }: { row: "tools" | "controls"; children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(strip);
  const reveal = (e: FocusEvent<HTMLDivElement>) => {
    const strip = e.currentTarget;
    const target = e.target as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth || !target.matches(":focus-visible")) return;
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div data-hero-row={row} className={`relative min-w-0 max-sm:-m-1 ${row === "tools" ? "sm:contents" : "sm:ml-auto"}`}>
      <div ref={strip} onFocus={reveal} className="max-sm:overflow-x-auto max-sm:p-1 max-sm:scroll-pr-8 max-sm:scroll-pl-8 sm:contents">
        <div
          className={`flex items-center gap-2 max-sm:w-max max-sm:pr-8 ${
            row === "tools" ? "sm:contents" : "sm:flex-wrap sm:justify-end"
          }`}
        >
          {children}
        </div>
      </div>
      <EdgeFade side="start" on={!!edges?.before} tone={ROW_TONE} className="sm:hidden" />
      <EdgeFade side="end" on={edges ? edges.after : true} tone={ROW_TONE} className="sm:hidden" />
    </div>
  );
}
