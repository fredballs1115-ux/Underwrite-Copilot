"use client";

import { useMemo, useState } from "react";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import { costAssumptionsLine, defaultExitGap, yearOneCapitalLine } from "@/lib/underwrite/cost-note";
import { PLAN_RETURNS_CAVEAT } from "@/lib/underwrite/plan-caveat";
import { NO_IRR_WHY, noIrrText } from "@/lib/underwrite/no-irr";
import { modelLoanCoverageLine } from "@/lib/sizer-terms";
import {
  sliderValues,
  runScenario,
  yearOneNoi,
  fmtPct,
  fmtX,
  fmtEm,
  fmtBpsDelta,
  fmtPtDelta,
  type ScenarioMetrics,
} from "@/lib/underwrite/playground";
import { METRIC_FIND, type BuyBox } from "@/lib/criteria";
import { scoreMandateFit } from "@/lib/mandate";
import { BUY_BOX_CHIP_CLS, buyBoxRead } from "@/lib/buy-box-chip";
import { solveMaxBid, timesWords, type BidFloors, type MaxBidSolution } from "@/lib/underwrite/solver";
import {
  MISREAD_WORD,
  misreadPageLine,
  nearlyVacantPageLine,
  nearlyVacantWord,
  placeholderPageLine,
  placeholderReason,
  type ModelSources,
} from "@/lib/underwrite/report-grid";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import type { PlausibilityFinding } from "@/lib/deal-strategy";

/** Everything the playground needs, computed server-side once. */
export interface PlaygroundData {
  inputs: UnderwriteInputs;
  dealAssetClass: string;
  /** the same source the buy-box check judges (extraction/first-signal) */
  checkSource: {
    assetClass?: string;
    market?: string;
    address?: string;
    metrics: { label: string; value: string }[];
  } | null;
  box: BuyBox | null;
  /** the deal's strategy kind from the derived model (stabilized / value_add /
   *  conversion …). A plan deal's price ⇄ cap control says what its cap is. */
  strategy?: string | null;
  /** where each of the model's inputs came from (lib/underwrite/inputs): a
   *  price or a year-1 NOI the model had to assume makes its returns a
   *  placeholder's, which the tiles and the max bid withhold, as the full
   *  report leaves them out (lib/underwrite/report-grid
   *  `placeholderReturnsLine`); absent, the returns stand as before */
  sources?: ModelSources | null;
  /** what the price buys, read by the compare table's rule on this model
   *  (lib/compare-interest `modelReturnsRead`): a note's, a preferred
   *  equity position's, or a share's beside its entity's loan or of no
   *  stated percentage — returns the price did not buy, withheld with its
   *  line, as the first-draft card withholds them; and a leasehold's whose
   *  lease ends inside the hold, withheld with the leasehold card's own
   *  sentence (research pass 38); absent, they stand */
  interest?: ModelReturnsRead | null;
  /** the occupancy the model read, decimal (the derived model's
   *  `meta.occupancyPct`): where the model runs the building 90% vacant or
   *  more, its returns, its cap and its max bid are withheld, the sentence
   *  naming the occupancy stated (lib/underwrite/report-grid
   *  `nearlyVacantReason`) */
  occupancyPct?: number | null;
  /** the plausibility check's findings on the memorandum's figures (lib/
   *  deal-strategy `assessPlausibility`, the panel under the deal's header):
   *  while a high one or an implied cap under the floor stands, the tiles
   *  and the max bid are withheld with its claim (lib/underwrite/report-grid
   *  `misreadPageLine`); absent, they stand */
  findings?: PlausibilityFinding[] | null;
  /** whether the price is the building's (lib/deal-strategy
   *  `buildingPriceOf`; the derived model's `meta.interest.basisWithheld` is
   *  none): only then is the model's own entry — its year-1 NOI over its
   *  price — set against a default exit cap under the tiles (lib/underwrite/
   *  cost-note `defaultExitGap`), as the exit's SOURCE note sets it; absent,
   *  it is */
  buildingPriced?: boolean;
  /** the model's name for its price where it is not the price as stated for
   *  what is sold (the derived model's `meta.priceLabel`: "Whole Price (49%
   *  share grossed up)"): the price field says it, never "Purchase price"
   *  over a figure the share does not cost (research pass 40, M7); absent,
   *  the field reads "Purchase price" */
  priceLabel?: string | null;
  /** the share of the whole a partial interest's price buys, as the
   *  memorandum states it (lib/interest `interestOf`), where the model runs
   *  the whole it grosses the price up to: the max bid states the share's
   *  bid, the whole's times the share, beside the whole's; absent where no
   *  percentage is stated or the price is the whole's */
  sharePct?: number | null;
  /** what that share is called in the bid's words: "interest" on an
   *  undivided interest held as a tenant in common, which is title to the
   *  property and never an entity's share (lib/interest `isTenancyInCommon`,
   *  research pass 37, audit C4 L4), as the price label names it; absent,
   *  "share" */
  shareNoun?: "share" | "interest";
}

const PLAN_KINDS = new Set(["value_add", "lease_up", "conversion", "development"]);

const finite = (n: number | null): n is number => n != null && Number.isFinite(n);

