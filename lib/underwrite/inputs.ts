/**
 * Derive the institutional workbook's inputs from a deal's existing OM
 * extraction + documented defaults. PURE and LLM-FREE (rule: LLM stays out of
 * the math layer). Every field carries provenance for the Assumptions tab's
 * SOURCE column:
 *   - "extracted"  — read from the OM (a real page ref only when the metric
 *                    actually carried one; never fabricated)
 *   - "derived"    — computed from extracted figures (e.g. NOI = price × cap)
 *   - "assumption" — an Underwrite Copilot default the user edits
 *
 * NOI anchor: whatever else is missing, the model's year-1 NOI is reconstructed
 * to equal the extracted (or derived) NOI, so the workbook's going-in cap ties
 * to the OM. Gross rent is grossed up from that NOI at an assumed expense ratio
 * and vacancy — the split is a labelled assumption, the NOI is real.
 */
import { findMetric, parseMoney, parsePct } from "@/lib/criteria";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { UnderwriteInputs } from "./engine";

/** Property actuals fed into the model (Feature 1): when present, the rent
 *  roll's occupancy/SF and the T-12's NOI/expense ratio replace the OM
 *  narrative and the class defaults — that's what moves the verdict. */
export interface ActualsForModel {
  rentRoll?: { summary: RentRollSummary; asOf?: string | null } | null;
  t12?: { summary: T12Summary; periodEnd?: string | null } | null;
}

export type Provenance = "extracted" | "derived" | "assumption";
export interface InputSource {
  provenance: Provenance;
  /** plain-English note for the SOURCE column / hover */
  note: string;
  /** OM page, ONLY when the extraction metric actually carried one */
  page?: string;
}

export interface WorkbookMeta {
  dealName: string;
  address: string;
  market: string;
  assetClass: string;
  /** display-only occupancy (decimal), null if not extractable */
  occupancyPct: number | null;
  rsf: number;
}

export interface DerivedModel {
  inputs: UnderwriteInputs;
  sources: Partial<Record<keyof UnderwriteInputs, InputSource>>;
  meta: WorkbookMeta;
}

/** Default operating-expense ratio (share of EGI) and vacancy by asset class —
 *  screening placeholders the user overrides, never presented as fact. */
const CLASS_DEFAULTS: Record<string, { expenseRatio: number; vacancy: number; reservesPsf: number }> = {
  multifamily: { expenseRatio: 0.42, vacancy: 0.05, reservesPsf: 0.25 },
  office: { expenseRatio: 0.45, vacancy: 0.1, reservesPsf: 0.2 },
  industrial: { expenseRatio: 0.28, vacancy: 0.05, reservesPsf: 0.15 },
  retail: { expenseRatio: 0.32, vacancy: 0.07, reservesPsf: 0.15 },
  auto: { expenseRatio: 0.4, vacancy: 0.07, reservesPsf: 0.2 },
};

/** Read a page ref off a found metric — findMetric returns the structural
 *  MetricLike, but the real objects are ExtractedMetric which carry `page`.
 *  Only a real page is ever used (never fabricated). */
const pageOf = (m: unknown): string | undefined =>
  m && typeof m === "object" && "page" in m ? (m as { page?: string }).page : undefined;

const normalizeClass = (c: string): keyof typeof CLASS_DEFAULTS =>
  (["multifamily", "office", "industrial", "retail"] as const).includes(c as never)
    ? (c as keyof typeof CLASS_DEFAULTS)
    : "auto";

const SF_INCLUDE = /rentable|\brsf\b|square f|building size|total sf|gross (building|leasable)|\bgla\b|\bnra\b|\bsf\b/i;
const SF_EXCLUDE = /per|\/|psf|land|acre|unit/i;

