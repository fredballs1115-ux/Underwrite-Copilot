/**
 * Citation-level provenance (Feature 2). Pure helpers to turn extracted
 * metrics into deal_facts rows, plus the parsing/validation the "never
 * fabricate a source" rule depends on:
 *
 *   ABSOLUTE RULE — a page is shown ONLY when it parses AND falls within the
 *   document's real page count. Anything else is `located: false`, which the
 *   UI renders as "source not located". A citation is never invented.
 */

export type Provenance = "extracted" | "derived" | "assumption";
export type Confidence = "high" | "medium" | "low";

/** A fact as stored / read from deal_facts. */
export interface DealFact {
  id?: string;
  field: string;
  value: string;
  unit: string | null;
  docLabel: string;
  pageNumber: number | null;
  located: boolean;
  locatorSnippet: string | null;
  confidence: Confidence;
  provenance: Provenance;
}

/** The metric shape the extraction produces (page + optional snippet). */
export interface FactMetric {
  label: string;
  value: string;
  flagged?: boolean;
  page?: string;
  basis?: "in_place" | "pro_forma" | "na";
  locatorSnippet?: string;
}

/** "p. 12" / "Page 12" / "pp. 3-4" / "1,024" → first page number; else null. */
export function parsePageNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  // Strip thousands separators so "p. 1,024" reads 1024, not 1.
  const m = raw.replace(/,/g, "").match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The absolute rule as one call: the page a citation names, only where it
 *  parses AND falls inside the document's real length; null otherwise —
 *  including when the length could not be determined, since then no page
 *  can be validated. Every citation of the memorandum goes through it: the
 *  extracted facts, Ask's answers, the broker email and the comps map. */
export function locatedPage(raw: string | undefined | null, pageCount: number | null | undefined): number | null {
  const n = parsePageNumber(raw);
  return n != null && pageCount != null && n >= 1 && n <= pageCount ? n : null;
}

/** Derive a display unit from the value string (pure, best-effort). */
export function deriveUnit(value: string): string {
  const v = value.trim();
  if (/\/\s*(unit|door|key|bed|pad)/i.test(v)) return "$/unit";
  if (/\/\s*(sf|ft|nra|gla)/i.test(v) || /psf/i.test(v)) return "$/SF";
  if (/%/.test(v)) return "%";
  if (/^\(?\$|\bUSD\b/i.test(v) || /\$/.test(v)) return "$";
  if (/\bx\b|[0-9]x\b/i.test(v)) return "x";
  if (/\bsf\b|square f|\bnra\b|\bgla\b/i.test(v)) return "SF";
  if (/\b(units?|doors|keys|beds|pads)\b/i.test(v)) return "units";
  return "";
}

/** Confidence for an extracted metric: flagged figures need verification. */
export function confidenceFor(metric: FactMetric): Confidence {
  if (metric.flagged) return "low";
  if (metric.basis === "pro_forma") return "medium";
  return "high";
}

/**
 * Build deal_facts rows from extracted metrics, validating every page against
 * the document's real length. `pageCount` null (couldn't be determined) means
 * NO page can be validated → every fact is "source not located", never a
 * guessed page.
 */
export function buildDealFacts(
  metrics: FactMetric[],
  pageCount: number | null,
  docLabel = "OM",
): DealFact[] {
  return metrics.map((m) => {
    const page = locatedPage(m.page, pageCount);
    const snippet = m.locatorSnippet?.trim();
    return {
      field: m.label,
      value: m.value,
      unit: deriveUnit(m.value) || null,
      docLabel,
      pageNumber: page,
      located: page != null,
      locatorSnippet: snippet ? snippet.split(/\s+/).slice(0, 12).join(" ") : null,
      confidence: confidenceFor(m),
      provenance: "extracted",
    };
  });
}

/** Row shape for the deal_facts insert (snake_case columns). */
export interface DealFactRow {
  deal_id: string;
  field: string;
  value: string;
  unit: string | null;
  doc_label: string;
  page_number: number | null;
  located: boolean;
  locator_snippet: string | null;
  confidence: Confidence;
  provenance: Provenance;
}

export function toFactRows(dealId: string, facts: DealFact[]): DealFactRow[] {
  return facts.map((f) => ({
    deal_id: dealId,
    field: f.field,
    value: f.value,
    unit: f.unit,
    doc_label: f.docLabel,
    page_number: f.pageNumber,
    located: f.located,
    locator_snippet: f.locatorSnippet,
    confidence: f.confidence,
    provenance: f.provenance,
  }));
}

/**
 * Each extracted row's own citation, in the metrics' order (null where none
 * is stored). Two rows may share a label — a cap rate in place and one pro
 * forma, each on its own page — so a fact is matched by its label AND its
 * value, never by the label alone, which handed the first row's page to
 * both. The stored rows' order cannot break a tie (deal_facts' id is a
 * random uuid), so rows sharing a label and a value share their facts'
 * citation only where those facts agree on it; where they disagree, which
 * page is whose is unknowable, and each reads "source not located" rather
 * than a page that may be the other's. A row whose value is not among the
 * facts takes the fact of its label only where that label is the only row
 * and the only fact of its name.
 */
export function factsForMetrics(
  metrics: ReadonlyArray<Pick<FactMetric, "label" | "value">>,
  facts: readonly DealFact[],
): (DealFact | null)[] {
  const key = (label: string, value: string) => `${label}\u0000${value}`;
  const byPair = new Map<string, DealFact[]>();
  const byLabel = new Map<string, DealFact[]>();
  for (const f of facts) {
    byPair.set(key(f.field, f.value), [...(byPair.get(key(f.field, f.value)) ?? []), f]);
    byLabel.set(f.field, [...(byLabel.get(f.field) ?? []), f]);
  }
  const rowsOfLabel = new Map<string, number>();
  for (const m of metrics) rowsOfLabel.set(m.label, (rowsOfLabel.get(m.label) ?? 0) + 1);
  const cite = (f: DealFact) => `${f.provenance}|${f.located}|${f.pageNumber}|${f.locatorSnippet ?? ""}|${f.docLabel}`;
  return metrics.map((m) => {
    const group = byPair.get(key(m.label, m.value));
    if (group && group.length) {
      if (group.every((f) => cite(f) === cite(group[0]))) return group[0];
      return { ...group[0], located: false, pageNumber: null, locatorSnippet: null };
    }
    const named = byLabel.get(m.label) ?? [];
    return named.length === 1 && rowsOfLabel.get(m.label) === 1 ? named[0] : null;
  });
}

/** Parse a deal_facts DB row back into a DealFact for the UI. */
export function parseFactRow(row: Record<string, unknown>): DealFact {
  return {
    id: row.id as string | undefined,
    field: String(row.field ?? ""),
    value: String(row.value ?? ""),
    unit: (row.unit as string | null) ?? null,
    docLabel: String(row.doc_label ?? "OM"),
    pageNumber: (row.page_number as number | null) ?? null,
    located: !!row.located,
    locatorSnippet: (row.locator_snippet as string | null) ?? null,
    confidence: (row.confidence as Confidence) ?? "medium",
    provenance: (row.provenance as Provenance) ?? "extracted",
  };
}
