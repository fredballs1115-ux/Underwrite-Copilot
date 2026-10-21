// The track record (2026-10-19, the investor's question: "is it really
// improving accuracy?"). The honest answer is scored, never claimed: each
// row of the screen's stress test — the code's verdict and the evidence
// figure that decided it, holds included (the owner's decision of
// 2026-10-20), kept with the verdict (lib/stress-snapshot) — is set against
// evidence that arrived on the deal AFTER the screen's verdict: a T-12 or a
// rent roll added after it, the reader's own decision (Dead, and why), and
// what the building traded for. Pure.
//
// Its rules:
//   - a row read stretched or unsupported is RIGHT where the later figure
//     lands past the OM's on the buyer's bad side by more than the row's own
//     margin (`StressSnapshotRow.threshold`), WRONG where it lands within
//     that margin of the OM's, or better for the buyer; a row that HELD is
//     right where the later figure lands within that margin of the OM's, or
//     better for the buyer, and
//     WRONG — a false hold — where it lands past it on the buyer's bad side;
//     an unchecked row is not scored;
//   - a screen whose verdict carries no snapshot (made before the snapshot
//     was kept, or with no test built) has its challenges scored as before,
//     on the challenger's own figures and by which side of them the later
//     figure landed on, and the record says the rows were not snapshotted;
//   - evidence counts only where it arrived after the screen: a document the
//     screen read is circular (the challenger was handed it) and is said so,
//     never scored; a document with no arrival time on record is not scored
//     either, since a guessed order is no order;
//   - a document's arrival is its upload (deal_documents.created_at), never
//     the day a screen extracted its figures (`arrivalOf`): the pipeline
//     re-reads every document on each screen, so the extraction row's own
//     `created_at` is the screen's, not the document's;
//   - an upload after the verdict is not enough: a document scores only
//     where its own date — a rent roll's as-of, a T-12's period end — falls
//     on a day after the verdict's. A T-12 whose year ended before the screen
//     is history the screen could have been handed, only uploaded later; a
//     document with no such date on record is not scored, and is said so;
//   - a document scores only what it can speak to. A seller's T-12 shows the
//     seller's tax bill and premium, never the bill a sale resets or the
//     premium a new owner is quoted (the stress test's own tax row refuses it
//     as evidence too), and no document kind on the deal is the buyer's bill
//     or quote, so a taxes or insurance row is never scored by a document
//     (`TAX_INSURANCE_NOT_SCORED`). On a plan deal the OM's NOI and its
//     stated vacancy are the finished project's, and a T-12 or rent roll is
//     the building before the plan is done, so neither scores them;
//   - a vacancy is scored in its own measure, as the stress test decides it
//     (lib/stress-deciders `VACANCY_ORDER`): a figure counted by doors by a
//     later rent roll's count, an economic one (dollars over gross potential
//     rent, `StressSnapshotRow.measure`) by a later T-12's economic vacancy,
//     never the one against the other; a document of the other measure is
//     named on the row with why it does not score it. An older screen's
//     challenge carries no measure of its own and is read in the measure
//     of the deal's OM vacancy (`vacancyEconomic`): doors by a rent roll,
//     dollars by a T-12;
//   - a stabilized vacancy the market's published figure decided is the
//     market's to judge, and a later rent roll's vacancy is today's: a
//     stress-test row says which kind decided it, and an older screen's
//     challenge reads the caller's `vacancyHeldToMarket`;
//   - a challenge (an older screen's) is scored only on its own figures: the
//     OM's figure and the screen's alternative as the challenger wrote them
//     (`omFigure`, `altFigure`, in the assumption's own unit); one stored
//     before the challenger wrote figures is unscored, with why;
//   - a decision is a direction, not a figure: a deal walked away from on
//     price agrees with a basis row read stretched, one walked away from on
//     financing with a debt row, and goes against such a row that held; such
//     a row says it was a decision, counted apart and in no share;
//   - a trade is put on the OM figure's own basis (the trade over the ask,
//     applied to the OM's figure), since the row's basis figure may be per
//     unit or per foot while a trade is the whole price;
//   - a Closed deal's price is the buyer's own (the owner's decision of
//     2026-10-21), negotiated with the screen in hand, so it is a decision,
//     never a trade: put on the OM figure's basis as a trade is, it says
//     which way it points against the row (past the margin under the ask or
//     not) and is counted apart, in no share; only a third party's trade,
//     reported on a deal moved to Dead, scores the price as a figure;
//   - a trade counts only where it was reported after the verdict and, where
//     its own date is stated, traded on a day after the verdict's: one dated
//     on or before it is a sale the screen could have been told of, only
//     reported later, refused as a document dated before it is;
//   - a T-12 whose period ends after the verdict's day is admitted, and
//     where most of its months still end on or before that day the rows it
//     scores say so ("11 of its 12 months precede the verdict") — words
//     only, the rule unchanged;
//   - under RECORD_FLOOR (5) scored rows the account's record is "a start,
//     not a record", and no share is printed; a share is always printed with
//     its count beside it ("3 of 5 rows");
//   - every earlier screen's rows are scored too (`priorScreen`, the snapshot
//     a re-screen writes to deals.prior_screen with the verdict — its stress
//     test's snapshot inside it — and the challenges it replaced; and since
//     2026-10-21 `priorScreens`, every such snapshot kept in screen_snapshots,
//     migration 0038, so a third re-screen never drops a row already scored):
//     the pipeline reads a T-12 added after a screen only on the re-screen
//     that also replaces the test it would be scored against, so a document
//     that arrived between two verdicts scores the row made before it. One
//     piece of later evidence scores a row of a key once a deal: by the
//     latest screen made before it whose row of that key it scores — a newer
//     screen's row of the key, scored on the same evidence, drops every older
//     one's, never counted twice; a snapshot written before the challenges
//     were kept reads as before;
//   - beside right and wrong, display only (the owner's decision of
//     2026-10-21): a flagged row scored on figures says how much of the gap
//     between the OM's figure and the evidence's the later figure covered
//     (`gapCaptured`), and the account says the base rate — how many scored
//     rows, whatever their verdict, landed past the OM's on the buyer's bad
//     side by more than the row's margin, a share only from RECORD_FLOOR.
//     Neither changes a score.
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { statedDay } from "@/lib/actuals/actuals-read";
import { t12Vacancy, t12VacancyOverWords } from "@/lib/actuals/analyze";
import { assetWords } from "@/lib/asset-words";
import { compactUsd } from "@/lib/money";
import { OUTCOME_REASON_LABEL, type OutcomeReason, type StageChange } from "@/lib/stages";
import { WORSE_WHEN, readStressSnapshot, snapshotThreshold, type StressSnapshot, type StressSnapshotRow } from "@/lib/stress-snapshot";
import { challengeKey, t12OpexOnFooting } from "@/lib/stress-test";
import { STRESS_KEYS, type StressKey, type StressVerdict } from "@/lib/stress-test-types";

import { RECORD_FLOOR, shareWords, wholeShares, type CapturedPlace, type GapCapturedLike, type RowOutcome } from "@/lib/track-record-words";

export {
  BASE_RATE_WHY,
  CALIBRATION_NOTE,
  CAPTURE_TRACK,
  CARD_SCOPE,
  DECISION_SCORES,
  DOCUMENT_DATE_RULE,
  NOT_YET_SCORABLE,
  OUTCOME_WORD,
  PURCHASE_IS_DECISION,
  RECORD_FLOOR,
  baseRateLine,
  calibrationCountsLine,
  capturedAt,
  capturedWords,
  decisionBadge,
  type CapturedPlace,
  type GapCapturedLike,
  SCORED_BY,
  SCORED_BY_TOO,
  RESCREEN_LINE,
  RESCREEN_RULE,
  SAMPLE_NO_RECORD,
  TAX_INSURANCE_NOT_SCORED,
  TRADE_DATE_RULE,
  VACANCY_MEASURE_RULE,
  dealRecordLine,
  shareWords,
  wholeShares,
  type RowOutcome,
} from "@/lib/track-record-words";

/** Where the later figure landed. A stress-test row is `right` or `wrong`
 *  (its `outcome`, `OUTCOME_WORD`, says which way); a challenge from a
 *  screen whose test was not kept lands on a side of the challenger's two
 *  figures. */
export type Landing = "right" | "wrong" | "om_side" | "screen_side" | "between" | "unscored";

/** What arrived after the screen. */
export type LaterSource = "t12" | "rent_roll" | "outcome" | "trade";

export interface LaterEvidence {
  source: LaterSource;
  /** "T-12 to May 31, 2026 (added Oct 3, 2026)" */
  label: string;
  /** ISO: when it arrived on the deal */
  at: string;
  /** a Closed deal's own price, a decision (source "outcome") */
  purchase?: boolean;
}

export interface ScoredRow {
  key: StressKey;
  title: string;
  /** the challenge's own words for the assumption; on a stress-test row, the
   *  row's title */
  assumption: string;
  /** the OM's figure, in the assumption's own unit; null where none is stated */
  omFigure: number | null;
  /** the challenger's alternative, in the same unit — on a stress-test row,
   *  the evidence figure that decided it; null where there is none */
  altFigure: number | null;
  /** the challenger's basis for its figure; on a stress-test row, the
   *  deciding evidence's label */
  altBasis: string | null;
  /** the row is the stress test's, kept with the verdict (lib/stress-snapshot);
   *  absent on a challenge scored on the challenger's own figures */
  fromTest?: boolean;
  /** the test's own verdict for the row, where it is the stress test's */
  verdict?: StressVerdict | null;
  /** a scored stress-test row's outcome, in `OUTCOME_WORD`'s words */
  outcome?: RowOutcome | null;
  /** the figure that arrived after the screen, or a decision in words */
  later: { source: LaterSource; value: number | null; text: string } | null;
  /** the three figures as the card prints them, in the key's own unit —
   *  only on a row scored on figures, so the card takes plain data; `alt` is
   *  the challenger's figure, or on a stress-test row the evidence's */
  figures: { om: string; alt: string; later: string } | null;
  landing: Landing;
  /** the later thing is the reader's decision (Dead, and why, or a Closed
   *  deal's own price), a direction: the row says which side it agrees with,
   *  and the account's record counts it apart from the scored rows, never in
   *  the shares */
  decision?: boolean;
  /** the decision is a Closed deal's own price: the buyer's, negotiated with
   *  the screen in hand, never a trade */
  purchase?: boolean;
  /** when the later thing arrived on the deal (ISO): with the key and its
   *  source, what makes one piece of evidence one, so it scores a key once
   *  across a deal's screens */
  laterAt?: string | null;
  /** a flagged row scored on figures: how much of the gap between the OM's
   *  figure and the evidence's the later figure covered — shown beside right
   *  and wrong, never scored (`gapCaptured`) */
  captured?: GapCaptured | null;
  /** why the row is unscored, where it is */
  why: string | null;
  /** one sentence: what was set against what, and where it landed */
  text: string;
  /** the day of the earlier screen whose row this scores ("Sep 20, 2026"),
   *  where the row is the prior screen's; null on the current screen's rows
   *  — and on every row of a record scored before the snapshot kept
   *  challenges */
  priorScreenedOn?: string | null;
}

