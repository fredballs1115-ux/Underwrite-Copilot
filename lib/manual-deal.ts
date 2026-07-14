/**
 * Manual deal entry — a deal typed in by hand instead of uploaded as an OM.
 *
 * The trick that keeps this small: typed facts become a normal
 * ExtractionResult, the same shape the OM pipeline produces. Every downstream
 * surface — buy-box fit, mandate score, pipeline columns, the playground, the
 * Excel workbook — already reads that shape, so a manual deal lights all of
 * them up with zero changes there. The metric LABELS below are load-bearing:
 * they must keep matching METRIC_FIND (lib/criteria.ts) and the matchers in
 * lib/underwrite/inputs.ts — the test file pins that contract.
 *
 * PURE and universal (no server imports): shared by the server action, the
 * pipeline's manual branch, and tests.
 */

import { parseMoney, parsePct } from "@/lib/criteria";
import type {
  ExtractionResult,
  ExtractedMetric,
  FirstSignal,
  BrokerCompsResult,
} from "@/lib/anthropic/types";

/** Everything the manual form can say about a property. Percents are in
 *  percent points (5.75 = 5.75%), money in dollars. */
export interface ManualDealFacts {
  name: string;
  assetClass: string;
  /** submarket / metro for display + geography checks, e.g. "Woodbridge, VA" */
  market: string;
  /** street address label (the structured pick is stored on the deal row) */
  address: string;
  price: number | null;
  capPct: number | null;
  noiAnnual: number | null;
  units: number | null;
  sf: number | null;
  occupancyPct: number | null;
  yearBuilt: number | null;
  /** average in-place rent per unit per month */
  avgRentMo: number | null;
  /** free-text context — condition, tenancy, the story (≤ NOTES_MAX chars) */
  notes: string;
}

/** How much "anything else" the buyer can type. Roomy on purpose — the
 *  challenger and market check read every word, and a page of context is
 *  ~1k tokens, trivial next to the analysis itself. */
export const NOTES_MAX = 4_000;