/** The levered IRR as a tile says it: the rate, or why none solved — "no
 *  IRR: the sale does not repay the loan" where a dash stood (research pass
 *  38, lib/underwrite/no-irr). */
const irrText = (m: ScenarioMetrics): string => (finite(m.leveredIrrPct) ? fmtPct(m.leveredIrrPct) : m.noIrr ? noIrrText(m.noIrr) : fmtPct(null));

/** Swap the scenario's computed IRR / CoC into the metric set the mandate
 *  score reads, replacing the OM's broker figures — same scorer, model basis.
 *  A return the model could not compute swaps nothing: the memorandum's own
 *  row stays, so the score never loses a dimension the chip's line then
 *  calls "the memorandum's figures". */
export function withScenarioReturns(
  metrics: { label: string; value: string }[],
  irrDec: number | null,
  cocDec: number | null,
): { label: string; value: string }[] {
  const swapIrr = finite(irrDec);
  const swapCoc = finite(cocDec);
  const out = metrics.filter(
    (m) =>
      !(swapIrr && METRIC_FIND.irr.inc.test(m.label)) &&
      !(swapCoc && METRIC_FIND.coc.inc.test(m.label)),
  );
  if (swapIrr) out.push({ label: "IRR", value: `${(irrDec * 100).toFixed(1)}%` });
  if (swapCoc) out.push({ label: "Cash-on-cash", value: `${(cocDec * 100).toFixed(1)}%` });
  return out;
}

/**
 * The Sensitivity Playground (Feature 2): three levers over the deal's
 * underwriting model, recomputed in-browser on every drag — returns, and the
 * mandate verdict + fit score, move live. Pure math (the tested engine); the
 * LLM pipeline is never re-run from here. On a plan deal it says its returns
 * are the screening model's (PLAN_RETURNS_CAVEAT, lib/underwrite/plan-caveat,
 * which the workbook's Deal Summary prints too).
 */
