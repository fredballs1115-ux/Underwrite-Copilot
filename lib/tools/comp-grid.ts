/**
 * The sales comparison grid: a handful of comps, adjusted to the subject.
 *
 * Every analyst does this, most of them in their head or in a corner of a
 * spreadsheet, and it is the one calculation here where the METHOD is
 * argued over rather than the inputs. Four rules. Two of them change the
 * answer by millions and the one people actually argue about changes it by
 * a rounding error — which is the finding this module was built to make
 * checkable.
 *
 * Rule 1. THE ADJUSTMENT IS APPLIED TO THE COMP, SO AN INFERIOR COMP
 * ADJUSTS UP. This is the sign convention and it is the most common error
 * in a comp grid. The question a grid answers is "what would this comp
 * have sold for if it were the subject" — so a comp in a worse location
 * than the subject is adjusted UPWARD, because the subject's better
 * location is worth more. "The comp is worse, so subtract" feels right and
 * is backwards, and getting it backwards costs roughly TWICE the
 * adjustment, because the sign flips rather than the magnitude changing:
 * on the seeded grid, $4,053,262 of value, a fifth of the deal.
 * `valueIfSignsReversed` runs the whole grid the wrong way so the size of
 * the error is a figure rather than a warning. The error is invisible in a
 * grid whose adjustments point both ways — they cancel in the
 * reconciliation — and ruinous in the ordinary case where the subject is
 * better than most of its comps and nearly every adjustment is positive.
 *
 * Rule 2. THE TIME ADJUSTMENT COMES FIRST, AND IT IS THE ONE LEFT OUT. A
 * sale is brought to today's dollars before anything else touches it,
 * because every other adjustment is a percentage of a price in today's
 * money. It is also the adjustment most often skipped, since a grid of
 * "recent" sales looks current — and on the seed a comp that sold 26
 * months ago in a 6% market is 13.5% behind the market before anything
 * about the building is considered. `valueIfTimeIgnored` prices leaving it
 * out: $716,948 here, against $37,656 for the convention argument in the
 * next paragraph. The adjustment nobody made is worth twenty times the one
 * everybody argues about.
 *
 * That argument, for completeness, because both schools are ordinary
 * practice and no grid says which it used: percentages applied in SEQUENCE
 * (each a multiplier) or summed into one NET percentage. `conventionGap`
 * is the disagreement in dollars. The sequential figure is the one
 * reported, for two reasons — an adjustment is a relative statement
 * ("worth 10% less") and relative statements compound; and additive
 * adjustments can drive an adjusted price to zero or below (four −30%
 * adjustments sum to −120%), which a product of positive factors cannot.
 * `additiveWentNegative` names that case rather than printing a negative
 * comp, and it is the one place the convention is not a matter of taste.
 *
 * Rule 3. GROSS ADJUSTMENT MEASURES COMPARABILITY; NET DOES NOT. A comp
 * adjusted +15% for location and −15% for size nets to zero, which reads
 * on the grid as a perfect comparable and is nothing of the sort: 30% of
 * that price is the analyst's judgement rather than the market's evidence.
 * `grossAdjustmentPct` is the figure to read and `GROSS_FLAG_PCT` the
 * conventional line. A comp over it is flagged and still shown — dropping
 * it would leave a thinner set, which is worse.
 *
 * Rule 4. THE RECONCILIATION IS WEIGHTED, NOT AVERAGED, and the weight is
 * the inverse of the gross adjustment: a comp needing 8% of adjustment
 * says more about the subject than one needing 35%, and a mean treats them
 * as equal evidence. The inverse is unstable near zero — untreated it made
 * a 1%-adjusted comp worth twice a 2%-adjusted one, which is a distinction
 * a comp grid cannot support — so the denominator is floored at
 * `MIN_GROSS_FOR_WEIGHT`. `meanBasis` is printed beside the weighted
 * figure so the choice is visible rather than asserted, and the RANGE is
 * reported too, because a tight range is evidence and a wide one is a
 * warning that the set does not agree with itself.
 *
 * And the floor: a grid needs comps. This grades a set by the same
 * thresholds the public-records layer already uses (`lib/public-comps`) —
 * under three is not a grid, under five is thin — so one rule about how
 * much evidence is enough governs both surfaces.
 *
 * Pure, no I/O.
 */

import { cellsOf } from "./unit-mix";

