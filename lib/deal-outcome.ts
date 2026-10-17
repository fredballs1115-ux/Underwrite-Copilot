// Why deals die, and what they traded at (research pass 24, B4). Pure: the
// deal's stage and its stage history come in; the outcome is stored on the
// history entry that moved the deal to Dead or Closed (lib/stages
// `StageChange.outcome`), which every stage change keeps. No new column: the
// history is the deal's own jsonb (migration 0013).
//
// Its rules:
//   - an outcome belongs to the move that ended the deal: it is set only
//     where the deal's current stage is Dead or Closed AND the history's last
//     entry is that move — never on a deal whose move was not recorded (a
//     row written before the history was kept), where no entry could carry
//     it without inventing the day it moved;
//   - a reason is Dead's alone (a closed deal was won), one of seven;
//   - a reported trade is hearsay until recorded: a positive price, the
//     buyer and day only as typed, and always said with who reported it and
//     when ("reported by Jane, Oct 2, 2026") — never pooled with asking
//     prices;
//   - a blank is null: no price typed is no trade, never $0.
import { DEADLINE_FIRST_YEAR, DEADLINE_LAST_YEAR, deadlineDay } from "@/lib/deadline-day";
import { compactUsd, readFigure } from "@/lib/money";
import { displayName } from "@/lib/person";
import {
  OUTCOME_REASONS,
  OUTCOME_REASON_LABEL,
  normalizeStage,
  type DealOutcome,
  type OutcomeReason,
  type ReportedTrade,
  type StageChange,
} from "@/lib/stages";

/** A trade price no building trades under, and none over: a typed "41.5"
 *  meant millions, which the field says, and is refused rather than read as
 *  $41.50. */
export const TRADE_MIN = 10_000;
export const TRADE_MAX = 50_000_000_000;

/** The entry an outcome is set on: the history's last, where it is the move
 *  to the deal's current Dead or Closed stage. */
export function outcomeEntryIndex(stage: string | null | undefined, history: readonly StageChange[]): number | null {
  const current = normalizeStage(stage ?? null);
  if (current !== "dead" && current !== "closed") return null;
  const i = history.length - 1;
  return i >= 0 && history[i].stage === current ? i : null;
}

/** The deal's recorded outcome, where its current stage ends it. */
export function currentOutcome(stage: string | null | undefined, history: readonly StageChange[]): DealOutcome | null {
  const i = outcomeEntryIndex(stage, history);
  return i == null ? null : (history[i].outcome ?? null);
}

/** The history with the outcome on the move that ended the deal, or null
 *  where no such move is recorded. An outcome with neither a reason nor a
 *  trade clears it. */
export function withOutcome(
  stage: string | null | undefined,
  history: readonly StageChange[],
  outcome: DealOutcome,
): StageChange[] | null {
  const i = outcomeEntryIndex(stage, history);
  if (i == null) return null;
  const entry = history[i];
  const reason = entry.stage === "dead" ? outcome.reason : null;
  const next: StageChange = reason || outcome.trade ? { stage: entry.stage, at: entry.at, outcome: { reason, trade: outcome.trade } } : { stage: entry.stage, at: entry.at };
  return [...history.slice(0, i), next];
}

export type OutcomeForm =
  | { ok: true; outcome: DealOutcome }
  | { ok: false; error: "reason" | "price" | "date" };

/** Who reported a trade: their account and the name it read under then. */
export interface Reporter {
  id: string | null;
  name: string | null;
}

/**
 * The outcome form as typed: the reason (Dead only), and a trade where a
 * price is typed — its buyer and its day as given. `reporter` and `nowIso`
 * mark who reported it and when: the account where one is given, and the
 * name (a bare string is the name alone).
 */
