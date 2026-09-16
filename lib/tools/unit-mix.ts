/**
 * An OM's unit mix table, read into the figures an underwriter needs.
 *
 * Every multifamily memorandum prints the same table — unit type, count,
 * average square feet, in-place rent, market rent — and every analyst
 * retypes it into Excel to get four things out of it: gross potential rent,
 * the weighted average rent (NOT the average of the rents, which is a
 * different and always wrong number), rent per foot, and loss to lease.
 *
 * Two rules the arithmetic turns on.
 *
 * WEIGHT BY UNIT COUNT, never by row. A property with 200 studios at $1,200
 * and 4 penthouses at $6,000 does not average $3,600. Averaging the rows
 * instead of the units is the most common error in this table and the
 * easiest to make, because the rows are what you can see.
 *
 * LOSS TO LEASE IS MEASURED AGAINST MARKET, not against the highest rent in
 * the building. A row with no market rent stated contributes to gross
 * potential rent but not to the loss-to-lease figure, because an assumption
 * a document does not state is absent, and absent is a different claim from
 * "equal to in-place".
 *
 * Pure, no I/O.
 */

import { readFigure } from "@/lib/money";

function positive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** One line of the mix, as read. */
export interface MixRow {
  label: string;
  units: number;
  /** average square feet per unit, when the table states it */
  sf: number | null;
  /** in-place / current rent per unit per month */
  inPlace: number | null;
  /** market / pro forma rent per unit per month, when stated */
  market: number | null;
}

export interface MixRead {
  rows: MixRow[];
  /** lines that could not be read as a unit row, verbatim */
  skipped: string[];
}

/**
 * Reads a pasted mix table.
 *
 * The shape it accepts is the shape an OM prints and a spreadsheet copies:
 * a label, then two to four numbers. Columns are tabs, commas, pipes or
 * runs of two or more spaces — a single space is NOT a separator, because
 * "2 Bed / 2 Bath" is one label.
 *
 * The numbers are read POSITIONALLY, in the order every memorandum prints
 * them: count, SF, in-place, market. A row of three numbers is missing one
 * of those columns, and which one is decided for the whole table at once —
 * see `threeNumberShape`.
 */
export function readMix(text: string): MixRead {
  const read: { label: string; nums: number[] }[] = [];
  const skipped: string[] = [];

  for (const line of text.split(/[\n\r]+/)) {
    const raw = line.trim();
    if (!raw) continue;

    const cells = cellsOf(raw);
    if (cells.length < 2) {
      skipped.push(raw);
      continue;
    }

    // The label is the first cell that is not a number; the numbers are
    // whatever follows, in order.
    const label = cells[0];
    if (readFigure(label) !== null) {
      // A row that opens with a figure has no label — an OM sometimes
      // prints the count first. Take it as unlabelled rather than refusing.
      const nums = cells.map(readFigure).filter((n): n is number => n !== null);
      if (nums.length >= 2 && positive(nums[0])) {
        read.push({ label: `${Math.round(nums[0])} units`, nums });
        continue;
      }
      skipped.push(raw);
      continue;
    }

    const nums = cells.slice(1).map(readFigure).filter((n): n is number => n !== null);
    if (nums.length < 2 || !positive(nums[0])) {
      skipped.push(raw);
      continue;
    }
    read.push({ label, nums });
  }

  const threeIsRents = threeNumberShape(read.map((r) => r.nums));
  return { rows: read.map((r) => rowOf(r.label, r.nums, threeIsRents)), skipped };
}

/**
 * For rows of exactly three numbers, are they (count, rent, market) or
 * (count, SF, rent)?
 *
 * Both tables exist — an OM with no market-rent column and an OM with no
 * square-footage column print the same shape — and the choice matters: read
 * a market rent as square footage and the loss to lease silently becomes
 * zero, which is the figure the table is opened for.
 *
 * The signal is the RATIO of the last two numbers. A market rent sits close
 * to its in-place rent by definition — that is what makes it comparable —
 * while a square footage beside a rent does not. So a ratio near 1 means
 * rents, and anything further out means the first of the pair is size.
 *
 * Decided once for the whole table rather than per row, because a column is
 * a property of the table: the rows that carry four numbers are ignored
 * here, and the three-number rows vote together on the median ratio. A
 * single odd row cannot flip its neighbours.
 */
