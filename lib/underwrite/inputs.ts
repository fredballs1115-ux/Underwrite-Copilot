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
import {
  buildingSfRow,
  findGoingInCap,
  occupancyPctFromMetrics,
  occupancyRow,
  parseMoney,
  parsePct,
  parseSf,
} from "@/lib/criteria";
import {
  IMPLIED_CAP_CEILING,
  budgetFromText,
  capitalBudgetFromMetrics,
  findPriceMetric,
  inferStrategy,
  isPlanDeal,
  noiFigures,
  type StrategyKind,
  unitCountFromMetrics,
} from "@/lib/deal-strategy";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetClassKey, assetWords } from "@/lib/asset-words";
import { assetClassLabel } from "@/lib/asset-class";
import { allInPct, debtRateNote, type DebtIndex, type RateSeed } from "@/lib/debt-index";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { UnderwriteInputs } from "./engine";

/** Property actuals fed into the model (Feature 1): when present, the rent
 *  roll's occupancy/SF and the T-12's NOI/expense ratio replace the OM
 *  narrative and the class defaults — that's what moves the verdict. */
export interface ActualsForModel {
  rentRoll?: { summary: RentRollSummary; asOf?: string | null } | null;
  t12?: { summary: T12Summary; periodEnd?: string | null } | null;
}

/** What the day's market lends the model (lib/debt-index): the index a
 *  permanent loan is quoted over, read off the rates table by the caller.
 *  Absent or null, the rate keeps its flat default and the old note — the
 *  sample deal, a test, a read that failed. */
export interface MarketForModel {
  debtIndex?: DebtIndex | null;
}

/** The model's hold, months — one constant, because the tenor the rate is
 *  seeded from is the one nearest the hold, and the caller that reads the
 *  index needs the same figure the model runs on. */
export const HOLD_MONTHS = 60;

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
  /** what one of the building is called (lib/asset-words) — the workbook's
   *  per-unit rows read "Price / Key" on a hotel, "Price / Pad" on a park */
  unitNoun?: { one: string; many: string };
  /** display-only occupancy (decimal), null if not extractable */
  occupancyPct: number | null;
  rsf: number;
  /** unit count for per-unit yardsticks — rent-roll actual first, then the
   *  OM's stated figure; null when neither states one (never guessed) */
  units: number | null;
  /** the deal's strategy (stabilized / value-add / conversion …), which
   *  decides what the OM's NOI figures may anchor */
  strategy?: StrategyKind;
  /** on a plan deal, the OM's stabilized pro forma NOI with its page — the
   *  finished project's figure, never year 1's; the workbook's Deal Summary
   *  puts it over total cost as the yield the plan is judged on. Null when
   *  the OM states none, or on a stabilized asset. */
  stabilizedNoi?: { value: number; page?: string } | null;
  /** the rate the model was seeded with off today's curve, with its note,
   *  so the deal page's debt sizer starts where the workbook does; null
   *  where no index was given or the class carries no permanent loan */
  rateSeed?: RateSeed | null;
}

export interface DerivedModel {
  inputs: UnderwriteInputs;
  sources: Partial<Record<keyof UnderwriteInputs, InputSource>>;
  meta: WorkbookMeta;
}

/** Default operating-expense ratio (share of EGI) and vacancy by asset class —
 *  screening placeholders the user overrides, never presented as fact. */
const CLASS_DEFAULTS: Record<
  string,
  {
    expenseRatio: number;
    vacancy: number;
    reservesPsf: number;
    /** gross square feet a typical one of the class's units carries, for a
     *  deal that states a count and no area — the model's per-SF lines
     *  then run on "248 units × 850 SF typical", marked as the assumption
     *  it is, instead of a flat placeholder; absent where the class is
     *  measured by its area (an OM always states an office's SF) or has no
     *  building to measure (a park's pads) */
    sfPerUnit?: number;
    /** the permanent lender's spread over the Treasury tenor nearest the
     *  hold, basis points — the assumption half of a seeded rate, beside
     *  the index half the rates table supplies (lib/debt-index); the
     *  agency-eligible residential classes price tightest, lodging and
     *  parking widest, and land carries no permanent loan to seed */
    spreadBps?: number;
  }
