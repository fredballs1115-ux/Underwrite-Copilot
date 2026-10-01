/**
 * The valuation forms — "Enter one by hand" and "Fill in or correct the
 * assumptions" — read the same way: the text each field is prefilled with,
 * what a typed figure reads as, and which fields a correction changed.
 *
 * Three rules:
 *   - A BLANK IS NULL, never zero: "not stated" stays out of the bridge.
 *   - A FIGURE IS READ AS TYPED through lib/money's `readFigure` ("$65.8M",
 *     "1.2mm", "6.5%"), and one it cannot read — or a hold that is not whole
 *     years, which the `hold_years` column cannot store — is REFUSED with a
 *     sentence. Dropped to null, it vanished from the table with no word.
 *   - AN EDITED FIELD IS THE USER'S. A correction to an extracted figure
 *     loses that figure's page citation and its "der" mark — they described
 *     the document's number, not this one — and is marked edited instead.
 *     A field is edited only where what comes back reads differently from
 *     what it was prefilled with, so an untouched field keeps its citation.
 *
 * Pure: no I/O.
 */
import { readFigure } from "@/lib/money";
import { FIELD_LABELS, VALUATION_FIELDS, type ValuationFacts, type ValuationField } from "./types";

export type ValuationFieldKind = "usd" | "pct" | "years";

/** How each field is typed. Percents are entered as whole numbers and stored
 *  as decimals, the engine's convention everywhere else. */
export const FIELD_KIND: Record<ValuationField, ValuationFieldKind> = {
  headlineValue: "usd",
  year1Noi: "usd",
  goingInCap: "pct",
  exitCap: "pct",
  holdYears: "years",
  rentGrowth: "pct",
  vacancyAssumption: "pct",
  capexDeduction: "usd",
  discountRate: "pct",
};

/** Each percent's bounds, in percent: a cap or a discount rate above zero;
 *  growth either way; vacancy under the whole building. */
const PCT_BOUNDS: Partial<Record<ValuationField, { min: number; max: number; openMin: boolean }>> = {
  goingInCap: { min: 0, max: 50, openMin: true },
  exitCap: { min: 0, max: 50, openMin: true },
  discountRate: { min: 0, max: 50, openMin: true },
  rentGrowth: { min: -50, max: 50, openMin: false },
  vacancyAssumption: { min: 0, max: 99, openMin: false },
};

/** The text a field is prefilled with: a percent to three places without
 *  trailing zeros, a dollar figure and a hold as they are stored. */
export function fieldText(field: ValuationField, value: number | null): string {
  if (value == null) return "";
  return FIELD_KIND[field] === "pct" ? (value * 100).toFixed(3).replace(/\.?0+$/, "") : String(value);
}

export type FieldRefusal = "unreadable" | "range" | "whole_years";

export type FieldRead = { ok: true; value: number } | { ok: false; refusal: FieldRefusal };

/** Read one typed field into stored units; null for a blank. */
export function readField(field: ValuationField, raw: string | null | undefined): FieldRead | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const n = readFigure(text);
  if (n == null) return { ok: false, refusal: "unreadable" };
  switch (FIELD_KIND[field]) {
    case "years":
      if (!Number.isInteger(n)) return { ok: false, refusal: "whole_years" };
      return n >= 1 && n <= 50 ? { ok: true, value: n } : { ok: false, refusal: "range" };
    case "pct": {
      const b = PCT_BOUNDS[field];
      if (b && ((b.openMin ? n <= b.min : n < b.min) || n > b.max)) return { ok: false, refusal: "range" };
      return { ok: true, value: n / 100 };
    }
    default:
      // A value is a price: above zero. NOI and a deduction can be anything
      // a document states.
      if (field === "headlineValue" && n <= 0) return { ok: false, refusal: "range" };
      return { ok: true, value: n };
  }
}

/** The sentence a refused field is answered with, from its own label and
 *  fixed words — never the typed text, which reaches the page in its URL. */
