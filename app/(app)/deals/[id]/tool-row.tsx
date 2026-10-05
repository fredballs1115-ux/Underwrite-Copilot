"use client";

import type { FocusEvent, ReactNode } from "react";

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
 */
export function ToolRow({ row, children }: { row: "tools" | "controls"; children: ReactNode }) {
  const reveal = (e: FocusEvent<HTMLDivElement>) => {
    const strip = e.currentTarget;
    const target = e.target as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth || !target.matches(":focus-visible")) return;
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div data-hero-row={row} className={`relative min-w-0 max-sm:-m-1 ${row === "tools" ? "sm:contents" : "sm:ml-auto"}`}>
      <div onFocus={reveal} className="max-sm:overflow-x-auto max-sm:p-1 max-sm:scroll-pr-8 sm:contents">
        <div
          className={`flex items-center gap-2 max-sm:w-max max-sm:pr-8 ${
            row === "tools" ? "sm:contents" : "sm:flex-wrap sm:justify-end"
          }`}
        >
          {children}
        </div>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-r from-transparent to-[color-mix(in_oklab,var(--color-faint)_50%,var(--color-surface))] sm:hidden"
      />
    </div>
  );
}