> = {
  multifamily: { expenseRatio: 0.42, vacancy: 0.05, reservesPsf: 0.25, sfPerUnit: 850, spreadBps: 200 },
  office: { expenseRatio: 0.45, vacancy: 0.1, reservesPsf: 0.2, spreadBps: 300 },
  industrial: { expenseRatio: 0.28, vacancy: 0.05, reservesPsf: 0.15, spreadBps: 225 },
  retail: { expenseRatio: 0.32, vacancy: 0.07, reservesPsf: 0.15, spreadBps: 250 },
  // A single tenant on a net lease: the landlord's expense load is a
  // sliver, and the vacancy is the lease's own risk rather than a market's.
  net_lease: { expenseRatio: 0.06, vacancy: 0.02, reservesPsf: 0.05, spreadBps: 200 },
  medical_office: { expenseRatio: 0.42, vacancy: 0.08, reservesPsf: 0.2, spreadBps: 250 },
  mixed_use: { expenseRatio: 0.4, vacancy: 0.07, reservesPsf: 0.2, sfPerUnit: 900, spreadBps: 250 },
  sfr_btr: { expenseRatio: 0.38, vacancy: 0.06, reservesPsf: 0.3, sfPerUnit: 1_600, spreadBps: 225 },
  student_housing: { expenseRatio: 0.45, vacancy: 0.06, reservesPsf: 0.3, sfPerUnit: 350, spreadBps: 225 },
  // Licensed care carries its labor inside the expense line.
  senior_housing: { expenseRatio: 0.68, vacancy: 0.12, reservesPsf: 0.3, sfPerUnit: 600, spreadBps: 275 },
  manufactured_housing: { expenseRatio: 0.35, vacancy: 0.06, reservesPsf: 0.1, spreadBps: 200 },
  self_storage: { expenseRatio: 0.35, vacancy: 0.12, reservesPsf: 0.15, sfPerUnit: 100, spreadBps: 250 },
  // A hotel's "vacancy" is its unsold rooms, and its expense load is the
  // whole operation — housekeeping, the fee stack, the FF&E reserve.
  hospitality_str: { expenseRatio: 0.65, vacancy: 0.32, reservesPsf: 0.5, sfPerUnit: 550, spreadBps: 325 },
  data_center: { expenseRatio: 0.45, vacancy: 0.1, reservesPsf: 0.5, spreadBps: 250 },
  parking: { expenseRatio: 0.4, vacancy: 0.15, reservesPsf: 0.1, sfPerUnit: 350, spreadBps: 325 },
  land_infill: { expenseRatio: 0.4, vacancy: 0.07, reservesPsf: 0.2 },
  auto: { expenseRatio: 0.4, vacancy: 0.07, reservesPsf: 0.2, spreadBps: 250 },
};

/** Read a page ref off a found metric — findMetric returns the structural
 *  MetricLike, but the real objects are ExtractedMetric which carry `page`.
 *  Only a real page is ever used (never fabricated). */
const pageOf = (m: unknown): string | undefined =>
  m && typeof m === "object" && "page" in m ? (m as { page?: string }).page : undefined;

// Every class the site files has its own defaults; a phrase the model wrote
// ("boutique hotel") is filed by its words (lib/asset-words), and only a
// class nothing resolves falls to the generic row.
const normalizeClass = (c: string): keyof typeof CLASS_DEFAULTS => {
  const key = assetClassKey(c);
  return key && CLASS_DEFAULTS[key] ? key : "auto";
};

