"use client";

import { useEffect, useRef } from "react";
import { MODAL_SELECTOR, orderJson, pipelineKeyAction, pipelineOrderKey, stepFrom } from "@/lib/shortcuts";

/**
 * The pipeline's keys (lib/shortcuts lists them): "/" to the search, "n" a
 * new deal, Escape closes the new-deal form, and "j" / "k" move a visible
 * focus through the cards or the rows in the order they are shown — the
 * deal's own link takes the focus, so its ring is the card's or the row's
 * own and Enter opens the deal (in compare mode the card's button takes it,
 * and Enter picks the deal). None of them fire while typing in a field,
 * inside a dialog or with a modal open, or with a modifier held.
 */
export function usePipelineKeys(opts: {
  onSearch: () => void;
  onNew: () => void;
  onEscape: () => void;
  /** a new deal can be started (not at the free plan's limit) */
  canNew: boolean;
}) {
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = latest.current;
      const action = pipelineKeyAction(e, { modalOpen: !!document.querySelector(MODAL_SELECTOR), canNew: o.canNew });
      if (action === "escape") {
        o.onEscape();
      } else if (action === "search") {
        e.preventDefault();
        o.onSearch();
      } else if (action === "new") {
        e.preventDefault();
        o.onNew();
      } else if (action === "next" || action === "previous") {
        if (stepDealFocus(action === "next" ? 1 : -1)) e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The deals' own controls, as the page shows them: a folded stage draws
 *  none, and the map view draws no card or row. */
function shownDealControls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-deal-nav]")].filter((el) => el.getClientRects().length > 0);
}

/** One deal along from the one in focus (the first where none is), its
 *  control focused and scrolled into view. False where none is shown. */
function stepDealFocus(delta: 1 | -1): boolean {
  const controls = shownDealControls();
  const active = document.activeElement;
  // The focus may sit on another control of the same deal (its photo
  // arrows): that deal is the one to step from.
  const holder = active instanceof Element ? active.closest("[data-deal-tile],[data-deal-row]") : null;
  const current = controls.findIndex((el) => el === active || (holder !== null && holder.contains(el)));
  const next = stepFrom(current, controls.length, delta);
  if (next == null) return false;
  const el = controls[next];
  el.focus({ preventScroll: true });
  // The page's own scroll-behavior decides smooth or not (globals.css keeps
  // it instant for a reader who asked for less motion), and its scroll
  // padding keeps the card clear of the bars that stay on screen.
  el.scrollIntoView({ block: "nearest" });
  return true;
}

/**
 * Keeps the order the pipeline shows — its filters and sort applied, a stage
 * after a stage — in the tab's session, so the deal page's "[" and "]" step
 * through it without a read of their own. A browser that keeps no storage
 * keeps no order, and the deal page's keys do nothing. The order is kept
 * under the reader's own id (`pipelineOrderKey`), so another account signed
 * in later in the same tab never steps through it; with no reader known,
 * none is kept.
 */
export function useKeepShownOrder(ids: readonly string[], viewerId: string | null | undefined) {
  const key = ids.join(",");
  const storeKey = pipelineOrderKey(viewerId);
  useEffect(() => {
    if (!storeKey) return;
    try {
      sessionStorage.setItem(storeKey, orderJson(key ? key.split(",") : []));
    } catch {
      // storage unavailable — no order kept
    }
  }, [key, storeKey]);
}