/** Under this many comps is not a grid at all. Matches `MEDIAN_FLOOR`. */
export const MIN_COMPS = 3;
/** Under this many is a read worth showing with its count attached. */
export const THIN_COMPS = 5;
/** The conventional line above which a comp is more judgement than evidence. */
export const GROSS_FLAG_PCT = 25;
/**
 * No comp is treated as needing less adjustment than this.
 *
 * The weight is 1/gross, which runs away near zero: a comp adjusted 1% and
 * one adjusted 2% are both excellent comps, and unfloored the first would
 * carry twice the weight of the second — a precision a comp grid does not
 * have. Five points is the honest floor.
 */
export const MIN_GROSS_FOR_WEIGHT = 5;
/** More than this is a paste, not a grid. */
export const MAX_COMPS = 12;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  // +0 so a negative zero never prints as "-0".
  return (Math.round(n * f) + 0) / f;
}

/**
 * One line of the grid, signed FROM THE COMP: a positive figure says the
 * comp is inferior to the subject on this attribute and is adjusted up.
 */
export type CompAdjustment = {
  label: string;
  pct: number | null;
};

export type GridComp = {
  name: string;
  /** What it sold for. */
  price: number | null;
  /** Its size in the subject's own unit — square feet, or units, or keys. */
  size: number | null;
  /** How long ago, in months. A sale today is 0, not null. */
  monthsAgo: number | null;
  adjustments: CompAdjustment[];
};

export type GridTerms = {
  subjectSize: number | null;
  /** What a unit of comparison is called here — printed, never computed on. */
  unitLabel: string;
  /** The market's own movement, per year, behind the time adjustment. */
  marketGrowthPct: number | null;
  /** What they are asking, if they have said. The grid is judged against it. */
  askingPrice: number | null;
  comps: GridComp[];
};

export type CompRead = {
  name: string;
  /** Price over size, before anything is done to it. */
  basisRaw: number | null;
  /** Compounded market movement over the months since the sale. */
  timeAdjustmentPct: number | null;
  basisTimeAdjusted: number | null;
  /** The property adjustments summed with their signs. */
  netAdjustmentPct: number | null;
  /** Their absolute values summed, plus the time adjustment's. */
  grossAdjustmentPct: number | null;
  /** Time first, then each adjustment as a multiplier. The answer. */
  basisAdjusted: number | null;
  /** Time first, then one summed percentage. The other school. */
  basisAdditive: number | null;
  /** Share of the reconciliation this comp carries, in percent. */
  weightPct: number | null;
  /** Gross adjustment past the conventional line. */
  flagged: boolean;
  /** Summing the adjustments took this comp to zero or below. */
  additiveWentNegative: boolean;
};

export type GridRead = {
  comps: CompRead[];
  /** Inverse-gross weighted, the figure to bid off. */
  indicatedBasis: number | null;
  /** The straight average of the adjusted bases, for the comparison. */
  meanBasis: number | null;
  lowBasis: number | null;
  highBasis: number | null;
  /** How far the high sits above the low, in percent of the low. */
  rangePct: number | null;
  indicatedValue: number | null;
  meanValue: number | null;
  /** Rule 1: the same grid run with every sign backwards. */
  valueIfSignsReversed: number | null;
  signErrorValue: number | null;
  /** Rule 2: the same grid with no time adjustment at all. */
  valueIfTimeIgnored: number | null;
  timeAdjustmentValue: number | null;
  /** What the summing convention would have indicated instead. */
  additiveBasis: number | null;
  additiveValue: number | null;
  conventionGap: number | null;
  /** The ask against what the comps indicate, where an ask is given. */
  askPremium: number | null;
  askPremiumPct: number | null;
  /**
   * The same comparison off the reversed grid. Rule 1's real cost: on the
   * seeded deal the ask is defensible read correctly and 11.4% rich read
   * backwards, so the sign error does not shade the answer, it reverses it.
   */
  askPremiumIfSignsReversedPct: number | null;
  /** The comp carrying the least judgement, and the most. */
  strongest: string | null;
  weakest: string | null;
  flaggedCount: number;
  usableCount: number;
  /** How much evidence there is: the grading the comps page already uses. */
  evidence: "none" | "individual" | "thin" | "usable";
  note: string;
};

