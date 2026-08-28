/**
 * CSV / XLSX import for submarket data.
 *
 * There is no CoStar API anyone can afford, so the design routes around it:
 * the user imports their OWN market export into their OWN account. That is
 * also the licensing position — see the note in the migration and the UI copy.
 *
 * Same fuzzy-mapping pattern as the rent roll (Phase 3), and the same header
 * scorer, against a market vocabulary instead of a lease one.
 *
 * Pure except for readGrid, which is async only because exceljs is.
 */
import {
  aliasScore,
  normalizeHeader,
  parseDate,
  parseNumber,
  parsePercent,
  readGrid,
  type Grid,
} from "@/lib/rentroll/parse";
import { isRoundPlaceholder, staleVerdict } from "./exclusions";
import type { PipelineProperty, PipelineStatus, RentBasis, SubmarketPeriod } from "./types";
import { RENT_BASES } from "./types";

export { readGrid };

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

export type PeriodKey =
  | "period"
  | "inventorySf"
  | "vacancyPct"
  | "netAbsorptionSf"
  | "underConstructionSf"
  | "askingRent"
  | "rentBasis";

export type PipelineKey =
  | "name"
  | "address"
  | "sf"
  | "status"
  | "expectedDelivery"
  | "subtype"
  | "ownerOccupied";

interface FieldSpec<K extends string> {
  key: K;
  label: string;
  aliases: string[];
  required?: boolean;
}

export const PERIOD_FIELDS: FieldSpec<PeriodKey>[] = [
  {
    key: "period",
    label: "Period",
    required: true,
    aliases: ["period", "quarter", "qtr", "date", "as of", "period end", "year", "period ending"],
  },
  {
    key: "inventorySf",
    label: "Inventory (SF)",
    aliases: ["inventory", "inventory sf", "existing inventory", "total inventory", "rba", "stock", "market rba"],
  },
  {
    key: "vacancyPct",
    label: "Vacancy",
    aliases: ["vacancy", "vacancy rate", "vacancy pct", "vacant pct", "vacancy %", "direct vacancy"],
  },
  {
    key: "netAbsorptionSf",
    label: "Net absorption (SF)",
    aliases: ["net absorption", "absorption", "net absorption sf", "net abs", "period absorption"],
  },
  {
    key: "underConstructionSf",
    label: "Under construction (SF)",
    aliases: ["under construction", "under construction sf", "uc sf", "construction", "under const", "u c sf"],
  },
  {
    key: "askingRent",
    label: "Asking rent",
    aliases: ["asking rent", "rent", "market asking rent", "asking rate", "market rent", "avg asking rent", "quoted rent"],
  },
  {
    key: "rentBasis",
    label: "Rent basis",
    aliases: ["rent basis", "basis", "rent type", "service type", "rent structure", "lease type"],
  },
];

export const PIPELINE_FIELDS: FieldSpec<PipelineKey>[] = [
  { key: "name", label: "Building name", required: true, aliases: ["name", "property name", "building", "building name", "project", "property", "development"] },
  { key: "address", label: "Address", aliases: ["address", "street address", "location", "site address"] },
  { key: "sf", label: "Size (SF)", required: true, aliases: ["sf", "rba", "size", "square feet", "building sf", "total sf", "gla", "sq ft", "building size"] },
  { key: "status", label: "Status", aliases: ["status", "construction status", "stage", "phase"] },
  { key: "expectedDelivery", label: "Expected delivery", aliases: ["delivery", "expected delivery", "delivery date", "completion", "completion date", "estimated delivery", "eta", "delivered"] },
  { key: "subtype", label: "Subtype", aliases: ["subtype", "type", "property type", "building type", "product type", "use"] },
  { key: "ownerOccupied", label: "Owner occupied", aliases: ["owner occupied", "owner user", "build to suit", "bts", "owner occ", "single tenant owner"] },
];

export interface MarketMapping<K extends string> {
  headerRow: number;
  columns: Partial<Record<K, number>>;
  confidence: Partial<Record<K, number>>;
}

