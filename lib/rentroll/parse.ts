/**
 * Rent roll ingestion: file bytes → a grid → a header row → a column mapping →
 * normalized leases.
 *
 * The three hard parts, each handled explicitly:
 *   1. THE HEADER IS RARELY ROW 1. Broker exports carry a title block
 *      ("Rent Roll", the property name, an as-of date) above the real header.
 *      detectHeaderRow scores every candidate row instead of assuming.
 *   2. COLUMN NAMES ARE NEVER THE SAME TWICE. suggestMapping scores each header
 *      against the alias vocabulary and returns a confidence, so the UI can
 *      show the user what it guessed and let them correct it.
 *   3. NUMBERS AND DATES ARRIVE IN EVERY FORMAT. "$1,234.56", "(500)", Excel
 *      serials, "Jan-27", "1/31/2027", "2027-01-31".
 *
 * The .xlsx reader is exceljs, already a dependency and already the writer for
 * the live-formula export. SheetJS's community build is a values-only writer
 * and its npm distribution is deprecated, so it is deliberately not used.
 *
 * Pure except for `readWorkbookGrid`, which is async only because exceljs is.
 */
import ExcelJS from "exceljs";
import {
  CANONICAL_FIELDS,
  FIELD_BY_KEY,
  TOTAL_QUALIFIERS,
  TOTAL_WORDS,
  VACANT_MARKERS,
  type CanonicalKey,
  type Lease,
  type RentBasis,
} from "./schema";

/** A worksheet as raw cells. `null` is an empty cell. */
export type Grid = (string | number | boolean | Date | null)[][];

// ---------------------------------------------------------------------------
// File → grid
// ---------------------------------------------------------------------------

/**
 * RFC 4180 CSV, plus the two things real exports do that the RFC doesn't:
 * a UTF-8 BOM, and CRLF line endings inside quoted fields.
 */
export function parseCsv(text: string): Grid {
  const src = text.replace(/^﻿/, "");
  const rows: Grid = [];
  let row: (string | null)[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(started || field.length ? field : null);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row as Grid[number]);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    field += ch;
  }
  if (field.length || started || row.length) endRow();
  // A trailing newline produces one empty row; drop fully-empty trailing rows.
  while (rows.length && rows[rows.length - 1].every((c) => c == null || c === "")) rows.pop();
  return rows;
}

/** The first worksheet of an .xlsx/.xlsm as a grid, formulas resolved to their
 *  cached values (a rent roll's own formulas are the broker's arithmetic, not
 *  ours to re-derive). */
export async function readWorkbookGrid(buffer: Buffer): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const grid: Grid = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row: Grid[number] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      row.push(cellValue(ws.getCell(r, c).value));
    }
    grid.push(row);
  }
  return grid;
}

function cellValue(v: ExcelJS.CellValue): Grid[number][number] {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string };
  if (o.richText) return o.richText.map((r) => r.text).join("");
  if (o.result !== undefined) {
    const r = o.result;
    if (typeof r === "string" || typeof r === "number" || typeof r === "boolean") return r;
    if (r instanceof Date) return r;
    return null;
  }
  if (typeof o.text === "string") return o.text;
  return null;
}