export function readOutcomeForm(
  fields: { reason?: string | null; price?: string | null; buyer?: string | null; date?: string | null },
  reporter: Reporter | string | null,
  nowIso: string,
): OutcomeForm {
  const who: Reporter = typeof reporter === "string" || reporter == null ? { id: null, name: reporter ?? null } : reporter;
  const rawReason = (fields.reason ?? "").trim();
  let reason: OutcomeReason | null = null;
  if (rawReason) {
    if (!(OUTCOME_REASONS as readonly string[]).includes(rawReason)) return { ok: false, error: "reason" };
    reason = rawReason as OutcomeReason;
  }
  const rawPrice = (fields.price ?? "").trim();
  let trade: ReportedTrade | null = null;
  if (rawPrice) {
    const price = readFigure(rawPrice);
    if (price == null || price < TRADE_MIN || price > TRADE_MAX) return { ok: false, error: "price" };
    const rawDate = (fields.date ?? "").trim();
    const date = rawDate ? deadlineDay(rawDate) : null;
    if (rawDate && !date) return { ok: false, error: "date" };
    const buyer = (fields.buyer ?? "").trim().slice(0, 120) || null;
    trade = {
      price,
      buyer,
      date,
      reportedBy: who.name?.trim().slice(0, 120) || null,
      ...(who.id ? { reportedById: who.id } : {}),
      reportedAt: nowIso,
    };
  }
  return { ok: true, outcome: { reason, trade } };
}

/** The form's words for a refusal. */
export const OUTCOME_FORM_ERROR: Record<"reason" | "price" | "date", string> = {
  reason: "Pick one of the reasons listed.",
  price: "Type the trade price as a dollar figure — $41,500,000 or $41.5M.",
  date: `Type the trade's day as a real date between ${DEADLINE_FIRST_YEAR} and ${DEADLINE_LAST_YEAR}.`,
};

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayWords = (iso: string): string => {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? DAY.format(new Date(t)) : iso;
};

/** "Traded at $41.5M to Blackstone on Sep 30, 2026 — reported by Jane, Oct
 *  2, 2026": the trade as reported, never as a record. */
/** A reported trade's price, the one way every surface writes it ("$41.25M"):
 *  the decision log's sentence and the internal comps' label beside its
 *  title had written one trade two ways, "$41.3M" beside "$41.25M" (audit
 *  C8, L1). */
export function tradePriceText(price: number): string {
  return compactUsd(price, { millions: 2 });
}

/** The reporter as a reader of the page knows them: the name the team's
 *  roster gives their account today (`names`, the page's own lookup), else
 *  the name the trade was reported under. Either is said as a name, never
 *  an address: a trade reported before the reporter set a name stored their
 *  whole email, which is printed by its local part (lib/person
 *  `displayName`). */
export function reporterName(trade: ReportedTrade, names?: Record<string, string> | null): string | null {
  const name = (trade.reportedById && names?.[trade.reportedById]) || trade.reportedBy;
  return name ? displayName(name) || null : null;
}

export function tradeWords(trade: ReportedTrade, names?: Record<string, string> | null): string {
  const to = trade.buyer ? ` to ${trade.buyer}` : "";
  const on = trade.date ? ` on ${dayWords(trade.date)}` : "";
  const reporter = reporterName(trade, names);
  const by = reporter ? `reported by ${reporter}` : "reported";
  return `Traded at ${tradePriceText(trade.price)}${to}${on} — ${by}, ${dayWords(trade.reportedAt)}`;
}

/** The outcome in one line, for the decision log and the card. */
export function outcomeWords(outcome: DealOutcome, names?: Record<string, string> | null): string {
  return [outcome.reason ? `Why: ${OUTCOME_REASON_LABEL[outcome.reason]}` : null, outcome.trade ? tradeWords(outcome.trade, names) : null]
    .filter(Boolean)
    .join(". ");
}

export interface ReasonCount {
  reason: OutcomeReason;
  label: string;
  count: number;
}

/**
 * Why the dead deals died: each reason's count, most first, every reason
 * listed (a zero is a finding too), and how many dead deals carry no reason
 * — counted, never folded into one.
 */
export function deathReasons(deals: readonly { stage: string | null | undefined; history: readonly StageChange[] }[]): {
  reasons: ReasonCount[];
  dead: number;
  unrecorded: number;
} {
  const counts = new Map<OutcomeReason, number>(OUTCOME_REASONS.map((r) => [r, 0]));
  let dead = 0;
  let unrecorded = 0;
  for (const d of deals) {
    if (normalizeStage(d.stage ?? null) !== "dead") continue;
    dead++;
    const reason = currentOutcome(d.stage, d.history)?.reason ?? null;
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    else unrecorded++;
  }
  const reasons = OUTCOME_REASONS.map((reason) => ({ reason, label: OUTCOME_REASON_LABEL[reason], count: counts.get(reason) ?? 0 })).sort(
    (a, b) => b.count - a.count || OUTCOME_REASONS.indexOf(a.reason) - OUTCOME_REASONS.indexOf(b.reason),
  );
  return { reasons, dead, unrecorded };
}