/** Best-guess mapping: highest-scoring unclaimed column per field. */
export function suggestMarketMapping<K extends string>(
  grid: Grid,
  fields: FieldSpec<K>[],
  headerRow?: number,
): MarketMapping<K> {
  const hr = headerRow ?? detectMarketHeaderRow(grid, fields);
  const headers = (grid[hr] ?? []).map((c) => normalizeHeader(c));

  const candidates: { key: K; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    if (!h) return;
    for (const f of fields) {
      for (const alias of f.aliases) {
        const s = aliasScore(h, alias);
        if (s >= 0.3) candidates.push({ key: f.key, col, score: s });
      }
    }
  });
  candidates.sort((a, b) => b.score - a.score);

  const columns: Partial<Record<K, number>> = {};
  const confidence: Partial<Record<K, number>> = {};
  const used = new Set<number>();
  for (const c of candidates) {
    if (columns[c.key] !== undefined || used.has(c.col)) continue;
    columns[c.key] = c.col;
    confidence[c.key] = c.score;
    used.add(c.col);
  }
  return { headerRow: hr, columns, confidence };
}

/** Header detection against a market vocabulary — same scoring shape as the
 *  rent roll's, so a title block above the real header is skipped there too. */
export function detectMarketHeaderRow<K extends string>(
  grid: Grid,
  fields: FieldSpec<K>[],
  limit = 25,
): number {
  let bestRow = 0;
  let bestScore = -1;
  for (let r = 0; r < Math.min(grid.length, limit); r++) {
    const cells = (grid[r] ?? []).filter((c) => c != null && String(c).trim() !== "");
    if (cells.length < 2) continue;
    let mapped = 0;
    for (const cell of cells) {
      const h = normalizeHeader(cell);
      if (!h) continue;
      const hit = fields.some((f) => f.aliases.some((a) => aliasScore(h, a) >= 0.3));
      if (hit) mapped++;
    }
    const score = mapped * 3 + Math.min(cells.length, 12) * 0.1;
    if (mapped >= 2 && score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

const BASIS_PATTERNS: [RegExp, RentBasis][] = [
  [/\bnnn\b.*\bdirect\b|\bdirect\b.*\bnnn\b|triple net direct/i, "nnn_direct"],
  [/\bnnn\b.*overall|overall.*\bnnn\b|triple net overall/i, "nnn_overall"],
  [/gross.*direct|direct.*gross/i, "gross_direct"],
  [/gross.*overall|overall.*gross/i, "gross_overall"],
  [/modified gross|\bmg\b|industrial gross/i, "mg"],
  [/\bnnn\b|triple net/i, "nnn_overall"],
  [/full service|\bfsg\b|\bgross\b/i, "gross_overall"],
];

/** Read a rent basis. Unrecognised text returns null — an unstated basis is a
 *  fact about the data, and guessing one is exactly the contamination trap
 *  this module exists to catch. */
export function parseRentBasis(raw: unknown): RentBasis | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if ((RENT_BASES as string[]).includes(s)) return s as RentBasis;
  for (const [re, basis] of BASIS_PATTERNS) if (re.test(s)) return basis;
  return null;
}

/** "2026 Q1", "Q1 2026", "1Q26" and plain dates all land on a period-end date. */
export function parsePeriodLabel(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Quarter and bare-year labels are checked BEFORE the general date parser:
  // "2026" is a year here, and the date parser would read a bare four-digit
  // number as an Excel serial (which lands in 1905).
  const quarterEnd = (y: number, q: number) =>
    `${y}-${String(q * 3).padStart(2, "0")}-${q === 1 ? "31" : q === 2 ? "30" : q === 3 ? "30" : "31"}`;

  const yq = /^(\d{4})\s*[-/ ]?\s*q\s*([1-4])$/i.exec(s);
  if (yq) return quarterEnd(Number(yq[1]), Number(yq[2]));
  const qy = /^q\s*([1-4])\s*[-/ ]?\s*(\d{2,4})$/i.exec(s);
  if (qy) {
    const y = Number(qy[2]);
    return quarterEnd(y < 100 ? 2000 + y : y, Number(qy[1]));
  }
  const nq = /^([1-4])q\s*[-/ ]?\s*(\d{2,4})$/i.exec(s);
  if (nq) {
    const y = Number(nq[2]);
    return quarterEnd(y < 100 ? 2000 + y : y, Number(nq[1]));
  }
  const yearOnly = /^(\d{4})$/.exec(s);
  if (yearOnly) return `${yearOnly[1]}-12-31`;

  return parseDate(raw);
}

export function parseStatus(raw: unknown): PipelineStatus {
  const s = String(raw ?? "").toLowerCase();
  if (/deliver|complete|built|existing/.test(s)) return "delivered";
  if (/under construction|u\/c|\buc\b|building|started|construction/.test(s)) {
    return "under_construction";
  }
  return "proposed";
}

const truthy = (raw: unknown): boolean =>
  /^(y|yes|true|1|owner)/i.test(String(raw ?? "").trim());

// ---------------------------------------------------------------------------
// Grid → rows
// ---------------------------------------------------------------------------

export type PeriodDraft = Omit<SubmarketPeriod, "id" | "submarketId">;
export type PipelineDraft = Omit<
  PipelineProperty,
  "id" | "submarketId" | "excluded" | "exclusionReason"
>;

export interface ImportResult<T> {
  rows: T[];
  skipped: number;
  mapping: MarketMapping<string>;
  headers: string[];
}

/** Submarket statistics rows. A row with no readable period is skipped and
 *  counted — never dated to today. */
export function toPeriods(
  grid: Grid,
  mapping: MarketMapping<PeriodKey>,
  source: string,
): ImportResult<PeriodDraft> {
  const rows: PeriodDraft[] = [];
  let skipped = 0;
  const at = (row: Grid[number], key: PeriodKey) => {
    const c = mapping.columns[key];
    return c === undefined ? null : (row[c] ?? null);
  };

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const period = parsePeriodLabel(at(row, "period"));
    if (!period) {
      skipped++;
      continue;
    }
    rows.push({
      period,
      inventorySf: parseNumber(at(row, "inventorySf")),
      vacancyPct: parsePercent(at(row, "vacancyPct")),
      netAbsorptionSf: parseNumber(at(row, "netAbsorptionSf")),
      underConstructionSf: parseNumber(at(row, "underConstructionSf")),
      askingRent: parseNumber(at(row, "askingRent")),
      rentBasis: parseRentBasis(at(row, "rentBasis")),
      source,
      unverified: false,
      sourceUrl: null,
    });
  }

  return {
    rows,
    skipped,
    mapping: mapping as MarketMapping<string>,
    headers: (grid[mapping.headerRow] ?? []).map((c) => String(c ?? "").trim()),
  };
}

/** Property-level pipeline rows, with the stale flags computed at import so a
 *  round-number placeholder is visible before anyone builds on it. */
export function toPipeline(
  grid: Grid,
  mapping: MarketMapping<PipelineKey>,
  source: string,
  asOf: string,
): ImportResult<PipelineDraft> {
  const rows: PipelineDraft[] = [];
  let skipped = 0;
  const at = (row: Grid[number], key: PipelineKey) => {
    const c = mapping.columns[key];
    return c === undefined ? null : (row[c] ?? null);
  };

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const name = String(at(row, "name") ?? "").trim();
    const sf = parseNumber(at(row, "sf"));
    if (!name && sf == null) {
      skipped++;
      continue;
    }
    // A totals line in a property export inflates the pipeline exactly the way
    // trap 3 describes.
    if (/^(total|totals|subtotal|grand total)\b/i.test(name)) {
      skipped++;
      continue;
    }

    const status = parseStatus(at(row, "status"));
    const expectedDelivery = parseDate(at(row, "expectedDelivery"));
    const stale = staleVerdict({ sf, status, expectedDelivery }, asOf);

    rows.push({
      name,
      address: String(at(row, "address") ?? "").trim(),
      sf,
      status,
      expectedDelivery,
      subtype: String(at(row, "subtype") ?? "").trim(),
      ownerOccupied: truthy(at(row, "ownerOccupied")),
      staleFlag: stale.stale,
      staleReason: stale.reason,
      source,
      notes: "",
    });
  }

  return {
    rows,
    skipped,
    mapping: mapping as MarketMapping<string>,
    headers: (grid[mapping.headerRow] ?? []).map((c) => String(c ?? "").trim()),
  };
}

export { isRoundPlaceholder };
