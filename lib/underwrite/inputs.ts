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
import {
  IMPLIED_CAP_CEILING,
  capitalBudgetFromMetrics,
  inferStrategy,
  noiFigures,
  type StrategyKind,
} from "@/lib/deal-strategy";
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
  /** unit count for per-unit yardsticks — rent-roll actual first, then the
   *  OM's stated figure; null when neither states one (never guessed) */
  units: number | null;
  /** the deal's strategy (stabilized / value-add / conversion …), which
   *  decides what the OM's NOI figures may anchor */
  strategy?: StrategyKind;
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
  // A truncated roll's SF sum covers only the captured rows — systematically
  // understated, so it never replaces the OM's building size. (Ratios like
  // occupancy remain valid sample estimates and still apply.)
  const rrSf = rr && !rr.truncated && rr.totalSf > 100 ? Math.round(rr.totalSf) : null;

  const mark = (
    key: keyof UnderwriteInputs,
    provenance: Provenance,
    note: string,
    page?: string,
  ) => {
    sources[key] = { provenance, note, page: page && page.trim() ? page : undefined };
  };

  // ── Purchase price ─────────────────────────────────────────────────────
  // Excludes are word-bounded: a bare /per/ would match the "per" inside
  // "oPERating" and silently disqualify "Net operating income" itself.
  const priceMetric = findMetric(
    metrics,
    /asking price|purchase price|guidance|^price\b|offering price/i,
    /unit|\bsf\b|\bper\b|\/|psf/i,
  );
  const capMetric = findMetric(
    metrics,
    /going[- ]?in cap|^cap rate|\bcap\b/i,
    // "expense cap" / "rate cap" / "capex" are not cap RATES.
    /exit|reversion|terminal|expense|capex|capital|rate cap/i,
  );
  // Which NOI is which. The OM may state an in-place figure, a Year-1 figure
  // and a stabilized pro forma; only the first two describe the building as
  // bought. The stabilized figure belongs over total cost on a plan deal
  // (value-add, conversion, development, lease-up) — capitalising it against
  // the acquisition price is how a $21M NOI met a $20M price as a "105% cap".
  const strategy = inferStrategy(extraction);
  const figs = noiFigures(metrics);
  const goingFig = figs.find((f) => f.kind === "in_place") ?? figs.find((f) => f.kind === "year1") ?? null;
  const stabilizedFig = figs.find((f) => f.kind === "stabilized") ?? null;
  const pageOfFig = (f: { page?: string } | null) => f?.page;

  const capDecimal = capMetric ? (parsePct(capMetric.value) ?? null) : null;
  // Plausibility band: a parsed 0% (garbled extraction) or a 35% "cap" (an
  // expense-cap style figure that slipped the excludes) must never anchor
  // pricing or the exit assumption — treat as absent.
  const capPct =
    capDecimal != null && capDecimal / 100 > 0.005 && capDecimal / 100 <= IMPLIED_CAP_CEILING
      ? capDecimal / 100
      : null;
  let price = priceMetric ? parseMoney(priceMetric.value) : null;

  if (price != null) {
    mark("purchasePrice", "extracted", "OM asking / purchase price", pageOf(priceMetric));
  } else if (goingFig && capPct) {
    // Only an in-place / Year-1 NOI may back a price out of the going-in cap.
    price = goingFig.value / capPct;
    mark("purchasePrice", "derived", "NOI ÷ going-in cap");
  } else {
    price = 10_000_000;
    mark("purchasePrice", "assumption", "Enter the purchase price");
  }

  /** Can this NOI be the going-in figure on THIS price? Positive, and under
   *  the cap ceiling — past it the two cannot describe the same building. */
  const plausibleOnPrice = (n: number) => n > 0 && n / price < IMPLIED_CAP_CEILING;
  const pctOfPrice = (n: number) => `${Math.round((n / price) * 100)}% of price`;

  // ── NOI (the anchor) ───────────────────────────────────────────────────
  // T-12 actual NOI outranks the OM narrative when a statement was uploaded —
  // this is the Feature-1 point: the model runs on what the property actually
  // produced, not the deck's story. Then the OM's in-place / Year-1 NOI; then,
  // ONLY on a stabilized deal, its stabilized figure (there it is next year's
  // income); then price × cap; then a labelled default. An OM figure that
  // cannot be a going-in NOI on this price is named, not used.
  const ttmNote = t12End ? ` (TTM to ${t12End})` : "";
  const implausible = (f: { label: string; value: number }) =>
    `The OM's ${f.label} of $${Math.round(f.value).toLocaleString("en-US")} is ${pctOfPrice(f.value)} — the finished project's stabilized figure on a ${strategy.label.toLowerCase()} deal, not year-1 income, so it does not anchor year 1 here`;
  let noi: number;
  if (t12Noi != null) {
    noi = t12Noi;
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the T-12 actual NOI${ttmNote} at ${t12Er != null ? "the T-12 actual" : "an assumed"} expense ratio`,
    );
  } else if (goingFig && plausibleOnPrice(goingFig.value)) {
    noi = goingFig.value;
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the OM's ${goingFig.label} at an assumed expense ratio`,
      pageOfFig(goingFig),
    );
  } else if (
    strategy.kind === "stabilized" &&
    stabilizedFig &&
    plausibleOnPrice(stabilizedFig.value)
  ) {
    noi = stabilizedFig.value;
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the OM's ${stabilizedFig.label} — the only NOI stated; on a stabilized asset it is next year's income`,
      pageOfFig(stabilizedFig),
    );
  } else if (capPct) {
    noi = price * capPct;
    const skipped = goingFig ?? stabilizedFig;
    mark(
      "inPlaceRentAnnual",
      "derived",
      skipped
        ? `${implausible(skipped)}. Year-1 NOI set from price × the stated going-in cap instead`
        : "From price × going-in cap, at an assumed expense ratio",
    );
  } else {
    noi = price * 0.06;
    const skipped = goingFig ?? stabilizedFig;
    mark(
      "inPlaceRentAnnual",
      "assumption",
      skipped
        ? `${implausible(skipped)}. No going-in cap in the OM either — assumed 6% going-in; enter the in-place NOI`
        : "No NOI or cap in the OM — assumed 6% going-in",
    );
  }

  // ── Capital / construction budget ──────────────────────────────────────
  // The plan's cost goes into the model's capital line, so the returns pay
  // for it. Shared reader with the deal page and the challenger's brief
  // (lib/deal-strategy): a "total project cost" includes the price, a budget
  // line does not, a mis-parsed figure never lands, absent is absent.
  const budgetRead = capitalBudgetFromMetrics(metrics, price);
  const capitalBudget = budgetRead?.budget ?? 0;

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
    capitalImprovementsYr1: capitalBudget,
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
        // Derived when the NOI it ties to came from the OM; an assumption when
        // the NOI itself was assumed.
        provenance: sources.inPlaceRentAnnual?.provenance === "derived" ? "derived" : "assumption",
        note: `Total opex to tie NOI (${Math.round(cd.expenseRatio * 100)}% of EGI ${assetClass} default) — break out from a T-12`,
      };
  mark("mgmtFeePct", "assumption", "Folded into operating expenses — split out if you track it");
  mark("reservesPsf", "assumption", `${assetClass} default $${cd.reservesPsf.toFixed(2)}/SF/yr`);
  if (budgetRead) {
    mark(
      "capitalImprovementsYr1",
      "extracted",
      `OM ${budgetRead.label}${budgetRead.allIn ? " less the price" : ""} — spent in year 1 in this annual model; the OM's own timeline may run longer`,
      budgetRead.page,
    );
  } else {
    mark(
      "capitalImprovementsYr1",
      "assumption",
      strategy.kind === "stabilized" || strategy.kind === "unknown"
        ? "No capital plan in the OM — enter one if the PCA finds work"
        : `A ${strategy.label.toLowerCase()} deal with no budget in the OM — enter the construction / renovation cost; yield on cost is meaningless without it`,
    );
  }
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

  // Unit count, same precedence as occupancy: rent-roll actual first, then
  // the OM's stated metric. Bounds guard against a mis-parsed dollar figure
  // landing in a "units" label; nothing plausible → null, never a guess.
  const unitsMetric = findMetric(metrics, /\bunits?\b|\bdoors?\b/i, /\bper\b|\/|price|rent|psf|value/i);
  const omUnits = unitsMetric ? parseMoney(unitsMetric.value) : null;
  const units =
    rr?.unitCount && rr.unitCount > 0
      ? rr.unitCount
      : omUnits != null && omUnits >= 1 && omUnits <= 50_000
        ? Math.round(omUnits)
        : null;

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
      units,
      strategy: strategy.kind,
    },
  };
}