export interface DealRecord {
  /** the verdict's own stamp (`generatedAt`), ISO; null where it carries none */
  screenedAt: string | null;
  /** the same day in words ("Oct 1, 2026"); null where there is none */
  screenedOn: string | null;
  /** what arrived after the screen, oldest first */
  evidence: LaterEvidence[];
  /** every stress-test row (or, where the test was not kept, every stored
   *  challenge), scored or unscored */
  rows: ScoredRow[];
  /** evidence on the deal that is NOT scored, with why: a document the
   *  screen read, one with no arrival time, an outcome recorded before it */
  notScored: string[];
  /** a rent roll or T-12 was uploaded after the verdict and refused for its
   *  own date (none on record, or one on or before the verdict's day), or a
   *  trade reported after it traded on or before its day: the deal page
   *  still draws the card, so the refusal is said where the reader looks for
   *  the score */
  refusedLater?: boolean;
  /** the earlier screen whose rows were scored beside the current one's
   *  (deals.prior_screen with its verdict and challenges), where the
   *  snapshot holds them and a stamp */
  prior?: { screenedAt: string; screenedOn: string } | null;
  /** every earlier screen scored beside the current one, newest first (the
   *  first is `prior`); empty where none */
  priors?: { screenedAt: string; screenedOn: string }[];
  /** whether the current screen's stress test was kept with its verdict, so
   *  its rows are what is scored; false where its challenges stand in */
  snapshotted?: boolean;
  /** the screens whose stress test was not kept, said: their challenges
   *  stand in for the rows */
  snapshotNotes?: string[];
  /** what kind of later evidence can score which row on this deal
   *  (`scorableGrid`, on the deal's own conditions): the card draws it while
   *  nothing has arrived, so the reader sees what will score what */
  scorable?: ScorableRow[];
}

/** The previous screen's snapshot as the pipeline writes it to
 *  deals.prior_screen on a re-screen (migration 0010; lib/screen-diff
 *  `PriorScreen`): the verdict it replaced, with its own stamp and — since
 *  2026-10-20 — its stress test's snapshot (`stressSnapshot`), and — since
 *  2026-10-19 — the challenges it replaced. A snapshot with neither rows nor
 *  challenges is one written before they were kept, and scores nothing. */
export interface PriorScreenLike {
  verdict?: { generatedAt?: string | null; stressSnapshot?: unknown } | null;
  challenges?: { challenges?: readonly Challenge[] | null } | null;
}

/** A stored rent roll or T-12 row beside the document it was read from. */
export interface LaterDocument<S> {
  /** when the document arrived on the deal (`arrivalOf`), ISO; null where unknown */
  arrivedAt: string | null;
  /** the roll's stated as-of, or the T-12's period end; null where unstated */
  dated: string | null;
  summary: S;
}

export interface ScoreDealArgs {
  /** the verdict's `generatedAt` */
  screenedAt: string | null | undefined;
  /** the verdict's `stressSnapshot` as stored: a snapshot's rows are what is
   *  scored; null (no test was built) or absent (a verdict written before the
   *  snapshot was kept) scores the challenges instead, and says so */
  stressSnapshot?: unknown;
  challenges: readonly Challenge[] | null | undefined;
  t12?: LaterDocument<T12Summary> | null;
  rentRoll?: LaterDocument<RentRollSummary> | null;
  /** the deal's stage and its stage history (lib/stages) */
  stage?: string | null;
  history?: readonly StageChange[] | null;
  /** the memorandum's asking price (lib/deal-strategy `askingPriceOf`), so
   *  a trade can be put on the OM figure's basis; null where none is stated */
  askingPrice?: number | null;
  /** the class the deal shows (lib/asset-class `shownAssetClass`), so a rent
   *  roll's vacancy is read as the stress test reads it: by count on a class
   *  priced by the unit, by area on one priced by the foot; absent, by area
   *  where the roll carries it */
  assetClass?: string | null;
  /** for a challenge scored where no stress test was kept: the OM's vacancy
   *  is a stabilized assumption on a deal read as stabilized (lib/stress-test
   *  `stabilizedVacancyStated`), which the stress test holds to the market's
   *  published figures, not to the documents: a rent roll's or T-12's
   *  vacancy that arrives later is the building's vacancy today again — the
   *  gap a lease-up has to close — so it scores no vacancy challenge, and
   *  the row says why. A stress-test row says itself which kind decided it,
   *  and reads that instead */
  vacancyHeldToMarket?: boolean;
  /** for a challenge scored where no stress test was kept: the OM's vacancy
   *  is economic, dollars over gross potential rent (lib/stress-test
   *  `vacancyEconomicStated`), so only a later T-12's economic vacancy scores
   *  a vacancy challenge, and a rent roll's count of doors is named as the
   *  other measure; false or absent, a figure counted by doors. A
   *  stress-test row carries its own measure, and reads that instead */
  vacancyEconomic?: boolean;
  /** the deal is a plan deal (lib/deal-strategy `isPlanDeal`): the OM's NOI
   *  is the finished project's, which a T-12 of the building before the plan
   *  cannot speak to, so a later T-12 scores no NOI row */
  plan?: boolean;
  /** the OM's vacancy is a stated allowance on a plan deal (lib/stress-test
   *  `planVacancyStated`): the stabilized figure the plan is to reach, which a
   *  later document's vacancy — the building mid-plan — cannot speak to */
  vacancyIsPlanTarget?: boolean;
  /** the previous screen's snapshot (the deal row's `prior_screen`), whose
   *  rows are scored against what arrived after ITS verdict — a document
   *  that arrived between the two screens scores the row made before it,
   *  which the re-screen's own test was made with */
  priorScreen?: PriorScreenLike | null;
  /** every earlier screen kept (screen_snapshots, migration 0038), in any
   *  order: each is scored against what arrived after ITS verdict, beside
   *  `priorScreen` — the same screen in both is read once, by its verdict's
   *  stamp. Absent or empty (the table not yet made, or not readable),
   *  `priorScreen` alone is read, as before */
  priorScreens?: readonly PriorScreenLike[] | null;
}

/** How much of the gap between the OM's figure and the evidence's a later
 *  figure covered (lib/track-record-words `GapCapturedLike`). */
export type GapCaptured = GapCapturedLike;

/**
 * How much of the gap the evidence opened the later figure covered: (later −
 * OM) / (evidence − OM), as a whole percent — 0 at the OM's figure, 100 at
 * the evidence's — with where that is: short of the OM's figure (under 0),
 * between the two, or past the evidence's (over 100). Null where a figure is
 * missing or the evidence's figure is the OM's own, which opens no gap.
 * Display only: the row's score is struck by its margin, never by this.
 */
export function gapCaptured(om: number | null | undefined, evidence: number | null | undefined, later: number | null | undefined): GapCaptured | null {
  if (om == null || evidence == null || later == null) return null;
  if (![om, evidence, later].every(Number.isFinite)) return null;
  const gap = evidence - om;
  if (Math.abs(gap) <= 1e-9 * Math.max(1, Math.abs(om))) return null;
  const share = (later - om) / gap;
  const pct = Math.round(share * 100);
  const place: CapturedPlace = share < 0 ? "om_side" : share > 1 ? "past" : "between";
  return { pct, place };
}

/**
 * When a stored rent roll or T-12 arrived on the deal: its source
 * document's upload where the document is on record, else the extraction
 * row's own write — the screen's. That write is LATER than the upload, so
 * the fallback can only admit more, never less: a document uploaded before
 * an earlier screen's verdict and read on the re-screen reads as arriving
 * after that verdict, and only its own date (the roll's as-of, the T-12's
 * period end, `scoreScreen`'s second gate) still holds it back. Null where
 * neither is known.
 */
export function arrivalOf(
  row: { created_at?: string | null; source_document_id?: string | null } | null | undefined,
  documents: readonly { id: string; created_at: string }[],
): string | null {
  if (!row) return null;
  const doc = row.source_document_id ? documents.find((d) => d.id === row.source_document_id) : null;
  return doc?.created_at ?? row.created_at ?? null;
}

const TITLES: Record<StressKey, string> = {
  basis: "Basis",
  exit_cap: "Exit cap",
  debt: "Debt",
  noi: "NOI",
  vacancy: "Stabilized vacancy",
  rent_growth: "Rent growth",
  market_rent: "Market rent",
  expense_growth: "Expense growth",
  taxes: "Real estate taxes",
  insurance: "Insurance",
  opex: "Operating expenses",
  renovation_premium: "Renovation premium",
  other: "Everything else the challenger raised",
};

/** The keys whose figures are percents; the rest are dollars. */
const PERCENT_KEYS: ReadonlySet<StressKey> = new Set(["exit_cap", "debt", "vacancy", "rent_growth", "expense_growth"]);

/** A figure in the key's own unit: a percent to one place, a dollar compact.
 *  A market rent's places follow its yardstick (the row's `per`, which rides
 *  beside the figure): a foot's rent to the cent, a unit's month in whole
 *  dollars — never decided by the figure's size. */
