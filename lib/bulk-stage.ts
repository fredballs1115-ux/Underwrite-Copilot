// The pipeline's bulk stage change (select mode): what the form may ask for,
// and how the answer is said. Pure, with no imports but the stage ladder, so
// the client bar and the server action read one rule — a "use server" module
// may export only async functions, so the limit and the reader live here.
import { STAGES, STAGE_LABEL, type Stage } from "./stages";

/** The most deals one bulk change moves: a page of selections, never the
 *  whole account in one request. A request past it is refused whole, never
 *  cut to its first fifty. */
export const BULK_STAGE_MAX = 50;

/** A deal's id: the database's uuid, nothing else. */
const DEAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BulkStageError = "auth" | "stage" | "none" | "toomany";

export type BulkStageResult =
  | {
      ok: true;
      stage: Stage;
      /** moved to the stage */
      changed: number;
      /** already at the stage: nothing written */
      unchanged: number;
      /** not the reader's to change — a deal they cannot see or edit, the
       *  sample deal — or a write that did not land */
      refused: number;
    }
  | { ok: false; error: BulkStageError };

type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

/** The stage and the deals a bulk form asks for: the stage one of the
 *  ladder's, each id a deal id (anything else is dropped, a repeat read
 *  once), one deal at least and `BULK_STAGE_MAX` at most. */
export function readBulkStageForm(
  form: FormLike,
): { ok: true; stage: Stage; ids: string[] } | { ok: false; error: Exclude<BulkStageError, "auth"> } {
  const stage = String(form.get("stage") ?? "");
  if (!(STAGES as readonly string[]).includes(stage)) return { ok: false, error: "stage" };
  const ids = [
    ...new Set(
      form
        .getAll("dealId")
        .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
        .filter((v) => DEAL_ID.test(v)),
    ),
  ];
  if (ids.length === 0) return { ok: false, error: "none" };
  if (ids.length > BULK_STAGE_MAX) return { ok: false, error: "toomany" };
  return { ok: true, stage: stage as Stage, ids };
}

const deals = (n: number) => `${n} ${n === 1 ? "deal" : "deals"}`;

/** The bar's one sentence on what a bulk change did. */
export function bulkStageSentence(r: BulkStageResult): string {
  if (!r.ok) {
    switch (r.error) {
      case "auth":
        return "Sign in again to change these deals.";
      case "stage":
        return "Pick a stage to move the deals to.";
      case "none":
        return "Select at least one deal.";
      case "toomany":
        return `Select ${BULK_STAGE_MAX} deals at most for one change.`;
    }
  }
  const to = r.stage === "dead" ? "marked Dead" : `moved to ${STAGE_LABEL[r.stage]}`;
  const parts = [r.changed > 0 ? `${deals(r.changed)} ${to}` : `No deals ${to}`];
  if (r.unchanged > 0) parts.push(`${r.unchanged} already there`);
  if (r.refused > 0) parts.push(`${r.refused} could not be changed`);
  return `${parts.join("; ")}.`;
}
