// The track record (2026-10-19, the investor's question: "is it really
// improving accuracy?"). The honest answer is scored, never claimed: each
// challenge the screen stored is set against evidence that arrived on the
// deal AFTER the screen's verdict — a T-12 or a rent roll added after it,
// the reader's own decision (Dead, and why), and what the building traded
// for — and each row says which side the later figure landed on. Pure.
//
// Its rules:
//   - evidence counts only where it arrived after the screen: a document the
//     screen read is circular (the challenger was handed it) and is said so,
//     never scored; a document with no arrival time on record is not scored
//     either, since a guessed order is no order;
//   - a document's arrival is its upload (deal_documents.created_at), never
//     the day a screen extracted its figures (`arrivalOf`): the pipeline
//     re-reads every document on each screen, so the extraction row's own
//     `created_at` is the screen's, not the document's;
//   - a challenge is scored only on its own figures: the OM's figure and the
//     screen's alternative as the challenger wrote them (`omFigure`,
//     `altFigure`, in the assumption's own unit); a challenge stored before
//     the challenger wrote figures is unscored, with why;
//   - a vacancy challenge is scored on a later document only where the
//     stress test would hold the OM's figure to the documents: a stabilized
//     assumption on a deal read as stabilized is the market's to judge
//     (`vacancyHeldToMarket`), and a later rent roll's vacancy is today's;
//   - a decision is a direction, not a figure: a deal walked away from on
//     price agrees with a basis challenge, one walked away from on financing
//     with a debt challenge, and such a row says it was a decision;
//   - a trade is put on the OM figure's own basis (the trade over the ask,
//     applied to the OM's figure), since the challenger's basis figure may be
//     per unit or per foot while a trade is the whole price;
//   - under MEDIAN_FLOOR scored rows the account's record is "a start, not a
//     record", and no share is printed;
//   - the previous screen's challenges are scored too (`priorScreen`, the
//     snapshot a re-screen writes to deals.prior_screen with the challenges it
//     replaced): the pipeline reads a T-12 added after a screen only on the
//     re-screen that also replaces the challenges it would be scored
//     against, so a document that arrived between the two verdicts scores the
//     challenge made before it. One later figure scores one challenge a key:
//     where the current screen's challenge of a key is scored, the prior's
//     of the same key is dropped, never counted twice; a snapshot written
//     before the challenges were kept reads as before.
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { statedDay } from "@/lib/actuals/actuals-read";
import { t12Vacancy, t12VacancyOverWords } from "@/lib/actuals/analyze";
import { assetWords } from "@/lib/asset-words";
import { compactUsd } from "@/lib/money";
import { MEDIAN_FLOOR } from "@/lib/public-comps/core";
import { OUTCOME_REASON_LABEL, type OutcomeReason, type StageChange } from "@/lib/stages";
import { T12_INSURANCE_NOT, T12_TAX_NOT, challengeKey } from "@/lib/stress-test";
import { STRESS_KEYS, type StressKey } from "@/lib/stress-test-types";

/** Which side of the screen's test the later figure landed on. */
export type Landing = "om_side" | "screen_side" | "between" | "unscored";

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
  /** the challenge's own words for the assumption */
  assumption: string;
  /** the OM's figure, in the assumption's own unit; null where the challenger gave none */
  omFigure: number | null;
  /** the screen's alternative, in the same unit; null where it held the OM to words alone */
  altFigure: number | null;
  altBasis: string | null;
  /** the figure that arrived after the screen, or a decision in words */
  later: { source: LaterSource; value: number | null; text: string } | null;
  /** the three figures as the card prints them, in the key's own unit —
   *  only on a row scored on figures, so the card takes plain data */
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
  /** the day of the earlier screen whose challenge this row scores ("Sep
   *  20, 2026"), where the row is the prior screen's; null on the current
   *  screen's rows — and on every row of a record scored before the
   *  snapshot kept challenges */
  priorScreenedOn?: string | null;
}