const EMPTY: Omit<GridRead, "note"> = {
  comps: [],
  indicatedBasis: null,
  meanBasis: null,
  lowBasis: null,
  highBasis: null,
  rangePct: null,
  indicatedValue: null,
  meanValue: null,
  valueIfSignsReversed: null,
  signErrorValue: null,
  valueIfTimeIgnored: null,
  timeAdjustmentValue: null,
  additiveBasis: null,
  additiveValue: null,
  conventionGap: null,
  askPremium: null,
  askPremiumPct: null,
  askPremiumIfSignsReversedPct: null,
  strongest: null,
  weakest: null,
  flaggedCount: 0,
  usableCount: 0,
  evidence: "none",
};

/** Grade a set by its count, the same way the public-records comps page does. */
export function gridEvidence(n: number): GridRead["evidence"] {
  if (n <= 0) return "none";
  if (n < MIN_COMPS) return "individual";
  if (n < THIN_COMPS) return "thin";
  return "usable";
}

/**
 * The market's movement over the months since a sale, compounded.
 *
 * Compounded rather than pro-rated because growth is quoted per year: a
 * two-year-old sale in a 6% market is 12.4% behind today, not 12.0%. The
 * difference is small on a short window and not on a long one, and there
 * is no reason to carry the cruder version.
 */
export function timeAdjustment(marketGrowthPct: number, monthsAgo: number): number {
  if (monthsAgo <= 0) return 0;
  return ((1 + marketGrowthPct / 100) ** (monthsAgo / 12) - 1) * 100;
}

const BLANK_COMP: Omit<CompRead, "name"> = {
  basisRaw: null,
  timeAdjustmentPct: null,
  basisTimeAdjusted: null,
  netAdjustmentPct: null,
  grossAdjustmentPct: null,
  basisAdjusted: null,
  basisAdditive: null,
  weightPct: null,
  flagged: false,
  additiveWentNegative: false,
};

function readComp(c: GridComp, growthPct: number): CompRead {
  if (!positive(c.price) || !positive(c.size)) return { name: c.name, ...BLANK_COMP };

  // Rule 2: the sale comes to today's dollars before anything else touches
  // it, because every later adjustment is a percentage of a price in
  // today's money.
  const basisRaw = c.price / c.size;
  const months = real(c.monthsAgo) && c.monthsAgo > 0 ? c.monthsAgo : 0;
  const timePct = timeAdjustment(growthPct, months);
  const timed = basisRaw * (1 + timePct / 100);

  const lines = c.adjustments.filter((a) => real(a.pct)).map((a) => a.pct as number);
  const net = lines.reduce((s, p) => s + p, 0);
  // Rule 3: the time adjustment is judgement too — it rests on a growth
  // rate nobody can prove — so it counts toward the gross.
  const gross = lines.reduce((s, p) => s + Math.abs(p), 0) + Math.abs(timePct);

  const sequential = lines.reduce((v, p) => v * (1 + p / 100), timed);
  const additiveFactor = 1 + net / 100;

  return {
    name: c.name,
    basisRaw: round(basisRaw, 2),
    timeAdjustmentPct: round(timePct, 1),
    basisTimeAdjusted: round(timed, 2),
    netAdjustmentPct: round(net, 1),
    grossAdjustmentPct: round(gross, 1),
    basisAdjusted: round(sequential, 2),
    basisAdditive: additiveFactor > 0 ? round(timed * additiveFactor, 2) : null,
    weightPct: null,
    flagged: gross > GROSS_FLAG_PCT,
    additiveWentNegative: additiveFactor <= 0,
  };
}

/** The weight a comp carries: inverse gross, floored so it cannot run away. */
function weightOf(c: CompRead): number {
  return 1 / Math.max(c.grossAdjustmentPct ?? 0, MIN_GROSS_FOR_WEIGHT);
}

/**
 * The whole grid reconciled to one basis — run for the real answer and
 * again for each counterfactual, so every comparison is the same
 * arithmetic on different inputs rather than a scaled approximation.
 */
function reconcile(comps: GridComp[], growthPct: number): number | null {
  const usable = comps.map((c) => readComp(c, growthPct)).filter((c) => c.basisAdjusted !== null);
  if (usable.length === 0) return null;
  const weights = usable.map(weightOf);
  const total = weights.reduce((s, w) => s + w, 0);
  return usable.reduce((s, c, i) => s + (c.basisAdjusted as number) * weights[i], 0) / total;
}

