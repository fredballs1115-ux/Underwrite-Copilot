/**
 * Shared shapes for the BOV Reconciler (Phase 2).
 *
 * A valuation is one opinion of value expressed as an assumption set. EVERY
 * numeric field is nullable and null means "not stated" — never zero, never a
 * guess. That rule is what makes the reconciler honest: a gap the data can't
 * explain is reported as unexplained rather than papered over.
 */

export type ValuationSourceType = "broker" | "internal" | "seller";

/** The fields a BOV states, and the reconciler compares. */
export interface ValuationFacts {
  headlineValue: number | null;
  year1Noi: number | null;
  /** decimals (0.065 = 6.5%), same convention as the underwriting engine */
  goingInCap: number | null;
  exitCap: number | null;
  holdYears: number | null;
  rentGrowth: number | null;
  vacancyAssumption: number | null;
  /** TI/LC, deferred maintenance, credits — deducted below the line */
  capexDeduction: number | null;
  discountRate: number | null;
}

export const VALUATION_FIELDS = [
  "headlineValue",
  "year1Noi",
  "goingInCap",
  "exitCap",
  "holdYears",
  "rentGrowth",
  "vacancyAssumption",
  "capexDeduction",
  "discountRate",
] as const;

export type ValuationField = (typeof VALUATION_FIELDS)[number];

export const FIELD_LABELS: Record<ValuationField, string> = {
  headlineValue: "Headline value",
  year1Noi: "Year-1 NOI",
  goingInCap: "Going-in cap",
  exitCap: "Exit cap",
  holdYears: "Hold period",
  rentGrowth: "Rent growth",
  vacancyAssumption: "Vacancy",
  capexDeduction: "Capex / TI-LC deduction",
  discountRate: "Discount rate",
};

/** Where a single extracted field came from. */
export interface FieldCitation {
  /** page reference as the extractor stated it, e.g. "p. 12" */
  page: string;
  /** short verbatim quote for the source chip's hover */
  snippet: string;
}

export interface Valuation extends ValuationFacts {
  id: string;
  dealId: string;
  sourceLabel: string;
  sourceType: ValuationSourceType;
  sourceDocumentId: string | null;
  extracted: boolean;
  citations: Partial<Record<ValuationField, FieldCitation>>;
  /** fields the extractor COMPUTED rather than read off the page */
  derivedFields: ValuationField[];
  note: string | null;
  createdAt: string;
}

/** Postgres `numeric` can arrive as a JSON number or a string depending on the
 *  driver — both are real values; anything else is "not stated". */
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Parse a `valuations` row into the typed shape, defensively — a column added
 *  later reads null rather than throwing. */
export function parseValuationRow(row: Record<string, unknown>): Valuation {
  const citationsRaw = (row.citations ?? {}) as Record<string, unknown>;
  const citations: Partial<Record<ValuationField, FieldCitation>> = {};
  for (const f of VALUATION_FIELDS) {
    const c = citationsRaw[f];
    if (c && typeof c === "object") {
      const { page, snippet } = c as { page?: unknown; snippet?: unknown };
      if (typeof page === "string" && page.trim()) {
        citations[f] = { page: page.trim(), snippet: typeof snippet === "string" ? snippet : "" };
      }
    }
  }
  const derivedRaw = Array.isArray(row.derived_fields) ? row.derived_fields : [];
  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    sourceLabel: String(row.source_label ?? "Valuation"),
    sourceType: (["broker", "internal", "seller"] as const).includes(
      row.source_type as ValuationSourceType,
    )
      ? (row.source_type as ValuationSourceType)
      : "broker",
    sourceDocumentId: row.source_document_id ? String(row.source_document_id) : null,
    extracted: row.extracted === true,
    citations,
    derivedFields: derivedRaw.filter((f): f is ValuationField =>
      (VALUATION_FIELDS as readonly string[]).includes(String(f)),
    ),
    note: typeof row.note === "string" && row.note.trim() ? row.note : null,
    createdAt: String(row.created_at ?? ""),
    headlineValue: num(row.headline_value),
    year1Noi: num(row.year1_noi),
    goingInCap: num(row.going_in_cap),
    exitCap: num(row.exit_cap),
    holdYears: num(row.hold_years),
    rentGrowth: num(row.rent_growth),
    vacancyAssumption: num(row.vacancy_assumption),
    capexDeduction: num(row.capex_deduction),
    discountRate: num(row.discount_rate),
  };
}
