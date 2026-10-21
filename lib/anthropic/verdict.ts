import "server-only";
import { compactUsd } from "@/lib/money";
import { z } from "zod";
import { screenOutputFormat } from "./output-format";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, verdictInstruction } from "./prompts";
import { todayLine } from "./today";
import {
  assessPlausibility,
  findPricedMetric,
  inferStrategy,
  isForwardPurchase,
  isOutdoorStorageYard,
  isPlanDeal,
  planSummary,
  planWithBasisChecked,
  plausibilityNote,
  unitCountFromMetrics,
  type DealStrategy,
} from "@/lib/deal-strategy";
import { buildingSfFromMetrics, buyBoxCoverage, foldBuyBoxChecks, parsePrice, priceRange, priceRefusal, screenYearOf, type BuyBoxCheck } from "@/lib/criteria";
import { checkedSentence } from "@/lib/fit-label";
import type { MandateScore } from "@/lib/mandate";
import { entityLoanWords, interestOf, isGpStake, isMasterLeasehold, isTenancyInCommon, isWholeShare } from "@/lib/interest";
import { readSale } from "@/lib/sale-terms";
import { condoUnitsOffered } from "@/lib/condo-units";
import { assetWords } from "@/lib/asset-words";
import { assetClassLabel } from "@/lib/asset-class";
import { basisTag as buildingBasisTag, shownAssetClass } from "@/lib/pipeline-slots";
import { placedBySentence } from "@/lib/placed-by";
import { currentBriefLine } from "@/lib/permit-split";
import { regionClause } from "@/lib/live-market-brief";
import type { StressTest } from "@/lib/stress-test-types";
import { HEADLINE_WITHHELD, VERDICT_WORD, decidesTag, headlineSentence, liveHeadline, rowMoveText, stressReadLine, evidenceWhen, sourceWithPage } from "@/lib/stress-test-words";
import type {
  ExtractionResult,
  FirstSignal,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "./types";

// The pages draw low → high on one track and print the cells "Low" and
// "High" (the deal page's range cards, the memo, the report, the shared
// screen), so the two are the smaller and the larger figure, never the
// conservative and the sponsor's end: an exit cap's conservative end is its
// higher figure, and "Low 5.75% / High 5.25%" drew no bar (research pass 18).
const ScreenRangeSchema = z.object({
  label: z.string(),
  low: z.string().describe("The smaller figure of the range, with its unit — whichever end is the conservative one."),
  base: z.string().describe("Your defensible pick, between low and high."),
  high: z.string().describe("The larger figure of the range, with its unit."),
  source: z.string(),
  basis: z.string().describe("One line: which end is the conservative one, and what drives the spread."),
  confidence: z.enum(["high", "medium", "low"]),
});

const DealKillerSchema = z.object({
  lever: z.enum(["basis", "exit", "debt"]),
  read: z.string(),
  risk: z.string(),
});

const VerdictSchema = z.object({
  verdict: z.enum(["pass", "caution", "pass_on"]),
  reason: z.string(),
  topRisks: z.array(z.string()),
  nextSteps: z.array(z.string()),
  screen: z.object({
    ranges: z.array(ScreenRangeSchema),
    dealKillers: z.array(DealKillerSchema),
    sensitivity: z.array(
      z.object({
        scenario: z.enum(["conservative", "base", "sponsor"]),
        call: z.enum(["pass", "caution", "pass_on"]),
        note: z.string(),
      }),
    ),
  }),
});

export interface VerdictInputs {
  extraction: ExtractionResult | null;
  /** the first signal, read beside the extraction for the deal's kind
   *  (lib/deal-strategy `inferStrategy`) — as the deal context, the
   *  challenger and the market figures read it, so the verdict never calls
   *  stabilized a deal every other step read as a plan */
  firstSignal?: FirstSignal | null;
  /** the class the deal row is filed as ("auto" where the analyst left it
   *  to the deck), read with the extraction's through `shownAssetClass` for
   *  the noun the building's basis is said in */
  assetClass?: string | null;
  /** what the screen established about the deal (lib/deal-context) — the
   *  same text the comps, the market check, Ask and the reconciler read,
   *  built once by the pipeline: what is being sold, how it is sold, the
   *  kind, the plan's figures, the flood zone */
  dealContext?: string | null;
  challenges: ChallengerResult | null;
  comps: BrokerCompsResult | null;
  reconciliation: ReconciliationResult | null;
  market: MarketResult | null;
  /** the buyer's standing criteria, pre-formatted one per line (optional) */
  buyBox?: string[] | null;
  /** the code's checks of this deal against that box — the deal page's own
   *  read (lib/buy-box-chip `dealCheckSource`, lib/criteria
   *  `evaluateBuyBox`): each criterion's call in the code's own sentence,
   *  the red lines it trips (lib/mandate `evalDealbreakers`) and the
   *  mandate-fit score beside them (lib/mandate `scoreMandateFit`), whose
   *  cash-on-cash floor and red lines the coverage counts — so the verdict
   *  judges fit on the calls the page's chip shows rather than re-deriving
   *  them; absent with no box */
  buyBoxChecks?: { checks: BuyBoxCheck[]; tripped: string[]; mandate?: MandateScore | null } | null;
  /** the latest published rates, dated, with the spread the site's model
   *  adds for the deal's class (lib/debt-index `ratesPromptLine`) — the line
   *  the challenger is handed; absent where the table seeds nothing */
  ratesLine?: string | null;
  /** the OM's assumptions tested in code (lib/stress-test), built by the
   *  pipeline before this step from the stored results, the deal's
   *  documents and the model it could derive: each row's figures and the
   *  return's move, the engine's own, which the verdict cites and never
   *  estimates; absent on a caller that built none */
  stressTest?: StressTest | null;
}

/** The stress test's section of the brief: "## STRESS TEST, STRUCK IN CODE"
 *  (exported for its test). */
export const STRESS_SECTION_HEADING = "## STRESS TEST, STRUCK IN CODE";

/**
 * The stress test as the synthesizer reads it: one line a row — the key, the
 * verdict word, what the OM says with its page, every piece of evidence
 * with its publisher and date, the gap in the assumption's own unit, the
 * return's move (the engine's own run of the model with that one input
 * swapped) and the challenger's question — then the instruction: the moves
 * are the engine's, cited by figure and date and never estimated.
 */
export function stressSection(test: StressTest): string[] {
  const lines: string[] = [stressReadLine(test)];
  // The headline, struck in code: the OM's case against the evidence's,
  // the gap split by assumption (lib/stress-test `stressHeadline`), which
  // the call may cite as it stands.
  if (liveHeadline(test)) lines.push(`HEADLINE (the engine's, two runs and a Shapley split): ${headlineSentence(test)}`);
  else if (test.impactsWithheld) lines.push(`HEADLINE: ${HEADLINE_WITHHELD}`);
  for (const r of test.rows) {
    const page = r.omSays.page != null ? ` [p. ${r.omSays.page}]` : "";
    const evidence = r.evidence.length
      ? r.evidence
          .map((e, i) => {
            // What the evidence is, after its publisher and date — left out
            // where the publisher already says it ("a rule of thumb").
            const kind =
              e.kind === "published"
                ? `the ${e.scope === "nation" ? "nation's" : e.scope === "state" ? "state's" : e.scope === "region" ? "Census region's" : "metro's"} figure`
                : e.kind === "document"
                  ? "the deal's own document"
                  : e.kind === "rule_of_thumb"
                    ? "a rule of thumb"
                    : "the memorandum's own figure";
            const when = evidenceWhen(e);
            // ONE figure decided the row (lib/stress-deciders): it is named
            // so, and every other piece as beside it, deciding nothing.
            const tag = decidesTag(r, i);
            // The memorandum's own page where one is validated, as the
            // panel and the report print it (`sourceWithPage`).
            return `${tag ? `[${tag.toUpperCase()}] ` : ""}${e.label}: ${e.text} (${sourceWithPage(e)}${when}${kind === e.publisher ? "" : `; ${kind}`})`;
          })
          .join("; ")
      : "no evidence with a figure or words could be read";
    const gap = r.gap ? r.gap.text : `unchecked — ${r.unchecked ?? "no figure to set against the OM's"}`;
    // A row that holds draws no re-run: its evidence side is the favourable one.
    const move = rowMoveText(test, r);
    const ask = r.challenge?.question ? ` The challenger asks: ${r.challenge.question}` : "";
    // The OM's text may end in its own full stop ("The OM states no loan rate.").
    // A plan deal's rows re-run its yield on total cost, said so by name.
    const measure = test.measure === "yield_on_cost" ? "The yield on cost" : "The levered IRR";
    lines.push(`- ${r.title} (${r.key}) [${VERDICT_WORD[r.verdict].toUpperCase()}] — OM says: ${r.omSays.text.replace(/\.$/, "")}${page}. Set against: ${evidence}. Gap: ${gap} ${measure}: ${move}${ask}`);
  }
  lines.push(
    "",
    test.impactsWithheld
      ? `${test.impactsWithheld} The rows carry the gaps alone: cite each gap by its figure and date, say in a reader's words that the return was not re-run for this deal and why, and never estimate a move.`
      : test.measure === "yield_on_cost"
        ? `The yield-on-cost moves above are the engine's own: the plan's stated stabilized NOI over its total cost (${test.forward ? "the price, the buyer's whole cost at delivery" : "the price plus the plan's budget"}), struck again with ONE figure moved by the evidence, in code — this is a value-add, lease-up, conversion or development deal, judged on its yield on total cost, so no levered IRR is re-run. Use them as they stand — never estimate a move yourself, never restate one as a levered return, and where a row says it has no re-run, say why in its own words. A row that holds carries no re-run: never cite a yield for it.${
            liveHeadline(test)
              ? " The HEADLINE's two yields on cost and its split are the engine's too: cite them as they stand, and never add the rows' moves up yourself."
              : ""
          }`
        : `The IRR moves above are the engine's own: the deal's derived model run again with ONE input swapped for the evidence's figure, in code. Use them as they stand — never estimate a move yourself, never restate one with other figures, and where a row says the model already runs at the evidence's figure, say that it moves nothing. A row that holds carries no re-run: never cite a return for it.${
          liveHeadline(test)
            ? " The HEADLINE's two returns and its split are the engine's too: cite them as they stand, and never add the rows' moves up yourself — each row starts from a different return, which is what the headline's one pair of runs answers."
            : ""
        }`,
    "Each tested row was decided on ONE figure, marked [DECIDES]; a piece marked [BESIDE IT, NOT DECIDING] is shown beside it and never the figure a row is held to, so never cite it as what the row was struck on. Lead the reason with the unsupported rows, then the stretched. Wherever a figure above decides a sentence — the reason, a screen range, a deal-killer's read, a next step — cite it by figure and date and name its publisher, the document or publisher being the one its own line names and the date written as that line writes it (the shape, not figures to use: \"the T-12's [its vacancy] for the twelve months to [its period end]\"; \"the rent roll's [its occupancy] as of [its date]\"; \"the Census Bureau's [its figure] for the metro, [the quarter its line states]\"): an unsupported figure is the range's conservative end, and the matching next step is what the broker must show to support the OM's figure. A row the test leaves unchecked has nothing in code to cite, and you say so if you raise it.",
  );
  return lines;
}

/** A check's call in words — never "pass", which is the verdict's own word
 *  for a deal worth more work. */
const CHECK_WORD: Record<BuyBoxCheck["status"], string> = {
  pass: "fits",
  near: "near miss",
  miss: "outside",
  unknown: "not checked",
};
const FOLD_WORD: Record<"fits" | "near" | "outside", string> = {
  fits: "inside the box on every criterion it could check",
  near: "near the box — a near miss and no outright miss",
  outside: "outside the box on at least one criterion",
};

// "$170k", "$40.8M" — as the deal context writes a figure (lib/deal-context).
const compact = (n: number): string => compactUsd(n);
const dollars = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const shareText = (pct: number): string => `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;

/**
 * The building's own basis as the code computes it, in one sentence (research
 * pass 18): the readers the pipeline card's basis and the comps' subject
 * tick read (lib/pipeline-slots `basisTag`, lib/comp-detail `subjectBasis` —
 * a range's top, a share's price grossed up to the whole), and on a plan deal
 * the plan's total cost a planned unit (lib/deal-strategy `planSummary`).
 * The brief used to print the asking price beside the unit count and leave
 * the division to the synthesizer: a 49% share's $20M over 240 units read
 * $83k a unit where the building's basis is $170k, a note's price is a
 * loan's, a preferred equity position's buys a rate and a redemption, and an
 * auction's starting bid is where the bidding opens. Each of those says what
 * the code computes, or that there is none and why.
 */
function buildingBasisLine(ex: ExtractionResult, strategy: DealStrategy, storedClass: string | null | undefined): string {
  const { kind, sharePct, entityLoan } = interestOf(ex);
  if (kind === "note") {
    return "THE BUILDING'S BASIS: none — this sells a loan, and its price is a loan's. No price per unit or per SF, no cap and no property return is struck on it; the collateral's own figures belong to the collateral's owner.";
  }
  // A preferred equity position (lib/position): its price buys a rate and a
  // redemption in the owning entity, so a property model's returns at that
  // price are the building's, never the position's.
  if (kind === "preferred_equity") {
    return "THE BUILDING'S BASIS: none — this sells a preferred equity position in the owning entity, and its price buys a preferred return and a redemption, never a slice of the building. No price per unit or per SF, no cap and no property return is struck on it: a property model run at that price returns the whole building's cash flows on it, which are the building's, not the position's. The position's return is its rate and its redemption — read by its yield to redemption at its price and by where its last dollar sits on the stated value.";
  }
  if (kind === "leased_fee") {
    return "THE BUILDING'S BASIS: none — the price buys the land under the ground lease, not the building, and is never divided over the building's units or area.";
  }
  // A share of the general partner's interest is a share of a share
  // (research pass 37): its percentage is never the entity's.
  if (kind === "partial_interest" && isGpStake(ex)) {
    return "THE BUILDING'S BASIS: none — this sells a share of the general partner's interest, a share of a share: its price buys the general partner's capital share and promote, never a slice of the building, and is never grossed up or divided over the whole building's units or area.";
  }
  if (kind === "partial_interest" && sharePct == null) {
    return "THE BUILDING'S BASIS: none — the OM states no percentage for the share, so the whole its price implies cannot be read, and the share's price is never divided over the whole building's units or area.";
  }
  // A master lease of the building, sublet (a sandwich position): the price
  // buys the position between the two rents, not the building (research
  // pass 38: the card had read its price over the building as "$20/SF").
  if (isMasterLeasehold(ex)) {
    return "THE BUILDING'S BASIS: none — this sells a master lease of the building, sublet to its tenants: the price buys the position between the master rent and the sublease income, not the building, and is never divided over the building's units or area.";
  }
  const words = assetWords(shownAssetClass(storedClass, ex));
  const noun = words.noun ?? { one: "unit", many: "units" };
  const metrics = ex.metrics ?? [];
  // The price row the basis divides — the same row the card's basis reads,
  // at the year the screen read the memorandum.
  const row = findPricedMetric(metrics, strategy.kind, screenYearOf(ex));
  // The figure alone: the line below says whose it is.
  const tag = buildingBasisTag(ex, strategy.kind, storedClass, { bare: true });
  if (isPlanDeal(strategy.kind)) {
    // A plan deal's basis is its total cost; the shell's or the land's price
    // over units that do not exist yet is no basis at all.
    // No all-in basis is handed on where the plausibility check finds it
    // outside the band (research pass 38: "$243 per planned unit").
    const plan = planWithBasisChecked(ex, strategy, planSummary(ex, strategy));
    // A forward purchase's total cost is its price, the buyer's whole cost
    // at delivery: the developer's budget is never added to it (research
    // pass 41 — "the land's price is never the basis" had been said of it).
    const deal = plan?.forward ? "forward purchase" : `${strategy.label.toLowerCase()} deal`;
    const cost = plan?.forward ? "the price, the buyer's whole cost at delivery" : "total cost";
    const never = plan?.forward
      ? "the price plus the developer's budget"
      : strategy.kind === "development"
        ? "the land's price"
        : "the price alone";
    const priceAlone = tag ? ` The price alone is ${tag}, before the works.` : "";
    if (plan?.basisWithheld) {
      return `THE BUILDING'S BASIS: on this ${deal} it is ${cost}, and none is handed on. ${plan.basisWithheld} No basis range is built on it.${priceAlone}`;
    }
    if (plan?.costPerUnit != null && plan.units != null && plan.totalCost != null) {
      return `THE BUILDING'S BASIS, computed in code: on this ${deal} it is ${cost} — ${compact(plan.totalCost)} over ${plan.units.toLocaleString("en-US")} planned ${noun.many} is ${compact(plan.costPerUnit)} per planned ${noun.one}, never ${never} over them.${priceAlone}`;
    }
    if (plan?.totalCost != null) {
      return `THE BUILDING'S BASIS: on this ${deal} it is ${cost}, ${compact(plan.totalCost)} all-in as computed in code; the OM states no planned count to set it per ${noun.one}, and ${never} is never the basis.${priceAlone}`;
    }
    // A share beside its entity's loan: the plan's own sentence on why.
    if (plan?.costWithheld) return `THE BUILDING'S BASIS: on this ${deal} it is ${cost}. ${plan.costWithheld}`;
    return `THE BUILDING'S BASIS: on this ${deal} it is ${cost}, which the code cannot compute from what the OM states; ${never} is never the basis.${priceAlone}`;
  }
  // A share beside the loan its entity carries: grossed up, its price is the
  // equity's whole, which no basis is struck on.
  // All of the entity's interests (a stated 100%, research pass 28): the
  // price is the whole's, nothing grossed up.
  const allInterests = isWholeShare(sharePct);
  // All the tenant-in-common interests are together the whole property, held
  // by no entity (the audit C3b LOW-1).
  const allWhat = isTenancyInCommon(ex) ? "all the tenant-in-common interests" : "all of the entity's interests";
  if (kind === "partial_interest" && entityLoan != null) {
    return allInterests
      ? `THE BUILDING'S BASIS: none — the price for ${allWhat} is the equity's whole, not the building's: the building's cost is that plus ${entityLoanWords(ex, compact(entityLoan))}, which the model does not add, so no price per unit or per SF and no cap is struck on it.`
      : `THE BUILDING'S BASIS: none — the ${isTenancyInCommon(ex) ? "interest's" : "share's"} price grossed up is the equity's whole, not the building's: the building's cost is that plus ${entityLoanWords(ex, compact(entityLoan))}, which the model does not add, so no price per unit or per SF and no cap is struck on it.`;
  }
  if (tag) {
    const range = row ? priceRange(row.value) : null;
    // A tenancy in common is title to the property, not a share of an
    // entity: its percentage is an undivided interest's (research pass 41).
    const share = isTenancyInCommon(ex) ? "interest" : "share";
    const what = allInterests
      ? isTenancyInCommon(ex)
        ? "the price for all the tenant-in-common interests, together the whole property, nothing grossed up"
        : "the price for all of the owning entity's interests, nothing grossed up"
      : sharePct != null
        ? `the whole the ${shareText(sharePct)} ${share}'s price implies`
        : range
          ? "the top of the price range the OM states, the end that does not flatter a return"
          : "the asking price";
    // A bulk condominium purchase's price is over the units it buys (the
    // card's own count, lib/condo-units), never the condominium's whole.
    const offered = words.basis === "sf" ? null : condoUnitsOffered(ex);
    const over =
      words.basis === "sf"
        ? "the building's area"
        : offered != null
          ? `the ${offered.toLocaleString("en-US")} ${offered === 1 ? noun.one : noun.many} offered`
          : `the OM's ${noun.one} count`;
    const never = sharePct != null && !allInterests ? ` The ${share}'s own price over the whole building is no basis.` : "";
    return `THE BUILDING'S BASIS, computed in code: ${tag} — ${what}, over ${over}.${never} Build the basis range on this figure.`;
  }
  const price = row ? parsePrice(row.value) : null;
  // A price row whose value is no price — a percentage, a share of a loan's
  // balance, a figure per unit (lib/criteria `priceRefusal`): said as
  // written, and nothing is divided by it (research pass 38: "6.25% cap
  // rate" read as a $6.25 price, then "the OM states no building area").
  const refused = row && price == null ? priceRefusal(row.value) : null;
  if (row && refused) {
    return `THE BUILDING'S BASIS: none — the OM's ${row.label.trim().toLowerCase()} reads “${row.value.trim()}”, ${refused}, not the price, so the deal reads as unpriced and no basis is computed from it.`;
  }
  const sale = price == null ? readSale(ex) : null;
  if (sale?.startingBid != null) {
    const allIn =
      sale.floorAllIn != null && sale.floorAllIn !== sale.startingBid
        ? ` (${dollars(sale.floorAllIn)} all-in with the buyer's premium)`
        : "";
    return `THE BUILDING'S BASIS: none — the OM states no asking price, and the ${dollars(sale.startingBid)} starting bid${allIn} is where the bidding opens, not a price: a cap or a return struck on it is the ceiling of what the building yields and a basis struck on it the floor of what it costs, never the deal's.`;
  }
  if (price == null) return "THE BUILDING'S BASIS: none — the OM states no asking price to compute one from.";
  // A basis the plausibility check finds outside any market's band is never
  // handed on as one, nor a range built on it (research pass 38: "$2k/unit
  // … Build the basis range on this figure" beside the check's own finding).
  const over = words.basis === "sf" ? "the building's area" : `the OM's ${noun.one} count`;
  if (assessPlausibility(ex, strategy).some((f) => f.code === "basis_out_of_band")) {
    return `THE BUILDING'S BASIS: none handed on — the price over ${over} falls outside the band any market trades at, which the plausibility check reads as a misread of the price or of ${over}; no basis range is built on it.`;
  }
  if (words.basis === "sf" && isOutdoorStorageYard(ex.assetClass)) {
    return "THE BUILDING'S BASIS: none — an outdoor-storage yard trades by the usable acre, and its price over the shop building on it is no basis.";
  }
  if (words.basis === "acre") {
    return "THE BUILDING'S BASIS: none — the price buys land, which trades by the acre or by the buildable foot, and the code strikes no basis on it.";
  }
  // Only where the memorandum states no count or area does the line say so.
  const stated = words.basis === "sf" ? buildingSfFromMetrics(metrics) != null : unitCountFromMetrics(metrics) != null;
  if (stated) return `THE BUILDING'S BASIS: none computed — the ${dollars(price)} price over ${over} is no basis the code strikes.`;
  return `THE BUILDING'S BASIS: none computed — the OM states no ${words.basis === "sf" ? "building area" : `${noun.one} count`} to set the price over.`;
}