/** "1,250,000" / "$1.25m" / "950k" → dollars; null when unparseable. */
export function moneyFrom(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = parseMoney(s);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** "5.75" / "5.75%" / "0.0575" → percent points (5.75). A bare number below
 *  1 is read as a decimal share — nobody means a 0.58% cap or 0.94% occupancy. */
export function pctFrom(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const viaPct = parsePct(s);
  const n = viaPct ?? Number(s.replace(/[%\s,]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return viaPct == null && n < 1 ? n * 100 : n;
}

/** "8" / "8 units" → integer count; null when unparseable. */
export function countFrom(raw: string): number | null {
  const m = raw.replace(/,/g, "").match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Read the manual-entry fields out of the create/edit form. */
export function factsFromForm(form: {
  get(name: string): unknown;
}): ManualDealFacts {
  const s = (name: string, cap = 160) =>
    String(form.get(name) ?? "")
      .trim()
      .slice(0, cap);
  return {
    name: s("name", 120),
    assetClass: s("assetClass", 40) || "multifamily",
    market: s("market"),
    address: s("addressText"),
    price: moneyFrom(s("price", 40)),
    capPct: pctFrom(s("cap", 40)),
    noiAnnual: moneyFrom(s("noi", 40)),
    units: countFrom(s("units", 40)),
    sf: moneyFrom(s("sf", 40)),
    occupancyPct: pctFrom(s("occupancy", 40)),
    yearBuilt: countFrom(s("yearBuilt", 40)),
    avgRentMo: moneyFrom(s("avgRent", 40)),
    notes: s("notes", NOTES_MAX),
  };
}

/**
 * "Enough information" gate: a name, plus a price the screen can anchor on —
 * given directly, or derivable as NOI ÷ cap. Returns the blocking problem as
 * user-facing copy, or null when the facts are screenable.
 */
export function manualFactsProblem(facts: ManualDealFacts): string | null {
  if (!facts.name) return "Give the deal a name.";
  if (facts.price == null && (facts.noiAnnual == null || facts.capPct == null)) {
    return "Give at least the asking price — or the annual NOI plus a cap rate, so the price can be derived.";
  }
  return null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number, d = 2) => `${n.toFixed(d).replace(/\.?0+$/, "") || "0"}%`;

/**
 * The typed facts as a normal ExtractionResult. Derivable figures (price from
 * NOI ÷ cap, cap from NOI ÷ price, per-unit / per-SF bases) are filled in —
 * they're exact arithmetic on the buyer's own numbers, so downstream surfaces
 * see a complete fact set. Nothing is flagged (flagged = "verify against the
 * OM"; here the buyer IS the source) and no metric ever carries a page.
 */
export function buildManualExtraction(facts: ManualDealFacts): ExtractionResult {
  // Fill the price/cap/NOI triangle from whichever two sides were given.
  let price = facts.price;
  let capPct = facts.capPct;
  let noi = facts.noiAnnual;
  if (price == null && noi != null && capPct != null) price = noi / (capPct / 100);
  if (capPct == null && noi != null && price != null && price > 0)
    capPct = (noi / price) * 100;
  if (noi == null && price != null && capPct != null) noi = price * (capPct / 100);

  const metrics: ExtractedMetric[] = [];
  const add = (
    label: string,
    value: string,
    basis: ExtractedMetric["basis"] = "na",
  ) => metrics.push({ label, value, flagged: false, page: "", basis });

  if (price != null) add("Asking price", money(price));
  if (capPct != null) add("Going-in cap rate", pct(capPct), "in_place");
  if (noi != null) add("Net operating income (annual)", money(noi), "in_place");
  if (facts.units != null)
    add("Units", `${facts.units} ${facts.units === 1 ? "unit" : "units"}`);
  if (price != null && facts.units != null && facts.units > 0)
    add("Price per unit", `${money(price / facts.units)}/unit`);
  if (facts.sf != null) add("Building size", `${Math.round(facts.sf).toLocaleString("en-US")} SF`);
  if (price != null && facts.sf != null && facts.sf > 0)
    add("Price per SF", `${money(price / facts.sf)}/SF`);
  if (facts.avgRentMo != null)
    add("Average in-place rent", `${money(facts.avgRentMo)}/unit/mo`, "in_place");
  if (facts.occupancyPct != null)
    add("Occupancy", pct(Math.min(100, facts.occupancyPct), 1), "in_place");
  if (facts.yearBuilt != null) add("Year built", String(facts.yearBuilt));

  return {
    dealName: facts.name,
    assetClass: facts.assetClass,
    market: facts.market,
    address: facts.address,
    totalPages: 0,
    // Notes travel as their own field, never a metric — a paragraph in a
    // KPI card renders badly, and keeping prose out of the metrics array
    // keeps the label matchers' surface purely figures.
    ...(facts.notes ? { buyerNotes: facts.notes } : {}),
    metrics,
  };
}

/** Parse a manual extraction back into form-editable facts — the edit panel
 *  round-trips through this, so labels here mirror buildManualExtraction. */
export function factsFromExtraction(
  extraction: ExtractionResult,
  fallbackName: string,
): ManualDealFacts {
  const find = (re: RegExp) =>
    extraction.metrics.find((m) => re.test(m.label))?.value ?? "";
  return {
    name: extraction.dealName || fallbackName,
    assetClass: extraction.assetClass || "multifamily",
    market: extraction.market ?? "",
    address: extraction.address ?? "",
    price: moneyFrom(find(/^asking price$/i)),
    capPct: pctFrom(find(/^going-in cap rate$/i)),
    noiAnnual: moneyFrom(find(/^net operating income/i)),
    units: countFrom(find(/^units$/i)),
    sf: moneyFrom(find(/^building size$/i)),
    occupancyPct: pctFrom(find(/^occupancy$/i)),
    yearBuilt: countFrom(find(/^year built$/i)),
    avgRentMo: moneyFrom(find(/^average in-place rent$/i)),
    // The dedicated field; the metric fallback reads deals created in the
    // brief window when notes shipped as a "Context from the buyer" metric.
    notes: extraction.buyerNotes ?? find(/^context from the buyer$/i),
  };
}

/**
 * The instant headline for a manual deal — deterministic, no model call.
 * (An OM deal's first signal is a fast Claude read; here the facts came
 * straight from the buyer, so the "signal" is just those facts formatted.)
 */
export function firstSignalFromExtraction(
  extraction: ExtractionResult,
): FirstSignal {
  const find = (re: RegExp) =>
    extraction.metrics.find((m) => re.test(m.label))?.value ?? "";
  const units = find(/^units$/i);
  const sf = find(/^building size$/i);
  return {
    dealName: extraction.dealName,
    assetClass: extraction.assetClass,
    market: extraction.market ?? "",
    askPrice: find(/^asking price$/i),
    size: units || sf,
    goingInCap: find(/^going-in cap rate$/i),
    perUnit: find(/^price per unit$/i) || find(/^price per sf$/i),
    take: "Entered by hand — no OM behind these figures. The screen runs on your numbers; verify rents and expenses against real documents before trusting the verdict.",
  };
}

/**
 * The plain-text "document" the analysis steps read for a manual deal — the
 * fact sheet stands in for the OM. The preamble reframes every step: figures
 * are the buyer's own unverified inputs, missing figures become questions for
 * the listing broker, and page citations are off the table.
 */
export function manualFactSheet(
  extraction: ExtractionResult,
  fallbackName: string,
): string {
  const lines = extraction.metrics.map((m) => `- ${m.label}: ${m.value}`);
  return [
    "BUYER-ENTERED DEAL FACT SHEET (no offering memorandum)",
    "",
    "The buyer typed these facts in by hand — from a listing, a broker call, or",
    "their own notes. There is no OM behind this deal, so:",
    "- Treat every figure as the buyer's unverified input, not a broker claim.",
    "  Where you would challenge an OM's story, challenge the buyer's numbers",
    "  the same way — plausibility against the market, internal consistency,",
    "  and what's conspicuously missing.",
    "- This document has no pages. Never cite a page number; leave any page",
    "  field empty.",
    "- Where a critical figure is missing below, the right question to put to",
    '  "the broker" is the one the buyer should ask the listing broker or',
    "  seller to obtain it.",
    "",
    `Deal: ${extraction.dealName || fallbackName}`,
    `Asset class: ${extraction.assetClass || "unknown"}`,
    `Market: ${extraction.market || "not stated"}`,
    `Address: ${extraction.address || "not stated"}`,
    "",
    "FACTS AS ENTERED",
    ...(lines.length ? lines : ["- (none beyond the header above)"]),
    ...(extraction.buyerNotes
      ? ["", "CONTEXT FROM THE BUYER (verbatim)", extraction.buyerNotes]
      : []),
  ].join("\n");
}

/** Stored in place of the comps step for a manual deal — there is no OM comp
 *  set to scrutinize, and the UI's own-comps / public-web tools take over. */
export function manualCompsStub(): BrokerCompsResult {
  return {
    saleComps: [],
    leaseComps: [],
    redFlags: [],
    summary:
      "This deal was entered by hand, so there's no broker comp set to scrutinize. Add comps you've gathered, or run the public-web comp search below.",
  };
}
