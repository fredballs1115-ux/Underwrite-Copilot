// A deal's stage and its history, written without losing a write made in
// between (audit C8, L4). `setStage` and `setDealOutcome` each read the
// stage and the history, build the next history from them and write it
// back; a stage change a teammate made between the read and the write was
// lost — the outcome's write put the old history back over it, and a second
// stage change dropped the first's entry. Here the write lands only on the
// row as it was read (its stage and its last write, `updated_at`, which
// both actions stamp), and where another write landed between, the row is
// read again and the change rebuilt on it, a few times before giving up.
//
// This narrows the race to what PostgREST can guard; it does not close it
// for a writer that leaves `updated_at` alone, and a reporter's name in the
// history stays a column the deal's readers can write through PostgREST — a
// trigger stamping both is a migration, the owner's to run.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StageRow {
  stage: string | null;
  stage_history: unknown;
  updated_at: string | null;
}

/** What a build makes of the row as read: the columns to write, or why
 *  nothing is written ("unchanged": the row is already there; "refused":
 *  the change does not apply to it). */
export type StageBuild = { patch: Record<string, unknown> } | { skip: "unchanged" | "refused" };

export type StageWriteResult =
  | { ok: true }
  | { ok: false; why: "missing" | "unchanged" | "refused" | "conflict" }
  | { ok: false; why: "error"; message: string };

export const STAGE_WRITE_ATTEMPTS = 3;

export async function writeStageGuarded(
  db: SupabaseClient,
  dealId: string,
  build: (row: StageRow) => StageBuild,
  attempts: number = STAGE_WRITE_ATTEMPTS,
): Promise<StageWriteResult> {
  for (let i = 0; i < attempts; i++) {
    const { data, error: readError } = await db.from("deals").select("stage, stage_history, updated_at").eq("id", dealId).maybeSingle();
    if (readError) return { ok: false, why: "error", message: readError.message ?? "" };
    if (!data) return { ok: false, why: "missing" };
    const row = data as StageRow;
    const next = build(row);
    if ("skip" in next) return { ok: false, why: next.skip };
    let q = db.from("deals").update(next.patch).eq("id", dealId);
    q = row.stage == null ? q.is("stage", null) : q.eq("stage", row.stage);
    q = row.updated_at == null ? q.is("updated_at", null) : q.eq("updated_at", row.updated_at);
    const { data: written, error } = await q.select("id");
    if (error) return { ok: false, why: "error", message: error.message ?? "" };
    if (Array.isArray(written) && written.length > 0) return { ok: true };
    // Another write landed between the read and this one: read it again.
  }
  return { ok: false, why: "conflict" };
}
