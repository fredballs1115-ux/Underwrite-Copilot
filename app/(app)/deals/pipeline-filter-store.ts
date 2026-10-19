"use client";

import { useCallback, useSyncExternalStore } from "react";
import { filterQueryOf, withFilterQuery } from "@/lib/pipeline-filters";

/**
 * The pipeline's filters in the page's address, the way /tools keeps its
 * fields and the comps page its order (app/tools/deal-math-tools `useShared`,
 * app/(app)/comps/sales-list.tsx): `history.replaceState`, never the router
 * — no navigation, nothing rendered again on the server, and Back still
 * leaves the page — debounced, and every other parameter the page carries
 * (the brokerage, a new-deal nonce) kept as it is.
 *
 * Read through useSyncExternalStore, whose server snapshot is the filter
 * query the page read from its own searchParams (lib/pipeline-filters
 * `filterQueryOf`): the server's HTML and the browser's first render open on
 * the same filters, and window.location is never read while rendering on
 * the server. A choice not yet written is held here until the write, which
 * then hands the truth back to the address. The snapshot is the canonical
 * query string, a primitive, so an unchanged address is an unchanged
 * snapshot.
 */
let pending: string | undefined;
/** the page the pending choice belongs to: a write that lands after the
 *  reader has left for a deal never touches the deal's address */
let pendingPath: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Back and Forward move the address under the page.
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

function snapshot(): string {
  return pending ?? filterQueryOf(window.location.search);
}

function write() {
  timer = null;
  const query = pending;
  const path = pendingPath;
  pending = undefined;
  pendingPath = null;
  if (query === undefined || window.location.pathname !== path) {
    notify();
    return;
  }
  const next = withFilterQuery(window.location.search, query);
  window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`);
  notify();
}

/** The filter query as the page holds it, and a setter that takes the next
 *  query (or makes it from the one held now). */
export function useFilterQuery(fromServer: string): [string, (next: string | ((prev: string) => string)) => void] {
  const query = useSyncExternalStore(subscribe, snapshot, () => fromServer);
  const set = useCallback((next: string | ((prev: string) => string)) => {
    const value = typeof next === "function" ? next(snapshot()) : next;
    if (value === snapshot()) return;
    pending = value;
    pendingPath = window.location.pathname;
    notify();
    if (timer) clearTimeout(timer);
    // Debounced: a reader tapping through the rungs writes the last one.
    timer = setTimeout(write, 400);
  }, []);
  return [query, set];
}
