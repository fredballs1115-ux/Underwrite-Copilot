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
//     margin (`StressSnapshotRow.threshold`), WRONG where it lands at or
//     better than the OM's; a row that HELD is right where the later figure
//     lands within that margin of the OM's, or better for the buyer, and
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
//   - under RECORD_FLOOR (5) scored rows the account's record is "a start,
//     not a record", and no share is printed; a share is always printed with
//     its count beside it ("3 of 5 rows");
//   - the previous screen's rows are scored too (`priorScreen`, the snapshot
//     a re-screen writes to deals.prior_screen with the verdict — its stress
//     test's snapshot inside it — and the challenges it replaced): the
//     pipeline reads a T-12 added after a screen only on the re-screen that
//     also replaces the test it would be scored against, so a document that
//     arrived between the two verdicts scores the row made before it. One
//     later figure scores one row a key: where the current screen's row of a
//     key is scored, the prior's of the same key is dropped, never counted
//     twice; a snapshot written before the challenges were kept reads as
//     before.
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { statedDay } from "@/lib/actuals/actuals-read";
import { t12Vacancy, t12VacancyOverWords } from "@/lib/actuals/analyze";
import { assetWords } from "@/lib/asset-words";
import { compactUsd } from "@/lib/money";
import { OUTCOME_REASON_LABEL, type OutcomeReason, type StageChange } from "@/lib/stages";
import { readStressSnapshot, type StressSnapshot, type StressSnapshotRow } from "@/lib/stress-snapshot";
import { challengeKey } from "@/lib/stress-test";
import { STRESS_KEYS, type StressKey, type StressVerdict } from "@/lib/stress-test-types";

import { RECORD_FLOOR, shareWords, type RowOutcome } from "@/lib/track-record-words";