export function readGrid(t: GridTerms): GridRead {
  if (!Array.isArray(t.comps) || t.comps.length === 0) {
    return { ...EMPTY, note: "Add a comp: its price, its size and how long ago it sold." };
  }
  if (t.comps.length > MAX_COMPS) {
    return {
      ...EMPTY,
      note: `${t.comps.length} comps is a paste rather than a grid — cut it to the ${MAX_COMPS} that are genuinely comparable and adjust those.`,
    };
  }

  const growth = real(t.marketGrowthPct) ? t.marketGrowthPct : 0;
  const comps = t.comps.map((c) => readComp(c, growth));
  const usable = comps.filter((c) => c.basisAdjusted !== null);
  const usableCount = usable.length;

  if (usableCount === 0) {
    return {
      ...EMPTY,
      comps,
      note: "No comp has both a price and a size, so there is nothing to put on a per-unit basis yet.",
    };
  }

  const weights = usable.map(weightOf);
  const weightTotal = weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < usable.length; i += 1) {
    usable[i].weightPct = round((weights[i] / weightTotal) * 100, 1);
  }

  const bases = usable.map((c) => c.basisAdjusted as number);
  const indicated = bases.reduce((s, b, i) => s + b * weights[i], 0) / weightTotal;
  const mean = bases.reduce((s, b) => s + b, 0) / bases.length;
  const low = Math.min(...bases);
  const high = Math.max(...bases);

  // The other convention, run through to a value so the disagreement is a
  // dollar figure. Withheld where any comp's additive price went negative:
  // a reconciliation that drops the comps the convention broke on is not a
  // fair comparison to one that kept them.
  const additiveAll = usable.every((c) => c.basisAdditive !== null);
  const additiveBasis = additiveAll
    ? usable.reduce((s, c, i) => s + (c.basisAdditive as number) * weights[i], 0) / weightTotal
    : null;

  // Rule 1 and rule 2's counterfactuals: the same reconciliation, run on
  // inputs an analyst might actually have given it.
  // Only the PROPERTY adjustments flip. The time adjustment's direction is
  // not the one people get backwards, and reversing it too would fold
  // rule 2's error into rule 1's figure. It also leaves every gross — and
  // therefore every weight — untouched, so the comparison isolates exactly
  // the sign error and nothing else.
  const reversed = reconcile(
    t.comps.map((c) => ({
      ...c,
      adjustments: c.adjustments.map((a) => ({ ...a, pct: real(a.pct) ? -a.pct : a.pct })),
    })),
    growth,
  );
  const timeless = reconcile(t.comps, 0);

  const sorted = [...usable].sort(
    (a, b) => (a.grossAdjustmentPct ?? 0) - (b.grossAdjustmentPct ?? 0),
  );

  const size = positive(t.subjectSize) ? t.subjectSize : null;
  const indicatedBasis = round(indicated, 2);
  const meanBasis = round(mean, 2);
  const additive = additiveBasis === null ? null : round(additiveBasis, 2);

  // Every value derives from the rounded basis, so the card's value is the
  // basis it prints times the size it prints.
  const value = (b: number | null): number | null =>
    size === null || b === null ? null : Math.round(b * size);

  const indicatedValue = value(indicatedBasis);
  const additiveValue = value(additive);
  const reversedValue = value(reversed === null ? null : round(reversed, 2));
  const timelessValue = value(timeless === null ? null : round(timeless, 2));

  const ask = positive(t.askingPrice) ? t.askingPrice : null;

  const read: Omit<GridRead, "note"> = {
    comps,
    indicatedBasis,
    meanBasis,
    lowBasis: round(low, 2),
    highBasis: round(high, 2),
    rangePct: low > 0 ? round((high / low - 1) * 100, 1) : null,
    indicatedValue,
    meanValue: value(meanBasis),
    valueIfSignsReversed: reversedValue,
    signErrorValue:
      indicatedValue === null || reversedValue === null ? null : reversedValue - indicatedValue,
    valueIfTimeIgnored: timelessValue,
    timeAdjustmentValue:
      indicatedValue === null || timelessValue === null ? null : indicatedValue - timelessValue,
    additiveBasis: additive,
    additiveValue,
    conventionGap:
      indicatedValue === null || additiveValue === null ? null : additiveValue - indicatedValue,
    askPremium: ask === null || indicatedValue === null ? null : ask - indicatedValue,
    askPremiumPct:
      ask === null || indicatedValue === null || indicatedValue <= 0
        ? null
        : round((ask / indicatedValue - 1) * 100, 1),
    askPremiumIfSignsReversedPct:
      ask === null || reversedValue === null || reversedValue <= 0
        ? null
        : round((ask / reversedValue - 1) * 100, 1),
    strongest: sorted[0]?.name ?? null,
    weakest: sorted.length > 1 ? (sorted.at(-1)?.name ?? null) : null,
    flaggedCount: usable.filter((c) => c.flagged).length,
    usableCount,
    evidence: gridEvidence(usableCount),
  };

  return { ...read, note: noteFor(read, t) };
}