export function deriveUnderwriteInputs(
  extraction: ExtractionResult | null,
  fallbackName: string,
  actuals?: ActualsForModel,
): DerivedModel {
  const metrics = extraction?.metrics ?? [];
  const assetClass = normalizeClass(extraction?.assetClass ?? "auto");
  const cd = CLASS_DEFAULTS[assetClass];
  const sources: DerivedModel["sources"] = {};

  // ── Property actuals (guarded) ──────────────────────────────────────────
  // Only physically-plausible figures override the OM/defaults; anything
  // degenerate (zero SF, occupancy ≤5%, expense ratio ≥90%, non-positive NOI)
  // falls back rather than poisoning the reconstruction below.
  const rr = actuals?.rentRoll?.summary ?? null;
  const rrAsOf = actuals?.rentRoll?.asOf ?? null;
  const t12 = actuals?.t12?.summary ?? null;
  const t12End = actuals?.t12?.periodEnd ?? null;
  const t12Noi =
    t12?.noi != null && Number.isFinite(t12.noi) && t12.noi > 0 ? t12.noi : null;
  const t12Er =
    t12?.totalOpex != null &&
    t12.egi != null &&
    t12.egi > 0 &&
    t12.totalOpex > 0 &&
    t12.totalOpex / t12.egi < 0.9
      ? t12.totalOpex / t12.egi
      : null;
  const rrOcc =
    rr?.sfWeightedOccupancy != null &&
    rr.sfWeightedOccupancy > 0.05 &&
    rr.sfWeightedOccupancy <= 1
      ? rr.sfWeightedOccupancy
      : null;
  const rrSf = rr && rr.totalSf > 100 ? Math.round(rr.totalSf) : null;

  const mark = (
    key: keyof UnderwriteInputs,
    provenance: Provenance,
    note: string,
    page?: string,
  ) => {
    sources[key] = { provenance, note, page: page && page.trim() ? page : undefined };
  };

  // ── Purchase price ─────────────────────────────────────────────────────
  const priceMetric = findMetric(
    metrics,
    /asking price|purchase price|guidance|^price\b|offering price/i,
    /unit|\bsf\b|per|\/|psf/i,
  );
  const capMetric = findMetric(metrics, /going[- ]?in cap|^cap rate|\bcap\b/i, /exit|reversion|terminal/i);
  const noiMetric = findMetric(metrics, /net operating income|\bnoi\b/i, /per|\/|psf/i);

  const capDecimal = capMetric ? (parsePct(capMetric.value) ?? null) : null;
  const capPct = capDecimal != null ? capDecimal / 100 : null;
  const extractedNoi = noiMetric ? parseMoney(noiMetric.value) : null;
  let price = priceMetric ? parseMoney(priceMetric.value) : null;

  if (price != null) {
    mark("purchasePrice", "extracted", "OM asking / purchase price", pageOf(priceMetric));
  } else if (extractedNoi != null && capPct) {
    price = extractedNoi / capPct;
    mark("purchasePrice", "derived", "NOI ÷ going-in cap");
  } else {
    price = 10_000_000;
    mark("purchasePrice", "assumption", "Enter the purchase price");
  }

  // ── NOI (the anchor) ───────────────────────────────────────────────────
  // T-12 actual NOI outranks the OM narrative when a statement was uploaded —
  // this is the Feature-1 point: the model runs on what the property actually
  // produced, not the deck's story.
  const ttmNote = t12End ? ` (TTM to ${t12End})` : "";
  let noi: number;
  if (t12Noi != null) {
    noi = t12Noi;
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the T-12 actual NOI${ttmNote} at ${t12Er != null ? "the T-12 actual" : "an assumed"} expense ratio`,
    );
  } else if (extractedNoi != null) {
    noi = extractedNoi;
    mark("inPlaceRentAnnual", "derived", "Grossed up from OM NOI at an assumed expense ratio", pageOf(noiMetric));
  } else if (capPct) {
    noi = price * capPct;
    mark("inPlaceRentAnnual", "derived", "From price × going-in cap, at an assumed expense ratio");
  } else {
    noi = price * 0.06;
    mark("inPlaceRentAnnual", "assumption", "No NOI or cap in the OM — assumed 6% going-in");
  }

  // ── RSF ────────────────────────────────────────────────────────────────
  // The rent roll's summed SF outranks the OM's stated building size.
  const sfMetric = findMetric(metrics, SF_INCLUDE, SF_EXCLUDE);
  const sfParsed = sfMetric ? parseMoney(sfMetric.value) : null; // parseMoney reads plain numbers too
  const rsf = rrSf ?? (sfParsed && sfParsed > 100 ? Math.round(sfParsed) : 100_000);
  if (rrSf != null) {
    mark("rsf", "extracted", `Rent roll total SF${rrAsOf ? ` (as of ${rrAsOf})` : ""}`);
  } else {
    mark("rsf", sfParsed && sfParsed > 100 ? "extracted" : "assumption",
      sfParsed && sfParsed > 100 ? "OM building size" : "Enter rentable SF", pageOf(sfMetric));
  }

  // ── NOI-anchored income reconstruction ──────────────────────────────────
  // EGR(1−expenseRatio) = NOI ; PGR(1−vacancy) = EGR ; rent = PGR.
  // The ratios come from the actuals when available: the T-12's expense load
  // and the rent roll's vacancy replace the class defaults, so the whole
  // income statement re-bases on the documents.
  const expenseRatio = t12Er ?? cd.expenseRatio;
  const vacancy = rrOcc != null ? 1 - rrOcc : cd.vacancy;
  const egr = noi / (1 - expenseRatio);
  const pgr = egr / (1 - vacancy);
  const inPlaceRentAnnual = pgr;
  const operatingExpenses = egr - noi; // = expenseRatio × EGR

  // ── Occupancy (display) ──────────────────────────────────────────────────
  const occMetric = findMetric(metrics, /occupancy|occupied|leased/i, /economic|physical vacancy/i);
  const occPct = occMetric ? parsePct(occMetric.value) : null;

  const inputs: UnderwriteInputs = {
    purchasePrice: price,
    holdMonths: 60,
    acqFeePct: 0,
    acqFeeCap: 0,

    transferTaxPct: 0,
    recordationTaxPct: 0,
    generalHoldPct: 0.01,
    buyerLegal: 0,
    lenderLegal: 0,
    thirdPartyReports: 0,
    miscClosing: 0,

    inPlaceRentAnnual,
    expenseRecoveriesAnnual: 0,
    otherRevenueAnnual: 0,
    vacancyPct: vacancy,
    rentGrowthPct: 0.03,

    expenseLines: [{ label: "Operating expenses", annual: operatingExpenses }],
    mgmtFeePct: 0,
    expenseGrowthPct: 0.03,

    rsf,
    reservesPsf: cd.reservesPsf,
    capitalImprovementsYr1: 0,
    tiPsf: 0,
    lcPct: 0,

    amFeePctEquity: 0.005,

    ltc: 0.6,
    allInRatePct: 0.06,
    ioMonths: 0,
    amortMonths: 360,
    financingCostPct: 0.01,

    exitCapPct: capPct ?? 0.06,
    saleCostPct: 0.02,
  };

  // Remaining provenance notes.
  mark("holdMonths", "assumption", "Underwrite Copilot default — 5-year hold");
  if (rrOcc != null) {
    mark(
      "vacancyPct",
      "extracted",
      `Rent roll actual — ${(rrOcc * 100).toFixed(1)}% SF-weighted occupancy${rrAsOf ? ` as of ${rrAsOf}` : ""}`,
    );
  } else {
    mark("vacancyPct", "assumption", `${assetClass} default (${Math.round(cd.vacancy * 100)}%)`);
  }
  mark("rentGrowthPct", "assumption", "Default 3.0%/yr — set your view");
  mark("expenseGrowthPct", "assumption", "Default 3.0%/yr — set your view");
  sources.expenseLines = t12Er != null
    ? {
        provenance: "extracted",
        note: `T-12 actual expense load${ttmNote} — ${Math.round(t12Er * 100)}% of EGI`,
      }
    : {
        provenance: extractedNoi != null ? "derived" : "assumption",
        note: `Total opex to tie NOI (${Math.round(cd.expenseRatio * 100)}% of EGI ${assetClass} default) — break out from a T-12`,
      };
  mark("mgmtFeePct", "assumption", "Folded into operating expenses — split out if you track it");
  mark("reservesPsf", "assumption", `${assetClass} default $${cd.reservesPsf.toFixed(2)}/SF/yr`);
  mark("amFeePctEquity", "assumption", "Default 0.5% of equity/yr");
  mark("ltc", "assumption", "Default 60% loan-to-cost — enter your quote");
  mark("allInRatePct", "assumption", "Enter your all-in rate (index + spread)");
  mark("ioMonths", "assumption", "Default fully amortizing (0 = no IO; 999 = full-term IO)");
  mark("amortMonths", "assumption", "Default 30-year amortization");
  mark("financingCostPct", "assumption", "Default 1.0% of loan");
  mark("generalHoldPct", "assumption", "Placeholder DD/closing hold (1.0%) — enter itemized costs");
  mark("exitCapPct", capPct ? "derived" : "assumption",
    capPct ? "Defaulted to the going-in cap — set your exit view" : "Default 6.0% — set your exit view",
    capPct ? pageOf(capMetric) : undefined);
  mark("saleCostPct", "assumption", "Default 2.0% of sale price");

  return {
    inputs,
    sources,
    meta: {
      dealName: extraction?.dealName || fallbackName || "Deal",
      address: extraction?.address ?? "",
      market: extraction?.market ?? "",
      assetClass,
      // Rent-roll actual occupancy outranks the OM's stated figure.
      occupancyPct: rrOcc ?? (occPct != null ? occPct / 100 : null),
      rsf,
    },
  };
}
