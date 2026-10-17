/**
 * The market memory's one read (research pass 42, H5): the deals the reader
 * screened themselves — never a teammate's, never another account's (row-level
 * security also hands over a team's deals, so the user filter is what keeps
 * the memory private) — every one, newest first, a page at a time.
 *
 * Two surfaces count from it: /market's "Your market data" (every market ×
 * class group) and the deal page's "From your past screens" strip (one deal's
 * group). They had read it two ways — the newest 500, and up to 1,000 in no
 * order — so between 500 and 1,000 screens the two pages stated two counts
 * for one market, and past 1,000 the strip's was an arbitrary subset's. Both
 * now read the same set: /market in full, the strip by a light read of every
 * screen's keys and then its group's rows a hundred ids a request.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll, readAllResult, readByIds } from "@/lib/read-all";
import { memoryCandidates, type buildComps, type MemoryKeyRow } from "@/lib/market-memory";

/** A screened deal as the memory reads it: its figures and its kind. */
export type MemoryDealRow = Parameters<typeof buildComps>[0][number];

/** The columns the memory reads of a deal in full (the first signal too:
 *  each deal's kind is read with it, as on its own page). */
const MEMORY_COLUMNS = "id, name, asset_class, created_at, is_sample, verdict, extraction, first_signal";

/** One page of a read, as lib/read-all takes it. */
type Page = PromiseLike<{ data: unknown[] | null; error: unknown }>;

/** The reader's own screened deals, the one filter both reads share, newest
 *  first with the id as the tie-break so the pages neither overlap nor skip. */
function ownScreens(supabase: SupabaseClient, userId: string, columns: string, from: number, to: number): Page {
  return supabase
    .from("deals")
    .select(columns)
    .eq("user_id", userId)
    .not("extraction", "is", null)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
}

/** Every screened deal of the reader's own, in full — /market's memory — or
 *  none and the failed page's error, whose words the page reads (a missing
 *  table is a setup, anything else an outage). */
export async function readMarketMemory(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: MemoryDealRow[] | null; error: { message: string } | null }> {
  const { data, error } = await readAllResult((from, to) => ownScreens(supabase, userId, MEMORY_COLUMNS, from, to));
  return {
    data: data as MemoryDealRow[] | null,
    error: error ? { message: String((error as { message?: unknown }).message ?? error) } : null,
  };
}

/** Every screened deal of the reader's own, its keys alone (the class and the
 *  market) — the light read the deal page's strip starts from. */
export async function readMemoryKeys(supabase: SupabaseClient, userId: string): Promise<MemoryKeyRow[] | null> {
  return (await readAll((from, to) =>
    ownScreens(supabase, userId, "id, asset_class, is_sample, market:extraction->>market, ext_class:extraction->>assetClass", from, to),
  )) as MemoryKeyRow[] | null;
}

/** One deal's (class × market) group of the reader's own screens, in full:
 *  the ids found in `keys` (lib/market-memory `memoryCandidates`), read a
 *  hundred a request. Null where a read failed. */
export async function readMemoryGroup(
  supabase: SupabaseClient,
  keys: readonly MemoryKeyRow[],
  dealId: string,
  assetClass: string,
  market: string,
): Promise<MemoryDealRow[] | null> {
  const ids = memoryCandidates(keys, dealId, assetClass, market);
  if (ids.length === 0) return [];
  return (await readByIds(ids, (chunk): Page => supabase.from("deals").select(MEMORY_COLUMNS).in("id", chunk))) as MemoryDealRow[] | null;
}