/**
 * A pasted grid: one comp a line, `name, price, size, months, then the
 * adjustments`.
 *
 * Shares `cellsOf` with the unit-mix and rollover readers, so the
 * comma-is-also-a-thousands-mark precedence stays solved in one place —
 * which matters more here than anywhere, since a comp's price is the one
 * figure certain to carry grouped thousands.
 *
 * The first cell is the NAME and is never parsed as a number, so a comp
 * called "1200 Market" keeps its address. Everything after the fourth cell
 * is an adjustment, labelled from `labels` positionally where they are
 * given and numbered where they are not — a grid with five adjustment
 * columns is as ordinary as one with three, and the module has no opinion
 * about which attributes an analyst chose.
 */
export function readGridText(
  raw: string,
  labels: string[] = [],
): { comps: GridComp[]; unreadable: string[] } {
  const comps: GridComp[] = [];
  const unreadable: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells = cellsOf(line);

    // `cellsOf` documents one shape it cannot resolve from the text alone:
    // a true CSV whose figures also carry grouped thousands, where every
    // comma sits between two digits and none of them splits. A unit-mix row
    // survives it; a comp grid does not, because it has six numeric columns
    // and the whole line collapses into one cell — which then parses as a
    // number. "Grantham Row,18400000,184,8,8,2,6" read as a price of
    // 184,000,001,848,826, a figure with the shape of an answer and no
    // relation to anything. So a line that collapses is REFUSED and handed
    // back, never guessed at: a silently dropped comp shortens every figure
    // the grid reports, and a silently mangled one is worse.
    if (collapsed(line, cells) || cells.length < 2) {
      unreadable.push(line.trim());
      continue;
    }

    const [name, ...rest] = cells;
    const nums = rest.map(numberOf);
    // A header row states no price; skip it rather than reading a column
    // heading as a figure, and do not call it unreadable either.
    if (nums[0] === null) continue;
    comps.push({
      name: name.trim(),
      price: nums[0],
      size: nums[1] ?? null,
      monthsAgo: nums[2] ?? null,
      adjustments: nums.slice(3).map((pctValue, i) => ({
        label: labels[i]?.trim() || `Adjustment ${i + 1}`,
        pct: pctValue,
      })),
    });
  }
  return { comps, unreadable };
}

/**
 * Did this line collapse for want of a separator?
 *
 * Only where the comma was the ONLY candidate — no tab, no pipe, no run of
 * spaces — and splitting on every comma would have found columns that
 * `cellsOf`'s digit-guarded split did not. A tab-separated line of two
 * cells whose price carries grouped thousands is a perfectly good comp with
 * its size left off, and must not be caught here; that was the first
 * version of this guard, and it refused the shape it was meant to protect.
 */
function collapsed(line: string, cells: string[]): boolean {
  if (cells.length > 2) return false;
  if (/\t|\||\S\s{2,}\S/.test(line)) return false;
  return line.split(",").length - cells.length >= 2;
}

