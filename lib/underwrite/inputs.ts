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
import { withArticle } from "@/lib/article";
import { compactUsd } from "@/lib/money";
import {
  entityLoanOf,
  groundRentOf,
  interestOf,
  interestShortLine,
  isGpStake,
  isTenancyInCommon,
  isWholeShare,
  readInterest,
  shareProjectCostOf,
  type EquipmentUse,
} from "@/lib/interest";
import { assumableLine, assumableSentence, readAssumable } from "@/lib/assumable-debt";
import { leaseholdBasisLine, leaseholdExitSentence, leaseholdLenderLine, readLeaseholdExit } from "@/lib/leasehold-exit";
import { affordableShortLine, readAffordable } from "@/lib/affordable";
import { readSingleTenant, singleTenantModelLine, singleTenantShortLine } from "@/lib/single-tenant";
import { hotelModelLine, hotelShortLine, readHotelDeal } from "@/lib/hotel-deal";
import { readSale, saleShortLine } from "@/lib/sale-terms";
import { saleCeilingRead } from "@/lib/sale-ceiling";
import { readRoster, rosterModelLine, rosterShortLine } from "@/lib/tenant-roster";
import { readValueAdd, valueAddModelLine, valueAddShortLine } from "@/lib/value-add";
import { readTaxAbatement, taxAbatementModelLine, taxAbatementShortLine } from "@/lib/tax-abatement";
import {
  notePurchaseFinancing,
  notePurchaseFinancingLine,
  readSellerFinancing,
  sellerFinancingLine,
  sellerFinancingSentence,
} from "@/lib/seller-financing";
import {
  buildingSfRow,
  findGoingInCap,
  occupancyPctFromMetrics,
  occupancyRow,
  parsePct,
  parsePrice,
  parseSf,
  priceRange,
  priceRefusal,
  screenYearOf,
} from "@/lib/criteria";
import {
  IMPLIED_CAP_CEILING,
  budgetFromText,
  buildingPriceOf,
  capitalBudgetFromMetrics,
  askingPriceOf,
  ebitdaFigure,
  findPriceMetric,
  inferStrategy,
  isForwardPurchase,
  isPlanDeal,
  noiFigures,
  renovationProgramBudget,
  type StrategyKind,
  unitCountFromMetrics,
  unitCountRow,
} from "@/lib/deal-strategy";
import type { ExtractionResult, InterestKind } from "@/lib/anthropic/types";
import { assetClassKey, assetWords, countNoun } from "@/lib/asset-words";
import { assetClassLabel } from "@/lib/asset-class";
import { readSiteReports, siteReportsModelLine, siteReportsShortLine } from "@/lib/site-reports";
import { readStudentHousing, studentModelLine, studentShortLine } from "@/lib/student-housing";
import { mhModelLine, mhShortLine, readManufacturedHousing } from "@/lib/manufactured-housing";
import { readSelfStorage, storageModelLine, storageShortLine } from "@/lib/self-storage";
import { regulationModelLine, regulationShortLine, type RegulationRead } from "@/lib/rent-regulation";
import { forwardModelLine, forwardShortLine, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseModelLine, mixedUseShortLine, readMixedUse } from "@/lib/mixed-use";
import { goingConcernModelLine, goingConcernShortLine, readGoingConcern } from "@/lib/going-concern";
import { condoModelLine, condoShortLine, readCondo } from "@/lib/condo";
import { condoUnitsOffered } from "@/lib/condo-units";
import { readSandwichLease, sandwichModelLine, sandwichShortLine } from "@/lib/sandwich-lease";
import { allInPct, debtRateNote, type DebtIndex, type PermanentSpread, type RateSeed } from "@/lib/debt-index";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { UnderwriteInputs } from "./engine";
import { defaultExitGap } from "./cost-note";

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

/** What the model is told about the deal that its extraction alone cannot
 *  say: the rent rules that reach the building (lib/rent-regulation), read
 *  by the caller through `regulationForDeal` from the deal row's address,
 *  site flags and class on the caller's own day. Absent or null, the cover
 *  says nothing of rent rules — the sample, a test, the bridge's read. */
export interface DealForModel {
  regulation?: RegulationRead | null;
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
  /** the document an extracted figure was read from where it is not the
   *  OM ("Rent roll"), so the SOURCE column never credits it to the OM */
  doc?: string;
  /** a figure the memorandum states for this input that the model does not
   *  run in its place — a leased fee's ground rent, which is the deal's
   *  income (#415) while the model reads its NOI as a building's, or an NOI
   *  of zero or less beside which the model runs the price × the stated cap
   *  (research pass 38) — named so a surface that withholds the returns
   *  never says no income was read; `unpriced` where a positive NOI was not
   *  run because no price was read to set it against (the placeholder) */
  notRun?: { label: string; value: number; unpriced?: boolean };
  /** on the price: no price is stated, and the NOI it was backed out of
   *  over the stated going-in cap (`label`, `value`) is zero or less — not a
   *  year's income to price on, so the quotient is no price (research pass
   *  38). The model runs the figure, which is the owner's to change; no
   *  surface shows it, and the returns are withheld with the reason */
  noPrice?: { label: string; value: number };
}