/** Roll the gathered analysis up into one readable brief for the synthesizer.
 *  Exported for its test; the pipeline calls `synthesizeVerdict`. */
/** The last `national` lines of a stored block are the nation's (the debt
 *  market, lessor rents, the insurance index, CRE prices): said, so the
 *  synthesizer never cites the 10-year as the metro's. */
function nationalNote(b: { lines: string[]; national?: number }): string {
  const nat = Math.min(Math.max(b.national ?? 0, 0), b.lines.length);
  return nat > 0
    ? nat === 1
      ? " The last line is the nation's figure, not the market's — it says so."
      : ` The last ${nat} lines are the nation's figures, not the market's — each says so.`
    : "";
}

/** Every line of a stored block the nation's: none of the market's own
 *  figures was current that day. */
const noneOwn = (b: { lines: string[]; national?: number }): boolean => b.lines.length > 0 && (b.national ?? 0) >= b.lines.length;

export function buildBrief(input: VerdictInputs): string {
  const sections: string[] = [];

  // Deal identity first — the ranges must be grounded in the actual asset,
  // asset class, and submarket, not synthesized in a vacuum. The class is the
  // one every page shows (shownAssetClass: the analyst's where they filed
  // one, the deck's where they left it to Auto), so the line never names a
  // class the basis and the box's checks below are not in (research pass 41).
  const ex = input.extraction;
  const shownClass = ex ? assetClassLabel(shownAssetClass(input.assetClass, ex)) || ex.assetClass : "";
  sections.push(
    "## Deal",
    ex
      ? [
          `${ex.dealName ?? "(unnamed)"} — ${shownClass}${ex.market ? ` — ${ex.market}` : ""}`,
          ex.address ? `Address: ${ex.address}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "Not available.",
  );

  const strategy = ex ? inferStrategy(ex, input.firstSignal ?? null) : null;

  // What the screen established about the deal, checked in code, before a
  // single extracted figure — the deal context every step that reads the OM
  // after the extraction is handed (what is being sold, how it is sold, the
  // kind, the plan, the flood zone), and the building's own basis. A
  // share's price, a note's and the land's are not the building's, and an
  // auction's starting bid is not a price; the brief says so here, where the
  // other steps' instructions say it.
  const established = [
    input.dealContext?.trim() ?? "",
    ex && strategy ? buildingBasisLine(ex, strategy, input.assetClass) : "",
  ].filter(Boolean);
  if (established.length > 0) {
    sections.push("## What the screen established about the deal, checked in code", established.join("\n\n"));
  }

  // What kind of deal this is, the plan's own figures, and whether the
  // numbers tie — checked in code before the synthesizer reads a single
  // extracted number. On a conversion the stabilized NOI is the finished
  // building's, judged on yield on total cost; on a stabilized asset an NOI
  // above the price is a misread. The brief says which.
  if (ex && strategy) {
    const note = plausibilityNote(
      assessPlausibility(ex, strategy),
      strategy,
      planSummary(ex, strategy),
      ex,
      // The deal context above says the type, its summary and the plan's
      // figures: the note leaves them to it (research pass 41).
      !!input.dealContext?.trim(),
    );
    if (note) sections.push("## Deal strategy, the plan, and figures that do not tie", note);
  }

  // The OM's assumptions tested in code (lib/stress-test), before any
  // step's own words: the figures the reason, the ranges and the next
  // steps cite, and the return's moves — the engine's, never the
  // synthesizer's estimate. Appended inside the brief, which rides after
  // the instruction in the user turn: never in ANALYST_SYSTEM, so the
  // cached prefix never moves.
  if (input.stressTest) {
    sections.push(STRESS_SECTION_HEADING, stressSection(input.stressTest).join("\n"));
  }

  // The buyer's standing criteria — the verdict must judge fit against THEIR
  // box, not a generic investor's. Where the code has checked the deal
  // against it (lib/criteria `evaluateBuyBox`, with a note's, a share's and a
  // price range's own rules), the verdict is handed those calls and their
  // sentences, as the deal page's chip shows them, rather than the bare
  // criteria to re-derive a fit from — and told that any entry price it
  // names is its own estimate, since the code computes none.
  if (input.buyBox && input.buyBox.length) {
    const checks = input.buyBoxChecks?.checks ?? [];
    const tripped = input.buyBoxChecks?.tripped ?? [];
    const fold = foldBuyBoxChecks(checks);
    // How much of the box that call stands on, as the deal page's chip says
    // it ("2 of 4 checked"): a note's or an unpriced deal's fit is no fit on
    // the criteria the price decides — the score's cash-on-cash floor and
    // red lines counted with the checks.
    const covered = checkedSentence(buyBoxCoverage(checks, input.buyBoxChecks?.mandate ?? null));
    sections.push(
      "## The buyer's standing buy box",
      [
        ...input.buyBox.map((l) => `- ${l}`),
        ...(checks.length > 0
          ? [
              "",
              "The code's checks of this deal against the box, computed before you read this — the calls the deal page's buy-box chip shows. Use each call and its figure as it stands; never re-derive a check or recompute its figure:",
              ...checks.map((c) => `- ${c.label} — ${CHECK_WORD[c.status]}: ${c.detail}`),
              ...(fold ? [`The code's call across the checks: ${FOLD_WORD[fold]}.`] : []),
              ...(covered ? [covered] : []),
              ...(tripped.length > 0 ? [`Red lines the buyer set that this deal trips: ${tripped.join("; ")}.`] : []),
              "",
              "Judge this deal's fit on these checks: reference clear misses in the reason and topRisks, and if the deal fails the box on price or basis, say in nextSteps what entry price WOULD fit. The code computes no entry price: one you name is your own estimate — give its arithmetic and say it is yours. A deal can be well-underwritten and still be outside the box — say so plainly.",
            ]
          : [
              "Judge this deal's fit against these criteria explicitly: reference clear misses in the reason and topRisks, and if the deal fails the box on price/basis, say what entry price WOULD fit in nextSteps — the code computes no entry price, so one you name is your own estimate, and say so. A deal can be well-underwritten and still be outside the box — say so plainly.",
            ]),
      ].join("\n"),
    );
  }

  const cite = (page?: string) => (page ? ` [${page}]` : "");
  const basisTag = (b?: string) =>
    b === "in_place" ? " (in-place)" : b === "pro_forma" ? " (pro forma)" : "";

  sections.push(
    "## Extracted terms",
    input.extraction
      ? input.extraction.metrics
          .map(
            (m) =>
              `- ${m.label}: ${m.value}${basisTag(m.basis)}${cite(m.page)}${m.flagged ? " (flagged)" : ""}`,
          )
          .join("\n")
      : "Not available.",
  );

  // The challenger's own downside paragraph (`stressTest`) is not handed
  // over: a screen stored before 2026-10-20 carries return figures in it
  // that the challenger worked out without the engine, and the brief's
  // STRESS TEST, STRUCK IN CODE section above is the one place the
  // synthesizer reads a return's move from.
  sections.push(
    "## Assumption challenges",
    !input.challenges
      ? "Not available."
      : input.challenges.challenges.length === 0
        ? "None raised."
        : input.challenges.challenges
            .map(
              (c) =>
                `- [${c.severity}] ${c.assumption}${cite(c.page)}: ${c.challenge}`,
            )
            .join("\n"),
  );

  sections.push(
    "## Broker-comp scrutiny",
    input.comps
      ? [
          ...input.comps.saleComps.map(
            (c) =>
              `- Sale [${c.support}] ${c.name}${c.detail ? ` (${c.detail})` : ""}${cite(c.page)}: ${c.note}`,
          ),
          ...input.comps.leaseComps.map(
            (c) =>
              `- Lease [${c.support}] ${c.name}${c.detail ? ` (${c.detail})` : ""}${cite(c.page)}: ${c.note}`,
          ),
          ...input.comps.redFlags.map((f) => `- Red flag: ${f}`),
          `Summary: ${input.comps.summary}`,
        ].join("\n")
      : "Not available.",
  );

  sections.push(
    "## Reconciliation vs. the buyer's own model",
    input.reconciliation
      ? [
          ...input.reconciliation.rows.map(
            (r) =>
              `- ${r.metric}: OM ${r.omValue} vs. model ${r.myValue} — ${r.gap} (${r.direction})`,
          ),
          `Takeaway: ${input.reconciliation.takeaway}`,
        ].join("\n")
      : "Not provided — the buyer has not uploaded their own model yet.",
  );

  sections.push(
    "## Market plausibility check",
    input.market
      ? [
          ...input.market.checks.map(
            (c) =>
              `- ${c.assumption}${cite(c.page)}: OM says ${c.omSays}, typical ${c.typicalRange} (${c.assessment}) — ${c.note}`,
          ),
          `Summary: ${input.market.summary}`,
        ].join("\n")
      : "Not available.",
  );

  // The published figures the market check read (lib/live-market-brief),
  // dated — the metro's income side and the national debt market — so a
  // screen range or a next step that turns on one of them can name the
  // figure and its date as its source rather than a rule of thumb.
  const live = input.market?.liveBrief;
  if (live && live.lines.length > 0 && noneOwn(live)) {
    // Every line the nation's: none of the market's own figures was
    // current, and the section says so rather than "each is the state's"
    // (the pre-merge audit).
    const whose = live.grain === "state" ? `the state of ${live.metro}'s` : `the ${live.metro} market's`;
    sections.push(
      `## The nation's published figures the market check read on ${live.readOn} — none of ${whose} own was current${
        live.grain === "state" ? ", and the deal lies outside the metros the site tracks" : ""
      }`,
      [
        ...live.lines.map((l) => `- ${currentBriefLine(l)}`),
        `Each is dated and is the nation's, not ${live.grain === "state" ? "the state's, any metro's" : "the metro's"}, the submarket's or the building's. Where a screen range, a risk or a next step turns on one of these, name the figure and its date as its source, and say it is the nation's.${
          live.grain === "state" ? "" : placedBySentence(live.placedBy)
        }`,
      ].join("\n"),
    );
  } else if (live && live.lines.length > 0) {
    sections.push(
      live.grain === "state"
        ? `## The state of ${live.metro}'s published figures the market check read on ${live.readOn} — the deal lies outside the metros the site tracks`
        : `## The ${live.metro} market's published figures the market check read on ${live.readOn}`,
      [
        ...live.lines.map((l) => `- ${currentBriefLine(l)}`),
        (live.grain === "state"
          ? `Each is dated and is the state's, not any metro's, the submarket's or the building's${regionClause(live.lines)}. Where a screen range, a risk or a next step turns on one of these, name the figure and its date as its source, and say it is the state's.`
          : `Each is dated and is the metro's, not the submarket's or the building's${regionClause(live.lines)}. Where a screen range, a risk or a next step turns on one of these, name the figure and its date as its source.${placedBySentence(live.placedBy)}`) +
          nationalNote(live),
      ].join("\n"),
    );
  }
  // A portfolio across markets (#413): each other market's figures under
  // its own heading, saying how many of the properties sit there, so a
  // range or a risk that turns on one names the market it belongs to.
  for (const o of input.market?.otherBriefs ?? []) {
    if (o.lines.length === 0) continue;
    const pf = o.portfolio;
    const where = pf ? `, where ${pf.here} of the portfolio's ${pf.of} properties ${pf.here === 1 ? "sits" : "sit"}` : "";
    if (noneOwn(o)) {
      sections.push(
        `## The nation's published figures, read on ${o.readOn} — none of ${o.grain === "state" ? `the state of ${o.metro}'s` : `the ${o.metro} market's`} own was current${where}`,
        [
          ...o.lines.map((l) => `- ${currentBriefLine(l)}`),
          "Each is dated and is the nation's, not that market's, never the portfolio's. Where a range, a risk or a next step turns on one, name the figure and its date, and say it is the nation's.",
        ].join("\n"),
      );
      continue;
    }
    sections.push(
      o.grain === "state"
        ? `## The state of ${o.metro}'s published figures${where}, read on ${o.readOn}`
        : `## The ${o.metro} market's published figures${where}, read on ${o.readOn}`,
      [
        ...o.lines.map((l) => `- ${currentBriefLine(l)}`),
        `Each is dated and is ${o.grain === "state" ? "the state's" : "the metro's"}${regionClause(o.lines)} — it speaks for the properties in ${o.metro} alone, never for the portfolio or for another market's properties. Where a range, a risk or a next step turns on one, name the figure, its date and its market.` +
          nationalNote(o),
      ].join("\n"),
    );
  }

  // The latest published rates the site's model prices its debt off, and
  // the spread it adds for the deal's class (lib/debt-index) — the line the
  // challenger is handed — so the debt deal-killer and any financing range
  // are read against a dated index and a named screening default, never a
  // rate or a spread remembered as current.
  const rates = input.ratesLine?.trim();
  if (rates) sections.push("## The latest published rates", rates);

  return sections.join("\n\n");
}