export function recordFigure(key: StressKey, n: number, per: string | null = null): string {
  if (PERCENT_KEYS.has(key)) return `${n.toFixed(1)}%`;
  if (key === "renovation_premium") return `$${Math.round(n).toLocaleString("en-US")}/mo`;
  if (key === "market_rent") return per != null && /sf/i.test(per) ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`;
  if (key === "other") return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
  return compactUsd(n, { millions: 2 });
}

/** A figure as the card's three columns print it: a vacancy row's percents
 *  are each a share vacant ("5.0% vacant"), so an "Occupancy today" row's
 *  OM figure never reads as 5% occupied. */
/** A figure on the card: a vacancy says its measure — "6.0% vacant" counted
 *  by doors, "6.0% economic vacancy" in dollars over gross potential rent. */
const cardFigure = (key: StressKey, figure: string, economic = false) => (key === "vacancy" ? (economic ? `${figure} economic vacancy` : `${figure} vacant`) : figure);

/** A stress-test row's margin in words: "0.05-point", "5%". */
export function marginWords(t: NonNullable<StressSnapshotRow["threshold"]>): string {
  if (t.unit === "pts") return `${Number(t.value.toFixed(2))}-point`;
  return `${Number((t.value * 100).toFixed(1))}%`;
}

const parseTime = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

interface Later {
  source: LaterSource;
  value: number | null;
  text: string;
  /** when it arrived on the deal (ISO), null where unknown */
  at: string | null;
  /** a decision is a direction: a Dead decision has no figure; a Closed
   *  deal's own price has one, and points by it */
  decision?: boolean;
  /** a Closed deal's own price */
  purchase?: boolean;
}

/** The row's own why, a key at a time (the record's one line is
 *  `TAX_INSURANCE_NOT_SCORED`, lib/track-record-words). */
const DOCUMENTS_CANNOT_SCORE: Record<"taxes" | "insurance", string> = {
  taxes: "a seller's T-12 cannot show a new owner's tax bill, and no document on the deal is the buyer's own, so no document scores it.",
  insurance: "a seller's T-12 cannot show a new owner's premium, and no document on the deal is the buyer's own quote, so no document scores it.",
};

/** A plan deal's NOI against a later T-12. */
const PLAN_NOI_WHY = "on a plan deal the OM's NOI is the finished project's, and a T-12 is the building's year before the plan is done, not a test of it.";

/** A plan deal's stated vacancy against a later document. */
const PLAN_VACANCY_WHY = "the OM's vacancy is the stabilized figure a plan deal is to reach; a document's vacancy is the building's today, before the plan is done, not a test of it.";

/** A stabilized vacancy the market decided, against a later document. */
const MARKET_VACANCY_WHY =
  "the OM's vacancy is a stabilized assumption on a deal read as stabilized, which the stress test holds to the market's published figures where one is fresh; a document's vacancy is the building's today, the gap a lease-up has to close, not a test of it.";

/** A market rent against a later rent roll: the roll's rent is what its
 *  leases are paying, which sits under market by its loss to lease, so it
 *  would score every market rent as overstated. */
export const MARKET_RENT_WHY =
  "a rent roll shows in-place rent, which sits under market by its loss to lease; a later rent roll cannot score a market rent.";

/** An unchecked stress-test row. */
const UNCHECKED_WHY = "the stress test left it unchecked — no evidence with a figure decided it — so there is no verdict to score.";

/** Why a screen's challenges stand in for its rows, said once a screen. */
export function notSnapshottedLine(day: string | null, built: "predates" | "none", current: boolean): string {
  const which = current ? "This screen" : `The screen of ${day}`;
  const why = built === "none" ? "built no stress test" : "was made before the stress test was kept with its verdict";
  return `${which}${day && current ? ` (${day})` : ""} ${why}, so its rows were not snapshotted: its challenges are scored on the challenger's own figures instead.`;
}

/** The rent roll's vacancy as a percent, the stress test's own reading: by
 *  count on a class priced by the unit, by area on one priced by the foot,
 *  each falling to the other where the roll lacks it; null where the roll
 *  counts nothing. */
