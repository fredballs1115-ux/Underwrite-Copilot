// What the ⌘K palette asks the server for (app/api/palette/route.ts). The
// palette read the fifty most recently updated deals and filtered them in
// the browser, so a deal updated fifty-one deals ago could not be found by
// any name. An empty query still lists the recent ones; a typed one
// searches every deal the reader can see, by its name, on the server. Pure.

/** How many deals one answer carries — the recent list, or a search's. */
export const PALETTE_LIMIT = 50;

/** The longest query sent: a deal's name, never a paragraph. */
export const PALETTE_QUERY_MAX = 80;

/**
 * A typed query as an ILIKE pattern on a deal's name — "%text%" — or null
 * for a query with nothing in it. The text is trimmed and capped, and its
 * LIKE metacharacters are escaped with Postgres's default escape, the
 * backslash (`\` itself, `%`, `_`), so "50%" finds a "50%" and not every
 * name. PostgREST also turns every `*` in a like pattern into `%` before
 * Postgres sees it, escaped or not, so a `*` is sent as `_` — any one
 * character, the `*` included: it can never widen the search past one
 * character, and the palette's own filter keeps the names that hold the
 * text as typed.
 */
export function nameSearchPattern(query: string | null | undefined): string | null {
  const text = (query ?? "").trim().slice(0, PALETTE_QUERY_MAX).trim();
  if (!text) return null;
  const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "_");
  return `%${escaped}%`;
}

/** Whether the palette asks the server about a typed query: something is
 *  typed, and the recent list (`recentCount` deals, null before it loads)
 *  did not come back shorter than the limit — a short list already holds
 *  every deal the reader can see. */
export function asksServer(typed: string, recentCount: number | null): boolean {
  return typed.trim() !== "" && !(recentCount != null && recentCount < PALETTE_LIMIT);
}

/** The items of several lists, each id once, in the order first met — the
 *  recent deals, then what searches found beyond them. */
export function uniqueById<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