/**
 * The one-screen call. Synthesizes every prior step (it reads the gathered
 * analysis, not the PDF) into a pass / caution / pass_on with the reason, top
 * risks, and next steps. Reasoning model. Re-run whenever a new step lands
 * (e.g. after the buyer reconciles their model) so the verdict stays current.
 */
export async function synthesizeVerdict(
  input: VerdictInputs,
): Promise<VerdictResult> {
  const client = getAnthropic();
  // A forward purchase reads the three deal-killers on the purchase's terms,
  // as the challenger, the comps and the market check do: the deal's kind
  // read with the first signal, as the brief reads it.
  const ex = input.extraction;
  const forward = !!ex && isForwardPurchase(ex, inferStrategy(ex, input.firstSignal ?? null));

  const out = await structured("The verdict", () => client.messages.parse({
    model: MODELS.verdict,
    max_tokens: MAX_TOKENS.verdict,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: verdictInstruction(forward) },
          {
            type: "text",
            text: `Here is the gathered analysis to synthesize:\n\n${buildBrief(
              input,
            )}`,
          },
          // Today's date, which every dated figure in the brief is read
          // against (lib/anthropic/today).
          { type: "text", text: todayLine() },
        ],
      },
    ],
    output_config: { format: screenOutputFormat(VerdictSchema) },
  }));
  return out;
}