function rollVacancy(s: RentRollSummary, perUnit: boolean): { pct: number; by: "by units" | "by area" } | null {
  const area = s.sfWeightedOccupancy != null && Number.isFinite(s.sfWeightedOccupancy) ? s.sfWeightedOccupancy : null;
  const units = s.unitCount > 0 ? s.occupiedUnits / s.unitCount : null;
  if (units != null && (perUnit || area == null)) return { pct: round1((1 - units) * 100), by: "by units" };
  if (area != null) return { pct: round1((1 - area) * 100), by: "by area" };
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One screen's score: its evidence, its rows, and why each later thing on
 *  the deal was refused — a refusal for arriving BEFORE the screen carries
 *  the sentence to use instead where the prior screen scored that thing. */
interface ScreenScore {
  evidence: LaterEvidence[];
  rows: ScoredRow[];
  notScored: { source: LaterSource | null; text: string; instead?: (priorDay: string) => string }[];
  /** a document uploaded after this screen was refused for its own date */
  refusedLater: boolean;
}

/** What a screen is scored on: its stress test's rows, else its challenges. */
type ScreenSubject = { kind: "test"; snapshot: StressSnapshot } | { kind: "challenges"; challenges: readonly Challenge[]; built: "predates" | "none" };

/** A stored verdict's snapshot as a subject, else its challenges. */
function subjectOf(stressSnapshot: unknown, challenges: readonly Challenge[] | null | undefined): ScreenSubject {
  const snapshot = readStressSnapshot(stressSnapshot);
  if (snapshot) return { kind: "test", snapshot };
  return { kind: "challenges", challenges: challenges ?? [], built: stressSnapshot === null ? "none" : "predates" };
}

/**
 * Score one deal's stress test — every row it struck, holds included — or,
 * where the verdict kept no test, its stored challenges, against what
 * arrived after its screen. Every row is a row; one with nothing after the
 * screen to score it on says so. A deal with no verdict stamp scores
 * nothing: there is no "after" without a "when".
 *
 * With the earlier screens' snapshots (`priorScreen`, and every screen kept
 * in `priorScreens`), each earlier screen's rows are scored against what
 * arrived after ITS verdict, and merged newest screen first, one piece of
 * evidence a key at a time: a row an earlier screen scores on evidence a
 * newer screen ADMITTED and has a row of the same key for is dropped,
 * whether or not that row scored it (the later figure is counted once,
 * against the latest screen made before it); a row it scores on evidence no
 * newer screen with a row of its key admitted —
 * the figure arrived between that screen's verdict and the next, or was
 * refused by the newer screen for its own date, so the newer rows were made
 * with it in hand — is kept, in the current screen's unscored row's place
 * for the key where there is one, said as the earlier screen's.
 */
export function scoreDeal(args: ScoreDealArgs): DealRecord {
  const screenedAt = args.screenedAt && parseTime(args.screenedAt) != null ? args.screenedAt : null;
  const screenedOn = screenedAt ? statedDay(screenedAt) : null;
  const subject = subjectOf(args.stressSnapshot, args.challenges);
  const current = scoreScreen(screenedAt, subject, args);
  const currentT = parseTime(screenedAt);
  const priors = priorsOf([...(args.priorScreens ?? []), ...(args.priorScreen ? [args.priorScreen] : [])], currentT);
  const snapshotNotes: string[] = [];
  if (subject.kind === "challenges" && screenedAt) snapshotNotes.push(notSnapshottedLine(screenedOn, subject.built, true));
  // What can score what on this deal: its own test's titles, and the vacancy
  // held back where the market's figure decided its row.
  const testRows = subject.kind === "test" ? subject.snapshot.rows : [];
  const vacancyRow = testRows.find((r) => r.key === "vacancy");
  const scorable = scorableGrid({
    plan: args.plan,
    vacancyIsPlanTarget: args.vacancyIsPlanTarget,
    vacancyHeldToMarket: vacancyRow ? vacancyRow.evidence?.kind === "published" : !!args.vacancyHeldToMarket,
    // A challenge carries no measure of its own: the deal's OM vacancy's.
    vacancyEconomic: vacancyRow ? vacancyRow.measure === "economic" : !!args.vacancyEconomic,
    titles: Object.fromEntries(testRows.filter((r) => r.key !== "other" && r.title).map((r) => [r.key, r.title])),
  });
  const record = (s: ScreenScore, priorMeta: { screenedAt: string; screenedOn: string }[]): DealRecord => ({
    screenedAt,
    screenedOn,
    evidence: s.evidence,
    rows: s.rows,
    notScored: s.notScored.map((n) => n.text),
    refusedLater: s.refusedLater,
    prior: priorMeta[0] ?? null,
    priors: priorMeta,
    snapshotted: subject.kind === "test",
    snapshotNotes,
    scorable,
  });
  if (priors.length === 0) return record(current, []);

  const earlier = priors.map((p) => ({ ...p, day: statedDay(p.screenedAt), score: scoreScreen(p.screenedAt, p.subject, args) }));
  for (const p of earlier) if (p.subject.kind === "challenges") snapshotNotes.push(notSnapshottedLine(p.day, p.subject.built, false));

  // One piece of evidence scores an assumption once, against the latest
  // screen made before it: a thing a newer screen ADMITTED is that screen's
  // for every key it has a row of, whether or not that row scored it (a row
  // left unchecked, or a vacancy of the other measure, keeps its own unscored
  // reason), so an older screen's row of the key is never scored by it. A
  // thing a newer screen refused for its own date — a document dated before
  // that screen's verdict, uploaded after it — was never admitted by it, and
  // still falls to the earlier screen; so does a key the newer screen has no
  // row of (a challenge it no longer makes).
  const claimed = new Set<string>();
  const claim = (s: ScreenScore) => {
    const keys = new Set(s.rows.map((r) => r.key));
    for (const e of s.evidence) for (const k of keys) claimed.add(`${k}|${evidenceId(e)}`);
  };
  claim(current);
  const rows = [...current.rows];
  for (const p of earlier) {
    for (const row of p.score.rows) {
      if (row.landing === "unscored" || claimed.has(`${row.key}|${rowEvidenceId(row)}`)) continue;
      const priorRow: ScoredRow = {
        ...row,
        priorScreenedOn: p.day,
        text: `${row.title} (the screen of ${p.day}):${row.text.slice(row.title.length + 1)}`,
      };
      // In the current screen's unscored row's place for the same key — the
      // newer rows were made with the later figure in hand, so the
      // prediction to score is the earlier one — else after the rest.
      const at = rows.findIndex((r) => r.key === row.key && r.landing === "unscored");
      if (at >= 0) rows[at] = priorRow;
      else rows.push(priorRow);
    }
    claim(p.score);
  }

  // The evidence of every screen, once each; a thing first admitted by an
  // earlier screen is said to have arrived between it and the next one.
  const seen = new Set(current.evidence.map((e) => `${e.source}@${e.at}`));
  const evidence = [...current.evidence];
  // The day of the newest earlier screen that admitted each kind of thing.
  const scoredBy = new Map<LaterSource, string>();
  earlier.forEach((p, i) => {
    const newerT = i === 0 ? currentT : parseTime(earlier[i - 1].screenedAt);
    const before = i === 0 ? "this one" : `the screen of ${earlier[i - 1].day}`;
    for (const e of p.score.evidence) {
      const id = `${e.source}@${e.at}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (!scoredBy.has(e.source)) scoredBy.set(e.source, p.day);
      // A document uploaded after the newer screen, which that screen refused
      // for its own date, is DATED between the two, a trade recorded after it
      // TRADED between them, a purchase CLOSED between them; anything else
      // arrived between them.
      const afterNewer = newerT != null && (parseTime(e.at) ?? 0) > newerT;
      const verb = e.purchase ? "closed" : e.source === "trade" ? "traded" : "dated";
      const between = afterNewer ? `; ${verb} after the screen of ${p.day} and before ${before})` : `, after the screen of ${p.day} and before ${before})`;
      evidence.push({ ...e, label: `${e.label.replace(/\)$/, "")}${between}` });
    }
  });
  evidence.sort((a, b) => a.at.localeCompare(b.at));
  // A thing the current screen refused as read by it, and an earlier screen
  // scored, is said to be scored against that screen instead; an earlier
  // screen's own refusals are said once, as the screen's.
  const said = new Set<string>();
  const notScored = [
    ...current.notScored.map((n) => {
      const day = n.source ? scoredBy.get(n.source) : undefined;
      return n.instead && day ? n.instead(day) : n.text;
    }),
    ...earlier.flatMap((p) =>
      p.score.notScored
        .filter((n) => !n.instead && !said.has(n.text) && said.add(n.text))
        .map((n) => `The screen of ${p.day}: ${n.text}`),
    ),
  ];
  return record(
    {
      evidence,
      rows,
      notScored: notScored.map((text) => ({ source: null, text })),
      refusedLater: current.refusedLater || earlier.some((p) => p.score.refusedLater),
    },
    earlier.map((p) => ({ screenedAt: p.screenedAt, screenedOn: p.day })),
  );
}

/** What makes one piece of later evidence one: the kind of thing and when
 *  it arrived — as a screen admitted it, and as a row scored on it. */
const evidenceId = (e: LaterEvidence) => `${e.source}@${e.at}`;
const rowEvidenceId = (r: ScoredRow) => `${r.later?.source ?? ""}@${r.laterAt ?? ""}`;

/**
 * How many of a T-12's twelve monthly periods end on or before the verdict's
 * day (both yyyy-mm-dd): the months a period ending `periodEnd` runs back
 * over, each ending on the period end's day of its month (a month's last day
 * where the period ends on one). A T-12 dated a day after the verdict is
 * admitted, and eleven of its months are still the screen's history.
 */
export function t12MonthsBefore(periodEnd: string, verdictDay: string): number {
  const [y, m, d] = periodEnd.slice(0, 10).split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) return 0;
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthEnd = d === lastDay(y, m);
  let n = 0;
  for (let k = 0; k < 12; k++) {
    let mm = m - k;
    let yy = y;
    while (mm < 1) {
      mm += 12;
      yy--;
    }
    const dd = monthEnd ? lastDay(yy, mm) : Math.min(d, lastDay(yy, mm));
    const iso = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    if (iso <= verdictDay) n++;
  }
  return n;
}

/** The earlier screens' stamps and what each is scored on, newest first:
 *  each snapshot that holds a stamp and rows or challenges, stamped before
 *  the current screen where that has one — the same screen kept twice (in
 *  deals.prior_screen and screen_snapshots) read once, by its stamp. */
function priorsOf(list: readonly (PriorScreenLike | null | undefined)[], currentT: number | null): { screenedAt: string; subject: ScreenSubject }[] {
  const out = new Map<number, { screenedAt: string; subject: ScreenSubject }>();
  for (const prior of list) {
    const stamp = prior?.verdict?.generatedAt ?? null;
    if (!stamp) continue;
    const P = parseTime(stamp);
    if (P == null || (currentT != null && P >= currentT) || out.has(P)) continue;
    const subject = subjectOf(prior?.verdict?.stressSnapshot, Array.isArray(prior?.challenges?.challenges) ? prior.challenges.challenges : null);
    if (subject.kind === "challenges" && subject.challenges.length === 0) continue;
    out.set(P, { screenedAt: stamp, subject });
  }
  return [...out.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v);
}

/** What arrived after one screen, admitted by the rules above. */
interface Admitted {
  t12: LaterDocument<T12Summary> | null;
  /** "11 of its 12 months precede the verdict", where most of an admitted
   *  T-12's months end on or before the verdict's day (`t12MonthsBefore`);
   *  null otherwise. Words only: the T-12 is scored as before. */
  t12Overlap: string | null;
  roll: LaterDocument<RentRollSummary> | null;
  decision: { reason: OutcomeReason; at: string } | null;
  /** a third party's trade, reported on a deal moved to Dead */
  trade: { price: number; at: string; text: string } | null;
  /** a Closed deal's own price: the buyer's, a decision */
  purchase: { price: number; at: string; text: string } | null;
}

function scoreScreen(screenedAt: string | null, subject: ScreenSubject, args: ScoreDealArgs): ScreenScore {
  const T = parseTime(screenedAt);
  const evidence: LaterEvidence[] = [];
  const notScored: ScreenScore["notScored"] = [];

  // The documents, each admitted only where its arrival is on record and
  // after the screen, and its own date — a roll's as-of, a T-12's period end
  // — falls on a day after the verdict's: an upload alone is not news.
  let refusedLater = false;
  const verdictDay = T != null ? new Date(T).toISOString().slice(0, 10) : null;
  const admit = <S,>(doc: LaterDocument<S> | null | undefined, name: string, datedWord: string): LaterDocument<S> | null => {
    if (!doc) return null;
    const source: LaterSource = name === "T-12" ? "t12" : "rent_roll";
    const at = parseTime(doc.arrivedAt);
    const datedT = parseTime(doc.dated);
    const datedDay = datedT != null ? new Date(datedT).toISOString().slice(0, 10) : null;
    const dated = doc.dated && datedDay ? `${name} ${datedWord} ${statedDay(doc.dated)}` : `${name} (${datedWord === "to" ? "period" : "as-of"} not stated)`;
    if (T == null) {
      notScored.push({ source, text: `${dated} is on the deal, but the verdict carries no screen time to set it after.` });
      return null;
    }
    if (at == null) {
      notScored.push({ source, text: `${dated} is on the deal with no arrival time on record, so it is not scored.` });
      return null;
    }
    if (at <= T) {
      const added = statedDay(doc.arrivedAt!);
      notScored.push({
        source,
        text: `${dated} was on the deal before the screen (added ${added}): the screen read it, so it is not scored against it.`,
        instead: (priorDay) => `${dated} was on the deal before this screen (added ${added}): this screen read it, so it is scored against the screen of ${priorDay} instead.`,
      });
      return null;
    }
    const added = statedDay(doc.arrivedAt!);
    if (datedDay == null) {
      refusedLater = true;
      const missing = source === "t12" ? "period end" : "as-of date";
      notScored.push({
        source,
        text: `${dated} was added ${added}, after the screen, but with no ${missing} on record nothing shows its figures postdate the verdict, so it is not scored.`,
      });
      return null;
    }
    if (verdictDay != null && datedDay <= verdictDay) {
      refusedLater = true;
      const what = source === "t12" ? "its period ended" : "it is dated";
      const onDay = statedDay(verdictDay);
      notScored.push({
        source,
        text: `${dated} was added ${added}, after the screen, but ${what} on or before the verdict (${onDay}): it is history the screen could have been handed, only uploaded later, so it is not scored.`,
        instead: (priorDay) => `${dated} was added ${added}, but ${what} on or before this screen's verdict (${onDay}), so it is scored against the screen of ${priorDay} instead.`,
      });
      return null;
    }
    evidence.push({ source, label: `${dated} (added ${added})`, at: doc.arrivedAt! });
    return doc;
  };
  const t12 = admit(args.t12, "T-12", "to");
  const roll = admit(args.rentRoll, "Rent roll", "as of");
  // A period ending a day after the verdict is admitted, and is still
  // mostly the months before it: said on every row it scores.
  const before = t12?.dated && verdictDay ? t12MonthsBefore(t12.dated, verdictDay) : 0;
  const t12Overlap = before > 6 ? `${before} of its 12 months precede the verdict` : null;

  // The decision and the trade, off the move that ended the deal.
  const history = args.history ?? [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  const stage = args.stage ?? null;
  const ended = last && (stage === "dead" || stage === "closed") && last.stage === stage ? last : null;
  let decision: Admitted["decision"] = null;
  let trade: Admitted["trade"] = null;
  let purchase: Admitted["purchase"] = null;
  if (ended?.outcome) {
    const endedAt = parseTime(ended.at);
    const reasonLabel = ended.outcome.reason ? OUTCOME_REASON_LABEL[ended.outcome.reason].toLowerCase() : null;
    if (ended.outcome.reason && ended.stage === "dead") {
      if (T != null && endedAt != null && endedAt > T) {
        decision = { reason: ended.outcome.reason, at: ended.at };
        evidence.push({ source: "outcome", label: `Moved to Dead on ${reasonLabel} (${statedDay(ended.at)})`, at: ended.at });
      } else if (T == null) {
        notScored.push({ source: "outcome", text: `The deal died on ${reasonLabel}, but the verdict carries no screen time to set the decision after.` });
      } else {
        notScored.push({
          source: "outcome",
          text: `The deal died on ${reasonLabel} before the screen's verdict (${statedDay(ended.at)}), so the decision is not scored.`,
          instead: (priorDay) => `The deal died on ${reasonLabel} before this screen's verdict (${statedDay(ended.at)}), so the decision is scored against the screen of ${priorDay} instead.`,
        });
      }
    }
    const t = ended.outcome.trade;
    // On a Closed deal the price is the buyer's own, negotiated with the
    // screen in hand: a decision, admitted by the same dates as a trade and
    // said as the buyer's, never a market's verdict on the OM's figure.
    const bought = ended.stage === "closed";
    if (t) {
      const reportedAt = parseTime(t.reportedAt);
      const who = t.reportedBy ? `, reported by ${t.reportedBy}` : "";
      const when = t.date ? ` on ${statedDay(t.date)}` : "";
      const text = bought ? `bought it at ${compactUsd(t.price, { millions: 2 })}${when}` : `traded at ${compactUsd(t.price, { millions: 2 })}${when}${who}`;
      const source: LaterSource = bought ? "outcome" : "trade";
      const what = bought ? `The purchase (you ${text})` : `The trade (${text})`;
      // The trade's own day, where stated, as a document's own date is read:
      // one reported after the verdict but traded on or before its day is a
      // sale the screen could have been told of, only reported later.
      const tradedT = parseTime(t.date);
      const tradedDay = tradedT != null ? new Date(tradedT).toISOString().slice(0, 10) : null;
      if (T != null && reportedAt != null && reportedAt > T && verdictDay != null && tradedDay != null && tradedDay <= verdictDay) {
        refusedLater = true;
        const onDay = statedDay(verdictDay);
        const recorded = statedDay(t.reportedAt);
        const verb = bought ? "closed" : "traded";
        notScored.push({
          source,
          text: bought
            ? `${what} was recorded ${recorded}, after the screen, but it closed on or before the verdict's day (${onDay}): a price agreed before the screen's call, only recorded later, so it is not counted.`
            : `${what} was recorded ${recorded}, after the screen, but it traded on or before the verdict's day (${onDay}): a sale the screen could have been told of, only reported later, so it is not scored.`,
          instead: (priorDay) => `${what} was recorded ${recorded}, but it ${verb} on or before this screen's verdict (${onDay}), so it is ${bought ? "counted" : "scored"} against the screen of ${priorDay} instead.`,
        });
      } else if (T != null && reportedAt != null && reportedAt > T) {
        if (bought) {
          purchase = { price: t.price, at: t.reportedAt, text };
          evidence.push({ source, label: `You ${text}: your own price, a decision (recorded ${statedDay(t.reportedAt)})`, at: t.reportedAt, purchase: true });
        } else {
          trade = { price: t.price, at: t.reportedAt, text };
          evidence.push({ source, label: `The building ${text} (recorded ${statedDay(t.reportedAt)})`, at: t.reportedAt });
        }
      } else if (T == null) {
        notScored.push({ source, text: bought ? `${what} is recorded, but the verdict carries no screen time to set it after.` : `A trade is recorded (${text}), but the verdict carries no screen time to set it after.` });
      } else {
        notScored.push({
          source,
          text: `${what} was recorded before the screen's verdict, so it is not ${bought ? "counted" : "scored"}.`,
          instead: (priorDay) => `${what} was recorded before this screen's verdict, so it is ${bought ? "counted" : "scored"} against the screen of ${priorDay} instead.`,
        });
      }
    }
  }
  evidence.sort((a, b) => a.at.localeCompare(b.at));

  const admitted: Admitted = { t12, t12Overlap, roll, decision, trade, purchase };
  const rows =
    subject.kind === "test"
      ? subject.snapshot.rows.map((r) => scoreTestRow(r, T, admitted, args))
      : subject.challenges.map((c) => scoreChallenge(c, T, admitted, args));
  return { evidence, rows, notScored, refusedLater };
}