export interface WorkbookMeta {
  dealName: string;
  address: string;
  market: string;
  assetClass: string;
  /** what one of the building is called (lib/asset-words) — the workbook's
   *  per-unit rows read "Price / Key" on a hotel, "Price / Pad" on a park */
  unitNoun?: { one: string; many: string };
  /** what is being sold (lib/interest, #414) — a note, a share, a
   *  leasehold: the cover says it in one line and what the model is and is
   *  not; absent for a plain fee simple. `equipment` is a ground lease's
   *  tower, billboard or solar array where the memorandum names one, which
   *  the deal type names on a leased fee in place of a building */
  interest?: {
    line: string;
    modelCaveat: string | null;
    kind?: InterestKind;
    equipment?: EquipmentUse | null;
    /** where the price did not buy the building (lib/deal-strategy
     *  `buildingPriceOf` answers none — a note, a leased fee, a preferred
     *  equity position, a share of no stated percentage or beside its
     *  entity's loan): the word its withheld cells say ("n/a — note") and
     *  why no building basis or cap is struck on the price; absent or null
     *  where the price is the building's */
    basisWithheld?: { word: string; why: string } | null;
  } | null;
  /** what the Deal Summary's price tile is called where the model's price
   *  is not the price the memorandum states for what is sold: a share's
   *  price grossed up to the whole ("Whole Price (49% share grossed up)"),
   *  or, beside the entity's stated loan, the equity's whole — the plan's
   *  own words for it (lib/deal-strategy `planSummary`). Absent where the
   *  model runs at the price as stated. */
  priceLabel?: string | null;
  /** the share the memorandum states a partial interest's price buys,
   *  where the model grossed that price up to the whole it runs (the share
   *  under 100% `priceLabel` names): the deal page's max bid, solved on the
   *  whole, states the share's beside it (research pass 40, M7); absent
   *  where the price is run as stated */
  grossedUpSharePct?: number | null;
  /** the model's price is a development's land or site cost: the
   *  workbook's yardsticks call it "Land cost / Unit", never "Price / Unit"
   *  (research pass 38); absent otherwise */
  priceIsLand?: boolean;
  /** the units a bulk condominium purchase buys (lib/condo-units
   *  `condoUnitsOffered`): the workbook's per-unit yardsticks divide by
   *  them, never by the condominium's whole count (research pass 38) — the
   *  area the model runs on stays the owner's; absent otherwise */
  unitsOffered?: number | null;
  /** the seller's loan offered for assumption (lib/assumable-debt, #419):
   *  the loan as stated, and what it is worth against this model's new
   *  loan; absent where none is offered */
  assumable?: { line: string; read: string } | null;
  /** a note the seller offers to carry (lib/seller-financing, #462): the
   *  note as stated, then what it is worth against this model's own new
   *  loan; absent where none is offered */
  sellerNote?: { line: string; read: string } | null;
  /** a leasehold's exit valued on the years its ground lease has left at
   *  this model's sale (lib/leasehold-exit, #422) — the read, with the
   *  exit cap that runs this workbook on the term, then the financing and
   *  the basis; absent unless a leasehold states when its lease ends (the
   *  lease's end itself rides in `interest.line`) */
  leasehold?: { line: string; read: string } | null;
  /** a covenant or a contract that sets the rents (lib/affordable, #453):
   *  the restriction in one line, and what this model's one rent growth
   *  rate is not on it; absent on a market-rate deal */
  affordable?: { line: string; modelCaveat: string | null } | null;
  /** the one lease a single-tenant property is (lib/single-tenant, #454):
   *  the lease in one line, and what it means for this model — the years
   *  left at its sale or the lease ending inside its hold, then the lease's
   *  increases against its rent growth; absent on anything else */
  singleTenant?: { line: string; read: string } | null;
  /** what a hotel is sold with (lib/hotel-deal, #455): the flag, the
   *  encumbrance, the PIP and the franchise's end in one line, then what
   *  they mean for this model — the PIP against its capital line, a flag
   *  ending inside its hold, a manager outlasting its sale; absent on
   *  anything but a hotel */
  hotel?: { line: string; read: string } | null;
  /** how the property is sold (lib/sale-terms, #456): the sale in one line,
   *  then the most this model pays all-in at the screening hurdle, backed
   *  out of the buyer's premium (lib/sale-ceiling); absent on a negotiated
   *  sale */
  sale?: { line: string; read: string } | null;
  /** a multi-tenant property's listed tenants (lib/tenant-roster, #457):
   *  the roster in one line, then what this model does not carry for the
   *  roll — its leasing capital, its flat vacancy; absent where the
   *  memorandum lists fewer than two tenants */
  roster?: { line: string; read: string } | null;
  /** a value-add renovation program (lib/value-add, #460): the program in
   *  one line, then what a door is worth at this model's exit cap and the
   *  premium the model does not carry; absent where none is stated */
  valueAdd?: { line: string; read: string } | null;
  /** a property-tax abatement (lib/tax-abatement, #461): the abatement in
   *  one line, then where it ends against this model's sale and the
   *  step-up at its exit cap; absent where none is stated */
  taxAbatement?: { line: string; read: string } | null;
  /** what the third-party reports found (lib/site-reports, #465): the
   *  reports in one line, then what this model does with the immediate
   *  repairs; absent where the memorandum cites none */
  siteReports?: { line: string; read: string } | null;
  /** a student building (lib/student-housing, #468): its pre-leasing, beds
   *  and walk to campus in a line, then the model's vacancy against the
   *  beds still to sign. Absent on anything else. */
  student?: { line: string; read: string } | null;
  /** a manufactured-housing park (lib/manufactured-housing, #470): its
   *  pads, lot rent, homes and utilities in a line, then what the model
   *  does with the gap to market, the park-owned homes and a private
   *  system. Absent on anything else. */
  mh?: { line: string; read: string } | null;
  /** a self-storage facility (lib/self-storage, #471): its occupancies,
   *  rates and platform in a line, then what the model does with the
   *  premium sitting tenants pay over street and with a lease-up. Absent on
   *  anything else. */
  storage?: { line: string; read: string } | null;
  /** the rent rules that reach the building (lib/rent-regulation): the
   *  regime, the regulated share as stated and the allowance in force in a
   *  line, then this model's one rent growth rate set beside the allowance
   *  ("" where no regime reaches it and only the memorandum names one).
   *  Absent where no rule reaches the building and the memorandum names
   *  none. */
  regulation?: { line: string; read: string } | null;
  /** a forward purchase or a build-to-suit bought at delivery
   *  (lib/forward-purchase): the price at delivery, the clock, the yield and
   *  the deposit in a line, then what this model does with them — the price
   *  as paid at closing with income from its first year, and its year-one
   *  NOI beside the memorandum's at delivery. Absent on anything else. */
  forward?: { line: string; read: string } | null;
  /** a mixed-use building (lib/mixed-use): its two incomes as stated, the
   *  commercial share of each and the commercial space in a line, then what
   *  this model does with them — one exit cap and one growth rate for both.
   *  Absent on anything else. */
  mixedUse?: { line: string; read: string } | null;
  /** an operating business on its real estate (lib/going-concern): what is
   *  sold, the operator's earnings and the rent's coverage in a line, then
   *  what this model does with the income — it capitalises it as rent and
   *  allocates nothing to the business ("" on a lease to the operator,
   *  whose rent is the landlord's income). Absent on anything else. */
  goingConcern?: { line: string; read: string } | null;
  /** condominium units bought in bulk (lib/condo): the units offered of the
   *  condominium's, a year of their dues and a special assessment in a line,
   *  then what this model does with them — it sells them as one building at
   *  its exit cap and runs no retail exit. Absent on anything else. */
  condo?: { line: string; read: string } | null;
  /** a sandwich position (lib/sandwich-lease): the sublease income against
   *  the master rent, its cover and the master lease's end in a line, then
   *  what this model does with the position — it capitalises the income at
   *  its sale as if it ran forever, while the master lease ends ("" where
   *  the stated end has passed). Absent on anything but a master lease of
   *  the building. */
  sandwich?: { line: string; read: string } | null;
  /** the share of effective gross income the model's operating expenses
   *  take where it is the class's screening default, not a T-12's load
   *  (research pass 40, M2): the operating expenses and the potential gross
   *  revenue are then the year-1 NOI grossed up through it and the vacancy,
   *  so the workbook's Operating Metrics leave out the rows that would only
   *  restate it. Absent where a T-12's load runs. */
  defaultExpenseRatio?: { ratio: number; classWord: string } | null;
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

/** A cap the OM states as a range — "5.25% - 5.75%", "5.25% to 5.75%" — as
 *  its two ends, either order written; null for one figure (research pass
 *  38, C27). */
const CAP_SPAN = /(\d{1,2}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d+)?)\s*%/i;
function capSpanOf(raw: string): { low: number; high: number } | null {
  const m = CAP_SPAN.exec(raw);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return low > 0 && high > low && high <= 25 ? { low, high } : null;
}

// Every class the site files has its own defaults; a phrase the model wrote
// ("boutique hotel") is filed by its words (lib/asset-words), and only a
// class nothing resolves falls to the generic row.
const normalizeClass = (c: string): keyof typeof CLASS_DEFAULTS => {
  const key = assetClassKey(c);
  return key && CLASS_DEFAULTS[key] ? key : "auto";
};

/**
 * The spread the model adds to the day's index for a deal's class, read as
 * `deriveUnderwriteInputs` reads it (the extraction's class, the class's
 * `spreadBps`, none where the class operates nothing), with the words its
 * note uses — so a Claude step handed the day's rates (lib/debt-index
 * `ratesPromptLine`) is told the spread the site's own model adds, as the
 * screening default it is, instead of inventing one. A read of the table,
 * never a change to it.
 */
export function permanentLoanSpread(assetClass: string | null | undefined): PermanentSpread {
  const key = normalizeClass(assetClass ?? "auto");
  const bps = assetWords(assetClass).operating ? (CLASS_DEFAULTS[key].spreadBps ?? null) : null;
  return { bps, label: `${(assetClassLabel(key) || "generic").toLowerCase()} spread` };
}

/** The cover's line about what is being sold, and what the model is and
 *  is not on it — null for a plain fee simple. */
function interestMeta(extraction: ExtractionResult | null): WorkbookMeta["interest"] {
  const r = readInterest(extraction, askingPriceOf(extraction));
  return r
    ? {
        line: interestShortLine(r),
        modelCaveat: r.modelCaveat,
        kind: r.kind,
        equipment: r.equipment,
        basisWithheld: basisWithheldOf(extraction),
      }
    : null;
}

/**
 * Why no building basis or going-in cap is struck on the price, where the
 * price did not buy the building — CLAUDE.md's rule, read through the one
 * reader every surface divides a price by (lib/deal-strategy
 * `buildingPriceOf`). Whether a price is the building's turns on what it
 * buys alone, so any positive figure asks it. Null where it is.
 */