export function deriveUnderwriteInputs(
  extraction: ExtractionResult | null,
  fallbackName: string,
  actuals?: ActualsForModel,
  market?: MarketForModel,
): DerivedModel {
  const metrics = extraction?.metrics ?? [];
  const assetClass = normalizeClass(extraction?.assetClass ?? "auto");
  const cd = CLASS_DEFAULTS[assetClass];
  // The class as a page says it, for the notes and the workbook's cover —
  // "Self-storage default", never "self_storage default", and "generic"
  // where nothing has read the deck.
  const classWord = assetClassLabel(assetClass) || "generic";
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
  // The shared price reader: the asking / purchase price, else — on a ground-up
  // development only — the land or site cost, which is what is being bought.
  const priceMetric = findPriceMetric(metrics, inferStrategy(extraction).kind);
  const priceIsLand = priceMetric != null && /\b(land|site)\b/i.test(priceMetric.label);
  // The shared going-in cap reader — the same call the deal page, the buy
  // box and the mandate score make — so the workbook never backs a price
  // out of a residual or an at-completion cap the page refused to show.
  const capMetric = findGoingInCap(metrics);
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
    mark(
      "purchasePrice",
      "extracted",
      priceIsLand
        ? "OM land / site cost — the development's acquisition basis; the build sits in the capital plan"
        : "OM asking / purchase price",
      pageOf(priceMetric),
    );
  } else if (goingFig && capPct) {
    // Only an in-place / Year-1 NOI may back a price out of the going-in cap.
    price = goingFig.value / capPct;
    mark("purchasePrice", "derived", "NOI ÷ going-in cap");
  } else {
    price = 10_000_000;
    mark("purchasePrice", "assumption", "Enter the purchase price");
  }

  // The price the OM stated, or null. A placeholder never bounds a budget
  // and never appears in a note as "98% of price" — a percentage of an
  // invented figure is not a fact about the deal.
  const statedPrice = sources.purchasePrice?.provenance === "assumption" ? null : price;

  /** Can this NOI be the going-in figure on THIS price? Positive, and under
   *  the cap ceiling — past it the two cannot describe the same building. */
  const plausibleOnPrice = (n: number) => n > 0 && n / price < IMPLIED_CAP_CEILING;
  const pctOfPrice = (n: number) =>
    statedPrice != null ? ` is ${Math.round((n / statedPrice) * 100)}% of price —` : " —";

  // ── NOI (the anchor) ───────────────────────────────────────────────────
  // T-12 actual NOI outranks the OM narrative when a statement was uploaded —
  // this is the Feature-1 point: the model runs on what the property actually
  // produced, not the deck's story. Then the OM's in-place / Year-1 NOI; then,
  // ONLY on a stabilized deal, its stabilized figure (there it is next year's
  // income); then price × cap; then a labelled default. An OM figure that
  // cannot be a going-in NOI on this price is named, not used.
  const ttmNote = t12End ? ` (TTM to ${t12End})` : "";
  // Why a stated NOI was not the anchor — said truthfully for each case: a
  // zero or negative figure is no income to anchor on; a plan deal's
  // stabilized figure is the finished project's; a figure past the cap
  // ceiling on an operating asset cannot be year-1 income on this price.
  const implausible = (f: { label: string; value: number }) => {
    const amount = `$${Math.round(f.value).toLocaleString("en-US")}`;
    if (!(f.value > 0)) return `The OM's ${f.label} is ${amount} — no income in place to anchor year 1 on`;
    return isPlanDeal(strategy.kind)
      ? `The OM's ${f.label} of ${amount}${pctOfPrice(f.value)} the finished project's stabilized figure on a ${strategy.label.toLowerCase()} deal, not year-1 income, so it does not anchor year 1 here`
      : `The OM's ${f.label} of ${amount}${pctOfPrice(f.value)} above any going-in cap on this price, so it cannot be year-1 income and does not anchor year 1 here`;
  };
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
  // Read against the STATED price only: a "total project cost" beside no
  // ask must not be thrown out as ten times a $10M placeholder. Against a
  // land price the ten-times bound does not apply at all.
  const budgetRead =
    capitalBudgetFromMetrics(metrics, statedPrice, !priceIsLand) ??
    budgetFromText(extraction?.strategy?.capitalBudget, statedPrice, !priceIsLand);
  const capitalBudget = budgetRead?.budget ?? 0;

  // Unit count, same precedence as occupancy: rent-roll actual first, then
  // the OM's stated metric through the shared count reader (a whole number
  // from a row that counts units — never a "Unit mix" or a "Vacant units"
  // row, never a dollar figure). Nothing plausible → null, never a guess.
  const omUnits = unitCountFromMetrics(metrics);
  const units = rr?.unitCount && rr.unitCount > 0 ? rr.unitCount : omUnits;

  // ── RSF ────────────────────────────────────────────────────────────────
  // The rent roll's summed SF outranks the OM's stated building size. The
  // shared size reader: the building, never the land's area or a unit's.
  // With neither stated, a deal that counts its units runs on the count
  // times the class's typical size — "248 units × 850 SF typical", marked
  // an assumption — and only a deal with no count at all falls to the
  // placeholder, because a per-SF figure struck on 100,000 SF for a
  // 40-unit building is a made-up number wearing a decimal point.
  const sfMetric = buildingSfRow(metrics);
  const sfParsed = sfMetric ? parseSf(sfMetric.value) : null;
  const words = assetWords(extraction?.assetClass);
  const unitNoun = words.noun ?? { one: "unit", many: "units" };
  const typicalSf = units != null && units > 0 && cd.sfPerUnit ? Math.round(units * cd.sfPerUnit) : null;
  const rsf = rrSf ?? (sfParsed && sfParsed > 100 ? Math.round(sfParsed) : (typicalSf ?? 100_000));
  if (rrSf != null) {
    mark("rsf", "extracted", `Rent roll total SF${rrAsOf ? ` (as of ${rrAsOf})` : ""}`);
  } else if (sfParsed && sfParsed > 100) {
    mark("rsf", "extracted", "OM building size", pageOf(sfMetric));
  } else if (typicalSf != null) {
    mark(
      "rsf",
      "assumption",
      `${units!.toLocaleString("en-US")} ${units === 1 ? unitNoun.one : unitNoun.many} × ${cd.sfPerUnit} SF typical — enter the rentable SF`,
    );
  } else {
    mark("rsf", "assumption", "Enter rentable SF");
  }

  // ── NOI-anchored income reconstruction ──────────────────────────────────
  // EGR(1−expenseRatio) = NOI ; PGR(1−vacancy) = EGR ; rent = PGR.
  // The ratios come from the actuals when available: the T-12's expense load
  // and the rent roll's vacancy replace the class defaults, so the whole
  // income statement re-bases on the documents.
  // ── Occupancy ────────────────────────────────────────────────────────────
  // Today's occupancy through the shared reader: the cell the workbook
  // labels "In-Place Occupancy" never carries a stabilized or pro forma
  // figure, and an OM that states only the finished project's occupancy
  // states none. It seeds the vacancy line too (below), so the Assumptions
  // tab never prints an 18% in-place occupancy beside a 10% class default.
  const occPct = occupancyPctFromMetrics(metrics);

  const expenseRatio = t12Er ?? cd.expenseRatio;
  const vacancy =
    rrOcc != null ? 1 - rrOcc : occPct != null ? Math.min(0.99, Math.max(0, 1 - occPct / 100)) : cd.vacancy;
  const egr = noi / (1 - expenseRatio);
  const pgr = egr / (1 - vacancy);
  const inPlaceRentAnnual = pgr;
  const operatingExpenses = egr - noi; // = expenseRatio × EGR

  // ── The rate ──────────────────────────────────────────────────────────
  // The index is a fact and the spread is a judgment (lib/debt-index): with
  // the day's index given, the rate is the Treasury tenor nearest the hold
  // plus the class's screening spread, and the note names both halves with
  // the index's date. Land carries no permanent loan, so nothing is seeded
  // on it; with no index at all — the sample deal, a read that failed — the
  // flat default stays and the note says only that it is the analyst's to
  // enter, never that the market was consulted.
  const debtIndex = market?.debtIndex ?? null;
  const spreadBps = cd.spreadBps ?? null;
  const rateSeed: RateSeed | null =
    debtIndex && spreadBps !== null && words.operating
      ? {
          pct: allInPct(debtIndex, spreadBps),
          note: debtRateNote(debtIndex, spreadBps, `${classWord.toLowerCase()} spread`),
        }
      : null;

  const inputs: UnderwriteInputs = {
    purchasePrice: price,
    holdMonths: HOLD_MONTHS,
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
    allInRatePct: rateSeed ? rateSeed.pct / 100 : 0.06,
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
  } else if (occPct != null) {
    mark(
      "vacancyPct",
      "extracted",
      `OM in-place occupancy ${occPct}% — the vacancy is what it leaves`,
      (occupancyRow(metrics) as { page?: string } | null)?.page,
    );
  } else {
    mark("vacancyPct", "assumption", `${classWord} default (${Math.round(cd.vacancy * 100)}%)`);
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
        note: `Total opex to tie NOI (${Math.round(cd.expenseRatio * 100)}% of EGI ${classWord} default) — break out from a T-12`,
      };
  mark("mgmtFeePct", "assumption", "Folded into operating expenses — split out if you track it");
  mark("reservesPsf", "assumption", `${classWord} default $${cd.reservesPsf.toFixed(2)}/SF/yr`);
  if (budgetRead) {
    mark(
      "capitalImprovementsYr1",
      "extracted",
      // sourceText() already prefixes "OM p. N —", so the note names the line.
      `${budgetRead.label}${
        budgetRead.allIn
          ? " less the price"
          : budgetRead.isTotal
            ? " (stated all-in; the OM gives no price to take out of it)"
            : ""
      } — spent in year 1 in this annual model; the OM's own timeline may run longer`,
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
  mark(
    "allInRatePct",
    "assumption",
    rateSeed
      ? rateSeed.note
      : debtIndex && !words.operating
        ? "Land carries no permanent loan to seed a rate from — enter the land loan's rate"
        : "Enter your all-in rate (index + spread)",
  );
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
      // The workbook's cover prints this: the label, never a key or "auto".
      assetClass: assetClassLabel(extraction?.assetClass) || "—",
      unitNoun: assetWords(extraction?.assetClass).noun ?? { one: "unit", many: "units" },
      // Rent-roll actual occupancy outranks the OM's stated figure.
      occupancyPct: rrOcc ?? (occPct != null ? occPct / 100 : null),
      rsf,
      units,
      strategy: strategy.kind,
      stabilizedNoi:
        isPlanDeal(strategy.kind) && stabilizedFig && stabilizedFig.value > 0
          ? { value: stabilizedFig.value, page: stabilizedFig.page }
          : null,
      rateSeed,
    },
  };
}
