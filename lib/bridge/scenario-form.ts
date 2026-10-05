/**
 * The bridge's "Save a scenario" form: the levers it exposes, the text each
 * is prefilled with, and the reading of what comes back.
 *
 * The form prefills every lever from the deal's current assumptions and the
 * browser posts every field back, changed or not. Prefilled at two decimals
 * and re-saved as typed, an untouched 5.87453% exit cap came back as 5.87%,
 * and the bridge reported "Tightening exit cap from 5.87% to 5.87% added 4
 * bps" — a move the user never made. So a lever counts as CHANGED only where
 * what came back reads differently from what the form was prefilled with,
 * compared at the input's own precision; an untouched lever keeps the base's
 * full-precision value.
 *
 * Every figure is read through lib/money's `readFigure`, so "$12.5M", "500k"
 * and "6.5%" read as typed; a figure it cannot read, or one outside what the
 * lever can be, is REFUSED with a sentence — never dropped silently, which
 * left the assumption untouched and the user believing it had moved.
 *
 * Pure: no I/O.
 */
import { readFigure } from "@/lib/money";
import { setPath } from "./fields";
import type { Assumptions } from "./model";

export type LeverField =
  | "purchasePrice"
  | "exitCapPct"
  | "rentGrowthPct"
  | "vacancyPct"
  | "expenseGrowthPct"
  | "holdMonths"
  | "ltc"
  | "allInRatePct";

export interface ScenarioLever {
  field: LeverField;
  /** the input's label, with its unit */
  label: string;
  kind: "usd" | "pct" | "months";
  /** the lever's bounds, in the units it is typed in (percent for a
   *  percent; inclusive unless `openMin`) */
  min: number;
  max: number;
  openMin?: boolean;
}

/** The levers, in the form's order. Percents are typed as whole numbers
 *  ("6.5") and stored as decimals, the engine's convention. */
export const SCENARIO_LEVERS: readonly ScenarioLever[] = [
  { field: "purchasePrice", label: "Purchase price ($)", kind: "usd", min: 0, max: 1e11, openMin: true },
  { field: "exitCapPct", label: "Exit cap (%)", kind: "pct", min: 0, max: 50, openMin: true },
  { field: "rentGrowthPct", label: "Rent growth (%)", kind: "pct", min: -50, max: 50 },
  { field: "vacancyPct", label: "Vacancy (%)", kind: "pct", min: 0, max: 99 },
  { field: "expenseGrowthPct", label: "Expense growth (%)", kind: "pct", min: -50, max: 50 },
  { field: "holdMonths", label: "Hold (months)", kind: "months", min: 12, max: 360 },
  { field: "ltc", label: "Loan to cost (%)", kind: "pct", min: 0, max: 99 },
  { field: "allInRatePct", label: "All-in rate (%)", kind: "pct", min: 0, max: 50, openMin: true },
];

/** The text the form prefills a lever with: its value at the input's own
 *  precision — whole dollars, a percent to two places, whole months. */
export function leverText(lever: ScenarioLever, value: number): string {
  switch (lever.kind) {
    case "usd":
      return Math.round(value).toLocaleString("en-US");
    case "pct":
      return (value * 100).toFixed(2);
    case "months":
      return String(Math.round(value));
  }
}

export type LeverRefusal = "unreadable" | "range" | "whole_years";

export type LeverRead = { ok: true; value: number } | { ok: false; refusal: LeverRefusal };

/** Read one typed lever into the engine's units; null for a blank, which
 *  leaves the assumption as it is. */
export function readLever(lever: ScenarioLever, raw: string | null | undefined): LeverRead | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const n = readFigure(text);
  if (n == null) return { ok: false, refusal: "unreadable" };
  const below = lever.openMin ? n <= lever.min : n < lever.min;
  if (below || n > lever.max) return { ok: false, refusal: "range" };
  if (lever.kind === "months") {
    // The model runs whole years: a hold that is not one would be rounded
    // to a year the bridge never names.
    if (!Number.isInteger(n) || n % 12 !== 0) return { ok: false, refusal: "whole_years" };
    return { ok: true, value: n };
  }
  return { ok: true, value: lever.kind === "pct" ? n / 100 : n };
}

/** The sentence a refused lever is answered with. Built from the lever's
 *  own label and fixed words only — never the typed text, which arrives on
 *  the page through its URL. */
export function leverRefusalSentence(lever: ScenarioLever, refusal: LeverRefusal): string {
  const name = lever.label.replace(/\s*\(.*\)$/, "");
  switch (refusal) {
    case "unreadable":
      return lever.kind === "usd"
        ? `${name} was not a figure the form could read — type it as 12,500,000, $12.5M or 12.5m. Nothing was saved.`
        : `${name} was not a figure the form could read — type it as a percent, like 6.5. Nothing was saved.`;
    case "range":
      return lever.kind === "usd"
        ? `${name} has to be above zero. Nothing was saved.`
        : `${name} has to be ${lever.openMin ? "above" : "at least"} ${lever.min}% and at most ${lever.max}%. Nothing was saved.`;
    case "whole_years":
      return `The model runs whole years, so the hold is 12, 24, 36… months up to ${lever.max}. Nothing was saved.`;
  }
}

export function leverFor(field: string | null | undefined): ScenarioLever | null {
  return SCENARIO_LEVERS.find((l) => l.field === field) ?? null;
}

export interface ScenarioForm {
  scenario: Assumptions;
  /** the levers the user actually moved */
  changed: LeverField[];
  /** the first lever refused, if any — the scenario is not to be saved */
  refused: { lever: ScenarioLever; refusal: LeverRefusal } | null;
}

/**
 * The scenario the form describes: the base with every lever the user
 * moved, and nothing else. A lever whose posted text reads the same as the
 * text it was prefilled with is untouched, whatever the base's precision.
 */
export function applyScenarioForm(base: Assumptions, posted: (field: LeverField) => string | null): ScenarioForm {
  let scenario = base;
  const changed: LeverField[] = [];
  for (const lever of SCENARIO_LEVERS) {
    const raw = posted(lever.field);
    const prefill = leverText(lever, base[lever.field]);
    // Untouched: the text the form was prefilled with, as it was.
    if (raw != null && raw.trim() === prefill) continue;
    const read = readLever(lever, raw);
    if (read == null) continue;
    if (!read.ok) return { scenario: base, changed: [], refused: { lever, refusal: read.refusal } };
    // Retyped to the same figure at the input's precision ("5.870" for
    // "5.87", "$41,250,000" for "41,250,000"): still untouched.
    const prefilled = readFigure(prefill);
    if (prefilled != null && (lever.kind === "pct" ? prefilled / 100 : prefilled) === read.value) continue;
    scenario = setPath(scenario, lever.field, read.value);
    changed.push(lever.field);
  }
  return { scenario, changed, refused: null };
}