function threeNumberShape(all: number[][]): boolean {
  const ratios = all
    .filter((n) => n.length === 3 && positive(n[1]) && positive(n[2]))
    .map((n) => n[2] / n[1])
    .sort((a, b) => a - b);
  if (ratios.length === 0) return true;
  const median = ratios[Math.floor(ratios.length / 2)];
  return median >= 0.6 && median <= 1.6;
}

/**
 * One line's cells, choosing ONE separator rather than accepting any.
 *
 * Precedence matters because a comma does double duty: it separates columns
 * in a CSV and it groups thousands in every rent an OM prints. Accepting
 * both at once reads "1,395" as two cells and quietly turns a $1,395 rent
 * into $1 — which is exactly what the first draft of this did. So the most
 * structured separator present wins, and a paste out of Excel or a PDF
 * (tabs, or runs of spaces) never splits on a comma at all.
 *
 * When a comma IS the separator, one sitting between two digits is still a
 * thousands mark. That leaves one ambiguous case — a true CSV with grouped
 * thousands and no other separator, "24,520,1395" — which reads as one
 * number. It is the rarest of the shapes and the only one this cannot
 * resolve from the text alone.
 */
function cellsOf(raw: string): string[] {
  const parts = /\t/.test(raw)
    ? raw.split(/\t+/)
    : /\|/.test(raw)
      ? raw.split(/\s*\|\s*/)
      : /\S\s{2,}\S/.test(raw)
        ? raw.split(/\s{2,}/)
        : raw.split(/(?<![0-9]),|,(?![0-9])/);
  return parts.map((c) => c.trim()).filter(Boolean);
}

function rowOf(label: string, nums: number[], threeIsRents: boolean): MixRow {
  const units = Math.round(nums[0]);
  if (nums.length >= 4) {
    return { label, units, sf: pos(nums[1]), inPlace: pos(nums[2]), market: pos(nums[3]) };
  }
  if (nums.length === 3) {
    return threeIsRents
      ? { label, units, sf: null, inPlace: pos(nums[1]), market: pos(nums[2]) }
      : { label, units, sf: pos(nums[1]), inPlace: pos(nums[2]), market: null };
  }
  return { label, units, sf: null, inPlace: pos(nums[1]), market: null };
}

const pos = (n: number): number | null => (positive(n) ? n : null);

// ---------------------------------------------------------------------------

export interface MixTotals {
  units: number;
  /** total building square feet across the rows that state SF */
  sf: number | null;
  /** units covered by the SF figure — less than `units` when a row omits it */
  sfUnits: number;
  avgSf: number | null;
  /** weighted by UNIT COUNT, never by row */
  avgInPlace: number | null;
  avgMarket: number | null;
  /** annual gross potential rent at in-place rents */
  gprInPlace: number | null;
  /** annual gross potential rent at market rents, over the rows that state one */
  gprMarket: number | null;
  /** annual dollars left on the table, over the rows that state a market rent */
  lossToLease: number | null;
  /** loss to lease as a share of market GPR, 0–100 */
  lossToLeasePct: number | null;
  /** units the loss-to-lease figure covers */
  ltlUnits: number;
  inPlacePerSf: number | null;
  marketPerSf: number | null;
  note: string | null;
}

const EMPTY: MixTotals = {
  units: 0,
  sf: null,
  sfUnits: 0,
  avgSf: null,
  avgInPlace: null,
  avgMarket: null,
  gprInPlace: null,
  gprMarket: null,
  lossToLease: null,
  lossToLeasePct: null,
  ltlUnits: 0,
  inPlacePerSf: null,
  marketPerSf: null,
  note: null,
};

/**
 * Totals the mix.
 *
 * Every average is weighted by unit count. Every total states how many units
 * it covers, because a mix whose market rents are half filled in produces a
 * loss-to-lease figure for half the building, and reporting that as the
 * building's is the failure mode this exists to avoid.
 */