export {
  CARD_SCOPE,
  DOCUMENT_DATE_RULE,
  OUTCOME_WORD,
  RECORD_FLOOR,
  TAX_INSURANCE_NOT_SCORED,
  dealRecordLine,
  shareWords,
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
  /** the later thing is the reader's decision (Dead, and why), a direction
   *  with no figure: the row says which side it agrees with, and the
   *  account's record counts it apart from the scored rows, never in the
   *  shares */
  decision?: boolean;
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
   *  own date (none on record, or one on or before the verdict's day): the
   *  deal page still draws the card, so the refusal is said where the reader
   *  looks for the score */
  refusedLater?: boolean;
  /** the earlier screen whose rows were scored beside the current one's
   *  (deals.prior_screen with its verdict and challenges), where the
   *  snapshot holds them and a stamp */
  prior?: { screenedAt: string; screenedOn: string } | null;
  /** whether the current screen's stress test was kept with its verdict, so
   *  its rows are what is scored; false where its challenges stand in */
  snapshotted?: boolean;
  /** the screens whose stress test was not kept, said: their challenges
   *  stand in for the rows */
  snapshotNotes?: string[];
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
}

/**
 * When a stored rent roll or T-12 arrived on the deal: its source
 * document's upload where the document is on record, else the extraction
 * row's own write — the screen's, which is later than the upload and so the
 * side that scores LESS, never more. Null where neither is known.
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
  expense_growth: "Expense growth",
  taxes: "Real estate taxes",
  insurance: "Insurance",
  renovation_premium: "Renovation premium",
  other: "Everything else the challenger raised",
};

/** The keys whose figures are percents; the rest are dollars. */
const PERCENT_KEYS: ReadonlySet<StressKey> = new Set(["exit_cap", "debt", "vacancy", "rent_growth", "expense_growth"]);

/** A figure in the key's own unit: a percent to one place, a dollar compact. */
export function recordFigure(key: StressKey, n: number): string {
  if (PERCENT_KEYS.has(key)) return `${n.toFixed(1)}%`;
  if (key === "renovation_premium") return `$${Math.round(n).toLocaleString("en-US")}/mo`;
  if (key === "other") return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
  return compactUsd(n, { millions: 2 });
}

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
  /** a decision agrees with the challenge's direction; it has no figure */
  decision?: boolean;
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
 * With the previous screen's snapshot (`priorScreen`), that screen's rows
 * are scored against what arrived after ITS verdict, and the two are merged
 * a key at a time: a key the current screen's row scores is the current's
 * (the later figure arrived after both screens, and is counted once,
 * against the newer row); a key only the prior's row scores — the figure
 * arrived between the two verdicts, so the re-screen's row was made with it
 * in hand — is the prior's, in the current's unscored row's place, said as
 * the earlier screen's.
 */
export function scoreDeal(args: ScoreDealArgs): DealRecord {
  const screenedAt = args.screenedAt && parseTime(args.screenedAt) != null ? args.screenedAt : null;
  const screenedOn = screenedAt ? statedDay(screenedAt) : null;
  const subject = subjectOf(args.stressSnapshot, args.challenges);
  const current = scoreScreen(screenedAt, subject, args);
  const prior = priorOf(args.priorScreen, parseTime(screenedAt));
  const snapshotNotes: string[] = [];
  if (subject.kind === "challenges" && screenedAt) snapshotNotes.push(notSnapshottedLine(screenedOn, subject.built, true));
  const record = (s: ScreenScore, priorMeta: DealRecord["prior"]): DealRecord => ({
    screenedAt,
    screenedOn,
    evidence: s.evidence,
    rows: s.rows,
    notScored: s.notScored.map((n) => n.text),
    refusedLater: s.refusedLater,
    prior: priorMeta,
    snapshotted: subject.kind === "test",
    snapshotNotes,
  });
  if (!prior) return record(current, null);

  const earlier = scoreScreen(prior.screenedAt, prior.subject, args);
  const priorDay = statedDay(prior.screenedAt);
  if (prior.subject.kind === "challenges") snapshotNotes.push(notSnapshottedLine(priorDay, prior.subject.built, false));
  const scoredNow = new Set(current.rows.filter((r) => r.landing !== "unscored").map((r) => r.key));
  const rows = [...current.rows];
  for (const row of earlier.rows) {
    if (row.landing === "unscored" || scoredNow.has(row.key)) continue;
    const priorRow: ScoredRow = {
      ...row,
      priorScreenedOn: priorDay,
      text: `${row.title} (the screen of ${priorDay}):${row.text.slice(row.title.length + 1)}`,
    };
    // In the current screen's unscored row's place for the same key — the
    // re-screen's row was made with the later figure in hand, so the
    // prediction to score is the earlier one — else after the rest.
    const at = rows.findIndex((r) => r.key === row.key && r.landing === "unscored");
    if (at >= 0) rows[at] = priorRow;
    else rows.push(priorRow);
    scoredNow.add(row.key);
  }
  // The evidence of both screens, once each; a thing admitted only by the
  // earlier screen is said to have arrived between the two.
  const seen = new Set(current.evidence.map((e) => `${e.source}@${e.at}`));
  const evidence = [...current.evidence];
  const betweenSources = new Set<LaterSource>();
  const currentT = parseTime(screenedAt);
  for (const e of earlier.evidence) {
    if (seen.has(`${e.source}@${e.at}`)) continue;
    betweenSources.add(e.source);
    // A document uploaded after both screens, which the current one refused
    // for its own date, is DATED between the two; anything else arrived
    // between them.
    const uploadedAfterBoth = (e.source === "t12" || e.source === "rent_roll") && currentT != null && (parseTime(e.at) ?? 0) > currentT;
    const between = uploadedAfterBoth ? `; dated after the screen of ${priorDay} and before this one)` : `, after the screen of ${priorDay} and before this one)`;
    evidence.push({ ...e, label: `${e.label.replace(/\)$/, "")}${between}` });
  }
  evidence.sort((a, b) => a.at.localeCompare(b.at));
  // A thing the current screen refused as read by it, and the earlier
  // screen scored, is said to be scored against the earlier screen instead.
  const notScored = [
    ...current.notScored.map((n) => (n.source && n.instead && betweenSources.has(n.source) ? n.instead(priorDay) : n.text)),
    ...earlier.notScored.filter((n) => !n.instead).map((n) => `The screen of ${priorDay}: ${n.text}`),
  ];
  return record(
    { evidence, rows, notScored: notScored.map((text) => ({ source: null, text })), refusedLater: current.refusedLater || earlier.refusedLater },
    { screenedAt: prior.screenedAt, screenedOn: priorDay },
  );
}

/** The prior screen's stamp and what it is scored on, where the snapshot
 *  holds a stamp and rows or challenges — and its stamp is before the
 *  current screen's, where that has one. */
function priorOf(prior: PriorScreenLike | null | undefined, currentT: number | null): { screenedAt: string; subject: ScreenSubject } | null {
  const stamp = prior?.verdict?.generatedAt ?? null;
  if (!stamp) return null;
  const subject = subjectOf(prior?.verdict?.stressSnapshot, Array.isArray(prior?.challenges?.challenges) ? prior.challenges.challenges : null);
  if (subject.kind === "challenges" && subject.challenges.length === 0) return null;
  const P = parseTime(stamp);
  if (P == null || (currentT != null && P >= currentT)) return null;
  return { screenedAt: stamp, subject };
}

/** What arrived after one screen, admitted by the rules above. */
interface Admitted {
  t12: LaterDocument<T12Summary> | null;
  roll: LaterDocument<RentRollSummary> | null;
  decision: { reason: OutcomeReason; at: string } | null;
  trade: { price: number; at: string; text: string } | null;
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

  // The decision and the trade, off the move that ended the deal.
  const history = args.history ?? [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  const stage = args.stage ?? null;
  const ended = last && (stage === "dead" || stage === "closed") && last.stage === stage ? last : null;
  let decision: Admitted["decision"] = null;
  let trade: Admitted["trade"] = null;
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
    if (t) {
      const reportedAt = parseTime(t.reportedAt);
      const who = t.reportedBy ? `, reported by ${t.reportedBy}` : "";
      const text = `traded at ${compactUsd(t.price, { millions: 2 })}${t.date ? ` on ${statedDay(t.date)}` : ""}${who}`;
      if (T != null && reportedAt != null && reportedAt > T) {
        trade = { price: t.price, at: t.reportedAt, text };
        evidence.push({ source: "trade", label: `The building ${text} (recorded ${statedDay(t.reportedAt)})`, at: t.reportedAt });
      } else if (T == null) {
        notScored.push({ source: "trade", text: `A trade is recorded (${text}), but the verdict carries no screen time to set it after.` });
      } else {
        notScored.push({
          source: "trade",
          text: `The trade (${text}) was recorded before the screen's verdict, so it is not scored.`,
          instead: (priorDay) => `The trade (${text}) was recorded before this screen's verdict, so it is scored against the screen of ${priorDay} instead.`,
        });
      }
    }
  }
  evidence.sort((a, b) => a.at.localeCompare(b.at));

  const admitted: Admitted = { t12, roll, decision, trade };
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
  if (key === "vacancy" && heldToMarket) return MARKET_VACANCY_WHY;
  if (key === "vacancy" && args.vacancyIsPlanTarget) return PLAN_VACANCY_WHY;
  if (key === "noi" && args.plan) return PLAN_NOI_WHY;
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
  const fig = (n: number) => `${recordFigure(key, n)}${per}`;
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

  const later = laterFor(key, { ...ev, omFigure: r.om, askingPrice: args.askingPrice ?? null, perUnit: perUnitFor(args) });
  if (!later) return unscored("nothing that arrived after the screen speaks to it.");
  // The market decided a stabilized vacancy where its published figure did.
  const cannot = documentCannotSpeak(key, later, args, key === "vacancy" && r.evidence?.kind === "published");
  if (cannot) return unscored(cannot, later);

  const flagged = r.verdict === "stretched" || r.verdict === "unsupported";
  const omWords = r.om != null ? `the OM's ${fig(r.om)}` : "the OM's figure";
  const against = r.evidence
    ? `, set against ${midSentence(r.evidence.label)} at ${fig(r.evidence.value)}${asOfWords(r.evidence.asOf) ? ` (${asOfWords(r.evidence.asOf)})` : ""}`
    : "";
  const readAs = `the test read ${omWords} as ${r.verdict === "holds" ? "holding" : r.verdict}${against}`;

  if (later.decision) {
    // A direction, not a figure: no outcome of the four, counted apart.
    return {
      ...base,
      outcome: null,
      later: { source: later.source, value: null, text: later.text },
      figures: null,
      landing: flagged ? "right" : "wrong",
      decision: true,
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
  const where = past
    ? `past the OM's figure, worse for the buyer by more than ${margin}: ${flagged ? "the test was right" : "a false hold"}`
    : flagged
      ? `at or better than the OM's figure for the buyer: the test was wrong`
      : `within ${margin} of the OM's figure, or better for the buyer: the hold was right`;
  return {
    ...base,
    outcome,
    later: { source: later.source, value: v, text: later.text },
    figures: { om: fig(r.om), alt: r.evidence ? fig(r.evidence.value) : "—", later: fig(v) },
    landing: outcome === "flag_right" || outcome === "hold_right" ? "right" : "wrong",
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

  const later = laterFor(key, { ...ev, omFigure, askingPrice: args.askingPrice ?? null, perUnit: perUnitFor(args) });
  if (!later) return unscored("nothing that arrived after the screen speaks to it.");
  // The stress test's own rule: a stabilized assumption on a deal read as
  // stabilized is held to the market's published figures, and a
  // document's vacancy is today's — never the test of it. And on a plan
  // deal the OM's NOI and stated vacancy are the finished project's: a
  // document of the building before the plan is done cannot speak to them.
  const why = documentCannotSpeak(key, later, args, !!args.vacancyHeldToMarket);
  if (why) {
    return {
      ...base,
      later: { source: later.source, value: later.value, text: later.text },
      figures: null,
      landing: "unscored",
      why,
      text: `${title}: ${later.text}, but ${why.replace(/\.$/, "")}, so it is not scored.`,
    };
  }

  if (later.decision) {
    return {
      ...base,
      later: { source: later.source, value: null, text: later.text },
      figures: null,
      landing: "screen_side",
      decision: true,
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
  return {
    ...base,
    later: { source: later.source, value: v, text: later.text },
    figures: { om: recordFigure(key, omFigure), alt: recordFigure(key, altFigure), later: recordFigure(key, v) },
    landing,
    why: null,
    text: `${title}: the OM's ${recordFigure(key, omFigure)}, the screen's ${recordFigure(key, altFigure)}${altBasis ? ` (${altBasis})` : ""}; ${later.text} — ${where}.`,
  };
}

/** The later figure that speaks to a key, where one arrived. A figure beats
 *  a decision; the roll's occupancy beats the T-12's economic vacancy. */
function laterFor(
  key: StressKey,
  ev: Admitted & {
    omFigure: number | null;
    askingPrice: number | null;
    perUnit: boolean;
  },
): Later | null {
  const t12When = ev.t12?.dated ? `the T-12 to ${statedDay(ev.t12.dated)}` : "the T-12";
  switch (key) {
    case "vacancy": {
      const rv = ev.roll ? rollVacancy(ev.roll.summary, ev.perUnit) : null;
      if (rv != null) {
        return { source: "rent_roll", value: rv.pct, text: `the rent roll${ev.roll!.dated ? ` as of ${statedDay(ev.roll!.dated)}` : ""} ran ${rv.pct.toFixed(1)}% vacant ${rv.by}` };
      }
      // Over gross potential rent, the statement's own EGI saying whether
      // its rent line is gross or net (lib/actuals/analyze, the stress
      // test's one reading).
      const tv = ev.t12 ? t12Vacancy(ev.t12.summary) : null;
      if (tv != null) return { source: "t12", value: tv.pct, text: `${t12When} ran ${tv.pct.toFixed(1)}% economic vacancy (its vacancy loss over gross potential rent: ${t12VacancyOverWords(tv)})` };
      return null;
    }
    case "noi": {
      const n = ev.t12?.summary.noi;
      if (n != null && Number.isFinite(n) && n !== 0) return { source: "t12", value: n, text: `${t12When} earned ${compactUsd(n, { millions: 2 })}${ev.t12!.summary.noiDerived ? " (derived)" : ""}` };
      return null;
    }
    // Taxes and insurance are never here: a seller's T-12 cannot show a new
    // owner's bill or premium (`DOCUMENTS_CANNOT_SCORE`).
    case "basis": {
      if (ev.trade) {
        // On the OM figure's own basis: the trade over the ask, applied to
        // the figure the row carries (per unit, per foot or whole).
        if (ev.omFigure != null && ev.askingPrice != null && ev.askingPrice > 0) {
          const ratio = ev.trade.price / ev.askingPrice;
          const whole = Math.abs(ev.omFigure - ev.askingPrice) / ev.askingPrice < 0.01;
          const value = whole ? ev.trade.price : ev.omFigure * ratio;
          return {
            source: "trade",
            value,
            text: `the building ${ev.trade.text}${whole ? "" : `, ${recordFigure("basis", value)} on the OM figure's basis`}`,
          };
        }
        return { source: "trade", value: null, text: `the building ${ev.trade.text}` };
      }
      if (ev.decision?.reason === "price") return { source: "outcome", value: null, text: "walked away on price", decision: true };
      return null;
    }
    case "debt":
      if (ev.decision?.reason === "financing") return { source: "outcome", value: null, text: "walked away on financing", decision: true };
      return null;
    default:
      return null;
  }
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
  "A stabilized vacancy the market's figure decided is never scored by a later rent roll or T-12. For a screen whose stress test was not kept, this record holds back every stated stabilized vacancy; its deal's own page scores one where the documents decided it.";

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
    screenSide: number;
    omSide: number;
    between: number;
    /** only at RECORD_FLOOR scored challenges or more */
    shares: { screenSidePct: number; omSidePct: number; betweenPct: number } | null;
  };
  /** rows a decision answered (Dead, and why): counted apart, in no share
   *  and no key's bar, since a direction is not a figure */
  decisions: number;
  /** the keys with a scored row or challenge, most scored first */
  byKey: KeyRecord[];
}

const keyTotal = (k: KeyRecord) => k.right + k.wrong + k.screenSide + k.omSide + k.between;

export function accountRecord(deals: readonly DealRecord[]): AccountRecord {
  const byKey = new Map<StressKey, KeyRecord>();
  let dealsTested = 0;
  let dealsWithLater = 0;
  let decisions = 0;
  let right = 0;
  let wrong = 0;
  let falseHolds = 0;
  const ch = { screenSide: 0, omSide: 0, between: 0 };
  for (const d of deals) {
    if (d.screenedAt && d.rows.length > 0) dealsTested++;
    if (d.evidence.length > 0) dealsWithLater++;
    for (const r of d.rows) {
      if (r.landing === "unscored") continue;
      if (r.decision) {
        decisions++;
        continue;
      }
      const k = byKey.get(r.key) ?? { key: r.key, title: TITLES[r.key], right: 0, wrong: 0, screenSide: 0, omSide: 0, between: 0 };
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
      byKey.set(r.key, k);
    }
  }
  const keys = [...byKey.values()].sort((a, b) => keyTotal(b) - keyTotal(a) || STRESS_KEYS.indexOf(a.key) - STRESS_KEYS.indexOf(b.key));
  const scored = right + wrong;
  const chScored = ch.screenSide + ch.omSide + ch.between;
  const pct = (n: number, of: number) => Math.round((n / of) * 100);
  return {
    dealsTested,
    dealsWithLater,
    scored,
    right,
    wrong,
    falseHolds,
    shares: scored >= RECORD_FLOOR ? { rightPct: pct(right, scored), wrongPct: pct(wrong, scored) } : null,
    challenges: {
      scored: chScored,
      ...ch,
      shares:
        chScored >= RECORD_FLOOR ? { screenSidePct: pct(ch.screenSide, chScored), omSidePct: pct(ch.omSide, chScored), betweenPct: pct(ch.between, chScored) } : null,
    },
    decisions,
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
  "No track record yet, and none is claimed. Every test is scored later against three things you supply: a T-12 or rent roll dated after the screen, what you decided (dead, and why), and what the building traded for.";

export function recordLine(r: AccountRecord): string {
  // A decision is a direction, not a figure: said apart, never in a share.
  const d = r.decisions;
  const apart = d > 0 ? ` ${d} more ${d === 1 ? "row was a decision" : "rows were decisions"} (Dead, and why), counted apart and in no share.` : "";
  if (recordState(r) === "none") return `${RECORD_NONE_LINE}${apart}`;
  const parts: string[] = [];
  const n = r.scored;
  if (n >= RECORD_FLOOR) {
    const fh = r.falseHolds > 0 ? `, ${r.falseHolds} of them ${r.falseHolds === 1 ? "a false hold" : "false holds"}` : "";
    parts.push(`${n} stress-test rows scored: ${shareWords(r.right, n, "rows", "right")}, ${shareWords(r.wrong, n, "rows", "wrong")}${fh}.`);
  } else if (n > 0) {
    parts.push(`${n} scored stress-test row${n === 1 ? " is" : "s are"} a start, not a record: no share is printed under ${RECORD_FLOOR}.`);
  }
  const c = r.challenges;
  if (c.scored >= RECORD_FLOOR) {
    parts.push(
      `${c.scored} challenges scored from screens whose stress test was not kept: ${shareWords(c.screenSide, c.scored, "challenges", "on the screen's side")}, ${shareWords(c.omSide, c.scored, "challenges", "on the OM's")}, ${shareWords(c.between, c.scored, "challenges", "between")}.`,
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
