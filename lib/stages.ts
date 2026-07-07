// The deal-stage ladder — ONE definition consumed by the pipeline grouping,
// the row/page stage selects, the CSV export, and the stage history. Order
// here IS the pipeline's group order.

export const STAGES = [
  "screening",
  "tracking",
  "active_pursuit",
  "loi_submitted",
  "under_contract",
  "closed",
  "dead",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  screening: "Screening",
  tracking: "Tracking",
  active_pursuit: "Active Pursuit",
  loi_submitted: "LOI Submitted",
  under_contract: "Under Contract / DD",
  closed: "Closed",
  dead: "Dead",
};

/** Legacy values (pre-migration-0013 rows, stale tabs) fold onto the new
 *  ladder so the UI never renders an unknown stage. */
export function normalizeStage(raw: string | null | undefined): Stage {
  if (!raw) return "screening";
  if ((STAGES as readonly string[]).includes(raw)) return raw as Stage;
  if (raw === "reviewing") return "tracking";
  if (raw === "pursuing") return "active_pursuit";
  return "screening";
}

/** One entry in deals.stage_history. */
export interface StageChange {
  stage: Stage;
  /** ISO timestamp of the change */
  at: string;
}

export function parseStageHistory(raw: unknown): StageChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is { stage: string; at: string } =>
        !!e &&
        typeof e === "object" &&
        typeof (e as { stage?: unknown }).stage === "string" &&
        typeof (e as { at?: unknown }).at === "string",
    )
    .map((e) => ({ stage: normalizeStage(e.stage), at: e.at }));
}
