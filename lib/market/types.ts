/**
 * Shared shapes for the submarket supply & pipeline module (Phase 4).
 *
 * Two rules run through all of it:
 *   - EVERY DISPLAYED METRIC CARRIES ITS SOURCE AND PERIOD. No orphan numbers.
 *   - A web-sourced figure is marked unverified and never blended silently
 *     into an imported series.
 */

export type RentBasis =
  | "nnn_direct"
  | "nnn_overall"
  | "gross_direct"
  | "gross_overall"
  | "mg";

export const RENT_BASIS_LABEL: Record<RentBasis, string> = {
  nnn_direct: "NNN — direct",
  nnn_overall: "NNN — overall",
  gross_direct: "Gross — direct",
  gross_overall: "Gross — overall",
  mg: "Modified gross",
};

export const RENT_BASES = Object.keys(RENT_BASIS_LABEL) as RentBasis[];

export type PipelineStatus = "proposed" | "under_construction" | "delivered";

/** One reporting period of submarket statistics. Every figure is nullable —
 *  an export that omits absorption has no absorption, and zero is a different
 *  claim entirely. */
export interface SubmarketPeriod {
  id: string;
  submarketId: string;
  /** quarter or year end, ISO yyyy-mm-dd */
  period: string;
  inventorySf: number | null;
  vacancyPct: number | null;
  netAbsorptionSf: number | null;
  underConstructionSf: number | null;
  askingRent: number | null;
  rentBasis: RentBasis | null;
  /** filename, "manual", or a URL — never blank */
  source: string;
  unverified: boolean;
  sourceUrl: string | null;
}

export interface PipelineProperty {
  id: string;
  submarketId: string;
  name: string;
  address: string;
  sf: number | null;
  status: PipelineStatus;
  /** ISO yyyy-mm-dd */
  expectedDelivery: string | null;
  subtype: string;
  ownerOccupied: boolean;
  excluded: boolean;
  exclusionReason: string | null;
  staleFlag: boolean;
  staleReason: string | null;
  source: string;
  notes: string;
}

export interface Submarket {
  id: string;
  userId: string;
  name: string;
  metro: string | null;
  assetClass: string;
  exclusionRules: ExclusionRules;
  supplyWarningMonths: number;
  notes: string | null;
  createdAt: string;
}

/**
 * Persistent category-contamination rules.
 *
 * The case this exists for: a county industrial pull that came back with
 * hyperscale data-center campuses in it. Those distort inventory, absorption
 * and the construction pipeline past usefulness, and the user has to be able
 * to exclude them ONCE and have it stick across every future import.
 */
export interface ExclusionRules {
  /** subtypes to exclude, matched case-insensitively */
  subtypes: string[];
  /** free-text patterns matched against name and address */
  namePatterns: string[];
  /** exclude anything at or below / at or above these sizes */
  minSf: number | null;
  maxSf: number | null;
  excludeOwnerOccupied: boolean;
}

export const EMPTY_RULES: ExclusionRules = {
  subtypes: [],
  namePatterns: [],
  minSf: null,
  maxSf: null,
  excludeOwnerOccupied: false,
};

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

export function parseExclusionRules(raw: unknown): ExclusionRules {
  if (!raw || typeof raw !== "object") return { ...EMPTY_RULES };
  const r = raw as Record<string, unknown>;
  return {
    subtypes: strArray(r.subtypes),
    namePatterns: strArray(r.namePatterns),
    minSf: num(r.minSf),
    maxSf: num(r.maxSf),
    excludeOwnerOccupied: r.excludeOwnerOccupied === true,
  };
}

export function parseSubmarketRow(row: Record<string, unknown>): Submarket {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: str(row.name, "Submarket"),
    metro: str(row.metro) || null,
    assetClass: str(row.asset_class, "industrial"),
    exclusionRules: parseExclusionRules(row.exclusion_rules),
    supplyWarningMonths: num(row.supply_warning_months) ?? 24,
    notes: str(row.notes) || null,
    createdAt: String(row.created_at ?? ""),
  };
}

const isBasis = (v: unknown): v is RentBasis =>
  typeof v === "string" && (RENT_BASES as string[]).includes(v);

export function parsePeriodRow(row: Record<string, unknown>): SubmarketPeriod {
  return {
    id: String(row.id),
    submarketId: String(row.submarket_id),
    period: String(row.period ?? "").slice(0, 10),
    inventorySf: num(row.inventory_sf),
    vacancyPct: num(row.vacancy_pct),
    netAbsorptionSf: num(row.net_absorption_sf),
    underConstructionSf: num(row.under_construction_sf),
    askingRent: num(row.asking_rent),
    rentBasis: isBasis(row.rent_basis) ? row.rent_basis : null,
    source: str(row.source, "unstated"),
    unverified: row.unverified === true,
    sourceUrl: str(row.source_url) || null,
  };
}

const isStatus = (v: unknown): v is PipelineStatus =>
  v === "proposed" || v === "under_construction" || v === "delivered";

export function parsePipelineRow(row: Record<string, unknown>): PipelineProperty {
  return {
    id: String(row.id),
    submarketId: String(row.submarket_id),
    name: str(row.name),
    address: str(row.address),
    sf: num(row.sf),
    status: isStatus(row.status) ? row.status : "proposed",
    expectedDelivery: row.expected_delivery ? String(row.expected_delivery).slice(0, 10) : null,
    subtype: str(row.subtype),
    ownerOccupied: row.owner_occupied === true,
    excluded: row.excluded === true,
    exclusionReason: str(row.exclusion_reason) || null,
    staleFlag: row.stale_flag === true,
    staleReason: str(row.stale_reason) || null,
    source: str(row.source, "unstated"),
    notes: str(row.notes),
  };
}

/** A warning the analyst dismissed, with the required reason. */
export interface Dismissal {
  code: string;
  reason: string;
  by: string;
  at: string;
}

export function parseDismissals(raw: unknown): Dismissal[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d) => {
    if (!d || typeof d !== "object") return [];
    const o = d as Record<string, unknown>;
    const code = str(o.code);
    const reason = str(o.reason);
    if (!code || !reason) return [];
    return [{ code, reason, by: str(o.by), at: str(o.at) }];
  });
}