export function SensitivityPlayground({ data }: { data: PlaygroundData }) {
  const { inputs, dealAssetClass, checkSource, box } = data;
  const planDeal = PLAN_KINDS.has(data.strategy ?? "");
  // Slider stops are fixed by the base model; each lever carries its own
  // base index (range ends can collapse when the base sits near a bound).
  const caps = useMemo(() => sliderValues("exitCapPct", inputs.exitCapPct), [inputs]);
  const growths = useMemo(
    () => sliderValues("rentGrowthPct", inputs.rentGrowthPct),
    [inputs],
  );
  const vacs = useMemo(() => sliderValues("vacancyPct", inputs.vacancyPct), [inputs]);

  const [capIdx, setCapIdx] = useState(caps.baseIdx);
  const [growthIdx, setGrowthIdx] = useState(growths.baseIdx);
  const [vacIdx, setVacIdx] = useState(vacs.baseIdx);
  // Your price: null = the modeled price. Typing a price (or a going-in cap,
  // its mirror) reprices the WHOLE model — debt, equity, fees, and every
  // metric below recompute, exactly like re-running the screen at that basis.
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  // If the underlying model changes (re-screen, actuals fold-in), the stop
  // lists are rebuilt — snap back to the NEW base during render (the React
  // "adjust state when props change" idiom); a stale index may not even
  // exist in the new list.
  const [prevStops, setPrevStops] = useState(caps);
  if (prevStops !== caps) {
    setPrevStops(caps);
    setCapIdx(caps.baseIdx);
    setGrowthIdx(growths.baseIdx);
    setVacIdx(vacs.baseIdx);
    setPriceOverride(null);
  }
  const dirty =
    capIdx !== caps.baseIdx ||
    growthIdx !== growths.baseIdx ||
    vacIdx !== vacs.baseIdx ||
    priceOverride != null;

  // What the model had to assume (lib/underwrite/inputs): a placeholder
  // price until the reader types one, an assumed NOI whatever price is
  // typed. Its returns are then a placeholder's — the full report leaves
  // them out, and the tiles and the max bid here are withheld on the same
  // rule (lib/underwrite/report-grid), the reason said over them.
  const sources = data.sources ?? null;
  const pricePlaceholder = sources?.purchasePrice?.provenance === "assumption";
  // A price backed out of the memorandum's NOI of zero or less over its cap
  // is no price (lib/underwrite/inputs `noPrice`, research pass 38): never
  // shown, and the field waits for the reader's as over the placeholder.
  const noPrice = sources?.purchasePrice?.noPrice != null;
  const priceMissing = pricePlaceholder || noPrice;
  const priceEntered = priceOverride != null;
  // And what the price buys (lib/compare-interest): a note's or a position's
  // model runs the building at a price that did not buy it, so its returns
  // are withheld whatever price is typed — the first-draft card's rule; and
  // a leasehold whose lease ends inside the hold sells a building that has
  // reverted (research pass 38), said by when ("lease ends in year 3").
  const own = data.interest?.withheld ?? null;
  const ownWord = own ? (data.interest?.word ?? own) : null;
  // A building the model runs 90% vacant or more (research pass 38): its
  // rent line is the occupied space's revenue grossed up through the
  // vacancy, so a step of the lever moves the NOI by a multiple, and no
  // return, cap or bid is struck on it.
  const vacantWord = nearlyVacantWord(inputs);
  // And figures the plausibility check finds do not tie (lib/deal-strategy
  // `findingWithholdsReturns`: a high finding, or an implied cap under the
  // floor — an NOI stated a month at a time): returns built on them would
  // be a misread's, whatever price is typed.
  const misread = misreadPageLine(data.findings, { maxBid: false }) != null;
  const placeholder = placeholderReason(inputs, sources, { priceEntered }) != null;
  const withheld = own != null || placeholder || vacantWord != null || misread;
  // The base case, at the modelled price, is a placeholder's wherever the
  // model assumed either figure: a moved lever is then set against nothing.
  const baseWithheld = own != null || placeholderReason(inputs, sources) != null || vacantWord != null || misread;
  const compare = dirty && !baseWithheld;
  const naWord =
    ownWord ??
    (placeholder
      ? priceMissing && !priceEntered
        ? "no price"
        : noPrice
          ? "no income"
          : "assumed NOI"
      : (vacantWord ?? (misread ? MISREAD_WORD : "")));
  // No cap is struck on year-1 NOI where the price did not buy the
  // building, where the NOI is the model's assumption (an assumed 6% of the
  // price printed "6.00%" on every such deal), or where the building runs
  // nearly vacant: the field says which (research pass 38). A lease that
  // ends inside the hold leaves year 1 inside it: its cap stands.
  const noiAssumed = sources?.inPlaceRentAnnual?.provenance === "assumption";
  // No cap on no price, nor on an NOI of zero or less at a price typed.
  const capNa =
    (own !== "lease" ? ownWord : null) ??
    (noPrice ? (priceEntered ? "no income" : "no price") : null) ??
    (noiAssumed ? "assumed NOI" : null) ??
    vacantWord;

  // The EFFECTIVE base is the sliders' base stops (clamped into physical
  // range), so a degenerate derived input can't make the resting metrics
  // disagree with what the levers say they're at.
  const base = useMemo(
    () =>
      runScenario(inputs, {
        exitCapPct: caps.values[caps.baseIdx],
        rentGrowthPct: growths.values[growths.baseIdx],
        vacancyPct: vacs.values[vacs.baseIdx],
      }),
    [inputs, caps, growths, vacs],
  );
  const current = useMemo(
    () =>
      dirty
        ? runScenario(inputs, {
            exitCapPct: caps.values[capIdx],
            rentGrowthPct: growths.values[growthIdx],
            vacancyPct: vacs.values[vacIdx],
            ...(priceOverride != null ? { purchasePrice: priceOverride } : {}),
          })
        : base,
    [inputs, caps, growths, vacs, capIdx, growthIdx, vacIdx, priceOverride, dirty, base],
  );

  // Year-one NOI at the current vacancy lever — the price <-> going-in-cap
  // inversion pivots on it (price never enters NOI).
  const noiY1 = useMemo(
    () => yearOneNoi(inputs, { vacancyPct: vacs.values[vacIdx] }),
    [inputs, vacs, vacIdx],
  );

  // Live mandate fit on the header chip's own rule (lib/buy-box-chip), with
  // the model's IRR/CoC swapped in for the memorandum's. Compared against
  // the playground's own base (also model-based) so the delta isolates the
  // sliders, not the OM-vs-model difference. The memorandum's own read —
  // the header's number — is carried beside it and never folded into it:
  // the two score different figures, and the chip says which it scores.
  const score = useMemo(() => {
    if (!box || !checkSource) return null;
    // A withheld return swaps nothing: the box scores the memorandum's own
    // figures in its place, and the chip's line says so.
    const at = (m: ScenarioMetrics, swap: boolean) =>
      buyBoxRead(
        dealAssetClass,
        {
          ...checkSource,
          metrics: swap ? withScenarioReturns(checkSource.metrics, m.leveredIrrPct, m.cocYr1Pct) : checkSource.metrics,
        },
        box,
      );
    const b = at(base, !baseWithheld);
    const c = dirty ? at(current, !withheld) : b;
    if (c.mandate?.score == null || !c.mandate.verdict) return null;
    // The returns the box scores that the model, not the memorandum, put
    // in: a floor the box does not set, or a return with no root, swaps
    // nothing, and the chip must not claim it.
    const m = dirty ? current : base;
    const scored = withheld
      ? []
      : [
          box.minIrrPct != null && finite(m.leveredIrrPct) ? "IRR" : null,
          box.minCoCPct != null && finite(m.cocYr1Pct) ? "cash-on-cash" : null,
        ].filter((s): s is string => s != null);
    return {
      chip: c.chip,
      score: c.mandate.score,
      base: b.mandate?.score ?? null,
      scored,
      onMemorandum: scoreMandateFit(dealAssetClass, checkSource, box).score,
    };
  }, [box, checkSource, dealAssetClass, base, current, dirty, withheld, baseWithheld]);

  // Max bid: the highest price that still clears the box's return floors,
  // solved under the CURRENT slider scenario — drag exit cap out 50bps and
  // watch your number drop. Pure engine (grid + bisection), ~2ms per solve.
  const floorsSet = !!box && (box.minIrrPct != null || box.minCoCPct != null || box.minCapPct != null);
  // Where the model's price is a placeholder, the bid is measured against
  // the price the reader typed, never against the placeholder.
  const bidAgainst = priceMissing && priceOverride != null ? priceOverride : null;
  const bid = useMemo(() => {
    // A bid solved on a placeholder's returns is the placeholder's (the
    // report leaves it out too).
    if (!box || withheld) return null;
    const floors: BidFloors = {
      ...(box.minIrrPct != null ? { minIrr: box.minIrrPct / 100 } : {}),
      ...(box.minCoCPct != null ? { minCoc: box.minCoCPct / 100 } : {}),
      ...(box.minCapPct != null ? { minCap: box.minCapPct / 100 } : {}),
    };
    if (floors.minIrr == null && floors.minCoc == null && floors.minCap == null)
      return null;
    return solveMaxBid(bidAgainst != null ? { ...inputs, purchasePrice: bidAgainst } : inputs, floors, {
      exitCapPct: caps.values[capIdx],
      rentGrowthPct: growths.values[growthIdx],
      vacancyPct: vacs.values[vacIdx],
    });
  }, [box, withheld, bidAgainst, inputs, caps, growths, vacs, capIdx, growthIdx, vacIdx]);

  const reset = () => {
    setCapIdx(caps.baseIdx);
    setGrowthIdx(growths.baseIdx);
    setVacIdx(vacs.baseIdx);
    setPriceOverride(null);
  };

  // The DSCR the tile shows, against the coverage the debt sizer tests —
  // none where the tile withholds it.
  const coverageLine = withheld ? null : modelLoanCoverageLine(current.dscrYr1, inputs.ltc);
  // What the multiple and the year-1 return are net of, where the model
  // spends capital in year 1 (lib/underwrite/cost-note).
  const capitalLine = yearOneCapitalLine(inputs.capitalImprovementsYr1);
  // Where the memorandum states no going-in cap, the exit at rest is the
  // model's default: its gap to the model's own entry — the year-1 NOI over
  // the price the tiles run on, both the memorandum's — said under the tiles
  // as the exit's SOURCE note says it (research pass 38: a 25.1% IRR rode
  // 200 bps of compression nobody chose). Only while the exit lever sits on
  // the default, and never over withheld tiles.
  const exitDefault =
    !withheld &&
    capIdx === caps.baseIdx &&
    data.buildingPriced !== false &&
    sources?.exitCapPct?.provenance === "assumption" &&
    sources.purchasePrice?.provenance !== "assumption" &&
    sources.inPlaceRentAnnual?.provenance !== "assumption";
  const atPrice = priceOverride ?? inputs.purchasePrice;
  const entry = exitDefault && atPrice > 0 ? noiY1 / atPrice : null;
  const exitGap = entry != null ? defaultExitGap(caps.values[capIdx], entry) : null;
  // Why the tiles are withheld, said over them: what the price buys (the
  // first-draft card's own line), then the report's placeholder reason.
  const interestLine =
    own != null && data.interest?.line
      ? `${data.interest.line}${floorsSet ? " The max bid, solved on them, is withheld too." : ""}`
      : null;
  // A placeholder's reason first; else, on a building the model runs nearly
  // vacant, that reason; else the finding that stands against the returns
  // (lib/underwrite/report-grid) — one sentence over the tiles.
  const withheldLine =
    placeholderPageLine(inputs, sources, { priceEntered, maxBid: floorsSet && own == null }) ??
    nearlyVacantPageLine(inputs, data.occupancyPct, { maxBid: floorsSet && own == null }) ??
    misreadPageLine(data.findings, { maxBid: floorsSet && own == null });

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Sensitivity playground
        </h2>
        <p className="text-xs text-muted">Live — no re-screen.</p>
      </div>
      {/* Which model this is, where a second model's returns can be seen
          beside it (the first-draft model's, on the Financials tab): the
          one the Excel workbook and the full report carry. */}
      <p className="mt-1 text-xs text-muted" data-qa="playground-model">
        The screening model — the one the Excel workbook and the full report carry.
      </p>

      <PriceCapControls
        basePrice={inputs.purchasePrice}
        noiY1={noiY1}
        value={priceOverride}
        onChange={setPriceOverride}
        planDeal={planDeal}
        pricePlaceholder={priceMissing}
        capWithheld={capNa}
        priceLabel={data.priceLabel ?? null}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Lever
          label="Exit cap"
          values={caps.values}
          baseIdx={caps.baseIdx}
          idx={capIdx}
          onChange={setCapIdx}
          display={(v) => fmtPct(v, 2)}
          deltaOf={fmtBpsDelta}
        />
        <Lever
          label="Rent growth"
          values={growths.values}
          baseIdx={growths.baseIdx}
          idx={growthIdx}
          onChange={setGrowthIdx}
          display={(v) => fmtPct(v, 1)}
          deltaOf={fmtBpsDelta}
        />
        <Lever
          label="Vacancy"
          values={vacs.values}
          baseIdx={vacs.baseIdx}
          idx={vacIdx}
          onChange={setVacIdx}
          display={(v) => fmtPct(v, 1)}
          deltaOf={fmtPtDelta}
        />
      </div>

      {/* What a lever's move did, said to a screen reader as it happens: the
          headline return, against the base once a lever has moved. The four
          tiles stay out of the live region, which would read all four at
          every step (research pass 33). */}
      <p role="status" className="sr-only">
        {/* A return that does not solve is said in words, never read aloud
            as "Levered IRR —" (the pre-merge audit). */}
        {withheld
          ? "Levered IRR withheld"
          : !finite(current.leveredIrrPct)
            ? `No levered IRR solves at these levers${current.noIrr ? `: ${NO_IRR_WHY[current.noIrr]}` : ""}`
            : compare
              ? `Levered IRR ${fmtPct(current.leveredIrrPct)}, base ${finite(base.leveredIrrPct) ? fmtPct(base.leveredIrrPct) : `none solves${base.noIrr ? ` (${NO_IRR_WHY[base.noIrr]})` : ""}`}`
              : baseWithheld
                ? `Levered IRR ${fmtPct(current.leveredIrrPct)} at your price`
                : `Levered IRR ${fmtPct(current.leveredIrrPct)}, the base case`}
      </p>
      {interestLine && (
        <p className="mt-4 text-[11px] leading-relaxed text-caution" data-qa="playground-interest">
          {interestLine}
        </p>
      )}
      {withheldLine && (
        <p className={`${interestLine ? "mt-1.5" : "mt-4"} text-[11px] leading-relaxed text-caution`} data-qa="playground-withheld">
          {withheldLine}
        </p>
      )}
      <div className={`${interestLine || withheldLine ? "mt-2" : "mt-4"} grid grid-cols-2 gap-3 sm:grid-cols-4`}>
        {withheld ? (
          // Returns the price did not buy, or a placeholder's, are not
          // figures to read: each tile says why, as the first-draft card
          // says "n/a — note".
          ["Levered IRR", "Equity multiple", "Year-1 CoC", "Year-1 DSCR"].map((label) => (
            <Metric key={label} label={label} value={`n/a — ${naWord}`} cur={null} was={null} baseText="" dirty={false} withheld />
          ))
        ) : (
          <>
            {/* Where no IRR solves, the tile says why in the dash's place
                (research pass 38), small, as a withheld tile is. */}
            <Metric
              label="Levered IRR"
              value={irrText(current)}
              cur={current.leveredIrrPct}
              was={base.leveredIrrPct}
              baseText={irrText(base)}
              dirty={compare}
              withheld={current.leveredIrrPct == null && current.noIrr != null}
            />
            <Metric label="Equity multiple" value={fmtEm(current.leveredEquityMultiple)} cur={current.leveredEquityMultiple} was={base.leveredEquityMultiple} baseText={fmtEm(base.leveredEquityMultiple)} dirty={compare} />
            <Metric label="Year-1 CoC" value={fmtPct(current.cocYr1Pct)} cur={current.cocYr1Pct} was={base.cocYr1Pct} baseText={fmtPct(base.cocYr1Pct)} dirty={compare} />
            <Metric label="Year-1 DSCR" value={fmtX(current.dscrYr1)} cur={current.dscrYr1} was={base.dscrYr1} baseText={fmtX(base.dscrYr1)} dirty={compare} />
          </>
        )}
      </div>
      {/* The model sizes its loan by cost alone, with no coverage test: where
          the DSCR the tile shows is under the debt sizer's own test, one
          line says so and by how much (lib/sizer-terms). Display only. */}
      {coverageLine && (
        <p className="mt-2 text-[11px] leading-relaxed text-caution" data-qa="playground-dscr-test">
          {coverageLine}
        </p>
      )}
      {/* The costs these returns carry and the card cannot show: the
          model's defaults, said as defaults (lib/underwrite/cost-note).
          Not under withheld tiles, where "these returns" would name
          figures the card does not show. */}
      {!withheld && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted" data-qa="playground-costs">
          {costAssumptionsLine(inputs)}
        </p>
      )}
      {/* Where the model spends capital in year 1, what the multiple and the
          year-1 return are net of (research pass 40, M6). */}
      {!withheld && capitalLine && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted" data-qa="playground-capital">
          {capitalLine}
        </p>
      )}
      {exitGap && entry != null && (
        // A default exit under the model's own entry is compression riding
        // in the returns — said in the caution tone; over it, plainly.
        <p
          className={`mt-1.5 text-[11px] leading-relaxed ${entry > caps.values[capIdx] ? "text-caution" : "text-muted"}`}
          data-qa="playground-exit-gap"
        >
          {`Exit cap — ${exitGap}.`}
        </p>
      )}
      {planDeal && !withheld && (
        // The full report leaves these out on a plan deal for this reason
        // (lib/memo/report-document); the page says it beside them — and,
        // as the cost line, never under withheld tiles, where "these
        // returns" and "a bid solved on them" would name figures the card
        // does not show (the second audit, LOW-6).
        <p className="mt-1.5 text-[11px] leading-relaxed text-caution" data-qa="playground-plan-caveat">
          {PLAN_RETURNS_CAVEAT}
        </p>
      )}

      {bid && (
        <MaxBidCard
          bid={bid}
          box={box!}
          modeledPrice={bidAgainst ?? inputs.purchasePrice}
          against={bidAgainst != null ? "yours" : "modeled"}
          dirty={dirty}
          sharePct={data.sharePct ?? null}
          shareNoun={data.shareNoun ?? "share"}
        />
      )}
      {box && !floorsSet && (
        <p className="mt-3 text-xs text-muted">
          Add an IRR, cash-on-cash, or cap-rate floor to your buy box and this
          panel will solve for your max bid.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {score ? (
          // The header's chip ("Fit 63 · Outside box"), read on the model's
          // returns, and what it scored said beside it — with the
          // memorandum's own read, which is the header's, kept apart.
          <p className="flex items-center gap-2 text-xs text-muted" data-qa="playground-fit">
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${BUY_BOX_CHIP_CLS[score.chip.tone]}`}
            >
              {score.chip.label}
            </span>
            <span>{playgroundFitLine(score, compare)}</span>
          </p>
        ) : box && checkSource ? (
          // A box IS set but no configured dimension is computable for this
          // deal/scenario — say that, never "no buy box".
          <span className="text-xs text-muted">
            Mandate fit can&apos;t be computed for this deal&apos;s scenario yet.
          </span>
        ) : (
          <span className="text-xs text-muted">
            Set a buy box to see the fit score move with the sliders.
          </span>
        )}
        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
          >
            Reset to base case
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * What the playground's fit chip scored, beside it: the returns the model
 * put in where the memorandum's figures stood, the base case's fit once a
 * slider has moved, and the memorandum's own fit — the deal header's number
 * — each said as what it is, never one folded into the other.
 */
export function playgroundFitLine(
  s: { score: number; base: number | null; scored: string[]; onMemorandum: number | null },
  dirty: boolean,
): string {
  const parts = [
    s.scored.length > 0
      ? `with the model's ${s.scored.join(" and ")} scored`
      : "mandate fit on the memorandum's figures",
  ];
  if (dirty && s.base != null) {
    // Recomputed on every drag; when it legitimately does not move (the
    // returns stay on the same side of every threshold), say so — a still
    // chip must never read as a broken one.
    parts.push(
      s.base === s.score
        ? "unchanged — these returns don't cross a mandate threshold"
        : `Fit ${s.base} at the base case`,
    );
  }
  if (s.scored.length > 0 && s.onMemorandum != null) {
    parts.push(`Fit ${s.onMemorandum} on the memorandum's figures`);
  }
  return parts.join(" · ");
}

/** Parse "$2,000,000", "2000000", "2m", "2.5 MM", "750k" → dollars. */
function parsePriceText(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^\$?\s*([\d,]*\.?\d+)\s*(mm?|k)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = m[2]?.startsWith("m") ? 1e6 : m[2] === "k" ? 1e3 : 1;
  return n * mult;
}

const fmtUsd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Under this a price typed where the model has no price of its own is
 *  taken for a fragment on its way to a figure ("5" before "5,000,000"):
 *  the 1% of the placeholder's $10,000,000 the guard holds a fragment to
 *  over the placeholder. A keystroke filter, no figure about a deal. */
const FRAGMENT_FLOOR = 100_000;

/**
 * Price ⇄ going-in cap, as one linked control. Typing either reprices the
 * whole model: price is a real engine input (debt, fees, and equity re-size
 * from it), and cap is its mirror through year-one NOI (cap = NOI ÷ price),
 * so the two fields can never disagree.
 */
function PriceCapControls({
  basePrice,
  noiY1,
  value,
  onChange,
  planDeal = false,
  pricePlaceholder = false,
  capWithheld = null,
  priceLabel = null,
}: {
  basePrice: number;
  noiY1: number;
  value: number | null;
  onChange: (v: number | null) => void;
  /** a conversion / development / lease-up / value-add: the cap here runs on
   *  year-1 income as modelled, never on the finished project's stabilized
   *  pro forma — say so, or the control reads as the plan's yield */
  planDeal?: boolean;
  /** no price was read: the modelled price is a placeholder, so the fields
   *  wait empty for the reader's, and nothing is set against the placeholder */
  pricePlaceholder?: boolean;
  /** why no cap is struck on year-1 NOI, in the words after "n/a — ": what
   *  the price buys where it is no building's (lib/compare-interest
   *  `withheld`: the building's income over a note's or a position's price
   *  is a cap nobody earns), an NOI the model assumed ("assumed NOI"), or a
   *  building it runs nearly vacant ("97% vacant"). The cap field says it
   *  and takes no figure; the price still does */
  capWithheld?: string | null;
  /** what the price is where it is not the price as stated for what is sold
   *  (`PlaygroundData.priceLabel`): the field's name, said in its accessible
   *  name too; absent, "Purchase price" */
  priceLabel?: string | null;
}) {
  const [editing, setEditing] = useState<"price" | "cap" | null>(null);
  const [draft, setDraft] = useState("");
  const price = value ?? basePrice;
  const capPct = price > 0 && noiY1 > 0 ? (noiY1 / price) * 100 : null;
  const atBase = value == null;
  const deltaPct = basePrice > 0 ? ((price - basePrice) / basePrice) * 100 : 0;
  // A placeholder price is no price to show in a field labelled "Purchase
  // price", nor a cap struck on it: both wait for the reader's figure.
  const blank = pricePlaceholder && atBase;

  // Snapping back to (nearly) the modeled price clears the override entirely,
  // so "base" stays an exact state, never a float hair away from it.
  const commit = (n: number | null) => {
    if (n == null) return;
    // Ignore keystroke fragments ("5" on the way to "55000000"): only prices
    // within 1%–100x of the modeled price commit; anything else waits for
    // more typing. Snapping (nearly) back to base clears the override. A
    // modelled figure of zero or less is no price to measure a fragment
    // against (research pass 38), so there a fragment is judged by its size.
    if (basePrice > 0 ? n < basePrice * 0.01 || n > basePrice * 100 : n < FRAGMENT_FLOOR) return;
    onChange(Math.abs(n - basePrice) < 0.5 ? null : n);
  };
  const commitPrice = (s: string) => {
    setDraft(s);
    commit(parsePriceText(s));
  };
  const commitCap = (s: string) => {
    setDraft(s);
    const c = parseFloat(s.replace(/[%\s]/g, ""));
    if (Number.isFinite(c) && c > 0.1 && c < 50 && noiY1 > 0) {
      commit(noiY1 / (c / 100));
    }
  };
  const inputCls =
    "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm font-semibold tabular-nums outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <div className="mt-4 rounded-xl border border-brand/25 bg-brand/[0.04] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-tight">Your price</span>
        <span className="text-[11px] text-muted">
          {capWithheld
            ? "type a price"
            : planDeal
              ? "type a price or a cap — year-1 income as modelled, not the plan's stabilized pro forma"
              : "type a price or a going-in cap"}
        </span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-muted" data-qa="playground-price-label">
            {priceLabel ?? "Purchase price"}
          </span>
          <input
            inputMode="decimal"
            value={editing === "price" ? draft : blank ? "" : fmtUsd0(price)}
            placeholder={blank ? "Type a price" : undefined}
            onFocus={(e) => {
              setEditing("price");
              setDraft(e.currentTarget.value);
            }}
            onChange={(e) => commitPrice(e.currentTarget.value)}
            onBlur={() => setEditing(null)}
            aria-label={`${priceLabel ?? "Purchase price"} scenario`}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-muted">
            {planDeal ? "Cap on Yr-1 income (as modelled)" : "Cap on Yr-1 NOI (as modelled)"}
          </span>
          {capWithheld ? (
            // No building's cap on a price that did not buy the building.
            <input
              readOnly
              value={`n/a — ${capWithheld}`}
              aria-label="Going-in cap scenario"
              className={`${inputCls} text-muted`}
            />
          ) : (
            <input
              inputMode="decimal"
              value={
                editing === "cap"
                  ? draft
                  : blank
                    ? ""
                    : capPct != null
                      ? `${capPct.toFixed(2)}%`
                      : "—"
              }
              placeholder={blank ? "or a cap" : undefined}
              onFocus={(e) => {
                setEditing("cap");
                setDraft(e.currentTarget.value);
              }}
              onChange={(e) => commitCap(e.currentTarget.value)}
              onBlur={() => setEditing(null)}
              aria-label="Going-in cap scenario"
              className={inputCls}
            />
          )}
        </label>
        <div className="flex items-end pb-2.5">
          {pricePlaceholder ? (
            // Nothing is set against a placeholder: the price is the reader's
            // own, or there is none yet.
            <span className="text-xs text-muted">
              {atBase ? "no price was read — type the price you would pay" : "your price"}
            </span>
          ) : atBase ? (
            <span className="text-xs text-muted">at the modeled price</span>
          ) : (
            <span
              className={`text-xs font-medium tabular-nums ${
                deltaPct < 0 ? "text-pass" : "text-caution"
              }`}
            >
              {deltaPct >= 0 ? "+" : "−"}
              {Math.abs(deltaPct).toFixed(1)}% vs modeled ({fmtUsd0(basePrice)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rounded DOWN at display precision so the printed bid still clears the
 *  floors — "$9.74M" must never stand for a solved $9,738,000. */
function fmtBid(n: number): string {
  if (n >= 1e9) return `$${(Math.floor(n / 1e7) / 100).toFixed(2)}B`;
  if (n >= 1e6) return `$${(Math.floor(n / 1e4) / 100).toFixed(2)}M`;
  return `$${Math.floor(n / 1e3).toLocaleString("en-US")}k`;
}

function bindingLabel(key: NonNullable<MaxBidSolution["binding"]>, box: BuyBox): string {
  switch (key) {
    case "minIrr":
      return `your ${box.minIrrPct}% IRR floor binds`;
    case "minCoc":
      return `your ${box.minCoCPct}% cash-on-cash floor binds`;
    case "minCap":
      return `your ${box.minCapPct}% going-in cap floor binds`;
  }
}

function MaxBidCard({
  bid,
  box,
  modeledPrice,
  against = "modeled",
  dirty,
  sharePct = null,
  shareNoun = "share",
}: {
  bid: MaxBidSolution;
  box: BuyBox;
  /** the price the bid is set against: the modelled one, or the reader's
   *  own where the model's is a placeholder (`against: "yours"`) */
  modeledPrice: number;
  against?: "modeled" | "yours";
  dirty: boolean;
  /** a partial interest's stated share, where the model runs the whole its
   *  price grosses up to (`PlaygroundData.sharePct`): the bid solved is the
   *  whole's, and the share's — the whole's times the share — is said
   *  beside it (research pass 40, M7) */
  sharePct?: number | null;
  /** what the share is called (`PlaygroundData.shareNoun`) */
  shareNoun?: "share" | "interest";
}) {
  const vs = against === "yours" ? "your price" : "the modeled price";
  // The share's bid, rounded down as the whole's is, so it still clears.
  const shareBid = (whole: number, atLeast = false): string | null =>
    sharePct != null
      ? `the whole's price, the ${shareNoun} grossed up; the ${Number(sharePct.toFixed(2))}% ${shareNoun}'s is ${atLeast ? "at least " : ""}${fmtBid(whole * (sharePct / 100))}`
      : null;
  return (
    <div className="mt-3 rounded-xl border border-brand/25 bg-brand/[0.04] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-tight">Max bid</span>
        <span className="text-[11px] text-muted">
          highest price that still clears your box
          {dirty ? " — under the current slider scenario" : ""}
        </span>
      </div>
      {bid.price == null ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          No price in range clears your floors under this scenario — the deal
          economics, not the price, are the blocker.
        </p>
      ) : bid.unbounded ? (
        // Every floor still clears at the top of the range searched — the
        // window doubles from twice the price while they clear (research
        // pass 40, H2) — so the bid is at least that top, and said so.
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {`Your floors hold even at ${timesWords(1 + (bid.deltaPct ?? 0))} ${vs} (${fmtBid(bid.price)}), the top of the range searched — the buy box isn't the constraint on this deal.${
            shareBid(bid.price) ? ` That is ${shareBid(bid.price, true)}.` : ""
          }`}
        </p>
      ) : (
        <>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-lg font-semibold tabular-nums">
              {fmtBid(bid.price)}
            </span>
            {bid.deltaPct != null && modeledPrice > 0 && (
              <span
                className={`text-xs font-medium tabular-nums ${
                  bid.deltaPct < 0 ? "text-caution" : "text-pass"
                }`}
              >
                {bid.deltaPct >= 0 ? "+" : "−"}
                {Math.abs(bid.deltaPct * 100).toFixed(1)}% vs {vs}
              </span>
            )}
            {bid.binding && (
              <span className="text-xs text-muted">
                {bindingLabel(bid.binding, box)}
              </span>
            )}
          </p>
          {shareBid(bid.price) && (
            // The bid is the whole's: the share's is said beside it.
            <p className="mt-1 text-[11px] text-muted" data-qa="max-bid-share">
              {`That is ${shareBid(bid.price)}.`}
            </p>
          )}
          {bid.at && (
            <p className="mt-1 text-[11px] tabular-nums text-muted">
              at that price: IRR {fmtPct(bid.at.irr)} · year-1 CoC{" "}
              {fmtPct(bid.at.coc)} · going-in cap {fmtPct(bid.at.cap, 2)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Lever({
  label,
  values,
  baseIdx,
  idx,
  onChange,
  display,
  deltaOf,
}: {
  label: string;
  values: number[];
  baseIdx: number;
  idx: number;
  onChange: (i: number) => void;
  display: (v: number) => string;
  deltaOf: (v: number, base: number) => string;
}) {
  const v = values[idx];
  // "Base" is decided by INDEX, not value equality — a clamped stop that
  // happens to duplicate the base must not claim to be it.
  const atBase = idx === baseIdx;
  const base = display(values[baseIdx]);
  const d = atBase ? "base" : deltaOf(v, values[baseIdx]);
  return (
    <div className="rounded-xl border border-line/70 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {display(v)}{" "}
          <span className={`ml-0.5 text-[11px] font-normal ${atBase ? "text-muted" : "text-brand"}`}>
            {atBase
              ? `base ${base}`
              : `(base ${base}, ${d === "base" ? "no change" : d})`}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={values.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} scenario`}
        // The slider moves along stops; what a screen reader says is the
        // figure the stop sets, never the stop's index (research pass 33).
        aria-valuetext={atBase ? `${display(v)}, the base` : `${display(v)}, base ${base}`}
        className="mt-2 w-full accent-brand"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-muted">
        <span>{display(values[0])}</span>
        <span>{display(values[values.length - 1])}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  cur,
  was,
  baseText,
  dirty,
  withheld = false,
}: {
  label: string;
  value: string;
  cur: number | null;
  was: number | null;
  baseText: string;
  dirty: boolean;
  /** a return withheld, its value the reason ("n/a — no price"), said small */
  withheld?: boolean;
}) {
  // Higher is better for all four headline metrics.
  const cls =
    !dirty || cur == null || was == null || Math.abs(cur - was) < 1e-9
      ? ""
      : cur > was
        ? "text-pass"
        : "text-kill";
  return (
    <div className="rounded-xl border border-line/70 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      {withheld ? (
        <p className="mt-1 text-sm font-medium text-muted">{value}</p>
      ) : (
        <p className={`font-mono text-lg font-semibold tabular-nums ${cls}`}>{value}</p>
      )}
      {dirty && <p className="text-[10px] tabular-nums text-muted">base {baseText}</p>}
    </div>
  );
}
