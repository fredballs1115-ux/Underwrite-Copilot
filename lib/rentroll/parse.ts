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
  TOTAL_MARKERS,
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

const ALL_ALIASES: { key: CanonicalKey; alias: string; monthly: boolean }[] = CANONICAL_FIELDS.flatMap(
  (f) => [
    ...f.aliases.map((alias) => ({ key: f.key, alias, monthly: false })),
    ...(f.monthlyAliases ?? []).map((alias) => ({ key: f.key, alias, monthly: true })),
  ],
);

/** How well a header cell matches an alias, 0..1. Exact beats prefix beats
 *  token-overlap; a bare substring scores lowest so "rate" doesn't outrank
 *  "rent psf" for the same column. */
function aliasScore(header: string, alias: string): number {
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
 * don't both win.
 */
export function suggestMapping(grid: Grid, headerRow?: number): ColumnMapping {
  const hr = headerRow ?? detectHeaderRow(grid);
  const headers = (grid[hr] ?? []).map((c) => normalizeHeader(c));

  const candidates: { key: CanonicalKey; col: number; score: number; monthly: boolean }[] = [];
  headers.forEach((h, col) => {
    if (!h) return;
    for (const { key, alias, monthly } of ALL_ALIASES) {
      const s = aliasScore(h, alias);
      if (s >= 0.3) candidates.push({ key, col, score: s, monthly });
    }
  });
  candidates.sort((a, b) => b.score - a.score);

  const columns: ColumnMapping["columns"] = {};
  const confidence: ColumnMapping["confidence"] = {};
  const monthly: CanonicalKey[] = [];
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (columns[c.key] !== undefined || usedCols.has(c.col)) continue;
    columns[c.key] = c.col;
    confidence[c.key] = c.score;
    usedCols.add(c.col);
    if (c.monthly) monthly.push(c.key);
  }

  return { columns, monthly, headerRow: hr, confidence };
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

/**
 * Parse the date formats rent rolls actually carry: ISO, US m/d/y, d-mmm-yy,
 * "Jan-27", "January 2027", and Excel's 1900-based serial numbers.
 * Returns ISO yyyy-mm-dd, or null.
 */
export function parseDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : iso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") return excelSerialToIso(raw);

  const s = String(raw).trim();
  if (!s) return null;

  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (isoMatch) {
    return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s);
  if (us) {
    const y = Number(us[3]);
    return iso(y < 100 ? twoDigitYear(y) : y, Number(us[1]), Number(us[2]));
  }

  const dMmmY = /^(\d{1,2})[-\s]([a-z]{3,9})[-\s](\d{2,4})$/i.exec(s);
  if (dMmmY) {
    const m = MONTHS[dMmmY[2].slice(0, 4).toLowerCase()] ?? MONTHS[dMmmY[2].slice(0, 3).toLowerCase()];
    if (m) {
      const y = Number(dMmmY[3]);
      return iso(y < 100 ? twoDigitYear(y) : y, m, Number(dMmmY[1]));
    }
  }

  // "Jan-27", "Jan 2027", "January 2027" — month precision, so end of month.
  const mmmY = /^([a-z]{3,9})[-\s,]+(\d{2,4})$/i.exec(s);
  if (mmmY) {
    const m = MONTHS[mmmY[1].slice(0, 4).toLowerCase()] ?? MONTHS[mmmY[1].slice(0, 3).toLowerCase()];
    if (m) {
      const yr = Number(mmmY[2]);
      const y = yr < 100 ? twoDigitYear(yr) : yr;
      return iso(y, m, endOfMonth(y, m));
    }
  }

  // A bare number in a date column is an Excel serial that survived as text.
  const asNumber = parseNumber(s);
  if (asNumber != null && asNumber > 1000 && asNumber < 100_000) return excelSerialToIso(asNumber);

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

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

// ---------------------------------------------------------------------------
// Grid + mapping → leases
// ---------------------------------------------------------------------------

export interface ParseResult {
  leases: Lease[];
  mapping: ColumnMapping;
  /** the header row's raw text, for the confirmation UI */
  headers: string[];
  /** rows skipped as totals/subtotals, so the count is never a silent loss */
  skippedTotalRows: number;
  skippedBlankRows: number;
}

/**
 * Apply a mapping to the grid. Rows below the header are leases, except
 * total/subtotal lines (summing a file that carries its own totals doubles the
 * building) and fully-blank spacer rows.
 */
export function toLeases(grid: Grid, mapping: ColumnMapping): ParseResult {
  const headers = (grid[mapping.headerRow] ?? []).map((c) => String(c ?? "").trim());
  const leases: Lease[] = [];
  let skippedTotalRows = 0;
  let skippedBlankRows = 0;

  const at = (row: Grid[number], key: CanonicalKey): unknown => {
    const col = mapping.columns[key];
    return col === undefined ? null : (row[col] ?? null);
  };
  const isMonthly = (key: CanonicalKey) => mapping.monthly.includes(key);

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    if (row.every((c) => c == null || String(c).trim() === "")) {
      skippedBlankRows++;
      continue;
    }
    // A totals line usually announces itself in the tenant or suite column;
    // check every mapped text column so a file that puts it elsewhere is still
    // caught.
    if (
      looksLike(at(row, "tenant"), TOTAL_MARKERS) ||
      looksLike(at(row, "suite"), TOTAL_MARKERS) ||
      row.some((c) => typeof c === "string" && looksLike(c, TOTAL_MARKERS))
    ) {
      skippedTotalRows++;
      continue;
    }

    const tenantRaw = String(at(row, "tenant") ?? "").trim();
    const sf = parseNumber(at(row, "sf"));
    const rentRaw = parseNumber(at(row, "baseRentAnnual"));
    const baseRentAnnual =
      rentRaw == null ? null : isMonthly("baseRentAnnual") ? rentRaw * 12 : rentRaw;
    const psfRaw = parseNumber(at(row, "rentPsf"));
    const rentPsfStated = psfRaw == null ? null : isMonthly("rentPsf") ? psfRaw * 12 : psfRaw;

    const leaseExpiry = parseDate(at(row, "leaseExpiry"));
    const vacant =
      looksLike(tenantRaw, VACANT_MARKERS) ||
      (tenantRaw === "" && (baseRentAnnual == null || baseRentAnnual === 0));

    // A row with no tenant, no SF and no rent is padding, not a vacancy.
    if (vacant && sf == null && baseRentAnnual == null && !leaseExpiry) {
      skippedBlankRows++;
      continue;
    }

    leases.push({
      sourceRow: r + 1,
      suite: String(at(row, "suite") ?? "").trim(),
      tenant: vacant ? "" : tenantRaw,
      sf,
      leaseStart: parseDate(at(row, "leaseStart")),
      leaseExpiry: vacant ? null : leaseExpiry,
      baseRentAnnual: vacant ? null : baseRentAnnual,
      rentPsf:
        rentPsfStated ??
        (baseRentAnnual != null && sf != null && sf > 0 && !vacant
          ? baseRentAnnual / sf
          : null),
      rentBasis: parseBasis(at(row, "rentBasis")),
      escalationPct: parsePercent(at(row, "escalationPct")),
      reimbursementType: String(at(row, "reimbursementType") ?? "").trim(),
      renewalOptions: String(at(row, "renewalOptions") ?? "").trim(),
      freeRentMonths: parseNumber(at(row, "freeRentMonths")),
      notes: String(at(row, "notes") ?? "").trim(),
      vacant,
    });
  }

  return { leases, mapping, headers, skippedTotalRows, skippedBlankRows };
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

/** Field metadata for the mapping UI, in display order. */
export const MAPPING_FIELDS = CANONICAL_FIELDS.map((f) => ({
  key: f.key,
  label: f.label,
  required: f.required,
  help: f.help,
  supportsMonthly: (f.monthlyAliases?.length ?? 0) > 0,
}));

export { FIELD_BY_KEY };