/** Why a later document cannot speak to a row of this key, where it cannot:
 *  a stabilized vacancy the market holds, a plan deal's stated vacancy or
 *  its NOI. */
function documentCannotSpeak(key: StressKey, later: Later, args: ScoreDealArgs, heldToMarket: boolean): string | null {
  const fromDocument = later.source === "rent_roll" || later.source === "t12";
  if (!fromDocument) return null;
  // A plan deal's stated vacancy is the plan's target first, whatever
  // figure decided its row: the market's sentence speaks of a deal read as
  // stabilized, which a value-add is not.
  if (key === "vacancy" && args.vacancyIsPlanTarget) return PLAN_VACANCY_WHY;
  if (key === "vacancy" && heldToMarket) return MARKET_VACANCY_WHY;
  if (key === "noi" && args.plan) return PLAN_NOI_WHY;
  if (key === "market_rent") return MARKET_RENT_WHY;
  return null;
}

/** The trade's figure on the OM figure's own basis, where it can be put on
 *  one (`laterFor`). */
const perUnitFor = (args: ScoreDealArgs) => args.assetClass !== undefined && assetWords(args.assetClass).basis === "unit";

/** A label read mid-sentence: "the deal's T-12", "rental vacancy, metro
 *  area" — its first word lowercased where it is a plain word, never an
 *  acronym ("CPI", "10-year") or a publisher's name. */
const PROPER_LEAD = /^(?:Zillow|Census|Realtor|Freddie|Fannie|Treasury|Moody)/;
const midSentence = (label: string) => (/^[A-Z][a-z]+\b/.test(label) && !PROPER_LEAD.test(label) ? `${label[0].toLowerCase()}${label.slice(1)}` : label);
const asOfWords = (asOf: string | null) => (asOf ? statedDay(asOf) : null);

/**
 * One stress-test row as it stood at the verdict, against what arrived after
 * it. The test's verdict says which way the row pointed: stretched or
 * unsupported says the OM's figure is worse for the buyer than it says, a
 * hold that it is not. The later figure's move from the OM's, signed so that
 * positive is worse for the buyer, is set against the row's own margin.
 */
function scoreTestRow(r: StressSnapshotRow, T: number | null, ev: Admitted, args: ScoreDealArgs): ScoredRow {
  const key = r.key;
  const title = r.title || TITLES[key];
  const per = r.per ?? "";
  const fig = (n: number) => `${recordFigure(key, n, r.per)}${per}`;
  const base = {
    key,
    title,
    assumption: title,
    omFigure: r.om,
    altFigure: r.evidence?.value ?? null,
    altBasis: r.evidence?.label ?? null,
    fromTest: true as const,
    verdict: r.verdict,
  };
  const unscored = (why: string, later: Later | null = null): ScoredRow => ({
    ...base,
    outcome: null,
    later: later ? { source: later.source, value: later.value, text: later.text } : null,
    figures: null,
    landing: "unscored",
    why,
    text: later ? `${title}: ${later.text}, but ${why.replace(/\.$/, "")}, so it is not scored.` : `${title}: ${why}`,
  });

  if (T == null) return unscored("the verdict carries no screen time, so nothing can be said to have come after it.");
  if (r.verdict === "unchecked") return unscored(UNCHECKED_WHY);
  if (key === "taxes" || key === "insurance") return unscored(DOCUMENTS_CANNOT_SCORE[key]);

  const laterArgs = { ...ev, omFigure: r.om, askingPrice: args.askingPrice ?? null, perUnit: perUnitFor(args), economic: r.measure === "economic", less: r.key === "opex" ? (r.less ?? []) : null, per: r.per };
  // A snapshot kept before the measure was carried (2026-10-20) has none,
  // and keeps the row's title and the deciding evidence, never the OM's own
  // label the measure is read off (lib/stress-test `measureOf`): it is read
  // as counted by doors, as it was struck.
  const econ = laterArgs.economic;
  // The market decided a stabilized vacancy where its published figure did.
  const heldToMarket = key === "vacancy" && r.evidence?.kind === "published";
  const later = laterFor(key, laterArgs);
  if (!later) {
    // A vacancy is scored in its own measure: a document of the other one is
    // named, with why, never passed over in silence.
    const other = otherMeasure(key, laterArgs, args, heldToMarket);
    return other ? unscored(other.why, other.later) : unscored("nothing that arrived after the screen speaks to it.");
  }
  const cannot = documentCannotSpeak(key, later, args, heldToMarket);
  if (cannot) return unscored(cannot, later);

  const flagged = r.verdict === "stretched" || r.verdict === "unsupported";
  const omWords = r.om != null ? `the OM's ${fig(r.om)}` : "the OM's figure";
  const against = r.evidence
    ? `, set against ${midSentence(r.evidence.label)} at ${fig(r.evidence.value)}${asOfWords(r.evidence.asOf) ? ` (${asOfWords(r.evidence.asOf)})` : ""}`
    : "";
  const readAs = `the test read ${omWords} as ${r.verdict === "holds" ? "holding" : r.verdict}${against}`;

  if (later.decision && !later.purchase) {
    // A direction, not a figure: no outcome of the four, counted apart.
    return {
      ...base,
      outcome: null,
      later: { source: later.source, value: null, text: later.text },
      figures: null,
      landing: flagged ? "right" : "wrong",
      decision: true,
      laterAt: later.at,
      why: null,
      text: `${title}: ${readAs}, and you ${later.text} — ${flagged ? "a decision on the test's side" : "a decision against the hold"}, not a figure.`,
    };
  }
  if (r.om == null) return unscored("the OM states no figure to score it on.", later);
  if (later.value == null) return unscored("what came after carries no figure on the OM figure's basis.", later);
  if (!r.threshold) return unscored("the row carries no margin to score it by.", later);
  if (r.threshold.unit === "share" && r.om === 0) return unscored("the OM's figure is zero, so no share of it can be read.", later);

  const v = later.value;
  const move = (r.worse === "higher" ? v - r.om : r.om - v) / (r.threshold.unit === "share" ? Math.abs(r.om) : 1);
  const past = move > r.threshold.value + 1e-9;
  const outcome: RowOutcome = flagged ? (past ? "flag_right" : "flag_wrong") : past ? "false_hold" : "hold_right";
  const margin = `the row's ${marginWords(r.threshold)} margin`;
  if (later.purchase) {
    // A Closed deal's own price: the buyer's, negotiated with the screen in
    // hand — a decision that points by its figure, never a market's verdict
    // on the OM's, counted apart and in no share.
    const agrees = flagged ? past : !past;
    const side = agrees ? "on the test's side" : flagged ? "against the flag" : "against the hold";
    const at = past ? `more than ${margin} under the OM's figure` : `within ${margin} of the OM's figure, or over it`;
    return {
      ...base,
      outcome: null,
      later: { source: later.source, value: v, text: later.text },
      figures: null,
      landing: agrees ? "right" : "wrong",
      decision: true,
      purchase: true,
      laterAt: later.at,
      why: null,
      text: `${title}: ${readAs}; ${later.text} — ${at}: your own price, negotiated with the screen in hand, so a decision ${side}, counted apart and in no share.`,
    };
  }
  // A price is the one row where the later figure is the market's verdict on
  // the OM's, not a figure that is better or worse for the buyer: a trade
  // under the ask says the market priced it under the OM's figure.
  const where =
    key === "basis"
      ? past
        ? `more than ${margin} under the OM's figure, the market pricing it under the ask: ${flagged ? "the test was right" : "a false hold"}`
        : `within ${margin} of the OM's figure, or over it, the market paying about the ask or more: ${flagged ? "the test was wrong" : "the hold was right"}`
      : past
        ? `past the OM's figure, worse for the buyer by more than ${margin}: ${flagged ? "the test was right" : "a false hold"}`
        : flagged
          ? `within ${margin} of the OM's figure, or better for the buyer: the test was wrong`
          : `within ${margin} of the OM's figure, or better for the buyer: the hold was right`;
  return {
    ...base,
    outcome,
    later: { source: later.source, value: v, text: later.text },
    figures: { om: cardFigure(key, fig(r.om), econ), alt: r.evidence ? cardFigure(key, fig(r.evidence.value), econ) : "—", later: cardFigure(key, fig(v), econ) },
    landing: outcome === "flag_right" || outcome === "hold_right" ? "right" : "wrong",
    laterAt: later.at,
    // Beside right and wrong, display only: how much of the gap the evidence
    // opened the later figure covered.
    captured: flagged ? gapCaptured(r.om, r.evidence?.value, v) : null,
    why: null,
    text: `${title}: ${readAs}; ${later.text} — ${where}.`,
  };
}