export function basisWithheldOf(extraction: ExtractionResult | null): { word: string; why: string } | null {
  if (buildingPriceOf(extraction, 1) != null) return null;
  const { kind, sharePct, entityLoan } = interestOf(extraction);
  switch (kind) {
    case "note":
      return { word: "note", why: "the price buys a note secured by the building, not the building" };
    case "preferred_equity":
      return { word: "position", why: "the price buys a preferred equity position in the owning entity, not the building" };
    case "leased_fee":
      return { word: "leased fee", why: "the price buys the land under the building, not the building" };
    case "partial_interest":
      // A share of the general partner's interest is a share of a share:
      // nothing grosses its price up to the building's (research pass 37).
      if (isGpStake(extraction)) {
        return {
          word: "share",
          why: "the price buys a share of the general partner's interest, a share of a share that no figure grosses up to the building's price",
        };
      }
      // An undivided interest held as a tenant in common is the real
      // estate's: a loan the memorandum states is the property's, never an
      // entity's (research pass 37).
      if (isTenancyInCommon(extraction)) {
        return {
          word: "share",
          why:
            entityLoan != null
              ? "the interest's price grossed up is the equity's whole, with the loan on the property on top of it, not the building's price"
              : "the price buys an undivided interest the memorandum states no percentage for, which cannot be grossed up to the building's price",
        };
      }
      return {
        word: "share",
        why:
          entityLoan != null
            ? isWholeShare(sharePct)
              ? "the price for all of the entity's interests is the equity's whole, with the entity's loan on top of it, not the building's price"
              : "the share's price grossed up is the equity's whole, with the entity's loan on top of it, not the building's price"
            : "the price buys a share the memorandum states no percentage for, which cannot be grossed up to the building's price",
      };
    default:
      return null;
  }
}

/** The cover's lines about the seller's loan offered for assumption
 *  (#419): the loan as stated, and the deal page's own read of it against
 *  this model's new loan. Null where none is offered. */
function sellerNoteMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["sellerNote"] {
  const s = extraction ? readSellerFinancing(extraction, inputs) : null;
  if (s) return { line: sellerFinancingLine(s.terms, s.overPrice), read: sellerFinancingSentence(s) };
  // On a note the seller's financing is of the note's purchase: listed as
  // that, and never run against this model's property loan.
  const t = notePurchaseFinancing(extraction);
  return t
    ? {
        line: notePurchaseFinancingLine(t),
        read: "It finances the purchase of the loan, not the property, so this model — the collateral's, run with a property loan of its own — does not run it.",
      }
    : null;
}

function assumableMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["assumable"] {
  const a = readAssumable(extraction, inputs);
  return a ? { line: assumableLine(a), read: assumableSentence(a) } : null;
}

/** The cover's lines about a covenant or a contract that sets the rents
 *  (#453): the restriction, and what the model's one growth rate is not on
 *  it. Null on a market-rate deal. */
function affordableMeta(extraction: ExtractionResult | null): WorkbookMeta["affordable"] {
  const r = readAffordable(extraction);
  return r ? { line: affordableShortLine(r), modelCaveat: r.modelCaveat } : null;
}

/** The cover's lines about the one lease a single-tenant property is
 *  (#454): the lease, then the deal page's own read of it against this
 *  model. Null on anything else. */
function singleTenantMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["singleTenant"] {
  const r = readSingleTenant(extraction);
  if (!r) return null;
  return {
    line: singleTenantShortLine(r),
    read: singleTenantModelLine(r, {
      holdMonths: inputs.holdMonths,
      rentGrowthPct: inputs.rentGrowthPct,
      vacancyPct: inputs.vacancyPct,
      exitCapPct: inputs.exitCapPct,
    }),
  };
}

/** The cover's lines about a student building (#468): the read, then the
 *  model's vacancy against the beds still to sign for the fall. */
function studentMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["student"] {
  const r = readStudentHousing(extraction);
  if (!r) return null;
  return { line: studentShortLine(r), read: studentModelLine(r, { vacancyPct: inputs.vacancyPct * 100 }) };
}

/** The cover's lines about a manufactured-housing park (#470): the read,
 *  then what the model does with the lot rent's gap to market, the
 *  park-owned homes' income and a private water or sewer system. */
function mhMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["mh"] {
  const r = readManufacturedHousing(extraction);
  if (!r) return null;
  return { line: mhShortLine(r), read: mhModelLine(r, { rentGrowthPct: inputs.rentGrowthPct, exitCapPct: inputs.exitCapPct }) };
}

/** The cover's lines about a self-storage facility (#471): the read, then
 *  what the model does with the premium over street and with a lease-up. */
function storageMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["storage"] {
  const r = readSelfStorage(extraction);
  if (!r) return null;
  return {
    line: storageShortLine(r),
    read: storageModelLine(r, { rentAnnual: inputs.inPlaceRentAnnual, exitCapPct: inputs.exitCapPct, vacancyPct: inputs.vacancyPct * 100 }),
  };
}

/** The cover's lines about the rent rules that reach the building
 *  (lib/rent-regulation): the read in a line, then this model's one rent
 *  growth rate set beside the allowance in force — never changed by it. */
function regulationMeta(r: RegulationRead | null | undefined, inputs: Pick<UnderwriteInputs, "rentGrowthPct">): WorkbookMeta["regulation"] {
  if (!r) return null;
  return { line: regulationShortLine(r), read: regulationModelLine(r, inputs.rentGrowthPct * 100) ?? "" };
}

/** The cover's lines about a forward purchase (lib/forward-purchase): the
 *  read in a line, then what this model does with it — the price as paid at
 *  closing, income from its first year, and its year-one NOI beside the
 *  memorandum's at delivery. Null on anything else. */
function forwardMeta(
  extraction: ExtractionResult | null,
  inputs: UnderwriteInputs,
  noi1: number,
  noiAssumed: boolean,
): WorkbookMeta["forward"] {
  const r = readForwardPurchase(extraction);
  if (!r) return null;
  return {
    line: forwardShortLine(r),
    read: forwardModelLine(r, { noi1, noiAssumed, price: inputs.purchasePrice }) ?? "",
  };
}

/** The cover's lines about a mixed-use building (lib/mixed-use): the two
 *  incomes in a line, then what this model does with them — one exit cap
 *  and one growth rate for both. Null on anything else. */
function mixedUseMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["mixedUse"] {
  const r = readMixedUse(extraction);
  if (!r) return null;
  return {
    line: mixedUseShortLine(r),
    read: mixedUseModelLine(r, { exitCapPct: inputs.exitCapPct, rentGrowthPct: inputs.rentGrowthPct }) ?? "",
  };
}

/** The cover's lines about an operating business on its real estate
 *  (lib/going-concern): the read in a line, then what this model does with
 *  the income — it capitalises its year-one income as rent and allocates
 *  nothing to the business. Null on anything else. */
function goingConcernMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs, noi1: number, noiAssumed = false): WorkbookMeta["goingConcern"] {
  const r = readGoingConcern(extraction);
  if (!r) return null;
  return { line: goingConcernShortLine(r), read: goingConcernModelLine(r, { noi1, exitCapPct: inputs.exitCapPct, noiAssumed }) ?? "" };
}

/** The cover's lines about condominium units bought in bulk (lib/condo):
 *  the read in a line, then what this model does with them — it sells the
 *  units as one building at its exit cap, and runs no retail exit. Null on
 *  anything else. */
function condoMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["condo"] {
  const r = readCondo(extraction);
  if (!r) return null;
  return { line: condoShortLine(r), read: condoModelLine(r, { exitCapPct: inputs.exitCapPct }) ?? "" };
}

/** The cover's lines about a sandwich position (lib/sandwich-lease): the
 *  two rents and the master lease's end in a line, then what this model
 *  does with the position — it capitalises the income at its sale as if it
 *  ran forever, and the master lease ends against its hold. Null on
 *  anything but a master lease of the building. */
function sandwichMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["sandwich"] {
  const r = readSandwichLease(extraction);
  if (!r) return null;
  return { line: sandwichShortLine(r), read: sandwichModelLine(r, { holdYears: inputs.holdMonths / 12 }) ?? "" };
}

/** The cover's lines about a multi-tenant property's listed tenants
 *  (#457): the roster, then what this model does not carry for its roll.
 *  Null where the memorandum lists fewer than two tenants. */
function rosterMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["roster"] {
  const r = readRoster(extraction);
  if (!r) return null;
  return {
    line: rosterShortLine(r),
    read: rosterModelLine(r, {
      holdMonths: inputs.holdMonths,
      tiPsf: inputs.tiPsf,
      lcPct: inputs.lcPct,
      vacancyPct: inputs.vacancyPct,
    }),
  };
}