export interface DealRecord {
  /** the verdict's own stamp (`generatedAt`), ISO; null where it carries none */
  screenedAt: string | null;
  /** the same day in words ("Oct 1, 2026"); null where there is none */
  screenedOn: string | null;
  /** what arrived after the screen, oldest first */
  evidence: LaterEvidence[];
  /** every stored challenge, scored or unscored */
  rows: ScoredRow[];
  /** evidence on the deal that is NOT scored, with why: a document the
   *  screen read, one with no arrival time, an outcome recorded before it */
  notScored: string[];
  /** the earlier screen whose challenges were scored beside the current
   *  one's (deals.prior_screen with its challenges), where the snapshot
   *  holds them and a stamp */
  prior?: { screenedAt: string; screenedOn: string } | null;
}

/** The previous screen's snapshot as the pipeline writes it to
 *  deals.prior_screen on a re-screen (migration 0010; lib/screen-diff
 *  `PriorScreen`): the verdict it replaced, with its own stamp, and — since
 *  2026-10-19 — the challenges it replaced. A snapshot without challenges is
 *  one written before they were kept, and scores nothing. */
export interface PriorScreenLike {
  verdict?: { generatedAt?: string | null } | null;
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
  /** the OM's vacancy is a stabilized assumption on a deal read as
   *  stabilized (lib/stress-test `stabilizedVacancyStated`), which the stress
   *  test holds to the market's published figures, not to the documents:
   *  a rent roll's or T-12's vacancy that arrives later is the building's
   *  vacancy today again — the gap a lease-up has to close — so it scores no
   *  vacancy challenge, and the row says why */
  vacancyHeldToMarket?: boolean;
  /** the previous screen's snapshot (the deal row's `prior_screen`), whose
   *  challenges are scored against what arrived after ITS verdict — a
   *  document that arrived between the two screens scores the challenge
   *  made before it, which the re-screen's own challenges were made with */
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

/** A T-12 line by its key, else its label — never one whose label `not`
 *  refuses (lib/stress-test's own exclusions: a "Taxes & insurance" line is
 *  neither line alone, whatever key the extraction filed it under). */
function t12Line(summary: T12Summary, re: RegExp, key: string, not: RegExp): number | null {
  const line = summary.opex.find((l) => l.key === key && !not.test(l.label)) ?? summary.opex.find((l) => re.test(l.label) && !not.test(l.label));
  const n = line?.amount;
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
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
}

/**
 * Score one deal's stored challenges against what arrived after its screen.
 * Every challenge is a row; a row with nothing after the screen to score it
 * on says so. A deal with no verdict stamp scores nothing: there is no
 * "after" without a "when".
 *
 * With the previous screen's snapshot (`priorScreen`), that screen's
 * challenges are scored against what arrived after ITS verdict, and the two
 * are merged a key at a time: a key the current screen's challenge scores
 * is the current's (the later figure arrived after both screens, and is
 * counted once, against the newer challenge); a key only the prior's
 * challenge scores — the figure arrived between the two verdicts, so the
 * re-screen's challenge was made with it in hand — is the prior's, in the
 * current's unscored row's place, said as the earlier screen's.
 */
export function scoreDeal(args: ScoreDealArgs): DealRecord {
  const screenedAt = args.screenedAt && parseTime(args.screenedAt) != null ? args.screenedAt : null;
  const current = scoreScreen(screenedAt, args.challenges ?? [], args);
  const prior = priorOf(args.priorScreen, parseTime(screenedAt));
  const record = (s: ScreenScore, priorMeta: DealRecord["prior"]): DealRecord => ({
    screenedAt,
    screenedOn: screenedAt ? statedDay(screenedAt) : null,
    evidence: s.evidence,
    rows: s.rows,
    notScored: s.notScored.map((n) => n.text),
    prior: priorMeta,
  });
  if (!prior) return record(current, null);

  const earlier = scoreScreen(prior.screenedAt, prior.challenges, args);
  const priorDay = statedDay(prior.screenedAt);
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
    // re-screen's challenge was made with the later figure in hand, so the
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
  for (const e of earlier.evidence) {
    if (seen.has(`${e.source}@${e.at}`)) continue;
    betweenSources.add(e.source);
    evidence.push({ ...e, label: `${e.label.replace(/\)$/, "")}, after the screen of ${priorDay} and before this one)` });
  }
  evidence.sort((a, b) => a.at.localeCompare(b.at));
  // A thing the current screen refused as read by it, and the earlier
  // screen scored, is said to be scored against the earlier screen instead.
  const notScored = [
    ...current.notScored.map((n) => (n.source && n.instead && betweenSources.has(n.source) ? n.instead(priorDay) : n.text)),
    ...earlier.notScored.filter((n) => !n.instead).map((n) => `The screen of ${priorDay}: ${n.text}`),
  ];
  return record({ evidence, rows, notScored: notScored.map((text) => ({ source: null, text })) }, { screenedAt: prior.screenedAt, screenedOn: priorDay });
}

/** The prior screen's stamp and challenges, where the snapshot holds both
 *  — and its stamp is before the current screen's, where that has one. */
function priorOf(prior: PriorScreenLike | null | undefined, currentT: number | null): { screenedAt: string; challenges: readonly Challenge[] } | null {
  const stamp = prior?.verdict?.generatedAt ?? null;
  const challenges = prior?.challenges?.challenges;
  if (!stamp || !Array.isArray(challenges) || challenges.length === 0) return null;
  const P = parseTime(stamp);
  if (P == null || (currentT != null && P >= currentT)) return null;
  return { screenedAt: stamp, challenges };
}

function scoreScreen(screenedAt: string | null, challenges: readonly Challenge[], args: ScoreDealArgs): ScreenScore {
  const T = parseTime(screenedAt);
  const evidence: LaterEvidence[] = [];
  const notScored: ScreenScore["notScored"] = [];

  // The documents, each admitted only where its arrival is on record and
  // after the screen.
  const admit = <S,>(doc: LaterDocument<S> | null | undefined, name: string, datedWord: string): LaterDocument<S> | null => {
    if (!doc) return null;
    const source: LaterSource = name === "T-12" ? "t12" : "rent_roll";
    const at = parseTime(doc.arrivedAt);
    const dated = doc.dated ? `${name} ${datedWord} ${statedDay(doc.dated)}` : `${name} (${datedWord === "to" ? "period" : "as-of"} not stated)`;
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
    evidence.push({ source, label: `${dated} (added ${statedDay(doc.arrivedAt!)})`, at: doc.arrivedAt! });
    return doc;
  };
  const t12 = admit(args.t12, "T-12", "to");
  const roll = admit(args.rentRoll, "Rent roll", "as of");

  // The decision and the trade, off the move that ended the deal.
  const history = args.history ?? [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  const stage = args.stage ?? null;
  const ended = last && (stage === "dead" || stage === "closed") && last.stage === stage ? last : null;
  let decision: { reason: OutcomeReason; at: string } | null = null;
  let trade: { price: number; at: string; text: string } | null = null;
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

  const rows: ScoredRow[] = challenges.map((c) => {
    const key = challengeKey(c);
    const title = TITLES[key];
    const omFigure = c.omFigure != null && Number.isFinite(c.omFigure) ? c.omFigure : null;
    const altFigure = c.altFigure != null && Number.isFinite(c.altFigure) ? c.altFigure : null;
    const altBasis = c.altBasis?.trim() || null;
    const base = { key, title, assumption: c.assumption, omFigure, altFigure, altBasis };
    const unscored = (why: string): ScoredRow => ({ ...base, later: null, figures: null, landing: "unscored", why, text: `${title}: ${why}` });

    if (T == null) return unscored("the verdict carries no screen time, so nothing can be said to have come after it.");

    const later = laterFor(key, { t12, roll, decision, trade, omFigure, askingPrice: args.askingPrice ?? null, perUnit: args.assetClass !== undefined && assetWords(args.assetClass).basis === "unit" });
    if (!later) return unscored("nothing that arrived after the screen speaks to it.");
    // The stress test's own rule: a stabilized assumption on a deal read as
    // stabilized is held to the market's published figures, and a
    // document's vacancy is today's — never the test of it.
    if (key === "vacancy" && args.vacancyHeldToMarket && (later.source === "rent_roll" || later.source === "t12")) {
      const why = "the OM's vacancy is a stabilized assumption on a deal read as stabilized, which the stress test holds to the market's published figures where one is fresh; a document's vacancy is the building's today, the gap a lease-up has to close, not a test of it.";
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
  });

  return { evidence, rows, notScored };
}

/** The later figure that speaks to a key, where one arrived. A figure beats
 *  a decision; the roll's occupancy beats the T-12's economic vacancy. */
function laterFor(
  key: StressKey,
  ev: {
    t12: LaterDocument<T12Summary> | null;
    roll: LaterDocument<RentRollSummary> | null;
    decision: { reason: OutcomeReason; at: string } | null;
    trade: { price: number; at: string; text: string } | null;
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
    case "insurance": {
      const n = ev.t12 ? t12Line(ev.t12.summary, /\binsurance\b/i, "insurance", T12_INSURANCE_NOT) : null;
      if (n != null) return { source: "t12", value: n, text: `${t12When} paid ${compactUsd(n, { millions: 2 })} of insurance` };
      return null;
    }
    case "taxes": {
      const n = ev.t12 ? t12Line(ev.t12.summary, /\btax/i, "taxes", T12_TAX_NOT) : null;
      if (n != null) return { source: "t12", value: n, text: `${t12When} paid ${compactUsd(n, { millions: 2 })} of real estate taxes` };
      return null;
    }
    case "basis": {
      if (ev.trade) {
        // On the OM figure's own basis: the trade over the ask, applied to
        // the figure the challenger wrote (per unit, per foot or whole).
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

/** Under this many scored rows the record is a start, and no share is printed. */
export const RECORD_FLOOR = MEDIAN_FLOOR;

/**
 * What the account's record does with a stabilized vacancy, said where it is
 * drawn (audit M5). A deal's own page scores a later rent roll or T-12
 * against a stabilized vacancy wherever its built stress test says the
 * documents, not the market, decided the row (lib/stress-test
 * `vacancyDecidedBy`); the account's record builds no stress test for each
 * deal, so it holds every stated stabilized vacancy back as the market's.
 */
export const ACCOUNT_VACANCY_NOTE =
  "Here a stabilized vacancy the OM states is never scored by a later rent roll or T-12; a deal's own page scores it where the documents, not the market, decided it.";

export interface KeyRecord {
  key: StressKey;
  title: string;
  screenSide: number;
  omSide: number;
  between: number;
}

export interface AccountRecord {
  /** deals with a stamped verdict and at least one stored challenge */
  dealsTested: number;
  /** deals with something that arrived after the screen */
  dealsWithLater: number;
  /** rows scored on figures: the later figure set against the OM's and the
   *  screen's; never a decision */
  scored: number;
  /** rows a decision answered (Dead, and why): counted apart, in no share
   *  and no key's bar, since a direction is not a figure */
  decisions: number;
  screenSide: number;
  omSide: number;
  between: number;
  /** the keys with a scored row, most scored first */
  byKey: KeyRecord[];
  /** the shares, only at RECORD_FLOOR scored rows or more */
  shares: { screenSidePct: number; omSidePct: number; betweenPct: number } | null;
}

export function accountRecord(deals: readonly DealRecord[]): AccountRecord {
  const byKey = new Map<StressKey, KeyRecord>();
  let dealsTested = 0;
  let dealsWithLater = 0;
  let scored = 0;
  let decisions = 0;
  let screenSide = 0;
  let omSide = 0;
  let between = 0;
  for (const d of deals) {
    if (d.screenedAt && d.rows.length > 0) dealsTested++;
    if (d.evidence.length > 0) dealsWithLater++;
    for (const r of d.rows) {
      if (r.landing === "unscored") continue;
      if (r.decision) {
        decisions++;
        continue;
      }
      scored++;
      const k = byKey.get(r.key) ?? { key: r.key, title: TITLES[r.key], screenSide: 0, omSide: 0, between: 0 };
      if (r.landing === "screen_side") {
        screenSide++;
        k.screenSide++;
      } else if (r.landing === "om_side") {
        omSide++;
        k.omSide++;
      } else {
        between++;
        k.between++;
      }
      byKey.set(r.key, k);
    }
  }
  const keys = [...byKey.values()].sort(
    (a, b) => b.screenSide + b.omSide + b.between - (a.screenSide + a.omSide + a.between) || STRESS_KEYS.indexOf(a.key) - STRESS_KEYS.indexOf(b.key),
  );
  const pct = (n: number) => Math.round((n / scored) * 100);
  return {
    dealsTested,
    dealsWithLater,
    scored,
    decisions,
    screenSide,
    omSide,
    between,
    byKey: keys,
    shares: scored >= RECORD_FLOOR ? { screenSidePct: pct(screenSide), omSidePct: pct(omSide), betweenPct: pct(between) } : null,
  };
}

/** The three states the record can be in, and the one sentence for each. */
export type RecordState = "none" | "start" | "record";

export function recordState(r: Pick<AccountRecord, "scored">): RecordState {
  if (r.scored <= 0) return "none";
  return r.scored < RECORD_FLOOR ? "start" : "record";
}

/** What the record is scored against — the homepage's FAQ promises exactly
 *  these three, and this sentence keeps it true. */
export const RECORD_NONE_LINE =
  "No track record yet, and none is claimed. Every test is scored later against three things you supply: the T-12 or rent roll you add after the screen, what you decided (dead, and why), and what the building traded for.";

export function recordLine(r: AccountRecord): string {
  // A decision is a direction, not a figure: said apart, never in a share.
  const d = r.decisions;
  const apart = d > 0 ? ` ${d} more ${d === 1 ? "row was a decision" : "rows were decisions"} (Dead, and why), counted apart and in no share.` : "";
  switch (recordState(r)) {
    case "none":
      return `${RECORD_NONE_LINE}${apart}`;
    case "start":
      return `${r.scored} scored row${r.scored === 1 ? " is" : "s are"} a start, not a record.${apart}`;
    default: {
      const s = r.shares!;
      return `Of ${r.scored} scored rows, ${r.screenSide} landed on the screen's side (${s.screenSidePct}%), ${r.omSide} on the OM's (${s.omSidePct}%) and ${r.between} between (${s.betweenPct}%).${apart}`;
    }
  }
}

/** "4 deals tested · 2 with later evidence · 3 rows scored"; with a
 *  decision among the rows answered, "4 rows answered, 1 of them a
 *  decision · 3 scored", the decision never in the scored count. */
export function recordCountsLine(r: AccountRecord): string {
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  const d = r.decisions;
  const rows =
    d > 0
      ? [`${n(r.scored + d, "row answered", "rows answered")}, ${d} of them ${d === 1 ? "a decision" : "decisions"}`, `${r.scored} scored`]
      : [n(r.scored, "row scored", "rows scored")];
  return [n(r.dealsTested, "deal tested", "deals tested"), `${r.dealsWithLater} with later evidence`, ...rows].join(" · ");
}