/** A stored challenge (a screen whose stress test was not kept), scored on
 *  the challenger's own figures by which side of them the later figure
 *  landed on. */
function scoreChallenge(c: Challenge, T: number | null, ev: Admitted, args: ScoreDealArgs): ScoredRow {
  const key = challengeKey(c);
  const title = TITLES[key];
  const omFigure = c.omFigure != null && Number.isFinite(c.omFigure) ? c.omFigure : null;
  const altFigure = c.altFigure != null && Number.isFinite(c.altFigure) ? c.altFigure : null;
  const altBasis = c.altBasis?.trim() || null;
  const base = { key, title, assumption: c.assumption, omFigure, altFigure, altBasis };
  const unscored = (why: string): ScoredRow => ({ ...base, later: null, figures: null, landing: "unscored", why, text: `${title}: ${why}` });

  if (T == null) return unscored("the verdict carries no screen time, so nothing can be said to have come after it.");
  // A seller's T-12 shows the seller's bill and premium, never a new
  // owner's, and no document kind on the deal is the buyer's own: no
  // document scores these, whatever arrives.
  if (key === "taxes" || key === "insurance") return unscored(DOCUMENTS_CANNOT_SCORE[key]);

  // A challenge carries no measure of its own: its vacancy is read in the
  // measure of the deal's OM vacancy (`vacancyEconomic`) — doors, scored by a
  // later rent roll alone, or dollars, by a later T-12's economic vacancy
  // alone, the other document named as the other measure.
  const laterArgs = { ...ev, omFigure, askingPrice: args.askingPrice ?? null, perUnit: perUnitFor(args), economic: !!args.vacancyEconomic };
  const cannotScore = (l: Later, why: string): ScoredRow => ({
    ...base,
    later: { source: l.source, value: l.value, text: l.text },
    figures: null,
    landing: "unscored",
    why,
    text: `${title}: ${l.text}, but ${why.replace(/\.$/, "")}, so it is not scored.`,
  });
  const later = laterFor(key, laterArgs);
  if (!later) {
    const other = otherMeasure(key, laterArgs, args, !!args.vacancyHeldToMarket);
    return other ? cannotScore(other.later, other.why) : unscored("nothing that arrived after the screen speaks to it.");
  }
  // The stress test's own rule: a stabilized assumption on a deal read as
  // stabilized is held to the market's published figures, and a
  // document's vacancy is today's — never the test of it. And on a plan
  // deal the OM's NOI and stated vacancy are the finished project's: a
  // document of the building before the plan is done cannot speak to them.
  const why = documentCannotSpeak(key, later, args, !!args.vacancyHeldToMarket);
  if (why) return cannotScore(later, why);

  if (later.decision && !later.purchase) {
    return {
      ...base,
      later: { source: later.source, value: null, text: later.text },
      figures: null,
      landing: "screen_side",
      decision: true,
      laterAt: later.at,
      why: null,
      text: `${title}: the screen challenged it ("${c.assumption}"), and you ${later.text} — a decision on the screen's side, not a figure.`,
    };
  }
  if (omFigure == null || altFigure == null) {
    return {
      ...base,
      later: { source: later.source, value: later.value, text: later.text },
      figures: null,
      landing: "unscored",
      why: omFigure == null ? "the challenger gave no OM figure to score it on." : "the challenger gave no alternative figure to score it on.",
      text: `${title}: ${later.text}, but ${omFigure == null ? "the challenger gave no OM figure" : "the challenger gave no alternative figure"}, so it is not scored.`,
    };
  }
  if (omFigure === altFigure) return unscored("the screen's figure is the OM's own, so there is no side to land on.");
  // A trade with no asking price to put it on the OM figure's basis
  // carries no figure: named, never scored as one.
  if (later.value == null) {
    return { ...base, later: { source: later.source, value: null, text: later.text }, figures: null, landing: "unscored", why: "what came after carries no figure on the OM figure's basis.", text: `${title}: ${later.text}, but it carries no figure on the OM figure's basis, so it is not scored.` };
  }
  const v = later.value;
  const lo = Math.min(omFigure, altFigure);
  const hi = Math.max(omFigure, altFigure);
  const landing: Landing = v > lo && v < hi ? "between" : Math.abs(v - omFigure) <= Math.abs(v - altFigure) ? "om_side" : "screen_side";
  const where = landing === "between" ? "between the two" : landing === "om_side" ? "on the OM's side" : "on the screen's side";
  if (later.purchase) {
    // A Closed deal's own price: which side it landed on, said as a
    // decision, counted apart and in no share.
    return {
      ...base,
      later: { source: later.source, value: v, text: later.text },
      figures: null,
      landing,
      decision: true,
      purchase: true,
      laterAt: later.at,
      why: null,
      text: `${title}: the OM's ${recordFigure(key, omFigure)}, the screen's ${recordFigure(key, altFigure)}${altBasis ? ` (${altBasis})` : ""}; ${later.text} — ${where}: your own price, negotiated with the screen in hand, so a decision, counted apart and in no share.`,
    };
  }
  return {
    ...base,
    later: { source: later.source, value: v, text: later.text },
    figures: {
      om: cardFigure(key, recordFigure(key, omFigure), laterArgs.economic),
      alt: cardFigure(key, recordFigure(key, altFigure), laterArgs.economic),
      later: cardFigure(key, recordFigure(key, v), laterArgs.economic),
    },
    landing,
    laterAt: later.at,
    why: null,
    text: `${title}: the OM's ${recordFigure(key, omFigure)}, the screen's ${recordFigure(key, altFigure)}${altBasis ? ` (${altBasis})` : ""}; ${later.text} — ${where}.`,
  };
}

/** The later figure that speaks to a key, where one arrived. A figure beats
 *  a decision. A vacancy is scored in its own measure: a figure counted by
 *  doors by the rent roll's count alone, an economic one (dollars over gross
 *  potential rent) by the T-12 alone — the stress test's own rule
 *  (lib/stress-deciders `VACANCY_ORDER`), so doors are never scored against
 *  dollars. Each carries when it arrived (`at`), which makes it one piece of
 *  evidence. */
function laterFor(
  key: StressKey,
  ev: Admitted & {
    omFigure: number | null;
    askingPrice: number | null;
    perUnit: boolean;
    /** the row's OM figure is an economic vacancy, not one counted by doors */
    economic: boolean;
    /** an operating-expense row's footing: the lines its figures leave out
     *  (lib/stress-snapshot `less`). Absent on an older screen's challenge,
     *  whose figure's footing is not known, so none scores it */
    less?: readonly ("taxes" | "insurance")[] | null;
    /** a market-rent row's yardstick ("/mo" or "/SF"); absent on an older
     *  screen's challenge, whose figure's yardstick is not known */
    per?: string | null;
  },
): Later | null {
  const t12When = t12WhenOf(ev);
  // A price on the OM figure's own basis: the price over the ask, applied to
  // the figure the row carries (per unit, per foot or whole).
  const onBasis = (price: number): { value: number | null; whole: boolean } => {
    if (ev.omFigure == null || ev.askingPrice == null || !(ev.askingPrice > 0)) return { value: null, whole: false };
    const whole = Math.abs(ev.omFigure - ev.askingPrice) / ev.askingPrice < 0.01;
    return { value: whole ? price : ev.omFigure * (price / ev.askingPrice), whole };
  };
  switch (key) {
    case "vacancy":
      return ev.economic ? t12VacancyLater(ev) : rollVacancyLater(ev);
    case "noi": {
      const n = ev.t12?.summary.noi;
      if (n != null && Number.isFinite(n) && n !== 0) {
        return { source: "t12", value: n, at: ev.t12!.arrivedAt, text: `${t12When} earned ${compactUsd(n, { millions: 2 })}${ev.t12!.summary.noiDerived ? " (derived)" : ""}` };
      }
      return null;
    }
    // Taxes and insurance are never here: a seller's T-12 cannot show a new
    // owner's bill or premium (`DOCUMENTS_CANNOT_SCORE`). The operating
    // lines are the building's own, so a seller's later T-12 speaks to them:
    // its expense total less the tax and insurance lines the row's figures
    // left out, on the row's own footing — none where it breaks out no such
    // line, and none for a challenge, whose figure's footing is not known.
    case "opex": {
      // The stress test's own reading of a T-12 on the row's footing
      // (lib/stress-test `t12OpexOnFooting`): its tax and insurance lines
      // are subtracted, never scored.
      if (!ev.t12 || !ev.less) return null;
      const footed = t12OpexOnFooting({ periodEnd: ev.t12.dated, summary: ev.t12.summary }, ev.less);
      if (!footed || "missing" in footed) return null;
      const out = [...(footed.tax != null ? ["taxes"] : []), ...(footed.insurance != null ? ["insurance"] : [])];
      return {
        source: "t12",
        value: footed.value,
        at: ev.t12.arrivedAt,
        text: `${t12When} ran ${compactUsd(footed.value, { millions: 2 })} of operating expenses${out.length ? ` less its ${out.join(" and ")}` : ""}`,
      };
    }
    case "basis": {
      if (ev.trade) {
        const { value, whole } = onBasis(ev.trade.price);
        return {
          source: "trade",
          value,
          at: ev.trade.at,
          text: `the building ${ev.trade.text}${value == null || whole ? "" : `, ${recordFigure("basis", value)} on the OM figure's basis`}`,
        };
      }
      // A Closed deal's own price: the buyer's, a decision with a figure.
      if (ev.purchase) {
        const { value, whole } = onBasis(ev.purchase.price);
        return {
          source: "outcome",
          value,
          at: ev.purchase.at,
          text: `you ${ev.purchase.text}${value == null || whole ? "" : `, ${recordFigure("basis", value)} on the OM figure's basis`}`,
          decision: true,
          purchase: true,
        };
      }
      if (ev.decision?.reason === "price") return { source: "outcome", value: null, at: ev.decision.at, text: "walked away on price", decision: true };
      return null;
    }
    // A later rent roll's in-place rent on the row's own yardstick, read
    // only to be named beside the row: an in-place rent sits under market by
    // its loss to lease, so it never scores a market rent
    // (`documentCannotSpeak`, `MARKET_RENT_WHY`).
    case "market_rent": {
      if (!ev.roll || (ev.per !== "/mo" && ev.per !== "/SF")) return null;
      const s = ev.roll.summary;
      const v = ev.per === "/mo" ? s.avgRentMonthly : s.weightedAvgRentPsf;
      if (v == null || !Number.isFinite(v) || !(v > 0)) return null;
      const said = ev.per === "/mo" ? `$${Math.round(v).toLocaleString("en-US")} a month a unit` : `$${v.toFixed(2)} a square foot a year`;
      return {
        source: "rent_roll",
        value: v,
        at: ev.roll.arrivedAt,
        text: `the rent roll${ev.roll.dated ? ` as of ${statedDay(ev.roll.dated)}` : ""} ran ${said} in place — an in-place rent, not a market's`,
      };
    }
    case "debt":
      if (ev.decision?.reason === "financing") return { source: "outcome", value: null, at: ev.decision.at, text: "walked away on financing", decision: true };
      return null;
    default:
      return null;
  }
}