export function fieldRefusalSentence(field: ValuationField, refusal: FieldRefusal): string {
  const name = FIELD_LABELS[field];
  switch (refusal) {
    case "whole_years":
      return `${name} is whole years — 5 or 6, not 5.5. Nothing was saved.`;
    case "range": {
      if (FIELD_KIND[field] === "years") return `${name} is 1 to 50 years. Nothing was saved.`;
      const b = PCT_BOUNDS[field];
      if (b) return `${name} has to be ${b.openMin ? "above" : "at least"} ${b.min}% and at most ${b.max}%. Nothing was saved.`;
      return `${name} has to be above zero. Nothing was saved.`;
    }
    case "unreadable":
      return FIELD_KIND[field] === "pct"
        ? `${name} was not a figure the form could read — type a percent, like 6.5. Nothing was saved.`
        : `${name} was not a figure the form could read — type it as 65,800,000, $65.8M or 65.8m. Nothing was saved.`;
  }
}

/**
 * A hold read off a document, as the `hold_years` column can keep it: whole
 * years as they are, anything else left blank with a sentence saying so —
 * a 5.5-year hold written to an integer column failed the whole write.
 */
export function extractedHold(value: number | null): { value: number | null; note: string | null } {
  if (value == null || (Number.isInteger(value) && value >= 1 && value <= 50)) return { value, note: null };
  return {
    value: null,
    note: `The document states a ${value}-year hold; the hold is kept in whole years, so it is left blank for you to enter.`,
  };
}

/** One field as a document reader returns it. */
export interface ReadField {
  value: number | null;
  page: string;
  snippet: string;
  derived: boolean;
}

/**
 * What a document read writes: each field's value, a page citation where
 * the reader gave one, the fields it computed rather than read, and a note
 * where a hold was not whole years (`extractedHold`).
 */
export function extractedFields(fields: Record<ValuationField, ReadField>): {
  values: ValuationFacts;
  citations: Record<string, { page: string; snippet: string }>;
  derived: ValuationField[];
  note: string | null;
} {
  const values = Object.fromEntries(VALUATION_FIELDS.map((f) => [f, null])) as unknown as ValuationFacts;
  const citations: Record<string, { page: string; snippet: string }> = {};
  const derived: ValuationField[] = [];
  let note: string | null = null;
  for (const f of VALUATION_FIELDS) {
    let value = fields[f].value;
    if (f === "holdYears") {
      const hold = extractedHold(value);
      value = hold.value;
      note = hold.note;
    }
    values[f] = value;
    if (value != null && fields[f].page) citations[f] = { page: fields[f].page, snippet: fields[f].snippet };
    if (value != null && fields[f].derived) derived.push(f);
  }
  return { values, citations, derived, note };
}

export function isValuationField(field: string | null | undefined): field is ValuationField {
  return (VALUATION_FIELDS as readonly string[]).includes(field ?? "");
}

/** Every field of a new valuation, read; the first refusal stops it. */
export function readValuationForm(
  posted: (field: ValuationField) => string | null,
): { values: ValuationFacts; refused: { field: ValuationField; refusal: FieldRefusal } | null } {
  const values = Object.fromEntries(VALUATION_FIELDS.map((f) => [f, null])) as unknown as ValuationFacts;
  for (const field of VALUATION_FIELDS) {
    const read = readField(field, posted(field));
    if (read == null) continue;
    if (!read.ok) return { values, refused: { field, refusal: read.refusal } };
    values[field] = read.value;
  }
  return { values, refused: null };
}

export interface ValuationEdit {
  /** the new value of each field the user changed — null where cleared */
  changes: Partial<Record<ValuationField, number | null>>;
  /** the fields the user changed, in the form's order */
  edited: ValuationField[];
  refused: { field: ValuationField; refusal: FieldRefusal } | null;
}

/**
 * What a correction changes: each field whose posted text reads differently
 * from the text it was prefilled with. A field not posted at all is left as
 * it is; one emptied is cleared to null (not stated).
 */
export function diffValuationForm(
  stored: ValuationFacts,
  posted: (field: ValuationField) => string | null,
): ValuationEdit {
  const changes: ValuationEdit["changes"] = {};
  const edited: ValuationField[] = [];
  for (const field of VALUATION_FIELDS) {
    const raw = posted(field);
    if (raw == null) continue;
    const prefill = fieldText(field, stored[field]);
    if (raw.trim() === prefill) continue;
    const read = readField(field, raw);
    if (read != null && !read.ok) return { changes: {}, edited: [], refused: { field, refusal: read.refusal } };
    const value = read?.ok ? read.value : null;
    // Retyped to the same figure at the field's precision: untouched.
    const before = readField(field, prefill);
    const was = before?.ok ? before.value : null;
    if (value === was) continue;
    changes[field] = value;
    edited.push(field);
  }
  return { changes, edited, refused: null };
}
