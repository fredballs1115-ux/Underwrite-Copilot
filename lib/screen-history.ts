// Every screen kept (the owner's decision of 2026-10-21, migration 0038).
//
// deals.prior_screen holds ONE earlier screen and a re-screen writes over it,
// so a third re-screen could drop a row the track record had already scored
// against the first. Each re-screen now also appends the screen it replaces
// to `screen_snapshots` — the same shape prior_screen holds ({ at, extraction,
// verdict, challenges }), one row a screen, unique by the deal and the
// verdict's own stamp — and the track record (lib/track-record `scoreDeal`'s
// `priorScreens`) scores every kept screen.
//
// The code works before the migration runs: a write is best-effort (an error
// — the table not made yet — is logged and ignored, never failing a screen),
// and a read that fails reads as no kept screens, so the record falls back to
// deals.prior_screen alone, as before.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriorScreenLike } from "@/lib/track-record";

export const SCREEN_SNAPSHOTS = "screen_snapshots";

/** The columns a read takes: the kept screen's verdict and challenges, never
 *  its extraction, which the track record does not read. */
export const SCREEN_SNAPSHOT_SELECT = "deal_id, verdict_at, verdict:snapshot->verdict, challenges:snapshot->challenges";

/** What a re-screen keeps of the screen it replaces (deals.prior_screen's
 *  shape). */
export interface KeptScreen {
  at: string;
  extraction: unknown;
  verdict: unknown;
  challenges: unknown;
}

/** The row to append for a kept screen: null where its verdict carries no
 *  stamp of its own, which no record can set evidence after. */
export function screenSnapshotRow(dealId: string, kept: KeptScreen): { deal_id: string; verdict_at: string; snapshot: KeptScreen } | null {
  const stamp = (kept.verdict as { generatedAt?: unknown } | null | undefined)?.generatedAt;
  if (typeof stamp !== "string" || !Number.isFinite(Date.parse(stamp))) return null;
  return { deal_id: dealId, verdict_at: stamp, snapshot: kept };
}

/**
 * Append a kept screen, best-effort: a retry of the same screen is ignored
 * (unique by the deal and the verdict's stamp), and any error — the table not
 * made yet among them — is logged and swallowed. Says whether it was written.
 */
export async function keepScreen(client: Pick<SupabaseClient, "from">, dealId: string, kept: KeptScreen): Promise<boolean> {
  const row = screenSnapshotRow(dealId, kept);
  if (!row) return false;
  try {
    const { error } = await client.from(SCREEN_SNAPSHOTS).upsert(row, { onConflict: "deal_id,verdict_at", ignoreDuplicates: true });
    if (error) {
      console.warn(`[screen-history] the screen of ${row.verdict_at} on deal ${dealId} was not kept: ${(error as { message?: string }).message ?? "unknown error"}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[screen-history] the screen of ${row.verdict_at} on deal ${dealId} was not kept: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** A kept screen as read back (`SCREEN_SNAPSHOT_SELECT`). */
export interface KeptScreenRow {
  deal_id: string;
  verdict_at?: string | null;
  verdict?: unknown;
  challenges?: unknown;
}

/** A kept screen as the track record reads it; null where it is not one. */
export function priorScreenOf(row: KeptScreenRow | null | undefined): PriorScreenLike | null {
  if (!row || !row.verdict || typeof row.verdict !== "object") return null;
  return {
    verdict: row.verdict as PriorScreenLike["verdict"],
    challenges: row.challenges && typeof row.challenges === "object" ? (row.challenges as PriorScreenLike["challenges"]) : null,
  };
}

/** The kept screens by deal, each deal's in the order read. */
export function keptScreensByDeal(rows: readonly KeptScreenRow[] | null | undefined): Map<string, PriorScreenLike[]> {
  const out = new Map<string, PriorScreenLike[]>();
  for (const row of rows ?? []) {
    const prior = priorScreenOf(row);
    if (!prior) continue;
    const list = out.get(row.deal_id) ?? [];
    list.push(prior);
    out.set(row.deal_id, list);
  }
  return out;
}

/** One deal's kept screens, best-effort: none where the table cannot be read
 *  (not made yet), so the record reads deals.prior_screen alone. */
export async function readKeptScreens(client: Pick<SupabaseClient, "from">, dealId: string): Promise<PriorScreenLike[]> {
  try {
    const { data, error } = await client.from(SCREEN_SNAPSHOTS).select(SCREEN_SNAPSHOT_SELECT).eq("deal_id", dealId).order("verdict_at", { ascending: false }).limit(500);
    if (error || !data) return [];
    return keptScreensByDeal(data as unknown as KeptScreenRow[]).get(dealId) ?? [];
  } catch {
    return [];
  }
}