type LaterArgs = Parameters<typeof laterFor>[1];

/** "the T-12 to May 31, 2026 (11 of its 12 months precede the verdict)" */
const t12WhenOf = (ev: LaterArgs) => `${ev.t12?.dated ? `the T-12 to ${statedDay(ev.t12.dated)}` : "the T-12"}${ev.t12Overlap ? ` (${ev.t12Overlap})` : ""}`;

/** A later rent roll's vacancy, by its count of doors (by its area on a
 *  class priced by the foot): what scores a vacancy counted by doors. */
function rollVacancyLater(ev: LaterArgs): Later | null {
  const rv = ev.roll ? rollVacancy(ev.roll.summary, ev.perUnit) : null;
  if (rv == null) return null;
  return {
    source: "rent_roll",
    value: rv.pct,
    at: ev.roll!.arrivedAt,
    text: `the rent roll${ev.roll!.dated ? ` as of ${statedDay(ev.roll!.dated)}` : ""} ran ${rv.pct.toFixed(1)}% vacant ${rv.by}`,
  };
}

/** A later T-12's economic vacancy, over gross potential rent, the
 *  statement's own EGI saying whether its rent line is gross or net
 *  (lib/actuals/analyze, the stress test's one reading): what scores an
 *  economic vacancy, and nothing else. */
function t12VacancyLater(ev: LaterArgs): Later | null {
  const tv = ev.t12 ? t12Vacancy(ev.t12.summary) : null;
  if (tv == null) return null;
  return {
    source: "t12",
    value: tv.pct,
    at: ev.t12!.arrivedAt,
    text: `${t12WhenOf(ev)} ran ${tv.pct.toFixed(1)}% economic vacancy (its vacancy loss over gross potential rent: ${t12VacancyOverWords(tv)})`,
  };
}

/** Why a vacancy row is not scored by a later document of the other
 *  measure: doors are never scored against dollars. */
export const T12_NOT_DOORS_WHY =
  "the T-12's economic vacancy is dollars, not doors, and the OM's figure counts doors, which only a later rent roll can score.";
export const ROLL_NOT_DOLLARS_WHY =
  "the rent roll counts doors, not dollars, and the OM's figure is an economic vacancy, which only a later T-12's can score.";

/** A vacancy row nothing of its own measure arrived to score: the later
 *  document of the other measure, where one arrived with a figure, and why
 *  it does not score the row — a plan's target or the market's figure first,
 *  which hold the vacancy back from every document, else the measure — so
 *  the card says why rather than nothing. */
function otherMeasure(key: StressKey, ev: LaterArgs, args: ScoreDealArgs, heldToMarket: boolean): { later: Later; why: string } | null {
  if (key !== "vacancy") return null;
  const later = ev.economic ? rollVacancyLater(ev) : t12VacancyLater(ev);
  if (!later) return null;
  return { later, why: documentCannotSpeak(key, later, args, heldToMarket) ?? (ev.economic ? ROLL_NOT_DOLLARS_WHY : T12_NOT_DOORS_WHY) };
}

// ── What can score what ─────────────────────────────────────────────────

/** The kinds of later evidence, in the grid's column order. */
export const SCORABLE_SOURCES: readonly LaterSource[] = ["t12", "rent_roll", "outcome", "trade"];

/** One row of the grid of what kind of later evidence can score which
 *  stress-test row: plain data, so the deal page's client card draws it. */
export interface ScorableRow {
  key: StressKey;
  title: string;
  /** a kind of later evidence that can score (or, a decision, answer) it */
  by: Record<LaterSource, boolean>;
}

/** The deal's own conditions the scorer reads: a plan deal's NOI and stated
 *  vacancy, a stabilized vacancy the market's figure decided. */
export interface ScorableContext {
  plan?: boolean;
  vacancyIsPlanTarget?: boolean;
  vacancyHeldToMarket?: boolean;
  /** the deal's vacancy row counts dollars (`StressSnapshotRow.measure`
   *  "economic"), so only a T-12 scores it; false, one counted by doors,
   *  which only a rent roll scores; absent (the account's grid, no deal),
   *  either kind of row, so either document is marked */
  vacancyEconomic?: boolean;
  /** the row titles the deal's own test carries ("Occupancy today") */
  titles?: Partial<Record<StressKey, string>>;
}

// A synthetic screen the grid is struck on: never printed, only run.
const GRID_SCREEN = "2026-01-01T12:00:00Z";
const GRID_LATER = "2026-03-01T12:00:00Z";
const GRID_LATER_DAY = "2026-03-01";
const GRID_FIGURE = 100;

/**
 * Which kind of later evidence can score which row, read off the scorer
 * itself rather than written by hand: each key's row, read stretched with a
 * figure and its margin, is run through `scoreTestRow` against one kind of
 * evidence at a time — a T-12, a rent roll, a Dead decision (on price, then
 * on financing), a trade — dated after a screen, and a mark is set where the
 * row comes back scored (a decision's answer included). So a taxes or an
 * insurance row is never marked against a seller's document, a plan deal's
 * NOI or stated vacancy against neither document, a vacancy the market's
 * figure decided against neither, and a vacancy counted by doors against
 * the rent roll alone, an economic one against the T-12 alone — whatever the
 * scorer does today.
 */
export function scorableGrid(ctx: ScorableContext = {}): ScorableRow[] {
  const T = Date.parse(GRID_SCREEN);
  const args: ScoreDealArgs = {
    screenedAt: GRID_SCREEN,
    challenges: [],
    askingPrice: GRID_FIGURE,
    plan: ctx.plan,
    vacancyIsPlanTarget: ctx.vacancyIsPlanTarget,
  };
  const none: Admitted = { t12: null, t12Overlap: null, roll: null, decision: null, trade: null, purchase: null };
  const t12: T12Summary = { collectedRent: 1_000, vacancyLoss: 100, otherIncome: 0, egi: 900, opex: [], totalOpex: 400, noi: 500, noiDerived: false };
  const roll = { unitCount: 10, occupiedUnits: 9, totalSf: 1_000, occupiedSf: 900, sfWeightedOccupancy: 0.9, avgRentMonthly: 80, weightedAvgRentPsf: 80 } as RentRollSummary;
  const kinds: Record<LaterSource, Admitted[]> = {
    t12: [{ ...none, t12: { arrivedAt: GRID_LATER, dated: GRID_LATER_DAY, summary: t12 } }],
    rent_roll: [{ ...none, roll: { arrivedAt: GRID_LATER, dated: GRID_LATER_DAY, summary: roll } }],
    outcome: (["price", "financing"] as const).map((reason) => ({ ...none, decision: { reason, at: GRID_LATER } })),
    trade: [{ ...none, trade: { price: GRID_FIGURE * 0.8, at: GRID_LATER, text: "traded" } }],
  };
  return STRESS_KEYS.map((key) => {
    const row: StressSnapshotRow = {
      key,
      title: TITLES[key],
      verdict: "stretched",
      om: GRID_FIGURE,
      page: null,
      evidence: {
        value: GRID_FIGURE * 0.9,
        label: "the deciding figure",
        asOf: null,
        kind: key === "vacancy" && ctx.vacancyHeldToMarket ? "published" : "document",
        publisher: "",
      },
      per: null,
      threshold: snapshotThreshold(key),
      worse: WORSE_WHEN[key],
      // A market rent carries its yardstick, which a later rent roll is read on.
      ...(key === "market_rent" ? { per: "/mo" } : {}),
    };
    // A vacancy is scored in its own measure: the deal's own row's, else
    // (the account's grid) a row of either measure.
    const economic = row.key === "vacancy" ? ctx.vacancyEconomic : false;
    const rows = economic === undefined ? [row, { ...row, measure: "economic" as const }] : economic ? [{ ...row, measure: "economic" as const }] : [row];
    const by = Object.fromEntries(
      SCORABLE_SOURCES.map((source) => [source, rows.some((r) => kinds[source].some((ev) => scoreTestRow(r, T, ev, args).landing !== "unscored"))]),
    ) as Record<LaterSource, boolean>;
    return { key, title: ctx.titles?.[key] ?? TITLES[key], by };
  });
}

// ── The account's record ────────────────────────────────────────────────

/**
 * What the account's record does with a stabilized vacancy, said where it is
 * drawn (audit M5). A stress-test row kept with its verdict says which kind
 * of evidence decided it, so a later rent roll or T-12 is held back only
 * where the market's figure did. A screen whose test was not kept has only
 * its challenges, and the account's record builds no stress test for each
 * deal, so it holds every stated stabilized vacancy back as the market's.
 */
export const ACCOUNT_VACANCY_NOTE =
  "A stabilized vacancy the market's figure decided is never scored by a later rent roll or T-12. For a screen whose stress test was not kept, this record holds back every stated stabilized vacancy counted by doors; one the OM states as economic, dollars, is not the market's to decide, and a later T-12, the same measure, scores it outside a plan deal. Its deal's own page scores a vacancy by doors where the documents decided it.";