/** Dispatch on the filename, falling back to a content sniff. */
export async function readGrid(filename: string, buffer: Buffer): Promise<Grid> {
  const isXlsx =
    /\.(xlsx|xlsm)$/i.test(filename) ||
    (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b); // PK zip header
  if (isXlsx) return readWorkbookGrid(buffer);
  return parseCsv(buffer.toString("utf8"));
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

/** lowercase, collapse punctuation and whitespace — the form aliases are in. */
export function normalizeHeader(raw: unknown): string {
  if (raw == null) return "";
  return String(raw)
    .toLowerCase()
    .replace(/[#().:/\\_\-–—]+/g, " ")
    .replace(/[^a-z0-9 %$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every alias, with its place in its field's list: where two columns match a
 *  field equally well, the alias listed first wins ("Lease Start" over
 *  "Move-in" for the lease's start). */
const ALL_ALIASES: { key: CanonicalKey; alias: string; monthly: boolean; rank: number }[] =
  CANONICAL_FIELDS.flatMap((f) => [
    ...f.aliases.map((alias, i) => ({ key: f.key, alias, monthly: false, rank: i })),
    ...(f.monthlyAliases ?? []).map((alias, i) => ({
      key: f.key,
      alias,
      monthly: true,
      rank: f.aliases.length + i,
    })),
  ]);

/** A header naming a market, asking or budgeted rent — what the space could
 *  let for, never what the tenant pays — maps to no field: a roll's "Market
 *  Rent" beside its "Actual Rent" had taken the base-rent column, and the
 *  in-place rent fell to the Rent $/SF column (the market rent the analysis
 *  reads is the leasing profile's). */
const MARKET_RENT_HEADER = /\b(market|mkt|asking|pro ?forma|proforma|budget|budgeted|potential|gpr|street)\b/;

/** A header naming what is let — "Unit Type", "Floor plan", "Bed/Bath" — maps
 *  to no field: its "type" had read as the lease's expense basis, and with
 *  that refused, as the reimbursement type. */
const SPACE_TYPE_HEADER =
  /\b(unit|space|suite|apartment|apt)\s+type\b|\bfloor ?plans?\b|\bfloorplans?\b|\bbed(room)?s?\b|\bbath(room)?s?\b|\bunit mix\b/;

/** The period a rent header states: a month's figure or a year's. */
const MONTH_HEADER = /\b(monthly|month|months|mo|mos|mth|mthly|mnth|mnthly)\b/;
const YEAR_HEADER = /\b(annual|annually|annualized|yearly|year|yr|pa|annum)\b/;

/** A header only a residential roll carries — where the deal's class is not
 *  known, it says a rent column that names no period is a month's. */
const RESIDENTIAL_HEADER = /\b(resident|residents|move in|bedrooms?|beds|baths?|floor ?plan|floorplan)\b/;

export interface MappingOptions {
  /** read a base-rent column whose header names no period as a month's: the
   *  deal's class leases by the month or the year (lib/rentroll/profiles
   *  `leasesShort`), and rental housing states its rents by the month. Unset
   *  (no class read), a header only a residential roll carries decides. */
  rentMonthly?: boolean;
}

/**
 * How well a header cell matches an alias, 0..1. Exact beats prefix beats
 * token-overlap; a bare substring scores lowest so "rate" doesn't outrank
 * "rent psf" for the same column.
 *
 * Exported because the submarket importer (lib/market/import.ts) scores its own
 * vocabulary the same way — one matching rule, two vocabularies.
 */
export function aliasScore(header: string, alias: string): number {
  if (!header) return 0;
  if (header === alias) return 1;
  if (header.startsWith(`${alias} `) || header.endsWith(` ${alias}`)) return 0.85;
  const ht = new Set(header.split(" "));
  const at = alias.split(" ");
  const overlap = at.filter((t) => ht.has(t)).length;
  if (overlap === at.length) return 0.75;
  if (overlap > 0) return 0.35 + 0.3 * (overlap / at.length);
  if (header.includes(alias) && alias.length >= 4) return 0.3;
  return 0;
}

/** Best canonical field for one header cell. */
export function scoreHeader(
  header: string,
): { key: CanonicalKey; confidence: number; monthly: boolean } | null {
  let best: { key: CanonicalKey; confidence: number; monthly: boolean } | null = null;
  for (const { key, alias, monthly } of ALL_ALIASES) {
    const s = aliasScore(header, alias);
    if (s > 0 && (!best || s > best.confidence)) best = { key, confidence: s, monthly };
  }
  return best && best.confidence >= 0.3 ? best : null;
}

/**
 * Which row is the header. Scores each of the first `limit` rows by how many
 * of its cells map to a canonical field, with a bonus for rows whose cells are
 * mostly short text (a header) rather than numbers (a data row).
 */
export function detectHeaderRow(grid: Grid, limit = 25): number {
  let bestRow = 0;
  let bestScore = -1;
  const upto = Math.min(grid.length, limit);
  for (let r = 0; r < upto; r++) {
    const row = grid[r];
    if (!row) continue;
    const cells = row.filter((c) => c != null && String(c).trim() !== "");
    if (cells.length < 2) continue;
    let mapped = 0;
    let texty = 0;
    for (const cell of cells) {
      const norm = normalizeHeader(cell);
      if (scoreHeader(norm)) mapped++;
      if (typeof cell !== "number" && !(cell instanceof Date) && norm.length > 0 && norm.length <= 40) {
        texty++;
      }
    }
    const score = mapped * 3 + (texty / cells.length) * 2 + Math.min(cells.length, 12) * 0.1;
    if (mapped >= 2 && score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** column index → canonical field, plus whether that column is a monthly figure. */
export interface ColumnMapping {
  /** canonical key → source column index */
  columns: Partial<Record<CanonicalKey, number>>;
  /** canonical keys whose source column holds a MONTHLY figure */
  monthly: CanonicalKey[];
  headerRow: number;
  /** per-field confidence from the fuzzy pass, for the confirmation UI */
  confidence: Partial<Record<CanonicalKey, number>>;
}

/**
 * Best-guess mapping from the header row. Each canonical field takes the
 * highest-scoring unclaimed column, so two columns that both look like "rent"
 * don't both win. A market or asking rent maps to nothing, and neither does a
 * space's type.
 *
 * WHETHER A RENT IS A MONTH'S IS THE HEADER'S TO SAY: "Monthly Rent", "Rent /
 * Mo" and "Rent PSF / Mo" are annualized on import, "Annual Rent" and "Rent
 * PSF / Yr" are not. A base-rent header that names no period ("Actual Rent")
 * is a month's where the roll leases by the month (`options.rentMonthly`) and
 * a year's otherwise. The confirmation form shows the "× 12" box either way.
 */
export function suggestMapping(grid: Grid, headerRow?: number, options: MappingOptions = {}): ColumnMapping {
  const hr = headerRow ?? detectHeaderRow(grid);
  const headers = (grid[hr] ?? []).map((c) => normalizeHeader(c));

  const candidates: { key: CanonicalKey; col: number; score: number; rank: number }[] = [];
  headers.forEach((h, col) => {
    if (!h || MARKET_RENT_HEADER.test(h) || SPACE_TYPE_HEADER.test(h)) return;
    for (const { key, alias, rank } of ALL_ALIASES) {
      const s = aliasScore(h, alias);
      if (s >= 0.3) candidates.push({ key, col, score: s, rank });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.rank - b.rank);

  const columns: ColumnMapping["columns"] = {};
  const confidence: ColumnMapping["confidence"] = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (columns[c.key] !== undefined || usedCols.has(c.col)) continue;
    columns[c.key] = c.col;
    confidence[c.key] = c.score;
    usedCols.add(c.col);
  }

  const rentMonthly = options.rentMonthly ?? headers.some((h) => RESIDENTIAL_HEADER.test(h));
  const monthly = (["baseRentAnnual", "rentPsf"] as const).filter((key) => {
    const col = columns[key];
    if (col === undefined) return false;
    const h = headers[col];
    if (MONTH_HEADER.test(h)) return true;
    if (YEAR_HEADER.test(h)) return false;
    // A rent per foot that names no period stays a year's: a commercial
    // figure, and a monthly one is caught by its base rent (lib/rentroll/
    // validate's cross-check) rather than guessed here.
    return key === "baseRentAnnual" && rentMonthly;
  });

  return { columns, monthly: [...monthly], headerRow: hr, confidence };
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

/** "$1,234.56", "(500)", "1 234", "" → number | null. Never returns 0 for a
 *  blank: a blank is an absent figure, and absent is not zero. */
export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "" || s === "-" || /^n\/?a$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Why an escalation cell was left blank: a dollar bump ("$0.50"), a bare
 *  figure that reads two ways ("1" — 1%, 100% or $1), words that are no one
 *  annual percent ("10% every 5 years", "CPI"), or a figure past any annual
 *  bump. */
export type EscalationUnread = "dollar" | "ambiguous" | "text" | "implausible";

/** A bare figure as an annual escalation: a decimal under 0.2 is how a
 *  spreadsheet stores a percent (0.03 is 3%), a figure over 1 and up to 15 is
 *  a whole percent ("3" is 3%), and one from 0.2 to 1 reads either way — "1"
 *  was once read as 100% — so it is refused. Past 15 is no annual bump. */
function escalationOfFigure(n: number): { pct: number | null; unread?: EscalationUnread } {
  const a = Math.abs(n);
  if (a === 0) return { pct: 0 };
  if (a < 0.2) return { pct: n };
  if (a <= 1) return { pct: null, unread: "ambiguous" };
  if (a <= 15) return { pct: n / 100 };
  return { pct: null, unread: "implausible" };
}

/**
 * An escalation cell, read only as an annual percent: "3%", "3.0% annually",
 * 0.03, "3", "Flat". A dollar bump ("$0.50") is a dollar bump, never 50%; a
 * bare figure that reads two ways and words that state no one annual percent
 * are refused — null, with the reason, so the import says so rather than
 * guessing. (`parsePercent` keeps its own rule for the submarket importer's
 * vacancy, where 0.25 is 25%.)
 */
export function readEscalation(raw: unknown): { pct: number | null; unread?: EscalationUnread } {
  if (raw == null || typeof raw === "boolean") return { pct: null };
  if (typeof raw === "number") return Number.isFinite(raw) ? escalationOfFigure(raw) : { pct: null };
  const s = String(raw).trim();
  if (!s || /^(?:n\/?a|na|-+|—|–)$/i.test(s)) return { pct: null };
  if (/^(?:flat|none|no|nil)$/i.test(s)) return { pct: 0 };
  if (s.includes("$")) return { pct: null, unread: "dollar" };
  const stated = /^(-?\d+(?:\.\d+)?)\s*%\s*(?:(?:\/|per|a|each)\s*(?:yr|year|annum)|annual(?:ly)?|yearly|p\.?\s?a\.?)?$/i.exec(s);
  if (stated) {
    const pct = Number(stated[1]) / 100;
    return Math.abs(pct) <= 0.15 ? { pct } : { pct: null, unread: "implausible" };
  }
  const n = parseNumber(s);
  return n != null ? escalationOfFigure(n) : { pct: null, unread: "text" };
}

/** A percent column may hold 3, "3%", or 0.03. Values above 1 are read as
 *  whole percents — a 300% annual escalation is not a thing a rent roll says. */
export function parsePercent(raw: unknown): number | null {
  if (raw == null) return null;
  const hadSign = typeof raw === "string" && raw.includes("%");
  const n = parseNumber(raw);
  if (n == null) return null;
  if (hadSign) return n / 100;
  return Math.abs(n) > 1 ? n / 100 : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Last day of a month, for "Jan-27" style expiries (a lease that expires in
 *  a month expires at its END, and rounding to the 1st understates WALT). */
function endOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const twoDigitYear = (y: number): number => (y >= 70 ? 1900 + y : 2000 + y);
const fullYear = (y: number): number => (y < 100 ? twoDigitYear(y) : y);

/** The ISO date for a year, month and day that exist — null for a 13th
 *  month, a 31st of June or a 29th of February outside a leap year, which a
 *  date column carries only where it was read the wrong way round. */
function realIso(y: number, m: number, d: number): string | null {
  if (![y, m, d].every(Number.isInteger) || m < 1 || m > 12 || d < 1) return null;
  return d <= endOfMonth(y, m) ? iso(y, m, d) : null;
}

const monthOf = (word: string): number | undefined =>
  MONTHS[word.slice(0, 4).toLowerCase()] ?? MONTHS[word.slice(0, 3).toLowerCase()];

/** A figure that is a year, not an Excel serial: serial 2028 is 20 July 1905. */
const yearLike = (n: number): boolean => Number.isInteger(n) && n >= 1900 && n <= 2199;

/** A day and a month written as figures — "31/12/2028", "12-31-26", "31.12.2028". */
const NUMERIC_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;

export interface DateOptions {
  /** read a date whose day and month could be either (05/06/2028) day
   *  first — the file's own convention, decided by `toLeases` from the dates
   *  that can only be one way */
  dayFirst?: boolean;
}

/**
 * Parse the date formats rent rolls actually carry: ISO, m/d/y and d/m/y,
 * d-mmm-yy, "Mmm d, yyyy", "Jan-27", "January 2027", and Excel's 1900-based
 * serial numbers. Returns ISO yyyy-mm-dd, or null.
 *
 * A date is a day that exists. 31/12/2028 can only be day first, so it is
 * read that way; 12/31/2028 only month first; 05/06/2028 could be either and
 * is read by the file's convention (`dayFirst`), month first where the file
 * has not shown one. A date that fits neither (13/13/2028, 2/30/2027,
 * 2028-31-12), a year alone and a day with no year are refused — null, never
 * a guess: the parser once wrote "2028-31-12" and WALT came back NaN.
 */
export function parseDate(raw: unknown, options: DateOptions = {}): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : iso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") return yearLike(raw) ? null : excelSerialToIso(raw);

  const s = String(raw).trim();
  if (!s) return null;

  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?=$|[T\s])/.exec(s);
  if (isoMatch) return realIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  // "2028-12" — a year and a month, so the month's end.
  const isoMonth = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (isoMonth) {
    const [y, m] = [Number(isoMonth[1]), Number(isoMonth[2])];
    return m >= 1 && m <= 12 ? iso(y, m, endOfMonth(y, m)) : null;
  }

  const numeric = NUMERIC_DATE.exec(s);
  if (numeric) {
    const [a, b, y] = [Number(numeric[1]), Number(numeric[2]), fullYear(Number(numeric[3]))];
    const dayFirst = a > 12 ? true : b > 12 ? false : !!options.dayFirst;
    return dayFirst ? realIso(y, b, a) : realIso(y, a, b);
  }

  const dMmmY = /^(\d{1,2})[-\s]([a-z]{3,9})\.?[-\s,]+(\d{2,4})$/i.exec(s);
  if (dMmmY) {
    const m = monthOf(dMmmY[2]);
    if (m) return realIso(fullYear(Number(dMmmY[3])), m, Number(dMmmY[1]));
  }

  // "Dec 31, 2028", "December 31st 2028".
  const mmmDY = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s);
  if (mmmDY) {
    const m = monthOf(mmmDY[1]);
    if (m) return realIso(Number(mmmDY[3]), m, Number(mmmDY[2]));
  }

  // "Jan-27", "Jan 2027", "January 2027" — month precision, so end of month.
  const mmmY = /^([a-z]{3,9})[-\s,]+(\d{2,4})$/i.exec(s);
  if (mmmY) {
    const m = monthOf(mmmY[1]);
    if (m) {
      const y = fullYear(Number(mmmY[2]));
      return iso(y, m, endOfMonth(y, m));
    }
  }

  // A bare number in a date column is an Excel serial that survived as text
  // — unless it is a year, which names no day.
  const asNumber = parseNumber(s);
  if (asNumber != null) {
    return !yearLike(asNumber) && asNumber > 1000 && asNumber < 100_000 ? excelSerialToIso(asNumber) : null;
  }

  // Anything else the engine can read, but only with its year: "12/31" alone
  // reads as 2001 to Date.parse, which is no lease's expiry.
  if (!/\b\d{4}\b/.test(s)) return null;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

/** What a date column says where it states no date at all — a blank by
 *  another name, never a date read wrong. */
const NO_DATE = /^(?:n\/?a|na|none|-+|—|–|tbd|tba|mtm|m-t-m|month[\s-]+to[\s-]+month|holdover|hold over|expired|vacant|see notes?)$/i;

/** Excel's serial epoch is 1899-12-30 (its 1900 leap-year bug baked in). */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 200_000) return null;
  const ms = Math.round(serial * 86_400_000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  if (Number.isNaN(d.getTime())) return null;
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseBasis(raw: unknown): RentBasis {
  const s = String(raw ?? "").toLowerCase();
  if (/triple\s*net|nnn|net net net|\bnet\b/.test(s)) return "NNN";
  if (/full\s*service|fsg|gross full|\bfs\b/.test(s)) return "FSG";
  if (/modified\s*gross|\bmg\b|industrial gross|\big\b/.test(s)) return "MG";
  return "unknown";
}

const looksLike = (value: unknown, markers: string[]): boolean => {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return false;
  return markers.some((m) => s === m || s.startsWith(`${m} `) || s.startsWith(`${m}:`));
};

/** A label's words, lowercase, punctuation read as a space. */
const labelWords = (raw: string): string[] =>
  raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** A word a totals label may carry beside its totals word: one that names
 *  what is totalled, a number, or a building's letter ("Building A"). */
const qualifies = (w: string): boolean => TOTAL_QUALIFIERS.has(w) || /^\d+$/.test(w) || w.length <= 2;

/** Where the label's totals word sits, when only qualifying words come
 *  before it ("Grand Total", "Vacant Total"); -1 when it has none. */
function totalsWordAt(words: string[]): number {
  const at = words.findIndex((w) => TOTAL_WORDS.has(w));
  return at >= 0 && words.slice(0, at).every(qualifies) ? at : -1;
}

/**
 * Whether a cell's WHOLE text is a totals label: the word itself ("Total",
 * "TOTALS:", "Grand Total", "Sub-total", "Weighted Average"), or the word with
 * words that name what is totalled ("Total Occupied", "Vacant Total", "Total
 * Rentable SF", "Building A Total"), or the word and then a separator or a
 * "for" / "of" that hands the rest to what is totalled ("Subtotal - Building
 * A", "Total: Retail", "Totals (12 leases)", "Total for Phase 2"). A name that
 * only opens on the word is not one: "Total Wine & More", "Sum Kitchen" and
 * "Average Joe's" are tenants.
 */
export function isTotalsLabel(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const words = labelWords(raw);
  const at = totalsWordAt(words);
  if (at < 0) return false;
  const rest = words.slice(at + 1);
  if (rest.length === 0) return true;
  // A dash separates only with a space after it: "Total - Retail" is a label,
  // "Total-Tel Communications" a tenant.
  const separated = new RegExp(`\\b${words[at]}\\b(?:\\s*[:(|/,]|\\s*[-–—]\\s)`, "i").test(raw);
  if (separated) return true;
  for (const w of rest) {
    if (w === "for" || w === "of" || w === "by") return true;
    if (!qualifies(w)) return false;
  }
  return true;
}

/** Whether a label opens on a totals word (after qualifiers only) — a
 *  candidate the figures decide: "Total Northgate Center" sums the rows above
 *  it, "Total Wine & More" does not. */
const opensOnTotalsWord = (raw: unknown): boolean =>
  typeof raw === "string" && totalsWordAt(labelWords(raw)) >= 0;

// ---------------------------------------------------------------------------
// Grid + mapping → leases
// ---------------------------------------------------------------------------

/** A row the parser left out of the leases, with the label that marked it. */
export interface SkippedRow {
  /** 1-based row in the source file */
  row: number;
  label: string;
}

/** A cell that held something the parser would not read as a figure, left
 *  blank on the lease rather than guessed. */
export interface UnreadCell {
  /** 1-based row in the source file */
  row: number;
  field: CanonicalKey;
  /** the cell as the file wrote it */
  text: string;
}

export interface ParseResult {
  leases: Lease[];
  mapping: ColumnMapping;
  /** the header row's raw text, for the confirmation UI */
  headers: string[];
  /** rows skipped as totals/subtotals, so the count is never a silent loss */
  skippedTotalRows: number;
  skippedBlankRows: number;
  /** each totals line left out, by row and label — stored with the import's
   *  issues (lib/rentroll/validate) and shown on the page */
  skippedTotals: SkippedRow[];
  /** dates on occupied leases that name no day that exists (31/31/2028), a
   *  year alone, or a day with no year — blank on the lease, said here */
  unreadDates: UnreadCell[];
  /** escalation cells on occupied leases read as no annual percent ("$0.50",
   *  "1", "10% every 5 years") — blank on the lease, said here with why */
  unreadEscalations: (UnreadCell & { reason: EscalationUnread })[];
  /** the cell that showed the file writes its dates day first ("31/12/2028")
   *  and the day it is, so a date that could be either was read that way;
   *  null where none did */
  dayFirst: { text: string; date: string } | null;
}

/**
 * The file's own date convention, from the dates that can only be one way: a
 * first figure over 12 is a day ("31/12/2028"), a second one over 12 is
 * ("12/31/2028"). Day first only where the file shows it and never shows the
 * other — a file that shows both is read cell by cell.
 */
function dayFirstEvidence(cells: unknown[]): { text: string; date: string } | null {
  let dayFirst: { text: string; date: string } | null = null;
  for (const c of cells) {
    const m = typeof c === "string" ? NUMERIC_DATE.exec(c.trim()) : null;
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (b > 12 && a <= 12) return null;
    if (a > 12 && b <= 12 && !dayFirst) {
      const date = parseDate(c, { dayFirst: true });
      if (date) dayFirst = { text: String(c).trim(), date };
    }
  }
  return dayFirst;
}

/** Two figures that agree to a dollar (or a foot), or to half a percent. */
const sameFigure = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

/**
 * Apply a mapping to the grid. Rows below the header are leases, except
 * total/subtotal lines (summing a file that carries its own totals doubles the
 * building) and fully-blank spacer rows.
 *
 * A TOTALS LINE IS READ BY ITS SHAPE, never by its first word, because a
 * tenant can open on the same word ("Total Wine & More", 18,000 SF, was once
 * dropped as a totals line). A row is the roll's own sums when:
 *   1. its suite column holds a totals label (`isTotalsLabel` — the word
 *      alone or with words naming what is totalled): a suite names a space,
 *      never a tenant;
 *   2. its tenant column holds one and it has no suite of its own;
 *   3. it names no suite and no tenant, and a totals label sits in another
 *      column ("Total" under a Building column);
 *   4. a label that only OPENS on a totals word ("Total Northgate Center")
 *      sits on a row with no suite of its own and no lease date, whose area
 *      or rent adds up the rows above it — to half a percent, over two rows
 *      or more, since the block it closes or the whole roll so far.
 * Everything else is a lease, whatever its name opens on.
 */
export function toLeases(grid: Grid, mapping: ColumnMapping): ParseResult {
  const headers = (grid[mapping.headerRow] ?? []).map((c) => String(c ?? "").trim());
  const leases: Lease[] = [];
  const skippedTotals: SkippedRow[] = [];
  let skippedBlankRows = 0;

  const at = (row: Grid[number], key: CanonicalKey): unknown => {
    const col = mapping.columns[key];
    return col === undefined ? null : (row[col] ?? null);
  };
  const isMonthly = (key: CanonicalKey) => mapping.monthly.includes(key);
  const text = (v: unknown): string => (v == null ? "" : String(v).trim());
  const rentOf = (row: Grid[number]): number | null => {
    const raw = parseNumber(at(row, "baseRentAnnual"));
    return raw == null ? null : isMonthly("baseRentAnnual") ? raw * 12 : raw;
  };

  // One date convention for the whole file, decided from both date columns.
  const body = grid.slice(mapping.headerRow + 1);
  const dayFirst = dayFirstEvidence(
    body.flatMap((row) => (row ? [at(row, "leaseStart"), at(row, "leaseExpiry")] : [])),
  );
  const dateOf = (row: Grid[number], key: CanonicalKey): string | null =>
    parseDate(at(row, key), { dayFirst: dayFirst != null });
  const unreadDates: UnreadCell[] = [];
  const unreadEscalations: ParseResult["unreadEscalations"] = [];
  /** A date cell that holds something, reads as no date, and is no word for
   *  "no date" ("MTM", "N/A") — a date the reader refused. */
  const unreadDate = (row: Grid[number], key: CanonicalKey): string | null => {
    const raw = at(row, key);
    const said = text(raw);
    return said && !NO_DATE.test(said) && dateOf(row, key) == null ? said : null;
  };

  // The leases since the last totals line, and since the top of the roll —
  // what a rule-4 label's figures must add up.
  let blockStart = 0;
  const addsUp = (row: Grid[number]): boolean => {
    const sf = parseNumber(at(row, "sf"));
    const rent = rentOf(row);
    if (sf == null && rent == null) return false;
    const sets = [leases.slice(blockStart), leases].flatMap((set) => [set, set.filter((l) => !l.vacant)]);
    return sets.some(
      (set) =>
        set.length >= 2 &&
        (sf == null || sameFigure(sf, set.reduce((s, l) => s + (l.sf ?? 0), 0))) &&
        (rent == null || sameFigure(rent, set.reduce((s, l) => s + (l.baseRentAnnual ?? 0), 0))),
    );
  };
  const totalsLabelOf = (row: Grid[number]): string | null => {
    const suite = text(at(row, "suite"));
    const tenant = text(at(row, "tenant"));
    if (isTotalsLabel(suite)) return suite;
    if (!suite && isTotalsLabel(tenant)) return tenant;
    const others = !suite && !tenant ? row.filter((c): c is string => typeof c === "string") : [];
    const elsewhere = others.find((c) => isTotalsLabel(c));
    if (elsewhere) return elsewhere.trim();
    const opener = [suite, tenant, ...others].find(opensOnTotalsWord);
    if (!opener || (suite && suite !== opener)) return null;
    const dated = dateOf(row, "leaseExpiry") != null || dateOf(row, "leaseStart") != null;
    return !dated && addsUp(row) ? opener.trim() : null;
  };

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    if (row.every((c) => c == null || String(c).trim() === "")) {
      skippedBlankRows++;
      continue;
    }
    const totalsLabel = totalsLabelOf(row);
    if (totalsLabel != null) {
      skippedTotals.push({ row: r + 1, label: totalsLabel });
      blockStart = leases.length;
      continue;
    }

    const tenantRaw = String(at(row, "tenant") ?? "").trim();
    const sf = parseNumber(at(row, "sf"));
    const baseRentAnnual = rentOf(row);
    const psfRaw = parseNumber(at(row, "rentPsf"));
    const rentPsfStated = psfRaw == null ? null : isMonthly("rentPsf") ? psfRaw * 12 : psfRaw;

    const leaseExpiry = dateOf(row, "leaseExpiry");
    const vacant =
      looksLike(tenantRaw, VACANT_MARKERS) ||
      (tenantRaw === "" && (baseRentAnnual == null || baseRentAnnual === 0));

    // A row with no tenant, no SF and no rent is padding, not a vacancy.
    if (vacant && sf == null && baseRentAnnual == null && !leaseExpiry) {
      skippedBlankRows++;
      continue;
    }

    // A vacancy's dates are no lease's; an occupied lease's refused date or
    // escalation is left blank and said.
    const escalation = readEscalation(at(row, "escalationPct"));
    if (!vacant) {
      for (const field of ["leaseStart", "leaseExpiry"] as const) {
        const said = unreadDate(row, field);
        if (said != null) unreadDates.push({ row: r + 1, field, text: said });
      }
      if (escalation.unread) {
        unreadEscalations.push({
          row: r + 1,
          field: "escalationPct",
          text: text(at(row, "escalationPct")),
          reason: escalation.unread,
        });
      }
    }

    leases.push({
      sourceRow: r + 1,
      suite: String(at(row, "suite") ?? "").trim(),
      tenant: vacant ? "" : tenantRaw,
      sf,
      leaseStart: dateOf(row, "leaseStart"),
      leaseExpiry: vacant ? null : leaseExpiry,
      baseRentAnnual: vacant ? null : baseRentAnnual,
      rentPsf:
        rentPsfStated ??
        (baseRentAnnual != null && sf != null && sf > 0 && !vacant
          ? baseRentAnnual / sf
          : null),
      rentBasis: parseBasis(at(row, "rentBasis")),
      escalationPct: escalation.pct,
      reimbursementType: String(at(row, "reimbursementType") ?? "").trim(),
      renewalOptions: String(at(row, "renewalOptions") ?? "").trim(),
      freeRentMonths: parseNumber(at(row, "freeRentMonths")),
      notes: String(at(row, "notes") ?? "").trim(),
      vacant,
    });
  }

  return {
    leases,
    mapping,
    headers,
    skippedTotalRows: skippedTotals.length,
    skippedBlankRows,
    skippedTotals,
    unreadDates,
    unreadEscalations,
    dayFirst,
  };
}

/** One call: bytes → leases, using the auto-detected mapping. */
export async function parseRentRoll(
  filename: string,
  buffer: Buffer,
  mapping?: ColumnMapping,
): Promise<ParseResult> {
  const grid = await readGrid(filename, buffer);
  return toLeases(grid, mapping ?? suggestMapping(grid));
}

/**
 * A stable signature for a file's header row — normalized, non-empty cells,
 * joined. Two exports from the same broker share it, which is what lets a
 * saved mapping apply on the second upload without the user re-doing it.
 */
export function headerSignature(grid: Grid, headerRow: number): string {
  return (grid[headerRow] ?? [])
    .map((c) => normalizeHeader(c))
    .filter(Boolean)
    .join("|")
    .slice(0, 500);
}

/**
 * The mapping a user confirmed for this file's shape, wherever its header
 * now sits. A saved mapping is keyed on the signature of the header row it
 * was confirmed at — which, after the user corrected the header row, is not
 * the row the detector picks, so looking up the detected row's signature
 * never found it again. Every row the detector reads is tried, the detected
 * row first, and the mapping is applied at the row whose signature matched
 * (a title block a line longer next month moves the header, not the
 * columns).
 */
export function matchSavedMapping(
  grid: Grid,
  detectedRow: number,
  saved: readonly { signature: string; mapping: ColumnMapping }[],
  limit = 25,
): ColumnMapping | null {
  if (!saved.length) return null;
  const bySignature = new Map(saved.map((s) => [s.signature, s.mapping]));
  const rows = [detectedRow, ...Array.from({ length: Math.min(grid.length, limit) }, (_, r) => r)];
  for (const r of rows) {
    const signature = headerSignature(grid, r);
    const mapping = signature ? bySignature.get(signature) : undefined;
    if (mapping) return { ...mapping, headerRow: r };
  }
  return null;
}

/** Field metadata for the mapping UI, in display order. */
export const MAPPING_FIELDS = CANONICAL_FIELDS.map((f) => ({
  key: f.key,
  label: f.label,
  required: f.required,
  help: f.help,
  supportsMonthly: (f.monthlyAliases?.length ?? 0) > 0,
}));

export { FIELD_BY_KEY };
