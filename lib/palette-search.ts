// What the ⌘K palette asks the server for (app/api/palette/route.ts). The
// palette read the fifty most recently updated deals and filtered them in
// the browser, so a deal updated fifty-one deals ago could not be found by
// any name. An empty query still lists the recent ones; a typed one
// searches every deal the reader can see on the server — by its name, its
// address and the file names of its documents (research pass 42: the field
// said "Search deals, addresses, documents…" while the server searched
// names alone, so an older deal was found by its address only if it was
// among the fifty) — and says how many matched where it lists fewer. Pure.

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

/** The call's dot on a deal's avatar, by the call on file. */
const CALL_DOT: Record<string, string> = {
  pass: "bg-pass",
  caution: "bg-caution",
  pass_on: "bg-kill",
};

/** A deal's latest run as the pipeline reads it (lib/screen-run
 *  `listJobStatus`): a live screen, one that stopped writing progress, or a
 *  failure that left the call behind. */
export type PaletteRun = "running" | "stalled" | "failed" | null;

/**
 * A deal's call in the palette, drawn the way the pipeline card draws it: a
 * failed or stalled run, or a screen still running, outranks the call on
 * file, which is the previous screen's — its dot is the run's, and the
 * row's hint says the run in the pipeline's own words (its CSV's: "Failed",
 * "Stalled", "Re-screening", "Screening"). The palette had drawn the call
 * on file whatever the run, the one list of calls that skipped
 * lib/screen-run.
 */
export function paletteCall(call: string | null, run: PaletteRun | undefined): { dot: string; word: string | null } {
  if (run === "failed") return { dot: "bg-kill", word: "Failed" };
  if (run === "stalled") return { dot: "bg-caution", word: "Stalled" };
  if (run === "running") return { dot: "pulse-bar bg-brand", word: call ? "Re-screening" : "Screening" };
  return { dot: (call ? CALL_DOT[call] : null) ?? "bg-line", word: null };
}

/** A deal a search matched, with what orders it. */
export type PaletteMatch = { id: string; updated_at: string | null };

/**
 * The deals several searches matched (by name, by address, by a document's
 * file name), each once, most recently updated first: the first `limit` ids
 * to show, and how many matched in all — the count the palette states where
 * it shows fewer.
 */
export function topMatches(lists: PaletteMatch[][], limit = PALETTE_LIMIT): { ids: string[]; total: number } {
  const all = uniqueById(...lists);
  all.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")) || a.id.localeCompare(b.id));
  return { ids: all.slice(0, limit).map((m) => m.id), total: all.length };
}

/** The line under a search's results where more deals matched than it
 *  lists, or null where it lists them all. */
export function paletteMoreLine(shown: number, total: number | null | undefined): string | null {
  if (total == null || total <= shown) return null;
  return `Listing the ${shown} most recently updated of the ${total.toLocaleString("en-US")} deals whose name, address or document name holds this — type more to narrow.`;
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