/** One cell as a number, or null — a blank states nothing, never zero. */
function numberOf(cell: string): number | null {
  const cleaned = cell.replace(/[$,\s%]/g, "").replace(/^\+/, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}%`;
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function noteFor(x: Omit<GridRead, "note">, t: GridTerms): string {
  const unit = t.unitLabel.trim() || "unit";

  // The convention that broke outranks everything: it is the one case
  // where the two schools are not a matter of taste.
  const broke = x.comps.filter((c) => c.additiveWentNegative);
  if (broke.length > 0) {
    return `Summing the adjustments takes ${broke.length === 1 ? `${broke[0].name} to zero or below` : `${broke.length} comps to zero or below`}, which is the one place the two conventions are not a matter of taste: a price cannot be adjusted away. Each adjustment is a multiplier here, so ${broke.length === 1 ? "it survives" : "they survive"} at ${usd(broke[0].basisAdjusted as number)} per ${unit}.`;
  }

  // Then the floor: below three comps there is no grid, whatever the
  // arithmetic managed to produce.
  if (x.evidence === "individual") {
    const one = x.usableCount === 1;
    return `${one ? "One comp is" : `${x.usableCount} comps are`} not a grid — ${one ? "it is a data point" : "they are two data points"}. The adjusted figure is shown because it is the evidence there is, but ${MIN_COMPS} comps is the floor below which a reconciliation says more about the adjustments than about the market.`;
  }

  // Then rule 2's finding, where the time adjustment is carrying real money.
  if (
    x.timeAdjustmentValue !== null &&
    x.indicatedValue !== null &&
    Math.abs(x.timeAdjustmentValue) / Math.max(x.indicatedValue, 1) > 0.02
  ) {
    const con =
      x.conventionGap === null
        ? ""
        : ` The sequential-versus-additive argument, by contrast, is worth ${usd(Math.abs(x.conventionGap))} on the same grid.`;
    return `${usd(Math.abs(x.timeAdjustmentValue))} of the indicated ${usd(x.indicatedValue)} is the TIME adjustment — the market's own movement since these sales, before anything about the buildings is considered. Leave it out, as a grid of "recent" comps invites, and the same comps indicate ${usd(x.valueIfTimeIgnored as number)}.${con}`;
  }

  // Then comparability, which is what a clean-looking grid hides.
  if (x.flaggedCount > 0) {
    const worst = [...x.comps]
      .filter((c) => c.flagged)
      .sort((a, b) => (b.grossAdjustmentPct ?? 0) - (a.grossAdjustmentPct ?? 0))[0];
    return `${x.flaggedCount === 1 ? "One comp carries" : `${x.flaggedCount} comps carry`} more than ${GROSS_FLAG_PCT}% of gross adjustment — ${worst.name} at ${worst.grossAdjustmentPct}%, against a net of ${pct(worst.netAdjustmentPct as number)}. The net is what a grid shows and it is not the test: a comp adjusted up for one thing and down for another nets to nothing while being a quarter judgement.`;
  }

  // Then whether the set agrees with itself.
  if (x.rangePct !== null && x.rangePct > 25) {
    return `The adjusted comps span ${x.rangePct}% from ${usd(x.lowBasis as number)} to ${usd(x.highBasis as number)} per ${unit}, which is wide enough that the set is not agreeing on a value. A spread that wide is a reason to look again at the adjustments rather than to reconcile them.`;
  }

  // Then the ask, where there is one — the thing the grid is for.
  if (x.askPremiumPct !== null && x.askPremium !== null && x.indicatedValue !== null) {
    const over = x.askPremium > 0;
    return `The comps indicate ${usd(x.indicatedValue)} against an ask of ${usd(t.askingPrice as number)} — ${usd(Math.abs(x.askPremium))} ${over ? "over" : "under"}, ${Math.abs(x.askPremiumPct)}%. ${over ? "That gap is what the adjustments have to justify, and it is worth checking which of them the seller would dispute." : "A set of comps above the ask is worth a second look at the adjustments before it is treated as a finding."}`;
  }

  if (x.evidence === "thin") {
    return `${x.usableCount} comps, indicating ${usd(x.indicatedBasis as number)} per ${unit}${x.indicatedValue === null ? "" : ` and ${usd(x.indicatedValue)}`} — weighted toward ${x.strongest}, which needs the least adjustment. Under ${THIN_COMPS} comps the figure carries its count: it is a read rather than a median.`;
  }

  if (x.indicatedBasis !== null && x.meanBasis !== null && x.indicatedValue !== null) {
    const same = Math.abs(x.indicatedBasis - x.meanBasis) < 0.005;
    return `${x.usableCount} comps indicate ${usd(x.indicatedBasis)} per ${unit}, or ${usd(x.indicatedValue)}${same ? "" : ` — against ${usd(x.meanBasis)} on a straight average`}. ${same ? "The weighting and the average agree here, which happens only when the comps carry similar adjustment." : `The weighting leans on ${x.strongest} at ${x.comps.find((c) => c.name === x.strongest)?.grossAdjustmentPct}% gross and away from ${x.weakest}.`}`;
  }

  return `${x.usableCount} comps adjusted to ${usd(x.indicatedBasis as number)} per ${unit}. Give the subject's size to turn that into a value.`;
}