export interface KeyRecord {
  key: StressKey;
  title: string;
  /** stress-test rows */
  right: number;
  wrong: number;
  /** challenges scored where no stress test was kept */
  screenSide: number;
  omSide: number;
  between: number;
}

export interface AccountRecord {
  /** deals with a stamped verdict and at least one stored row or challenge */
  dealsTested: number;
  /** deals with something that arrived after the screen */
  dealsWithLater: number;
  /** stress-test rows scored on figures, right or wrong; never a decision */
  scored: number;
  /** the deals those scored rows come from: the floor counts rows, and a
   *  share is said beside how many deals its rows are from */
  scoredDeals: number;
  right: number;
  wrong: number;
  /** of the wrong rows, the holds a later figure landed past */
  falseHolds: number;
  /** the stress-test shares, only at RECORD_FLOOR scored rows or more */
  shares: { rightPct: number; wrongPct: number } | null;
  /** challenges scored on the challenger's own figures, from screens whose
   *  stress test was not kept: counted on their own, never mixed into the
   *  rows' shares */
  challenges: {
    scored: number;
    /** the deals those challenges come from */
    deals: number;
    screenSide: number;
    omSide: number;
    between: number;
    /** only at RECORD_FLOOR scored challenges or more */
    shares: { screenSidePct: number; omSidePct: number; betweenPct: number } | null;
  };
  /** rows a decision answered (Dead, and why, or a Closed deal's own
   *  price): counted apart, in no share and no key's bar, since a direction
   *  is not a figure */
  decisions: number;
  /** of those, the rows a Closed deal's own price answered */
  purchases: number;
  /** of the scored stress-test rows, whatever their verdict, those whose
   *  later figure landed past the OM's on the buyer's bad side by more than
   *  the row's margin (a flag borne out, or a false hold): the base rate a
   *  flag's being right is read beside */
  pastOm: number;
  /** that count's share, only at RECORD_FLOOR scored rows or more */
  pastOmPct: number | null;
  /** each scored flagged row's capture of its gap, display only: never a
   *  share, an average or a score */
  calibration: { key: StressKey; title: string; captured: GapCaptured }[];
  /** the calibration's rows by where their later figure landed */
  capturedCounts: { between: number; past: number; omSide: number };
  /** the keys with a scored row or challenge, most scored first */
  byKey: KeyRecord[];
}

const keyTotal = (k: KeyRecord) => k.right + k.wrong + k.screenSide + k.omSide + k.between;

export function accountRecord(deals: readonly DealRecord[]): AccountRecord {
  const byKey = new Map<string, KeyRecord>();
  let dealsTested = 0;
  let dealsWithLater = 0;
  let decisions = 0;
  let purchases = 0;
  let pastOm = 0;
  const calibration: AccountRecord["calibration"] = [];
  const capturedCounts = { between: 0, past: 0, omSide: 0 };
  let right = 0;
  let wrong = 0;
  let falseHolds = 0;
  const ch = { screenSide: 0, omSide: 0, between: 0 };
  let scoredDeals = 0;
  let challengeDeals = 0;
  for (const d of deals) {
    if (d.screenedAt && d.rows.length > 0) dealsTested++;
    if (d.evidence.length > 0) dealsWithLater++;
    const figured = d.rows.filter((r) => r.landing !== "unscored" && !r.decision);
    if (figured.some((r) => r.landing === "right" || r.landing === "wrong")) scoredDeals++;
    if (figured.some((r) => r.landing === "screen_side" || r.landing === "om_side" || r.landing === "between")) challengeDeals++;
    for (const r of d.rows) {
      if (r.landing === "unscored") continue;
      if (r.decision) {
        decisions++;
        if (r.purchase) purchases++;
        continue;
      }
      // The base rate: a flag borne out and a false hold are the rows whose
      // later figure landed past the OM's on the buyer's bad side.
      if (r.outcome === "flag_right" || r.outcome === "false_hold") pastOm++;
      if (r.captured) {
        calibration.push({ key: r.key, title: r.title || TITLES[r.key], captured: r.captured });
        if (r.captured.place === "between") capturedCounts.between++;
        else if (r.captured.place === "past") capturedCounts.past++;
        else capturedCounts.omSide++;
      }
      // A row is filed under the title the deal's card prints for it, so a
      // vacancy struck on today's occupancy ("Occupancy today") is never
      // counted under "Stabilized vacancy": the two are different claims.
      const title = r.title || TITLES[r.key];
      const at = `${r.key}|${title}`;
      const k = byKey.get(at) ?? { key: r.key, title, right: 0, wrong: 0, screenSide: 0, omSide: 0, between: 0 };
      if (r.landing === "right") {
        right++;
        k.right++;
      } else if (r.landing === "wrong") {
        wrong++;
        k.wrong++;
        if (r.outcome === "false_hold") falseHolds++;
      } else if (r.landing === "screen_side") {
        ch.screenSide++;
        k.screenSide++;
      } else if (r.landing === "om_side") {
        ch.omSide++;
        k.omSide++;
      } else {
        ch.between++;
        k.between++;
      }
      byKey.set(at, k);
    }
  }
  const keys = [...byKey.values()].sort(
    (a, b) => keyTotal(b) - keyTotal(a) || STRESS_KEYS.indexOf(a.key) - STRESS_KEYS.indexOf(b.key) || a.title.localeCompare(b.title),
  );
  const scored = right + wrong;
  const chScored = ch.screenSide + ch.omSide + ch.between;
  // Whole percents by the largest remainder, so a set of shares sums to
  // 100: rounded each on its own, thirds read 33, 33 and 33.
  const [rightPct, wrongPct] = wholeShares([right, wrong]);
  const [screenSidePct, omSidePct, betweenPct] = wholeShares([ch.screenSide, ch.omSide, ch.between]);
  return {
    dealsTested,
    dealsWithLater,
    scored,
    scoredDeals,
    right,
    wrong,
    falseHolds,
    shares: scored >= RECORD_FLOOR ? { rightPct, wrongPct } : null,
    challenges: {
      scored: chScored,
      deals: challengeDeals,
      ...ch,
      shares: chScored >= RECORD_FLOOR ? { screenSidePct, omSidePct, betweenPct } : null,
    },
    decisions,
    purchases,
    pastOm,
    pastOmPct: scored >= RECORD_FLOOR ? Math.round((pastOm / scored) * 100) : null,
    calibration,
    capturedCounts,
    byKey: keys,
  };
}

/** The three states the record can be in, and the one sentence for each. */
export type RecordState = "none" | "start" | "record";

export function recordState(r: Pick<AccountRecord, "scored"> & { challenges?: { scored: number } }): RecordState {
  const rows = r.scored;
  const challenges = r.challenges?.scored ?? 0;
  if (rows <= 0 && challenges <= 0) return "none";
  return rows >= RECORD_FLOOR || challenges >= RECORD_FLOOR ? "record" : "start";
}

/** What the record is scored against — the homepage's FAQ promises exactly
 *  these three, and this sentence keeps it true. */
export const RECORD_NONE_LINE =
  "No track record yet, and none is claimed. A test's rows are scored later where one of three things you supply speaks to them: a T-12 or rent roll dated after the screen, what you decided (dead and why, or the price you closed at), and what the building traded for.";

export function recordLine(r: AccountRecord): string {
  // A decision is a direction, not a figure: said apart, never in a share.
  const d = r.decisions;
  const p = r.purchases ?? 0;
  const which = p === 0 ? "Dead, and why" : p === d ? "a Closed deal's own price" : "Dead and why, or a Closed deal's own price";
  const apart = d > 0 ? ` ${d} more ${d === 1 ? "row was a decision" : "rows were decisions"} (${which}), counted apart and in no share.` : "";
  if (recordState(r) === "none") return `${RECORD_NONE_LINE}${apart}`;
  const parts: string[] = [];
  const n = r.scored;
  const fromDeals = (m: number | undefined) => (m != null && m > 0 ? ` from ${m} ${m === 1 ? "deal" : "deals"}` : "");
  if (n >= RECORD_FLOOR && r.shares) {
    const fh = r.falseHolds > 0 ? `, ${r.falseHolds} of them ${r.falseHolds === 1 ? "a false hold" : "false holds"}` : "";
    parts.push(
      `${n} stress-test rows${fromDeals(r.scoredDeals)} scored: ${shareWords(r.right, n, "rows", "right", r.shares.rightPct)}, ${shareWords(r.wrong, n, "rows", "wrong", r.shares.wrongPct)}${fh}.`,
    );
  } else if (n > 0) {
    parts.push(`${n} scored stress-test row${n === 1 ? " is" : "s are"} a start, not a record: no share is printed under ${RECORD_FLOOR}.`);
  }
  const c = r.challenges;
  if (c.scored >= RECORD_FLOOR && c.shares) {
    parts.push(
      `${c.scored} challenges${fromDeals(c.deals)} scored, from screens whose stress test was not kept: ${shareWords(c.screenSide, c.scored, "challenges", "on the screen's side", c.shares.screenSidePct)}, ${shareWords(c.omSide, c.scored, "challenges", "on the OM's", c.shares.omSidePct)}, ${shareWords(c.between, c.scored, "challenges", "between", c.shares.betweenPct)}.`,
    );
  } else if (c.scored > 0) {
    parts.push(
      `${c.scored} challenge${c.scored === 1 ? "" : "s"} scored from screens whose stress test was not kept ${c.scored === 1 ? "is" : "are"} a start, not a record: no share is printed under ${RECORD_FLOOR}.`,
    );
  }
  return `${parts.join(" ")}${apart}`;
}

/** "4 deals tested · 2 with later evidence · 3 rows scored"; with a
 *  decision among the rows answered, "4 rows answered, 1 of them a
 *  decision · 3 scored", the decision never in the scored count. Rows count
 *  the stress test's and the older screens' challenges together. */
export function recordCountsLine(r: AccountRecord): string {
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  const d = r.decisions;
  const scored = r.scored + r.challenges.scored;
  const rows =
    d > 0
      ? [`${n(scored + d, "row answered", "rows answered")}, ${d} of them ${d === 1 ? "a decision" : "decisions"}`, `${scored} scored`]
      : [n(scored, "row scored", "rows scored")];
  return [n(r.dealsTested, "deal tested", "deals tested"), `${r.dealsWithLater} with later evidence`, ...rows].join(" · ");
}