/** The cover's lines about a value-add renovation program (#460): the
 *  program, then its worth at this model's exit cap and what the model does
 *  not carry of it. Null where the memorandum states no program. */
function valueAddMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["valueAdd"] {
  const r = readValueAdd(extraction);
  if (!r) return null;
  return {
    line: valueAddShortLine(r),
    read: valueAddModelLine(r, {
      holdMonths: inputs.holdMonths,
      exitCapPct: inputs.exitCapPct,
      capitalYr1: inputs.capitalImprovementsYr1,
      rentGrowthPct: inputs.rentGrowthPct,
    }),
  };
}

/** The cover's lines about a property-tax abatement (#461): the
 *  abatement, then where it ends against this model's sale and what the
 *  step-up is worth at its exit cap. Null where the memorandum states none. */
function taxAbatementMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["taxAbatement"] {
  const r = readTaxAbatement(extraction);
  if (!r) return null;
  return {
    line: taxAbatementShortLine(r),
    read: taxAbatementModelLine(r, {
      holdMonths: inputs.holdMonths,
      exitCapPct: inputs.exitCapPct,
      expenseGrowthPct: inputs.expenseGrowthPct,
    }),
  };
}

/** The cover's lines about a leasehold's exit (#422): the deal page's own
 *  read of this model's sale on the years its lease has left then, with the
 *  exit cap that runs this workbook on the term — the Exit Cap input stays
 *  the model's, the reader decides — then the financing and the basis.
 *  Null unless a leasehold states when its lease ends. */
function leaseholdMeta(extraction: ExtractionResult | null, inputs: UnderwriteInputs): WorkbookMeta["leasehold"] {
  const r = readLeaseholdExit(extraction, inputs);
  if (!r) return null;
  const t = r.onTerm;
  const run =
    t && t.sharePct < 99.5 ? ` Enter ${(Math.round(t.termCapPct * 100) / 100).toFixed(2)}% as the Exit Cap to run this workbook on the term.` : "";
  return {
    line: `${leaseholdExitSentence(r)}${run}`,
    read: [leaseholdLenderLine(r), leaseholdBasisLine(r)].filter(Boolean).join(" "),
  };
}