export function totalMix(rows: MixRow[]): MixTotals {
  if (rows.length === 0) {
    return { ...EMPTY, note: "Paste the unit mix — type, count, SF, in-place rent, market rent." };
  }

  const units = rows.reduce((s, r) => s + r.units, 0);
  if (units <= 0) return { ...EMPTY, note: "No unit counts read." };

  let sf = 0;
  let sfUnits = 0;
  let inPlaceRent = 0;
  let inPlaceUnits = 0;
  let marketRent = 0;
  let marketUnits = 0;
  // Loss to lease is summed only over rows that state BOTH, so the two
  // sides of the subtraction always cover the same units.
  let ltlInPlace = 0;
  let ltlMarket = 0;
  let ltlUnits = 0;

  for (const r of rows) {
    if (positive(r.sf)) {
      sf += r.sf * r.units;
      sfUnits += r.units;
    }
    if (positive(r.inPlace)) {
      inPlaceRent += r.inPlace * r.units;
      inPlaceUnits += r.units;
    }
    if (positive(r.market)) {
      marketRent += r.market * r.units;
      marketUnits += r.units;
    }
    if (positive(r.inPlace) && positive(r.market)) {
      ltlInPlace += r.inPlace * r.units;
      ltlMarket += r.market * r.units;
      ltlUnits += r.units;
    }
  }

  const gprInPlace = inPlaceUnits > 0 ? inPlaceRent * 12 : null;
  const gprMarket = marketUnits > 0 ? marketRent * 12 : null;
  const lossToLease = ltlUnits > 0 ? (ltlMarket - ltlInPlace) * 12 : null;

  return {
    units,
    sf: sfUnits > 0 ? Math.round(sf) : null,
    sfUnits,
    avgSf: sfUnits > 0 ? round(sf / sfUnits, 0) : null,
    avgInPlace: inPlaceUnits > 0 ? round(inPlaceRent / inPlaceUnits, 0) : null,
    avgMarket: marketUnits > 0 ? round(marketRent / marketUnits, 0) : null,
    gprInPlace: gprInPlace === null ? null : Math.round(gprInPlace),
    gprMarket: gprMarket === null ? null : Math.round(gprMarket),
    lossToLease: lossToLease === null ? null : Math.round(lossToLease),
    lossToLeasePct:
      lossToLease !== null && ltlMarket > 0 ? round((lossToLease / (ltlMarket * 12)) * 100, 1) : null,
    ltlUnits,
    inPlacePerSf: perSf(rows, "inPlace"),
    marketPerSf: perSf(rows, "market"),
    note: noteFor(rows, units, sfUnits, marketUnits, ltlUnits),
  };
}

/** Annual rent per square foot, over the rows that state both a rent and SF. */
function perSf(rows: MixRow[], which: "inPlace" | "market"): number | null {
  let rent = 0;
  let sf = 0;
  for (const r of rows) {
    const v = r[which];
    if (positive(v) && positive(r.sf)) {
      rent += v * 12 * r.units;
      sf += r.sf * r.units;
    }
  }
  return sf > 0 ? round(rent / sf, 2) : null;
}

/**
 * The one sentence that says what the figures do NOT cover.
 *
 * A partially filled table is the normal case, not an error — an OM often
 * states market rents for the renovated types only. What must never happen
 * is a loss-to-lease figure for 40 units being read as the building's.
 */
function noteFor(
  rows: MixRow[],
  units: number,
  sfUnits: number,
  marketUnits: number,
  ltlUnits: number,
): string | null {
  const parts: string[] = [];
  if (marketUnits === 0) {
    parts.push("No market rents stated, so there is no loss to lease to read");
  } else if (ltlUnits < units) {
    parts.push(
      `Loss to lease covers ${ltlUnits} of ${units} units — the rest state no market rent`,
    );
  }
  if (sfUnits > 0 && sfUnits < units) {
    parts.push(`square footage covers ${sfUnits} of ${units}`);
  } else if (sfUnits === 0 && rows.length > 0) {
    parts.push("no square footage stated, so there is no rent per foot");
  }
  return parts.length ? `${parts.join("; ")}.` : null;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}
