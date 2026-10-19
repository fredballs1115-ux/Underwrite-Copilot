// One query parameter of the /comps page kept in its address, the way /tools
// keeps its fields (app/tools/deal-math-tools `useShared`):
// `history.replaceState`, never the router — no navigation, nothing
// re-rendered on the server, and Back still leaves the page — debounced, and
// every other parameter the page carries (the address, the radius, the
// window, the class, the list's order or the sales left out) kept as it is.
//
// Read through useSyncExternalStore, whose server snapshot is the value the
// page handed down from its own searchParams: the server's HTML and the
// browser's first render agree, and window.location is never read while
// rendering on the server. A value not yet written is held here until the
// write, which then hands the truth back to the address. Imported only by the
// page's client components (./sales-list, ./comps-readout).

import { useSyncExternalStore } from "react";

export interface AddressParam {
  subscribe: (fn: () => void) => () => void;
  snapshot: () => string | null;
  /** null takes the parameter off the link */
  set: (value: string | null) => void;
}

/** A store for one parameter; made once per module, so every list on the
 *  page reads the one value. */
export function addressParam(name: string, debounceMs = 400): AddressParam {
  // undefined: nothing waiting to be written; null: the parameter's removal
  let pending: string | null | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const write = () => {
    timer = null;
    if (pending === undefined) return;
    const q = new URLSearchParams(window.location.search);
    if (pending === null) q.delete(name);
    else q.set(name, pending);
    const query = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    pending = undefined;
  };
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot() {
      if (pending !== undefined) return pending;
      return new URLSearchParams(window.location.search).get(name);
    },
    set(value) {
      pending = value;
      for (const fn of listeners) fn();
      if (timer) clearTimeout(timer);
      // Debounced: a reader clicking through the choices writes the last one.
      timer = setTimeout(write, debounceMs);
    },
  };
}

/** The parameter's value, the server's own on the server and on the first
 *  render, the address's after; and its setter. */
export function useAddressParam(param: AddressParam, fromServer: string | null): [string | null, (value: string | null) => void] {
  const raw = useSyncExternalStore(param.subscribe, param.snapshot, () => fromServer);
  return [raw, param.set];
}