export function deriveUnderwriteInputs(
  extraction: ExtractionResult | null,
  fallbackName: string,
  actuals?: ActualsForModel,
  market?: MarketForModel,
  deal?: DealForModel,
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
    doc?: string,
  ) => {
    sources[key] = { provenance, note, page: page && page.trim() ? page : undefined, ...(doc ? { doc } : {}) };
  };

  // ── Purchase price ─────────────────────────────────────────────────────
  // Excludes are word-bounded: a bare /per/ would match the "per" inside
  // "oPERating" and silently disqualify "Net operating income" itself.
  // The shared price reader: the asking / purchase price, else — on a ground-up
  // development only — the land or site cost, which is what is being bought.
  // A label's year is read against the year the screen read the memorandum,
  // so a stored deal's model keeps its price in a later year.
  const priceMetric = findPriceMetric(metrics, inferStrategy(extraction).kind, screenYearOf(extraction));
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
  // A cap the OM states as a range — "5.25% - 5.75%" — runs at the end the
  // cap reader took, and every note that names the cap names the range and
  // that end, as the price note does a price range's (research pass 38,
  // C27). Which end the model should run at is the owner's call.
  const capSpan = capMetric && capPct != null ? capSpanOf(capMetric.value) : null;
  const capEnd = capSpan && capPct != null ? (Math.abs(capPct * 100 - capSpan.low) < 1e-9 ? "low" : Math.abs(capPct * 100 - capSpan.high) < 1e-9 ? "high" : null) : null;
  const capRangeWords =
    capSpan && capEnd ? `the ${capEnd} end of the ${capSpan.low.toFixed(2)}%–${capSpan.high.toFixed(2)}% range the OM states as its going-in cap` : null;
  // A range the OM states — pricing guidance, a whisper — is read at its
  // top (#466): the end that does not flatter a single return below.
  let price = priceMetric ? parsePrice(priceMetric.value) : null;
  const priceSpan = priceMetric ? priceRange(priceMetric.value) : null;
  const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  // An NOI the OM states a month at a time is read as the year it makes
  // (lib/deal-strategy `noiOfRow`, research pass 40), and every note that
  // names it says so: "twelve times the $85,000 a month the OM states".
  const monthWords = (f: { month?: number }) =>
    f.month != null
      ? `twelve times the ${Math.round(f.month) < 0 ? "−" : ""}$${Math.abs(Math.round(f.month)).toLocaleString("en-US")} a month the OM states`
      : null;
  // A stated NOI the model does not run is named in a sentence by its label
  // and figure, and a year read off a month by its month too.
  const namedLabel = (f: { label: string; month?: number }) => {
    const month = monthWords(f);
    return month ? `${f.label}, ${month},` : f.label;
  };
  const spanNote = priceSpan
    ? `the top of the ${usd0(priceSpan.low)}–${usd0(priceSpan.high)} range the OM states, the end that does not flatter the returns`
    : "";
  // What the price buys (lib/interest, #414). A share's price is grossed up
  // to the whole asset the building's figures describe — the model runs the
  // entity's cash flows, of which the share earns its slice before any
  // promote — and a note's price is the collateral's model at the loan's
  // price, which the note says outright.
  const interest = interestOf(extraction);
  // How it is sold (#456): an auction's starting bid is where the price
  // starts, read only where no asking price is stated.
  const saleFloor = readSale(extraction);

  // A leased fee's price note says what the model runs as its income, which
  // only the NOI's derivation below knows: it is written there.
  let leasedFeePrice = false;
  // The Deal Summary's name for the price where it is not the price as
  // stated for what is sold (WorkbookMeta `priceLabel`): set below where a
  // share's price is grossed up, or is the equity's whole.
  let priceLabel: string | null = null;
  // The share a partial interest's price was grossed up from (WorkbookMeta
  // `grossedUpSharePct`), set where it is.
  let grossedUpSharePct: number | null = null;
  if (price != null && interest.kind === "partial_interest" && isWholeShare(interest.sharePct)) {
    // All of the entity's interests (a stated 100%, research pass 28): the
    // price is the whole's as stated, nothing grossed up — said so, never as
    // a share with no stated percentage. Beside the entity's stated loan it
    // is the equity's whole, and the loan sits on top of it, as below.
    const entityLoan = entityLoanOf(extraction);
    if (entityLoan != null) priceLabel = "Equity's Whole (all the entity's interests)";
    const of = `The OM's ${usd0(price)}${spanNote ? ` (${spanNote})` : ""} for all of the owning entity's interests`;
    mark(
      "purchasePrice",
      "extracted",
      entityLoan != null
        ? `${of} — the equity's whole, nothing grossed up, not the asset's: the entity's stated ${usd0(entityLoan)} loan sits on top of it, and the model neither adds it to the price nor carries it, sizing a new loan of its own on the ${usd0(price)} instead; the model runs the whole building's cash flows, before the entity's own costs and fees`
        : `${of} — the whole, nothing grossed up; the model runs the whole building's cash flows, before the entity's own costs and fees`,
      pageOf(priceMetric),
    );
  } else if (price != null && interest.kind === "partial_interest" && interest.sharePct != null) {
    const share = interest.sharePct;
    const stated = price;
    price = stated / (share / 100);
    grossedUpSharePct = share;
    // Beside the entity's stated loan the figure grossed up is the equity's
    // whole, not the asset's (research pass 23). The note names both; the
    // loan is not added to the price — that is the model's arithmetic, and
    // the owner's call.
    const entityLoan = entityLoanOf(extraction);
    // The tile says what the figure is, in the plan's own words: the whole
    // the share's price implies, or beside the entity's loan the equity's
    // whole — never a "Purchase Price" the share does not cost.
    const shareWord = `${Math.round(share * 10) / 10}%`;
    // An undivided interest held as a tenant in common is title to the real
    // estate beside its co-owners, never an entity's share: no promote, and a
    // loan the memorandum states is the property's (research pass 37).
    const tic = isTenancyInCommon(extraction);
    // A stated total project cost above the figure grossed up makes it the
    // equity's whole, never the whole (research pass 37: a development joint
    // venture's equity commitment grossed up is its equity, the construction
    // debt above it). Said; nothing is added to the price.
    const projectCost = shareProjectCostOf(extraction, price);
    priceLabel = `${entityLoan != null || projectCost != null ? "Equity's Whole" : "Whole Price"} (${shareWord} ${tic ? "TIC interest" : "share"} grossed up)`;
    const sold = tic ? `an undivided ${share}% interest held as a tenant in common` : `${withArticle(`${share}%`)} share`;
    const earns = tic
      ? `the interest earns ${share}% of them before any fee the co-owners' agreement pays its manager`
      : `the share earns ${share}% of them before the promote and the sponsor's fees`;
    const loanOnTop = tic ? `the stated ${usd0(entityLoan ?? 0)} loan on the property` : `the entity's stated ${usd0(entityLoan ?? 0)} loan`;
    mark(
      "purchasePrice",
      "derived",
      entityLoan != null
        ? `The OM's ${usd0(stated)}${spanNote ? ` (${spanNote})` : ""} for ${sold}, grossed up to ${usd0(price)} — the equity's whole, not the asset's: ${loanOnTop} sits on top of it, and the model neither adds it to the price nor carries it, sizing a new loan of its own on the ${usd0(price)} instead; the model runs the whole building's cash flows, and ${earns}`
        : projectCost != null
          ? `The OM's ${usd0(stated)}${spanNote ? ` (${spanNote})` : ""} for ${sold}, grossed up to ${usd0(price)} — the equity's whole, not the project's: the memorandum's stated ${usd0(projectCost)} total project cost sits above it; the model runs the whole building's cash flows, and ${earns}`
          : `The OM's $${Math.round(stated).toLocaleString("en-US")}${spanNote ? ` (${spanNote})` : ""} for ${sold}, grossed up to the whole asset — the model runs the whole building's cash flows; ${earns}`,
      pageOf(priceMetric),
    );
  } else if (price != null) {
    const what = priceIsLand
      ? "OM land / site cost — the development's acquisition basis; the build sits in the capital plan"
      : interest.kind === "note"
        ? "The OM's price for a NOTE secured by the property — this model runs the collateral as if bought outright at that price, which is not the note's return"
        : interest.kind === "preferred_equity"
          ? "The OM's price for a PREFERRED EQUITY position in the owning entity — this model runs the whole building as if bought outright at that price, which is not the position's return: that is its rate and its redemption"
        : interest.kind === "partial_interest"
          ? isGpStake(extraction)
            ? // A share of a share (research pass 37): the price runs as
              // stated, as a share of no stated percentage's does, and its
              // returns are said not to be the stake's.
              "The OM's price for a share of the GENERAL PARTNER'S interest — a share of a share, not of the owning entity: this model runs the whole building's cash flows at that price, so its cap and returns are not the stake's"
            : isTenancyInCommon(extraction)
              ? "The OM's price for an UNDIVIDED INTEREST held as a tenant in common that states no single percentage — the model cannot gross it up, so its returns are not the interest's"
              : "The OM's price for a SHARE of the owning entity that states no single percentage — the model cannot gross it up, so its returns are not the share's"
          : interest.kind === "leased_fee"
            ? "The OM's price for the LEASED FEE — the land under a building someone else owns, with its ground lease"
            : "OM asking / purchase price";
    leasedFeePrice = interest.kind === "leased_fee" && !priceIsLand;
    mark(
      "purchasePrice",
      "extracted",
      // A range is said, with the end the model runs at (#466).
      spanNote ? `${what} — ${usd0(price)}, ${spanNote}; enter the price you would pay` : what,
      pageOf(priceMetric),
    );
  } else if (saleFloor?.floorAllIn != null && saleFloor.startingBid != null) {
    // An auction has no asking price (#456): the starting bid plus the
    // buyer's premium is the floor of what a winner pays, a stated fact —
    // never a placeholder, and never the price itself.
    price = saleFloor.floorAllIn;
    mark(
      "purchasePrice",
      "derived",
      `The $${Math.round(saleFloor.startingBid).toLocaleString("en-US")} starting bid${
        saleFloor.premium ? ` plus the ${saleFloor.premium.pct}% buyer's premium` : ""
      } — the floor of what a winning bidder pays, so every return here is a ceiling; enter the price you would bid`,
      saleFloor.startingBidPage || undefined,
    );
  } else if (goingFig && capPct) {
    // Only an in-place / Year-1 NOI may back a price out of the going-in cap.
    price = goingFig.value / capPct;
    if (goingFig.value > 0) {
      const month = monthWords(goingFig);
      mark("purchasePrice", "derived", `NOI${month ? ` (${month})` : ""} ÷ ${capRangeWords ?? "going-in cap"}`);
    } else {
      // An NOI of zero or less over the cap is no price: the model runs the
      // quotient (the owner's to change), and the note says why it is none
      // without printing it, marked so that no surface shows it and every
      // one withholds the returns struck on it (research pass 38).
      mark(
        "purchasePrice",
        "derived",
        `The OM states no price, and its ${goingFig.label} of ${compactUsd(goingFig.value, { thousandsFrom: Infinity })}${monthWords(goingFig) ? ` (${monthWords(goingFig)})` : ""} is not a year's income to price on: that NOI ÷ ${capRangeWords ?? "the stated going-in cap"} is no price — enter the purchase price`,
      );
      sources.purchasePrice = { ...sources.purchasePrice!, noPrice: { label: namedLabel(goingFig), value: goingFig.value } };
    }
  } else {
    price = 10_000_000;
    // A price row whose value is no price ("6.25% cap rate", "185,000 per
    // unit" — lib/criteria `priceRefusal`) is named, as written, so the note
    // never reads as if the memorandum stated nothing (research pass 38).
    const refused = priceMetric ? priceRefusal(priceMetric.value) : null;
    mark(
      "purchasePrice",
      "assumption",
      priceMetric && refused
        ? `The OM's ${priceMetric.label.trim().toLowerCase()} reads “${priceMetric.value.trim()}” — ${refused}, not a price; enter the purchase price`
        : "Enter the purchase price",
    );
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
  // ceiling on an operating asset cannot be year-1 income on this price — and
  // beside a price that buys a share no figure grosses up, the building's own
  // income is not wrong, the price is not the building's (research pass 37:
  // a GP stake's note had called the building's stated NOI no year-1 income).
  const shareUngrossed = interest.kind === "partial_interest" && interest.sharePct == null;
  const implausible = (f: { label: string; value: number; month?: number }) => {
    // A loss is written with its minus outside the dollar, as every surface
    // writes one: "−$310,000", never "$-310,000" (research pass 38) — and a
    // year read off a month says so beside it (research pass 40).
    const whole = Math.round(f.value);
    const month = monthWords(f);
    const amount = `${whole < 0 ? "−" : ""}$${Math.abs(whole).toLocaleString("en-US")}${month ? ` (${month})` : ""}`;
    if (!(f.value > 0)) return `The OM's ${f.label} is ${amount} — no income in place to anchor year 1 on`;
    // No price was read: a stated NOI is set against nothing the memorandum
    // states, so it is never judged against the placeholder (research pass
    // 38: "above any going-in cap on this price" of a $10M placeholder).
    if (statedPrice == null && !isPlanDeal(strategy.kind)) {
      return `The OM's ${f.label} of ${amount} cannot be set against the ${usd0(price)} placeholder price, which no memorandum stated — enter the price`;
    }
    if (shareUngrossed && !isPlanDeal(strategy.kind)) {
      return `The OM's ${f.label} of ${amount}${pctOfPrice(f.value)} the whole building's income against the price of ${
        isGpStake(extraction) ? "a share of the general partner's interest" : "a share the memorandum states no percentage for"
      }, which is not the building's price, so it does not anchor year 1 here`;
    }
    return isPlanDeal(strategy.kind)
      ? `The OM's ${f.label} of ${amount}${pctOfPrice(f.value)} the finished project's stabilized figure on ${withArticle(strategy.label.toLowerCase())} deal, not year-1 income, so it does not anchor year 1 here`
      : `The OM's ${f.label} of ${amount}${pctOfPrice(f.value)} above any going-in cap on this price, so it cannot be year-1 income and does not anchor year 1 here`;
  };
  let noi: number;
  // What the year-1 NOI was read from, in words — a leased fee's price note
  // says it, beside the ground rent the model does not read.
  let noiRead: string;
  // A building the memorandum states 0% occupied with no NOI, its year-1 NOI
  // the 6% placeholder: the rent line's note says what its rent is, below.
  let noIncomeInPlace = false;
  if (t12Noi != null) {
    noi = t12Noi;
    noiRead = "the T-12's actual NOI";
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the T-12 actual NOI${ttmNote} at ${t12Er != null ? "the T-12 actual" : "an assumed"} expense ratio`,
    );
  } else if (goingFig && plausibleOnPrice(goingFig.value)) {
    noi = goingFig.value;
    const month = monthWords(goingFig);
    noiRead = `the OM's ${goingFig.label}${month ? `, ${month}` : ""}`;
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the OM's ${goingFig.label}${month ? ` — ${month} —` : ""} at an assumed expense ratio`,
      pageOfFig(goingFig),
    );
  } else if (
    strategy.kind === "stabilized" &&
    stabilizedFig &&
    plausibleOnPrice(stabilizedFig.value)
  ) {
    noi = stabilizedFig.value;
    const month = monthWords(stabilizedFig);
    noiRead = `the OM's ${stabilizedFig.label}${month ? `, ${month}` : ""}`;
    mark(
      "inPlaceRentAnnual",
      "derived",
      `Grossed up from the OM's ${stabilizedFig.label}${month ? `, ${month},` : ""} — the only NOI stated; on a stabilized asset it is next year's income`,
      pageOfFig(stabilizedFig),
    );
  } else if (capPct) {
    noi = price * capPct;
    noiRead = "this price × the stated going-in cap";
    const skipped = goingFig ?? stabilizedFig;
    // Beside a stated NOI of zero or less, the price × the stated cap is not
    // the building's income: the model runs it unchanged, but it is marked
    // an assumption, so the returns are withheld on it and the debt sizer
    // seeds no loan from it, and the memorandum's own figure is named as the
    // one not run (research pass 38: an OM's −$310,000 ran as $616,250, a
    // 13.31% IRR with a sizer seeded from it, the finding in another card).
    const noIncome = skipped != null && !(skipped.value > 0);
    // And where no price is stated, the price × the cap is the site's
    // placeholder × the cap: the placeholder's NOI, never one derived from
    // the memorandum, so a price typed over the placeholder never shows
    // returns on it (the second audit, MED-2).
    const onPlaceholder = statedPrice == null;
    // A cap stated as a range is named with the end taken (C27).
    const capWords = capRangeWords ?? `the stated ${(Math.round(capPct * 10_000) / 100).toFixed(2)}% going-in cap`;
    mark(
      "inPlaceRentAnnual",
      noIncome || onPlaceholder ? "assumption" : "derived",
      skipped
        ? `${implausible(skipped)}. Year-1 NOI set from ${onPlaceholder ? `the ${usd0(price)} placeholder × ${capWords}` : `price × ${capRangeWords ?? "the stated going-in cap"}`} instead`
        : onPlaceholder
          ? `The ${usd0(price)} placeholder × ${capWords}, at an assumed expense ratio — the memorandum states no price or NOI, so this NOI is the placeholder's; enter the price and the in-place NOI`
          : `From price × ${capRangeWords ?? "going-in cap"}, at an assumed expense ratio`,
    );
    if (noIncome && skipped && sources.inPlaceRentAnnual) {
      sources.inPlaceRentAnnual = { ...sources.inPlaceRentAnnual, notRun: { label: namedLabel(skipped), value: skipped.value } };
    }
  } else {
    noi = price * 0.06;
    noiRead = "an assumed 6% of this price";
    const skipped = goingFig ?? stabilizedFig;
    // An operating business's earnings stated where no NOI anchors year 1
    // (research pass 28): said, so the note never reads as if the memorandum
    // stated no earnings, and never used — EBITDA is the business's, before
    // rent, a management fee and reserves, never the real estate's NOI. The
    // model's NOI stays the assumed 6%.
    const ebitda = ebitdaFigure(metrics);
    const earnings = ebitda
      ? `The OM states the business's ${ebitda.label} of $${Math.round(ebitda.value).toLocaleString("en-US")}, which is not the real estate's NOI and is not used`
      : "";
    // Land, which earns no income, and a building the memorandum states 0%
    // occupied with no NOI (research pass 37): the 6% is said to be a
    // placeholder, never an assumption about income the memorandum
    // describes. Words only — the model's figures stand (the owner's call).
    // A leased fee's land earns its ground rent, and a rent roll's occupancy
    // outranks the memorandum's.
    const noneStated = !skipped && !earnings && interest.kind !== "leased_fee";
    const landNoIncome = noneStated && !assetWords(extraction?.assetClass).operating;
    noIncomeInPlace = noneStated && !landNoIncome && rrOcc == null && occupancyPctFromMetrics(metrics) === 0;
    // What to enter: on the placeholder, the price — a stated NOI is never
    // asked for again ("enter the in-place NOI" beside the OM's own NOI,
    // research pass 38) — and beside a stated NOI the price can carry, the
    // year-1 NOI the reader would run.
    const onPlaceholder = statedPrice == null;
    // A positive NOI on an operating asset already asks for the price
    // (`implausible`); a loss, or a plan's stabilized figure, does not.
    const priceAsked = skipped != null && onPlaceholder && skipped.value > 0 && !isPlanDeal(strategy.kind);
    const enter = !skipped || priceAsked ? "" : onPlaceholder ? "; enter the price" : "; enter the year-1 NOI you would run";
    mark(
      "inPlaceRentAnnual",
      "assumption",
      landNoIncome
        ? "Land earns no income: the 6% and the loan beside it are placeholders, and the returns are not the land's"
        : noIncomeInPlace
          ? "The memorandum states the building 0% occupied and no NOI: no income is in place, and the 6% is a placeholder"
          : skipped
            ? `${implausible(skipped)}. No going-in cap in the OM either — assumed 6% going-in${onPlaceholder ? ` on the ${usd0(price)} placeholder` : ""}${enter}${earnings ? `. ${earnings}` : ""}`
            : earnings
              ? `${earnings}; with no NOI or cap in the OM, the model assumed 6% going-in`
              : "No NOI or cap in the OM — assumed 6% going-in",
    );
    // A stated NOI the model does not run is named wherever the returns are
    // withheld, never said to be unread — and where it had no stated price to
    // be set against, said so (research pass 38).
    if (skipped && sources.inPlaceRentAnnual) {
      sources.inPlaceRentAnnual = {
        ...sources.inPlaceRentAnnual,
        notRun: { label: namedLabel(skipped), value: skipped.value, ...(onPlaceholder && skipped.value > 0 ? { unpriced: true } : {}) },
      };
    }
  }

  // A leased fee's income is its ground rent (#415), and the model reads no
  // ground rent: the extraction files it under "Ground rent", a label no NOI
  // reader takes, so year 1 runs on the NOI a building's model reads — a
  // stated NOI, else the price × the stated cap, else the assumed 6%. Both
  // notes say which figure the model runs and name the stated rent beside
  // it, so the gap is seen; reading the rent as the NOI is the owner's call
  // (research pass 34).
  if (interest.kind === "leased_fee") {
    const rent = groundRentOf(extraction);
    // A year-1 NOI equal to the stated rent is the rent's own figure where
    // it was read off a memorandum row (the OM's NOI, the T-12's), and the
    // rent's only by arithmetic where it was struck — the price × the stated
    // cap, or the assumed 6% (the second audit, MED-4: a NOI read off the
    // OM's own row, which was the rent, was said to be "by arithmetic, not
    // read from it" and the rent "not read").
    const sameAsRent = rent != null && Math.abs(noi - rent) <= rent * 0.005;
    const byArithmetic = sources.inPlaceRentAnnual?.provenance === "assumption" || noiRead === "this price × the stated going-in cap";
    const sameFigure = rent != null ? ` — the same figure as the ${usd0(rent)} ground rent the OM states` : "";
    if (rent != null && sources.inPlaceRentAnnual) {
      sources.inPlaceRentAnnual =
        sameAsRent && !byArithmetic
          ? { ...sources.inPlaceRentAnnual, note: `${sources.inPlaceRentAnnual.note}${sameFigure}` }
          : {
              ...sources.inPlaceRentAnnual,
              note: `${sources.inPlaceRentAnnual.note}. The OM's ${usd0(rent)} ground rent is the leased fee's income; the model does not read it`,
              notRun: { label: "ground rent", value: rent },
            };
    }
    if (leasedFeePrice && sources.purchasePrice) {
      const against =
        rent == null
          ? ""
          : sameAsRent
            ? byArithmetic
              ? ` — equal to the ${usd0(rent)} ground rent the OM states by arithmetic, not read from it`
              : sameFigure
            : `, not the ${usd0(rent)} ground rent the OM states`;
      sources.purchasePrice = {
        ...sources.purchasePrice,
        note: `The OM's price for the LEASED FEE — the land under a building someone else owns, with its ground lease${
          spanNote ? ` (${usd0(price)}, ${spanNote})` : ""
        }. The model reads no ground rent as its income: its year-1 NOI is ${noiRead}, ${usd0(noi)} a year${against}, run with a building's assumptions${
          spanNote ? "; enter the price you would pay" : ""
        }`,
      };
    }
  }

  // ── Capital / construction budget ──────────────────────────────────────
  // The plan's cost goes into the model's capital line, so the returns pay
  // for it. Shared reader with the deal page and the challenger's brief
  // (lib/deal-strategy): a "total project cost" includes the price, a budget
  // line does not, a mis-parsed figure never lands, absent is absent.
  // Read against the STATED price only: a "total project cost" beside no
  // ask must not be thrown out as ten times a $10M placeholder. Against a
  // land price the ten-times bound does not apply at all.
  // A value-add that states its program a door at a time and no total
  // (#460) carries the doors times a door's cost — the plan's own budget,
  // from lib/deal-strategy, so the model and the plan spend one figure.
  // A forward purchase or a build-to-suit bought at delivery
  // (lib/forward-purchase): the developer funds the works. Said in the
  // capital line's note — the model's figures are unchanged.
  const forwardDeal = isForwardPurchase(extraction, strategy);
  const budgetRead =
    capitalBudgetFromMetrics(metrics, statedPrice, !priceIsLand) ??
    budgetFromText(extraction?.strategy?.capitalBudget, statedPrice, !priceIsLand) ??
    (strategy.kind === "value_add" ? renovationProgramBudget(metrics, statedPrice, !priceIsLand) : null);
  // A hotel's PIP (#455): the brand's required renovation is the buyer's
  // capital. Where the memorandum states a PIP and no other capital budget
  // the model carries it; where it states both, the budget is read as
  // including it — never the two added.
  const hotelRead = readHotelDeal(extraction);
  const pipCapital = !budgetRead && hotelRead?.pipTotal != null && hotelRead.pipTotal > 0 ? hotelRead.pipTotal : null;
  // The property condition report's immediate repairs (#465): work the
  // building needs now, capital at closing. Carried where the memorandum
  // states no other budget and no PIP; a stated budget or PIP is read as
  // including them — never the two added.
  const reportsRead = readSiteReports(extraction);
  const repairsCapital =
    !budgetRead && pipCapital == null && reportsRead?.pca?.immediate != null && reportsRead.pca.immediate > 0
      ? reportsRead.pca.immediate
      : null;
  const capitalBudget = budgetRead?.budget ?? pipCapital ?? repairsCapital ?? 0;

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
  // The count in the memorandum's own noun (lib/asset-words `countNoun`): a
  // care home's "Licensed beds" are beds and a marina's "Wet slips" slips,
  // never "units" because the class names no noun of its own (audit A, L2);
  // else the class's, else units.
  const countMany = countNoun(unitCountRow(metrics)?.label, extraction?.assetClass);
  const unitNoun = { one: countMany.replace(/s$/, ""), many: countMany };
  const typicalSf = units != null && units > 0 && cd.sfPerUnit ? Math.round(units * cd.sfPerUnit) : null;
  const rsf = rrSf ?? (sfParsed && sfParsed > 100 ? Math.round(sfParsed) : (typicalSf ?? 100_000));
  if (rrSf != null) {
    mark("rsf", "extracted", `Rent roll total SF${rrAsOf ? ` (as of ${rrAsOf})` : ""}`, undefined, "Rent roll");
  } else if (sfParsed && sfParsed > 100) {
    mark("rsf", "extracted", "OM building size", pageOf(sfMetric));
  } else if (typicalSf != null) {
    // A class sized by the bed (student housing) whose memorandum counts
    // units: the typical size is a bed's, applied to a unit count, and the
    // note says so (research pass 38 — "180 units × 350 SF" for 600 beds).
    // The area itself is the owner's.
    const bedSizeOnUnits = words.noun?.one === "bed" && unitNoun.many !== "beds";
    mark(
      "rsf",
      "assumption",
      `${units!.toLocaleString("en-US")} ${units === 1 ? unitNoun.one : unitNoun.many} × ${cd.sfPerUnit} SF typical — ${
        bedSizeOnUnits ? `${cd.sfPerUnit} SF is a bed's typical size, applied here to a count of ${unitNoun.many}, not beds; ` : ""
      }enter the rentable SF`,
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
  // On a building with no income in place the rent line is the placeholder
  // grossed up through the vacancy the stated 0% occupancy is run at — said,
  // with its figure, as no building's rent (research pass 37: $92.7M a year on
  // a vacant 42,000 SF office). Words only; the figure stands.
  if (noIncomeInPlace && sources.inPlaceRentAnnual) {
    sources.inPlaceRentAnnual = {
      ...sources.inPlaceRentAnnual,
      note: `${sources.inPlaceRentAnnual.note}. The ${compactUsd(pgr)} of gross potential rent on this line is backed out of that placeholder at the stated 0% occupancy, which the model runs as ${withArticle(`${Math.round(vacancy * 100)}% vacancy`)} — it is no building's rent`,
    };
  }

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
  // Read off a stated occupancy, the workbook's "General Vacancy & Credit
  // Loss %" row holds 1 − that occupancy and nothing for credit or
  // collection loss — the note says so, so the label is not read as both.
  const noCreditLoss = "the vacancy is what it leaves and carries no credit or collection loss";
  if (rrOcc != null) {
    mark(
      "vacancyPct",
      "extracted",
      `Rent roll actual — ${(rrOcc * 100).toFixed(1)}% SF-weighted occupancy${rrAsOf ? ` as of ${rrAsOf}` : ""} — ${noCreditLoss}`,
      undefined,
      "Rent roll",
    );
  } else if (occPct != null) {
    mark(
      "vacancyPct",
      "extracted",
      `OM in-place occupancy ${occPct}% — ${noCreditLoss}`,
      (occupancyRow(metrics) as { page?: string } | null)?.page,
    );
  } else {
    mark("vacancyPct", "assumption", `${classWord} default (${Math.round(cd.vacancy * 100)}%)`);
  }
  mark("rentGrowthPct", "assumption", "Default 3.0%/yr — set your view");
  mark("expenseGrowthPct", "assumption", "Default 3.0%/yr — set your view");
  // A stated occupancy under half: the class's ratio is a share of a mostly
  // empty building's income, while its taxes and insurance are owed on the
  // whole building (research pass 38). Said; the figure is the owner's.
  const statedOcc = rrOcc ?? (occPct != null ? occPct / 100 : null);
  const mostlyEmpty = statedOcc != null && statedOcc < 0.5;
  sources.expenseLines = t12Er != null
    ? {
        provenance: "extracted",
        note: `T-12 actual expense load${ttmNote} — ${Math.round(t12Er * 100)}% of EGI`,
        // The T-12's own figure, never the OM's: the SOURCE column credits
        // the document it was read from, as a rent roll's rows do (research
        // pass 40, M3: "OM — T-12 actual expense load …").
        doc: "T-12",
      }
    : {
        // Derived when the NOI it ties to came from the OM; an assumption when
        // the NOI itself was assumed.
        provenance: sources.inPlaceRentAnnual?.provenance === "derived" ? "derived" : "assumption",
        note: mostlyEmpty
          ? `Total opex to tie NOI (${Math.round(cd.expenseRatio * 100)}% of EGI ${classWord} default) — the class's ratio struck on a mostly empty building's income (${Math.round(statedOcc! * 100)}% occupied as stated), though its taxes and insurance do not fall with occupancy — enter the T-12's expenses`
          : `Total opex to tie NOI (${Math.round(cd.expenseRatio * 100)}% of EGI ${classWord} default) — break out from a T-12`,
      };
  mark("mgmtFeePct", "assumption", "Folded into operating expenses — split out if you track it");
  mark("reservesPsf", "assumption", `${classWord} default $${cd.reservesPsf.toFixed(2)}/SF/yr`);
  if (budgetRead) {
    mark(
      "capitalImprovementsYr1",
      // The program's doors times a door's cost is two stated figures
      // multiplied, not a figure the memorandum states.
      budgetRead.program ? "derived" : "extracted",
      // sourceText() already prefixes "OM p. N —", so the note names the line.
      `${budgetRead.label}${
        budgetRead.allIn
          ? " less the price"
          : budgetRead.isTotal
            ? " (stated all-in; the OM gives no price to take out of it)"
            : ""
      }${
        // A forward purchase (lib/forward-purchase): the developer funds the
        // works and the price is all-in at delivery, which the note says —
        // the model still charges the budget, an owner's call to change.
        forwardDeal
          ? " — the developer's budget: on a forward purchase the developer funds the works and the price is all-in at delivery, yet this model charges it as the buyer's first-year capital; enter 0 to run the price alone"
          : " — spent in year 1 in this annual model; the OM's own timeline may run longer"
      }`,
      budgetRead.page,
    );
  } else if (repairsCapital != null) {
    mark(
      "capitalImprovementsYr1",
      "extracted",
      "PCA immediate repairs — the property condition report's work the building needs now, as stated — spent in year 1 in this annual model; a lender may escrow them at closing",
      reportsRead?.page || undefined,
    );
  } else if (pipCapital != null) {
    mark(
      "capitalImprovementsYr1",
      "extracted",
      "PIP cost — the brand's property improvement plan, as stated — spent in year 1 in this annual model; the brand's own schedule, and the rooms out of order while it runs, may differ",
      hotelRead?.pipPage || undefined,
    );
  } else {
    mark(
      "capitalImprovementsYr1",
      "assumption",
      strategy.kind === "stabilized" || strategy.kind === "unknown"
        ? "No capital plan in the OM — enter one if the PCA finds work"
        : forwardDeal
          ? "No construction budget is the buyer's: on a forward purchase the developer funds the works and the price is all-in at delivery"
          : `${withArticle(strategy.label.toLowerCase(), true)} deal with no budget in the OM — enter the construction / renovation cost; yield on cost is meaningless without it`,
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
  // A default of none is a claim, said as one in the SOURCE column: the
  // costs the model holds at zero (none is ever read from a document), and
  // the income its one rent line carries — that line is grossed up from the
  // NOI, so a recovery or other income added beside it counts twice.
  mark("acqFeePct", "assumption", "None modelled — enter it with its cap: the fee is the lesser of the two");
  mark("acqFeeCap", "assumption", "None modelled — the fee is the lesser of its % of the price and this cap, so enter both");
  mark("transferTaxPct", "assumption", "None modelled — enter the jurisdiction's transfer-tax rate where it levies one");
  mark("recordationTaxPct", "assumption", "None modelled — enter the jurisdiction's recordation-tax rate where it levies one");
  for (const key of ["buyerLegal", "lenderLegal", "thirdPartyReports", "miscClosing"] as const) {
    mark(key, "assumption", "None itemized — the general hold stands in for it; enter it to itemize");
  }
  for (const key of ["expenseRecoveriesAnnual", "otherRevenueAnnual"] as const) {
    mark(key, "assumption", "Folded into the potential gross revenue line — split it out of that line, never add it on top");
  }
  // Leasing capital is held at none too, and said so (research pass 40, M4:
  // the two rows printed $0.00 and 0.0% with nothing but how each is
  // charged). What a class should carry is the owner's.
  mark("tiPsf", "assumption", "None modelled — enter it to carry tenant improvements: the returns carry no leasing capital");
  mark("lcPct", "assumption", "None modelled — enter it to carry leasing commissions: the returns carry none");
  // The exit defaults to the OM's stated going-in cap (which cap it defaults
  // to is the owner's call). Where the model's own entry — its year-1 NOI
  // over its price, the Deal Summary's "Going-In Cap (Yr-1 NOI / Price)" —
  // sits 5 bps or more from it, the note names that too, so a compression
  // the default carries is seen (research pass 34). Never on a price that
  // did not buy the building, where no cap is struck on the price.
  const ownEntry = capPct && price > 0 && buildingPriceOf(extraction, price) != null ? noi / price : null;
  const ownEntryClause =
    capPct && ownEntry != null && Math.abs(ownEntry - capPct) >= 0.0005
      ? `; the model's own year-1 NOI over its price is ${(ownEntry * 100).toFixed(2)}%`
      : "";
  // With no cap stated the exit is the flat default, and where the model's
  // own entry — a stated price and a stated NOI, the price the building's —
  // sits 5 bps or more from it, the note names the gap (research pass 38;
  // lib/underwrite/cost-note `defaultExitGap`, which the playground says
  // under its tiles too). The default itself is the owner's.
  const defaultEntry =
    !capPct &&
    price > 0 &&
    sources.purchasePrice?.provenance !== "assumption" &&
    sources.inPlaceRentAnnual?.provenance !== "assumption" &&
    buildingPriceOf(extraction, price) != null
      ? noi / price
      : null;
  const defaultGap = capPct ? null : defaultExitGap(0.06, defaultEntry);
  mark("exitCapPct", capPct ? "derived" : "assumption",
    capPct
      ? `Defaulted to ${capRangeWords ?? "the OM's stated going-in cap"}${ownEntryClause} — set your exit view`
      : defaultGap
        ? `${defaultGap} — set your exit view`
        : "Default 6.0% — set your exit view",
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
      unitNoun,
      interest: interestMeta(extraction),
      priceLabel,
      ...(grossedUpSharePct != null ? { grossedUpSharePct } : {}),
      // A development priced at its land, and a bulk condominium purchase's
      // units offered: what the workbook's per-unit yardsticks are of.
      ...(priceIsLand && statedPrice != null ? { priceIsLand: true } : {}),
      ...(condoUnitsOffered(extraction) != null ? { unitsOffered: condoUnitsOffered(extraction) } : {}),
      assumable: assumableMeta(extraction, inputs),
      sellerNote: sellerNoteMeta(extraction, inputs),
      leasehold: leaseholdMeta(extraction, inputs),
      affordable: affordableMeta(extraction),
      singleTenant: singleTenantMeta(extraction, inputs),
      roster: rosterMeta(extraction, inputs),
      valueAdd: valueAddMeta(extraction, inputs),
      taxAbatement: taxAbatementMeta(extraction, inputs),
      siteReports: reportsRead
        ? {
            line: siteReportsShortLine(reportsRead),
            read: siteReportsModelLine(reportsRead, { capitalYr1: capitalBudget, capitalIsRepairs: repairsCapital != null }),
          }
        : null,
      student: studentMeta(extraction, inputs),
      mh: mhMeta(extraction, inputs),
      storage: storageMeta(extraction, inputs),
      regulation: regulationMeta(deal?.regulation, inputs),
      forward: forwardMeta(extraction, inputs, noi, sources.inPlaceRentAnnual?.provenance === "assumption"),
      mixedUse: mixedUseMeta(extraction, inputs),
      goingConcern: goingConcernMeta(extraction, inputs, noi, sources.inPlaceRentAnnual?.provenance === "assumption"),
      condo: condoMeta(extraction, inputs),
      sandwich: sandwichMeta(extraction, inputs),
      sale: saleFloor ? { line: saleShortLine(saleFloor), read: saleCeilingRead(extraction, inputs) } : null,
      hotel: hotelRead
        ? {
            line: hotelShortLine(hotelRead),
            read: hotelModelLine(hotelRead, { holdMonths: inputs.holdMonths, capitalYr1: capitalBudget, capitalIsPip: pipCapital != null }),
          }
        : null,
      ...(t12Er == null ? { defaultExpenseRatio: { ratio: cd.expenseRatio, classWord } } : {}),
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
