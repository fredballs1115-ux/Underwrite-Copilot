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
  active_pursuit: "Active pursuit",
  loi_submitted: "LOI submitted",
  under_contract: "Under contract / DD",
  closed: "Closed",
  dead: "Dead",
};

/** A deal still in play: on the ladder short of Closed and Dead. The Monday
 *  digest counts these as the pipeline's open deals — it had called every
 *  deal but a dead one "live", a closed one included. */
export function isOpenStage(stage: Stage): boolean {
  return stage !== "closed" && stage !== "dead";
}

/** Legacy values (pre-migration-0013 rows, stale tabs) fold onto the new
 *  ladder so the UI never renders an unknown stage. */
export function normalizeStage(raw: string | null | undefined): Stage {
  if (!raw) return "screening";
  if ((STAGES as readonly string[]).includes(raw)) return raw as Stage;
  if (raw === "reviewing") return "tracking";
  if (raw === "pursuing") return "active_pursuit";
  return "screening";
}

/** Why a deal died (research pass 24, B4): the one tap a team makes when
 *  it moves a deal to Dead, so the firm learns what it loses on. */
export const OUTCOME_REASONS = [
  "price",
  "timing",
  "market",
  "physical",
  "financing",
  "lost_to_bidder",
  "seller_withdrew",
] as const;

export type OutcomeReason = (typeof OUTCOME_REASONS)[number];

export const OUTCOME_REASON_LABEL: Record<OutcomeReason, string> = {
  price: "Price",
  timing: "Timing",
  market: "Market",
  physical: "Physical",
  financing: "Financing",
  lost_to_bidder: "Lost to another bidder",
  seller_withdrew: "Seller withdrew",
};

/** A trade price someone on the team reported — hearsay until recorded, and
 *  always said with who reported it and when. */
export interface ReportedTrade {
  /** dollars */
  price: number;
  buyer: string | null;
  /** the day it traded, yyyy-mm-dd, as reported; null where not given */
  date: string | null;
  /** the reporter's name (their profile's), else email, as it read when
   *  they reported it — said where the reader has no newer name for them */
  reportedBy: string | null;
  /** the reporter's account, so a page that knows the team's names says
   *  the name it knows today (audit C8, L4); absent on a trade reported
   *  before it was kept */
  reportedById?: string | null;
  /** ISO timestamp of the report */
  reportedAt: string;
}

/** What became of a deal moved to Dead or Closed: why it died (Dead only),
 *  and what it traded at (either). Stored on the stage-history entry that
 *  moved it, so a later stage change keeps it (`parseStageHistory`). */
export interface DealOutcome {
  reason: OutcomeReason | null;
  trade: ReportedTrade | null;
}

/** One entry in deals.stage_history. */
export interface StageChange {
  stage: Stage;
  /** ISO timestamp of the change */
  at: string;
  /** on a move to Dead or Closed, what became of the deal (lib/deal-outcome) */
  outcome?: DealOutcome;
}

const TEXT_MAX = 120;

function parseTrade(raw: unknown): ReportedTrade | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const price = typeof t.price === "number" && Number.isFinite(t.price) && t.price > 0 ? t.price : null;
  const reportedAt = typeof t.reportedAt === "string" ? t.reportedAt : null;
  if (price == null || !reportedAt) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, TEXT_MAX) : null);
  const date = typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null;
  const byId = typeof t.reportedById === "string" && /^[0-9a-f-]{8,64}$/i.test(t.reportedById) ? t.reportedById : null;
  return { price, buyer: text(t.buyer), date, reportedBy: text(t.reportedBy), ...(byId ? { reportedById: byId } : {}), reportedAt };
}

/** A stored outcome, kept only where it is well formed and on an entry that
 *  ends the deal: a reason on Dead alone, a trade on Dead or Closed. */
function parseOutcome(raw: unknown, stage: Stage): DealOutcome | undefined {
  if ((stage !== "dead" && stage !== "closed") || !raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const reason =
    stage === "dead" && typeof o.reason === "string" && (OUTCOME_REASONS as readonly string[]).includes(o.reason)
      ? (o.reason as OutcomeReason)
      : null;
  const trade = parseTrade(o.trade);
  return reason || trade ? { reason, trade } : undefined;
}

export function parseStageHistory(raw: unknown): StageChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is { stage: string; at: string; outcome?: unknown } =>
        !!e &&
        typeof e === "object" &&
        typeof (e as { stage?: unknown }).stage === "string" &&
        typeof (e as { at?: unknown }).at === "string",
    )
    .map((e) => {
      const stage = normalizeStage(e.stage);
      // The outcome rides on its entry, so the stage change that rewrites
      // the array from this parse keeps it (research pass 24, B4): a parse
      // that kept only the stage and the day erased it at the next move.
      const outcome = parseOutcome(e.outcome, stage);
      return outcome ? { stage, at: e.at, outcome } : { stage, at: e.at };
    });
}
