import "server-only";
// The stored sample's writes (lib/sample-refresh): the fixture's rent roll
// and T-12 beside a sample row, and the whole fixture written again over a
// row whose edition is not the current one. Service-role writes — the
// actuals tables are user-read-only (migration 0020) — and every write is
// held to a row that IS a sample (`is_sample`). Best-effort and never
// throwing: a failed write leaves the next view to try again, and every
// reader of the row reads the fixture over it meanwhile (`currentSampleRow`).
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SAMPLE_EDITION, sampleActualsRows, sampleEditionOf, sampleFixtureColumns } from "@/lib/sample-refresh";

/** The few query shapes these writes make, so a test can hand in a fake. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SampleWriteClient = { from(table: string): any };

/** How long a page view waits for the rewrite before drawing on. */
export const SAMPLE_REFRESH_WAIT_MS = 4_000;

const ACTUALS = [
  { table: "deal_rent_rolls", row: () => sampleActualsRows().rentRoll },
  { table: "deal_t12_statements", row: () => sampleActualsRows().t12 },
] as const;

/**
 * The sample's rent roll and T-12 beside the deal. Where the deal has none,
 * the fixture's is added; with `rewrite`, the rows the seed wrote (those read
 * from no document of the reader's: `source_document_id` null) are written
 * again with the fixture's figures, so a fixture change reaches them. A row
 * the reader added from a document of their own is never touched. A read
 * that errors writes nothing (a pre-0020 schema leaves the sample OM-only).
 */
export async function syncSampleActuals(
  dealId: string,
  { rewrite = false, client }: { rewrite?: boolean; client?: SampleWriteClient } = {},
): Promise<void> {
  try {
    const admin = client ?? createSupabaseAdminClient();
    for (const { table, row } of ACTUALS) {
      if (rewrite) {
        const { data, error } = await admin
          .from(table)
          .update(row())
          .eq("deal_id", dealId)
          .is("source_document_id", null)
          .select("id");
        if (error) continue;
        if (Array.isArray(data) && data.length > 0) continue;
      }
      const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("deal_id", dealId);
      if (error || (count ?? 0) > 0) continue;
      await admin.from(table).insert({ deal_id: dealId, ...row() });
    }
  } catch {
    // the sample still works OM-only
  }
}

/**
 * Write the current fixture over a sample row whose edition is not the
 * current one — every column the seed writes, then its rent roll and T-12.
 * Reads the row first and touches only a sample; answers what it found.
 * Never throws.
 */
export async function refreshSampleDeal(
  dealId: string,
  { client }: { client?: SampleWriteClient } = {},
): Promise<"current" | "refreshed" | "not_sample" | "failed"> {
  try {
    const admin = client ?? createSupabaseAdminClient();
    const { data, error } = await admin.from("deals").select("is_sample, extraction").eq("id", dealId).maybeSingle();
    if (error || !data) return "failed";
    const row = data as { is_sample?: boolean | null; extraction?: unknown };
    if (!row.is_sample) return "not_sample";
    if (sampleEditionOf(row.extraction) === SAMPLE_EDITION) return "current";
    const written = await admin
      .from("deals")
      .update(sampleFixtureColumns())
      .eq("id", dealId)
      .eq("is_sample", true);
    if (written?.error) return "failed";
    await syncSampleActuals(dealId, { rewrite: true, client: admin });
    return "refreshed";
  } catch {
    return "failed";
  }
}

/** `refreshSampleDeal`, waited for at most `waitMs`: a page view draws on
 *  past a slow write (it reads the fixture over the row either way), and the
 *  write carries on behind it. */
export async function refreshSampleDealWithin(dealId: string, waitMs: number = SAMPLE_REFRESH_WAIT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      refreshSampleDeal(dealId),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } catch {
    // never throws
  } finally {
    if (timer) clearTimeout(timer);
  }
}
