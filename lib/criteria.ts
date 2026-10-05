// The buy box: the buyer's standing mandate, checked against every screened
// deal. Deliberately deterministic — parsing and comparison in code, no model
// in the loop — so the same deal always gets the same fit call. Each check
// reads like an analyst testing the deal against the firm's mandate: the
// mandate's bound, the deal's figure, and the call in plain English.
// (Universal module: used by server pages and the background pipeline.)

import { SCALE_WORDS, compactUsd, scaleOf, scaledText } from "@/lib/money";
import { withArticle } from "@/lib/article";
import { assetWords, countNoun } from "@/lib/asset-words";
import { EXCHANGE_FILERS, exchangeDay, type ExchangeBlock } from "@/lib/exchange-window";
import { dayIn } from "@/lib/reader-day";
import type { CapWithheldKind } from "@/lib/cap-slot";

export interface GeoTarget {
  /** display label, e.g. "Dallas, TX" or "Tarrant County, TX" */
  label: string;
  city?: string;
  state?: string;
  county?: string;
  /** extra match needles for market-level territories (a "Dallas-Fort Worth"
   *  chip must hit Fort Worth and Plano deals too). Same substring semantics
   *  as city/county/label. */
  aliases?: string[];
}

export interface BuyBox {
  /** e.g. ["multifamily", "industrial"] — empty/undefined = any */
  assetClasses?: string[];
  /** structured geography targets (autocomplete chips) */
  geos?: GeoTarget[];
  /** LEGACY: comma-separated market substrings — still honored */
  markets?: string;
  /** building size band, square feet */
  sfMin?: number;
  sfMax?: number;
  /** count band — units, keys, pads, beds, homes or spaces, whatever the
   *  deal counts in. A box spans classes, so the mandate says "units" and
   *  the check speaks the deal's own noun ("Keys" on a hotel). The two
   *  bands are independent: an apartment mandate is stated in units and
   *  an office mandate in square feet, and a memorandum that states the
   *  one and not the other is judged on the one it states. */
  unitsMin?: number;
  unitsMax?: number;
  /** total purchase price band, $ millions */
  priceMinM?: number;
  priceMaxM?: number;
  /** LEGACY: max total price, $ millions — folds into priceMaxM */
  maxPriceM?: number;
  /** max price per unit, $ thousands */
  maxPerUnitK?: number;
  /** minimum going-in cap rate, % */
  minCapPct?: number;
  /** minimum year-one cash-on-cash, % */
  minCoCPct?: number;
  /** target base-case return (IRR), % */
  minIrrPct?: number;
  /** hard disqualifiers — any one tripped forces a PASS verdict regardless of
   *  the rest of the score (see lib/mandate.ts). All optional/off by default. */
  dealbreakers?: Dealbreakers;
  /** free-text priorities, fed to the verdict synthesizer verbatim */
  notes?: string;
  /** the buyer's 1031 exchange (lib/exchange-window): the day the
   *  relinquished property was transferred (an ISO day), who files the
   *  return and whether it is extended — read against each deal's
   *  offers-due day and what its price buys. Absent, no exchange: a blank
   *  is null. The box is the reader's, so never on the shared screen. */
  exchange?: ExchangeBlock;
}

/**
 * Absolute red lines. Distinct from the scored bands above: a scored miss
 * costs points, a tripped dealbreaker caps the verdict at PASS. Every field is
 * checked deterministically against the same extraction the score reads.
 */
export interface Dealbreakers {
  /** an asset class outside the mandate list is an automatic PASS */
  requireAssetClass?: boolean;
  /** a location outside the target geographies is an automatic PASS */
  requireGeography?: boolean;
  /** hard purchase-price ceiling, $ millions */
  maxPriceM?: number;
  /** hard going-in cap floor, % */
  minCapPct?: number;
  /** hard basis ceiling, $ thousands per unit */
  maxPerUnitK?: number;
}

/** True when the dealbreakers object carries no active red line. */
export function hasNoDealbreakers(d: Dealbreakers | null | undefined): boolean {
  if (!d) return true;
  return (
    !d.requireAssetClass &&
    !d.requireGeography &&
    d.maxPriceM == null &&
    d.minCapPct == null &&
    d.maxPerUnitK == null
  );
}

/** near = a miss inside the tolerance band — worth a look, not a kill. */
export type BuyBoxStatus = "pass" | "near" | "miss" | "unknown";

export interface BuyBoxCheck {
  label: string;
  status: BuyBoxStatus;
  /** one plain-English analyst line: mandate, deal figure, call */
  detail: string;
  /** the criterion turns on the price — the price band, the basis, the
   *  going-in cap, the target return — so a note's or a position's price, a
   *  plan deal or a memorandum that states no cap or return can leave it
   *  unknown, and a fit judged without it is no green light
   *  (`buyBoxCoverage`) */
  onPrice?: boolean;
}

// Near-miss tolerances, per criterion kind. Exported because the mandate-fit
// SCORE (lib/mandate.ts) awards proportional partial credit across exactly
// these bands — so "near" on a chip and "partial credit" in the score always
// mean the same distance from the bound.
export const NEAR_REL = 0.1; // price / SF / per-unit: within 10% beyond the bound
export const NEAR_CAP_PT = 0.25; // going-in cap: within 25bps of the floor
export const NEAR_IRR_PT = 1.0; // IRR / CoC: within 1pt of the target

/**
 * The metric-label patterns the screen figures are pulled out with. Shared by
 * the buy-box fit check (evaluateBuyBox, below) and the mandate-fit score
 * (lib/mandate.ts) so both read the SAME figure out of an extraction — a regex
 * that drifts in one place would silently score a deal on a different number
 * than the chip says it checked. One definition, both consumers.
 */
/**
 * A later year of the hold — "Year 2", "Yr. 3", "Y5", "Year 10" — as a
 * label fragment. A Year-1 figure is today's by another name (the going-in
 * cap, the first year's NOI), so the guard starts at 2 and runs past 9: the
 * one pattern behind the cap reader, the NOI classifier and the strategy
 * inference, so no two of them can disagree about which year is "later".
 */
export const LATER_YEAR = /\b(?:year|yr)\.?\s?(?!1\b)\d{1,2}\b|\by(?!1\b)\d{1,2}\b/i;

/** Any calendar year before `screenYear`, as a label fragment: years 1900
 *  through the year before it. "Sale price (2019)", "Purchase price (2019)"
 *  and "Acquired 2019" are what the building last traded for; a label
 *  carrying the screen's year or a later one — "Asking price (2026)",
 *  "Purchase price (2027 close)" on a 2026 screen — is the ask. The year is
 *  the caller's to give (`screenYearOf`), never the clock's. */
export function pastYearSource(screenYear: number): string {
  const last = Math.min(Math.max(screenYear - 1, 2000), 2099) - 2000;
  const tens = Math.floor(last / 10);
  const ones = last % 10;
  const parts = ["19\\d\\d"];
  if (tens > 0) parts.push(`20[0-${tens - 1}]\\d`);
  parts.push(`20${tens}[0-${ones}]`);
  return `\\b(?:${parts.join("|")})\\b`;
}

/**
 * The year an extraction stored before `screenedOn` existed is read as.
 * Until the stamp shipped, the price reader judged a label's year against
 * the clock's year when the module loaded, and the stamp ships in 2026: so
 * every extraction on file was last read as a 2026 screen, and reading the
 * unstamped ones as 2026 keeps each one's price where it stands. The clock
 * is no fallback — it is the bug: on January 1 it turned "Asking price
 * (2026)" into a prior trade, and the deal lost its price on the pipeline,
 * the model, the buy box and the memo.
 */
export const UNSTAMPED_SCREEN_YEAR = 2026;

/** A stamp as the screen writes one: an ISO day, read off its front. */
const SCREEN_STAMP = /^(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;

/**
 * The year the screen read the memorandum, which a price label's year is
 * judged against: the extraction's `screenedOn` stamp (written by the
 * pipeline and the manual-deal path, `screenStamp`), else
 * UNSTAMPED_SCREEN_YEAR. A label's "this year" is the year it was read, so a
 * stored deal keeps its price whatever year it is opened in. Never the clock.
 */
export function screenYearOf(ex: { screenedOn?: string | null } | null | undefined): number {
  const stamp = typeof ex?.screenedOn === "string" ? ex.screenedOn.trim() : "";
  const m = SCREEN_STAMP.exec(stamp);
  return m ? Number(m[1]) : UNSTAMPED_SCREEN_YEAR;
}

/** The zone the screen stamp's day is read in: Hawaii's — no state's day
 *  begins later. The stamp exists to judge a price label's
 *  year (`screenYearOf`), so its year must never run ahead of the calendar
 *  of the analyst who screened the deck: the UTC day did from 7 pm Eastern
 *  (4 pm Pacific) on December 31, and "Asking price (2026)" on a deck
 *  screened that evening read as a prior trade. Read in Honolulu the stamp
 *  can run behind a reader's day (3 am on January 1 in New York is still
 *  December 31 there), never ahead of it in any state — and behind is the
 *  side a label can bear: a label of the reader's new year is a later
 *  year, the ask. (American Samoa's day begins an hour later still.) */
export const SCREEN_STAMP_TIME_ZONE = "Pacific/Honolulu";

/** The stamp a screen writes on the extraction it stores: the day it read
 *  the memorandum (or the typed facts), as an ISO date — the day in
 *  `SCREEN_STAMP_TIME_ZONE`, never the UTC day. One writer, so the pipeline
 *  and the manual-deal path stamp alike. */
export function screenStamp(now: Date = new Date()): string {
  return dayIn(SCREEN_STAMP_TIME_ZONE, now);
}

/**
 * The stamp a re-screen writes — or none (undefined), where the extraction
 * it replaces was read from the same bytes and carried none. A re-screen
 * never moves the screen's year forward for bytes the extraction on file
 * read: a label's year is the memorandum's, so reading one deck again in a
 * later year never turns its "Asking price (2026)" into a prior trade.
 *
 *   - The extraction on file carries a fingerprint (`omFingerprint`,
 *     lib/om-fingerprint): these bytes' keeps its stamp, or its lack of one
 *     (it reads as UNSTAMPED_SCREEN_YEAR, and keeps reading so); another
 *     deck's is a new reading, stamped today.
 *   - It carries none (stored before the fingerprint shipped): the deal row
 *     says whether it was read from the memorandum being read now
 *     (`priorReadFromThisDeck`, which the pipeline reads off the deal: not
 *     typed by hand, lib/manual-deal `typedByHand`, and not replaced since
 *     its last screen, lib/deals `memorandumReplacedSince`). Where it says
 *     so, the stamp or its absence is kept; else today's.
 *   - No extraction on file, or no memorandum: today's.
 *
 * Never an invented date: a reading kept without a stamp is written with
 * none, never with a day nobody screened on.
 */
export function screenStampFor(
  prior: { screenedOn?: string | null; omFingerprint?: string | null } | null | undefined,
  fingerprint: string | null | undefined,
  now: Date = new Date(),
  opts: { priorReadFromThisDeck?: boolean } = {},
): string | undefined {
  if (fingerprint && prior) {
    const priorFingerprint = typeof prior.omFingerprint === "string" ? prior.omFingerprint.trim() : "";
    const sameDeck = priorFingerprint ? priorFingerprint === fingerprint : opts.priorReadFromThisDeck === true;
    if (sameDeck) {
      // A malformed stamp is no stamp: it read as UNSTAMPED_SCREEN_YEAR
      // (`screenYearOf`, the same pattern), and that reading is what is kept.
      const kept = typeof prior.screenedOn === "string" ? SCREEN_STAMP.exec(prior.screenedOn.trim()) : null;
      return kept ? kept[0] : undefined;
    }
  }
  return screenStamp(now);
}

// The price row's exclusions either side of the past-year fragment, which
// depends on the screen's year (priceExclude, below).
const PRICE_EXCLUDE_HEAD = String.raw`unit|\bsf\b|\/ ?sf|per ?sf|per (square|sq)|psf|\bper\s+(?!(?:the|om|broker|seller|sponsor|offering|agent|marketing|guidance|psa|contract|loi)\b)|\/\s*(key|bed|room|pad|door|acre|lot|suite|stall|space|home|apartment|apt|bay|berth|slip|r?sf|nrsf|gsf|gla|nra|gba|nla)s?\b|\brent|yield|\bcap\b|\brate\b|spread|loan|debt|insurance|\bdate\b|exit|reversion|terminal|residual|disposition|projected|forward|pro ?forma|stabili[sz]|`;
const PRICE_EXCLUDE_TAIL = String.raw`|\b(sale|sold|trade|traded)\b(?=[\s\S]*\b(19|20)\d\d\b)|\b(19|20)\d\d\b(?=[\s\S]*\b(sale|sold|trade|traded)\b)|\b(year|yr)\s?\d|\b(last|prior|previous|historical|original|land|site|reduction|reserve|bid|strike|target|underwritten|range)\b`;
const priceExcludes = new Map<number, RegExp>();

/**
 * What is never the ask, on a screen of `screenYear` (METRIC_FIND.price.exc):
 * a per-unit or per-SF figure, a rent, a rate, a projected or residual sale
 * price, a prior trade — and a label dated before the screen's year. Built
 * the first time a year is asked for and kept; never at module load.
 */
export function priceExclude(screenYear: number): RegExp {
  let re = priceExcludes.get(screenYear);
  if (!re) {
    re = new RegExp(PRICE_EXCLUDE_HEAD + pastYearSource(screenYear) + PRICE_EXCLUDE_TAIL, "i");
    priceExcludes.set(screenYear, re);
  }
  return re;
}

export const METRIC_FIND = {
  // The building's size is read by shape, not by pattern: see
  // buildingSfFromMetrics below.
  // Every name an OM gives the number being asked — asking, purchase, list,
  // sale, offering, contract price, the guidance, the whisper — never a
  // per-unit or per-SF figure, never what the building last traded for,
  // and never a land or site allocation (on a development the land cost is
  // read separately, as the price, by lib/deal-strategy's findPriceMetric).
  price: {
    // "Ask" / "Asking" alone, or with "price" / "guidance" — never "Asking
    // rent", "Asking cap rate" or "Asking yield". "Pricing" as a word — never
    // "Repricing", and the exclude keeps loan / debt / insurance pricing and
    // a pricing date out.
    inc: /asking price|purchase price|guidance|\bpricing\b|^ask(ing)?(?=\s*($|[:—–(-]))|^ask(ing)?\s+(price|guidance)\b|offering price|offer price|sale price|sales price|list price|listing price|contract price|acquisition (price|cost)|total consideration|whisper|\bprice\b/i,
    // Not a per-unit / per-SF / per-key figure in either spelling ("per
    // key", "/ Key", "/ RSF"), not a rent, a rate or a yield, not what the
    // building last traded for, not a land or site allocation (read
    // separately, as the price, only when no ask exists), and not a
    // reserve, bid, target or underwritten figure. "Price / Terms" and
    // "Purchase price per the PSA" are asks and stay in.
    // "per <anything>" is a per-something figure — home, apartment, bay,
    // berth, parking space, whatever noun the OM picks — except "per the
    // PSA" / "per OM" / "per broker", which say where the ask came from.
    // A projected, residual, disposition or pro forma sale price and a
    // prior trade — a year before the screen's in the label ("2019 sale
    // price", "Purchase price (2019)"), or a sale / trade word beside any
    // year, or "Year 5 sale price" — are not the ask either. A label
    // carrying the screen's year or a later one ("Revised asking price
    // (March 2026)" on a 2026 screen) still is. So the exclusion is a
    // function of the screen's year (`screenYearOf`), never a pattern built
    // from the clock when the module loads.
    exc: priceExclude,
  },
  // The price over the units, read by SHAPE: "Price per unit", "Price /
  // Unit", "$ / Unit", "Unit price", "Asking price per door", "Basis per
  // key" — never an NOI, a rent, a cost or a spend expressed per unit
  // (which would pass a basis ceiling at $2k/unit), and never a ratio row
  // the same KPI table prints per unit: "Avg SF / unit", "Parking spaces
  // per unit", "Beds per unit" (which would pass it at $912/unit).
  perUnit: {
    // Every noun a class counts in (lib/asset-words): a hotel's price per
    // key, a park's per pad, a portfolio's per home, a garage's per space.
    inc: /^(?:(?:avg\.?|average|asking|total|implied|blended|going[- ]?in)\s+)*(?:price|basis|\$)\s*(?:per|\/)\s*(?:unit|door|key|pad|bed|site|home|space|room)s?\b|\bunit price\b|\bprice\s*(?:per|\/)\s*unit\b/i,
    exc: /noi|income|rent\b|rents\b|cost|budget|expense|tax|reserve|revenue|insurance|utilit|payroll|debt|loan|equity|value|\begi\b|replacement|capex|capital|management|repairs?|maintenance|marketing|admin|contract|\bopex\b|operating|concession|turnover|\br ?& ?m\b|renovation|spend|fees?\b|\bg ?& ?a\b|payment|deposit|exit|reversion|terminal|residual|disposition|projected|pro ?forma|\b(last|prior|previous|historical|original)\b/i,
  },
  // The going-in cap is today's income against the price. A stabilized, pro
  // forma, forward or at-completion cap — or a yield on cost — describes a
  // plan deal's finished project, and reading it as the going-in cap is how
  // a conversion "cleared" a 6% floor at 11.7%. A forward purchase's cap at
  // delivery ("Delivery cap rate", "Cap rate at delivery", research pass 28)
  // is struck on a building not yet standing, never today's income.
  goingInCap: {
    inc: /going[- ]?in cap/i,
    exc: /stabili[sz]|pro ?forma|forward|projected|at completion|deliver|yield/i,
  },
  capRate: {
    // "Cap rate" or "Capitalization rate" — the OM's formal wording.
    inc: /\bcap(?:italization)? rate\b/i,
    // A Year-2+ cap ("Yr. 3", "Year 10"), a cap dated to a calendar year in
    // parentheses or a cap on cost is a projection, not today's income
    // against the price (a Year-1 cap is the going-in figure by another
    // name, so the shared year guard starts at 2 — as classifyNoi's does).
    // A cap at delivery is a forward purchase's, as above.
    exc: new RegExp(
      String.raw`exit|terminal|reversion|residual|stabili[sz]|pro ?forma|forward|projected|at completion|deliver|yield|on cost|\(\s*(19|20)\d\d|` +
        LATER_YEAR.source,
      "i",
    ),
  },
  irr: { inc: /\birr\b/i },
  // Cash-on-cash isn't a required extraction field, so it's often absent —
  // when it is, the score reports the CoC dimension "unknown", never a pass.
  coc: { inc: /cash[- ]?on[- ]?cash|cash[- ]?on[- ]?equity|cash yield|\bcoc\b/i },
  // A ground-up development buys land, and its OM says "land cost" or
  // "site acquisition" where a building's OM says "asking price". That
  // line is the price only on a development, and never an appraised land
  // VALUE — on an operating asset an allocation, not what is being bought.
  landPrice: {
    inc: /\b(land|site) (cost|price|acquisition|purchase|basis)\b/i,
    exc: /value|\bper\b|\/|psf|acre|\bsf\b/i,
  },
} as const;

/**
 * THE row that states the price: the ask under any of its names, else — on
 * a development only — the land or site cost, which is what is being
 * bought. An ask row that states no figure ("Call for offers") still yields
 * to a development's land cost, since the land cost IS the figure such a
 * deck prices. Null when the OM states neither. One implementation for the
 * buy-box price band, the mandate ceiling and every surface's price slot
 * (lib/deal-strategy's findPriceMetric delegates here), so the band judges
 * the same row the page prints. A label's year is read against
 * `screenYear`, the year the screen read the memorandum — the caller's
 * `screenYearOf(extraction)`, so no two surfaces read one deal's rows
 * against two different years.
 */
export function findPriceRow(
  metrics: MetricLike[],
  kind: string | null | undefined,
  screenYear: number,
): MetricLike | null {
  const ask = findMetric(metrics, METRIC_FIND.price.inc, METRIC_FIND.price.exc(screenYear));
  // An ask whose value is no price ("6.25% cap rate", "75% of UPB", "185,000
  // per unit" — `priceRefusal`) states no figure, as "Call for offers" does.
  if (ask && parsePrice(ask.value) != null) return ask;
  return kind === "development"
    ? (findMetric(metrics, METRIC_FIND.landPrice.inc, METRIC_FIND.landPrice.exc) ?? ask)
    : ask;
}

/**
 * THE going-in cap metric, or null: the labelled going-in figure first, else
 * a plain cap rate that is not the exit cap and not the finished project's
 * stabilized / pro forma figure. One implementation for the buy-box check,
 * the mandate score and the market memory, so no surface can drift back to
 * reading a plan deal's yield on cost as the cap on the price.
 */
export function findGoingInCap(metrics: MetricLike[]): MetricLike | null {
  return (
    findMetric(metrics, METRIC_FIND.goingInCap.inc, METRIC_FIND.goingInCap.exc) ??
    findMetric(metrics, METRIC_FIND.capRate.inc, METRIC_FIND.capRate.exc)
  );
}

/** A deal with a plan has no going-in cap to check — "value-add", "lease-up",
 *  "conversion" or "development" from the extraction's strategy; null for a
 *  stabilized asset, an unknown strategy or an extraction saved before the
 *  field existed. */
export function planKindLabel(extraction: ExtractionLike | null): string | null {
  const kind = extraction?.strategy?.kind;
  if (!kind || kind === "stabilized" || kind === "unknown") return null;
  return kind.replace(/_/g, "-");
}

export function isEmptyBuyBox(box: BuyBox | null | undefined): boolean {
  if (!box) return true;
  return (
    !(box.assetClasses && box.assetClasses.length) &&
    !(box.geos && box.geos.length) &&
    !box.markets?.trim() &&
    box.sfMin == null &&
    box.sfMax == null &&
    box.unitsMin == null &&
    box.unitsMax == null &&
    box.priceMinM == null &&
    box.priceMaxM == null &&
    box.maxPriceM == null &&
    box.maxPerUnitK == null &&
    box.minCapPct == null &&
    box.minCoCPct == null &&
    box.minIrrPct == null &&
    hasNoDealbreakers(box.dealbreakers) &&
    !box.notes?.trim() &&
    !box.exchange?.relinquishedTransferOn
  );
}

/** A real calendar day, as an ISO date — "2026-09-15", never "2026-02-31" —
 *  in a year an exchange can have run in. */
function isExchangeDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) return false;
  const year = Number(s.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

/**
 * The buy box's 1031 exchange from what the form sends (or the stored
 * jsonb), each part only as given: the relinquished property's transfer day
 * as a real calendar day, else no exchange at all (a blank is null, and a
 * filer or an extension with no day has nothing to run from); the filer
 * only as one of `EXCHANGE_FILERS`; the extension only where ticked.
 */
export function sanitizeExchange(raw: unknown): ExchangeBlock | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const day = typeof r.relinquishedTransferOn === "string" ? r.relinquishedTransferOn.trim() : "";
  if (!isExchangeDay(day)) return undefined;
  const filer = EXCHANGE_FILERS.find((f) => f.id === r.filer)?.id;
  return {
    relinquishedTransferOn: day,
    ...(filer ? { filer } : {}),
    ...(r.returnExtended === true ? { returnExtended: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Multiple named buy boxes (Feature 4).
//
// The `criteria` JSONB column holds EITHER a bare BuyBox (the legacy shape,
// still written when there's a single DEFAULT-named box) OR a versioned
// envelope carrying several named boxes and which one is active. A single
// CUSTOM-named box uses the envelope too, so it round-trips its name.
// `resolveBuyBoxStore` normalizes both into a canonical store;
// `serializeBuyBoxStore` collapses back to the most backward-compatible shape.
// Every reader goes through these, so nothing downstream has to know which
// shape is on disk — and for the common single-default-box account a pre-F4
// rollback still reads a plain BuyBox (a custom-named or multi-box account
// would read as no-criteria until re-deployed, never a crash).
// ---------------------------------------------------------------------------

export interface NamedBuyBox {
  id: string;
  name: string;
  box: BuyBox;
}
export interface BuyBoxStore {
  boxes: NamedBuyBox[];
  /** id of the box every screen is judged against */
  activeId: string;
}

/** Normalize the stored `criteria` value (legacy bare box OR v2 envelope). */
export function resolveBuyBoxStore(raw: unknown): BuyBoxStore {
  if (!raw || typeof raw !== "object") return { boxes: [], activeId: "" };
  const obj = raw as Record<string, unknown>;

  // v2 envelope: a list of named boxes plus the active id.
  if (Array.isArray(obj.boxes)) {
    const boxes: NamedBuyBox[] = [];
    obj.boxes.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const it = item as Record<string, unknown>;
      boxes.push({
        id: typeof it.id === "string" && it.id ? it.id : `box-${i}`,
        name: typeof it.name === "string" && it.name.trim() ? it.name.trim() : `Mandate ${i + 1}`,
        box: (it.box && typeof it.box === "object" ? it.box : {}) as BuyBox,
      });
    });
    if (!boxes.length) return { boxes: [], activeId: "" };
    const activeId =
      typeof obj.activeId === "string" && boxes.some((b) => b.id === obj.activeId)
        ? obj.activeId
        : boxes[0].id;
    return { boxes, activeId };
  }

  // Legacy bare BuyBox.
  const box = obj as BuyBox;
  if (isEmptyBuyBox(box)) return { boxes: [], activeId: "" };
  return { boxes: [{ id: "default", name: "Mandate", box }], activeId: "default" };
}

/** The active box out of a store — or null when it's unset/empty. */
export function activeBox(store: BuyBoxStore): BuyBox | null {
  const found =
    store.boxes.find((b) => b.id === store.activeId) ?? store.boxes[0] ?? null;
  return found && !isEmptyBuyBox(found.box) ? found.box : null;
}

/** Collapse a store back to what goes in `criteria`: null when empty, a bare
 *  box for the single-box case (backward-compatible), else the v2 envelope. */
export function serializeBuyBoxStore(store: BuyBoxStore): BuyBox | Record<string, unknown> | null {
  const boxes = store.boxes;
  if (boxes.length === 0) return null;
  if (boxes.length === 1) {
    const only = boxes[0];
    if (isEmptyBuyBox(only.box)) return null;
    // A single default-named box stores as a bare BuyBox (backward-compatible);
    // a custom name is only preserved by keeping the envelope.
    if (!only.name || only.name === "Mandate") return only.box;
    return { v: 2, activeId: only.id, boxes: [{ id: only.id, name: only.name, box: only.box }] };
  }
  const activeId = boxes.some((b) => b.id === store.activeId)
    ? store.activeId
    : boxes[0].id;
  return {
    v: 2,
    activeId,
    boxes: boxes.map((b) => ({ id: b.id, name: b.name, box: b.box })),
  };
}

// The figure a value leads with, as `parseMoney` reads it once the dollar
// sign and the commas are dropped: the digits, never an ordinal's, and a
// scale only where it ends its word (lib/money's one table).
const MONEY_FIGURE = new RegExp(String.raw`^\s*(\d+(?:\.\d+)?)(?!\.?\d)(?!(?:st|nd|rd|th)\b)(?:\s*(${SCALE_WORDS})(?![a-z]))?`);

/** "$70.7M" / "$70,700,000" / "285k" / "1.2 mm" → dollars (or plain
 *  number), or null. Reads the approximations an OM writes — "±$42M",
 *  "~$42M", "approx. $42,000,000", "circa $42M", "USD 42,000,000" — as
 *  parseSf and parseCount do, and a negative in either spelling,
 *  "-$250,000" or "($250,000)": a lease-up's in-place NOI can be below
 *  zero, and a figure that parses as nothing would vanish from the screen. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/^(?:±|\+\/-|~|≈|approx(?:imately|\.)?|about|circa|c\.|usd|us\$)\s*/i, "");
  let sign = 1;
  const wrapped = s.match(/^\(\s*([^()]*?)\s*\)$/);
  if (wrapped) {
    s = wrapped[1];
    sign = -1;
  }
  if (/^[-−–]/.test(s)) {
    s = s.replace(/^[-−–]\s*/, "");
    sign = -1;
  }
  // A scale is read only where it ends its word (lib/money's one table): the
  // spaces stay in, so the first letter of the next word is never a scale.
  // With every space dropped, "$450,000 more" read as 450,000 million and
  // "$600,000 base rent" as 600,000 billion. The digits never give back a
  // decimal to a word glued after them (audit C3a): with a word boundary
  // after the scale, "$12.5mil" read as 12, "1.25x" as 1 and "$32.50psf" as
  // 32. An ordinal is no figure ("2nd lien").
  s = s.replace(/[,$]/g, "").toLowerCase();
  const m = s.match(MONEY_FIGURE);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return sign * n * scaleOf(m[2]);
}

// ── A price stated as a range (#466) ─────────────────────────────────────

// Each end's scale from lib/money's one table: "$40–42 mil" had read as
// forty to forty-two dollars.
const RANGE_FIGURE = String.raw`\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(${SCALE_WORDS})?`;
const PRICE_RANGE = new RegExp(
  String.raw`^(?:(?:±|\+\/-|~|≈|approx(?:imately|\.)?|about|circa|c\.|usd|us\$)\s*)?(?:between\s+)?${RANGE_FIGURE}\s*(?:[-–—]|to|and)\s*${RANGE_FIGURE}\b`,
  "i",
);

/**
 * Two figures stated as a RANGE, as its two ends: "$40,000,000 –
 * $42,000,000", "$40M-$42M", "$40–42M", "$40 to $42 million", "between $40M
 * and $42M". The second figure's scale carries to a first written without
 * one ("$40–42M" is $40M to $42M) wherever that makes a range at all, so
 * "$950,000 – $1.1M" keeps its first figure whole. Null for a single figure,
 * and for two figures that are not a range: a second no larger than the
 * first ("$42,000,000 – $500,000 credit", "$42,000,000 – 5.25% cap") or more
 * than twice it. Any two figures — a market lot rent's "$500–$550 a month"
 * too (lib/manufactured-housing); a price's range is `priceRange`, which
 * refuses a value that is no price.
 */
export function figureRange(raw: string): { low: number; high: number } | null {
  const m = PRICE_RANGE.exec(raw.trim());
  if (!m) return null;
  const n1 = Number(m[1].replace(/,/g, ""));
  const n2 = Number(m[3].replace(/,/g, ""));
  const s1 = scaleOf(m[2]);
  const s2 = scaleOf(m[4]);
  const high = n2 * s2;
  let low = n1 * s1;
  // "$40–42M": the first figure borrows the second's scale where, so
  // scaled, it lies within a range's reach below the second.
  if (!m[2] && m[4] && n1 * s2 <= high && n1 * s2 * 2 >= high) low = n1 * s2;
  if (!Number.isFinite(low) || !Number.isFinite(high) || !(low > 0) || !(high > low) || high > 2 * low) return null;
  return { low, high };
}

// ── A price row's value that is no price (research pass 38) ──────────────

// The figure a value leads with, as `parseMoney` reads it: an approximation
// word, a bracket or a sign, the dollar, the digits and their scale.
const LEAD_FIGURE = new RegExp(
  String.raw`^(?:(?:±|\+\/-|~|≈|approx(?:imately|\.)?|about|circa|c\.|usd|us\$)\s*)?(?:between\s+)?\(?\s*[-−–]?\s*(?:us\$|usd|\$)?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:${SCALE_WORDS})(?![a-z]))?`,
  "i",
);
// What a figure is counted per: a unit by any of the nouns a class counts in,
// a foot by any of its spellings, an acre, a building. Only these: "per the
// OM", "per broker" and "per appraisal" say where the ask came from.
const PER_WHAT = String.raw`(?:units?|doors?|keys?|beds?|rooms?|pads?|sites?|lots?|homes?|houses?|spaces?|stalls?|suites?|apartments?|apts?|slips?|berths?|bays?|acres?|ac|sf|s\.f\.?|sq\.?\s*f(?:oo|ee)?t|square\s+f(?:oo|ee)t|r?sf|nrsf|gsf|nsf|usf|gla|nra|rba|gba|nla|foot|feet|ft|buildings?|propert(?:y|ies)|parcels?)\b`;
const PER_PERIOD = String.raw`(?:years?|yr|annum|annually|months?|mo|monthly)\b`;
const PER = (what: string) => new RegExp(String.raw`^\s*(?:\$?\s*\/\s*${what}|(?:per|a|an|each)\s+${what})`, "i");
// The words right after the figure, and what they make it: never the price.
const NO_PRICE: [RegExp, string][] = [
  [/^\s*(?:%|pct\b|percent\b|per\s?cent\b)/i, "a percentage"],
  [/^\s*(?:¢|cents?\b)/i, "a share of the loan's balance"],
  [/^\s*(?:of\s+(?:the\s+)?)?(?:par|upb)\b|^\s*of\s+(?:the\s+)?(?:face|unpaid|outstanding|balance|principal)\b/i, "a share of the loan's balance"],
  [/^\s*[x×](?![a-z])/i, "a multiple"],
  [/^\s*(?:psf\b|p\.s\.f\.?|each\b)/i, "a figure per unit, per foot or per acre"],
  [PER(PER_WHAT), "a figure per unit, per foot or per acre"],
  [PER(PER_PERIOD), "a figure per year or per month"],
];

/**
 * Why a price row's value is no price, in a few words — "a percentage", "a
 * share of the loan's balance", "a multiple", "a figure per unit, per foot or
 * per acre", "a figure per year or per month" — or null where it is one. Read
 * off the words right after the figure the value leads with, or after a
 * range's second figure: "6.25% cap rate", "75% of UPB", "80 cents on the
 * dollar", "185,000 per unit", "425/SF", "1,850,000 per acre". Each states a
 * fact about the price, never the price: read as the whole price, "6.25% cap
 * rate" put a $6.25 ask on a 410,000 SF warehouse and "75% of UPB" a $75 one
 * on a $20M note. A dollar figure with its cap or its share in words after
 * it — "$42,000,000 (5.25% cap)", "$15,000,000 (75% of UPB)" — is the price.
 */
export function priceRefusal(raw: string): string | null {
  const s = raw.trim();
  const lead = (figureRange(s) ? PRICE_RANGE.exec(s) : null) ?? LEAD_FIGURE.exec(s);
  if (!lead) return null;
  const tail = s.slice(lead[0].length);
  for (const [words, why] of NO_PRICE) if (words.test(tail)) return why;
  return null;
}

/**
 * A price the OM states as a RANGE — pricing guidance, a whisper — as its two
 * ends (`figureRange`); null for a value that is no price (`priceRefusal`): a
 * range of figures per unit is no range of prices.
 */
export function priceRange(raw: string): { low: number; high: number } | null {
  return priceRefusal(raw) ? null : figureRange(raw);
}

/**
 * A PRICE, read on the side that does not flatter the buyer: the top of a
 * range the OM states — a lower price lifts every return and every cap
 * struck on it — else the one figure `parseMoney` reads. Every reader of an
 * asking price goes through here; `parseMoney` stays the reader of every
 * other figure, since an income's or a cost's unflattering side is not its
 * top. It read "$40,000,000 – $42,000,000" guidance as $40M before. A value
 * that is no price (`priceRefusal`: a percentage, a share of a loan's
 * balance, a figure per unit, foot or acre) is none, so the deal reads as
 * unpriced and its row stays in the key terms as written (research pass 38).
 */
export function parsePrice(raw: string): number | null {
  if (priceRefusal(raw)) return null;
  const r = figureRange(raw);
  return r ? r.high : parseMoney(raw);
}

// Counted in tenths of the unit in whole numbers, as every compact figure
// is (lib/money `scaledText`): "$40–42M", "$9–9.5M".
const rangeEnd = (n: number, unit: number, suffix: string) => `${scaledText(n, unit, 1, true)}${suffix}`;

// A figure that rounds to a thousand thousands is said in millions, as
// `compactUsd` says it alone: "$1M", never "$1000k".
const inMillions = (n: number) => Math.round(n / 100) >= 10_000;

/** A range as one short figure — "$40–42M", "$950k–$1.1M" — for a slot
 *  that shows one price. */
export function priceRangeShort(r: { low: number; high: number }): string {
  if (inMillions(r.low)) return `$${rangeEnd(r.low, 1e6, "")}–${rangeEnd(r.high, 1e6, "M")}`;
  if (inMillions(r.high)) return `$${rangeEnd(r.low, 1e3, "k")}–$${rangeEnd(r.high, 1e6, "M")}`;
  if (r.low >= 1e3) return `$${rangeEnd(r.low, 1e3, "")}–${rangeEnd(r.high, 1e3, "k")}`;
  return `$${Math.round(r.low)}–${Math.round(r.high)}`;
}

/** "5.25%" / "5.25 %" → 5.25, or null. */
export function parsePct(raw: string): number | null {
  const m = raw.replace(/\s/g, "").match(/(-?\d+(?:\.\d+)?)%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const fmtM = (dollars: number) => compactUsd(dollars);

const fmtSf = (sf: number) =>
  sf >= 1e6
    ? `${(sf / 1e6).toFixed(2).replace(/\.?0+$/, "")}M SF`
    : `${Math.round(sf / 1e3)}k SF`;

const fmtCount = (n: number) => Math.round(n).toLocaleString("en-US");
const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface MetricLike {
  label: string;
  value: string;
}

interface ExtractionLike {
  assetClass?: string;
  market?: string;
  address?: string;
  metrics: MetricLike[];
  /** the deal's strategy as the extraction read it; a plan deal (value-add,
   *  lease-up, conversion, development) has no going-in cap to check */
  strategy?: { kind?: string } | null;
  /** what the price buys (#414); a note's price is a loan's, so the
   *  collateral's cap is not the buyer's and no cap floor is checked on it */
  interest?: { kind?: string | null } | null;
  /** why the deal's cap slot holds no cap of its own, carried in by
   *  `buyBoxCheckSource`'s reads (`capWithheldOf`); absent on a raw
   *  extraction */
  capWithheld?: CapWithheldKind | null;
  /** whether a per-unit figure the memorandum states is the building's,
   *  carried in by `buyBoxCheckSource`'s reads; absent on a raw extraction,
   *  which is read as before */
  statedBasisIsBuildings?: boolean;
  /** what a partial interest holds, carried in by `buyBoxCheckSource`'s
   *  reads (`Holding`); absent on a raw extraction and on any other share */
  holding?: Holding | null;
  /** the loan the memorandum states on a tenancy in common's property, in
   *  lib/interest's `entityLoanWords`; absent where none is stated */
  loanWords?: string | null;
  /** a share's holding, carried in by `buyBoxCheckSource`'s reads
   *  (`ShareRead`); absent on a raw extraction and on anything but a share */
  shareRead?: ShareRead | null;
  /** the day the screen read the memorandum (ExtractionResult.screenedOn) —
   *  the year a price label's year is judged against (`screenYearOf`) */
  screenedOn?: string | null;
}

/** What a partial interest holds, where its words say: an undivided
 *  interest in the property held as a tenant in common (lib/interest
 *  `isTenancyInCommon`) — title to real estate, never a share of an entity —
 *  or a share of the general partner's interest (`isGpStake`), a share of a
 *  share. */
export type Holding = "tic" | "gp_stake";

/**
 * What a share of the owning entity is, by lib/interest's readers (which
 * this module cannot import): a share of the general partner's interest (a
 * share of a share, `isGpStake`) and whether a percentage of the entity is
 * stated (`interestOf`'s `sharePct`).
 */
export interface ShareRead {
  gpStake: boolean;
  pctStated: boolean;
}

/**
 * Why a deal's stated going-in cap is no cap its buyer earns — its cap
 * slot's own reason (lib/compare-interest `capSlotWithheld`), carried in by
 * `buyBoxCheckSource`'s reads: the price buys a loan or a preferred equity
 * position, or a share beside the loan its entity carries, whose price
 * grossed up is the equity's whole. A raw extraction, built without the
 * reads, is read by its stored kind alone: a note, a position. Null where the
 * stated cap stands. One reader for the buy box's check, the mandate's cap
 * dimension and its dealbreaker floor.
 */
export function capWithheldOf(ex: ExtractionLike | null | undefined): CapWithheldKind | null {
  if (!ex) return null;
  if (ex.capWithheld !== undefined) return ex.capWithheld;
  const kind = ex.interest?.kind;
  return kind === "note" ? "note" : kind === "preferred_equity" ? "position" : null;
}

/** The going-in cap check's words where the cap is withheld, by the cap
 *  slot's own reason — the buy box's check and the mandate's dimension say
 *  the same sentence. */
export function capWithheldDetail(
  floorPct: number,
  why: CapWithheldKind,
  ex?: Pick<ExtractionLike, "holding" | "loanWords"> | null,
): string {
  const head = `Mandate wants ≥${floorPct}% going-in`;
  if (why === "note") {
    return `${head}, but this is a note: its price is a loan's, and the collateral's cap is not a return the note's buyer earns.`;
  }
  if (why === "position") {
    return `${head}, but this is a preferred equity position: its price buys a rate and a redemption, never a slice of the building, and the building's cap is not a return the position's buyer earns.`;
  }
  // What the share holds, said as the deal's own surfaces say it (the audit
  // C3b MED-4: a tenancy in common had read "a share of the owning entity",
  // which its own lead says it is not, and its loan "its entity's").
  if (ex?.holding === "gp_stake") {
    return `${head}, but this sells a share of the general partner's interest, a share of a share: no figure grosses its price up to the building's, and the building's cap is not a return its buyer earns.`;
  }
  if (ex?.holding === "tic") {
    return `${head}, but beside ${ex.loanWords ?? "the loan the memorandum states on the property"}, this interest's price grossed up is the equity's whole, not the building's: a cap stated against that price is on a basis the memorandum never says.`;
  }
  return `${head}, but beside the loan its entity carries, this share's price grossed up is the equity's whole, not the building's: a cap stated against that price is on a basis the memorandum never says.`;
}

/** Why the target-return check holds no IRR the memorandum states to the
 *  box's floor: the cap slot's own reasons (`capWithheldOf`: a note, a
 *  preferred equity position, a share beside the loan its entity carries),
 *  a leased fee, whose price buys the land under the ground lease, a share
 *  of the general partner's interest (a share of a share), and a share of
 *  no stated percentage, whose price grosses up to no building's. */
export type ReturnWithheldKind = CapWithheldKind | "leased_fee" | "gp_stake" | "share_unstated";

/**
 * Why an IRR the memorandum states is no return of this deal's buyer
 * (research pass 41): where the price buys no building, a stated IRR is the
 * property's — the collateral's, the building's above a position or the
 * entity's loan, the building's above the land — or of a kind the screen
 * does not read, and the box holds none of them to its target, as the cap
 * and basis checks beside it hold none. A GP stake's price buys a share of
 * a share, and a share of no stated percentage grosses up to no building's
 * price (audit C4, L2). One reader for the buy box's check and the
 * mandate's IRR dimension. Null where the stated IRR is checked — a share
 * of a stated percentage with no entity loan among them, whose deal-level
 * IRR is the owner's call.
 */
export function returnWithheldOf(ex: ExtractionLike | null | undefined): ReturnWithheldKind | null {
  if (!ex) return null;
  if (ex.shareRead?.gpStake) return "gp_stake";
  const cap = capWithheldOf(ex);
  if (cap) return cap;
  if (ex.interest?.kind === "leased_fee") return "leased_fee";
  return ex.interest?.kind === "partial_interest" && ex.shareRead && !ex.shareRead.pctStated ? "share_unstated" : null;
}

/** The target-return check's words where the IRR is withheld, by the same
 *  reasons — the buy box's check and the mandate's dimension say the same
 *  sentence. */
export function returnWithheldDetail(targetPct: number, why: ReturnWithheldKind): string {
  const head = `Mandate targets ≥${targetPct}% IRR`;
  if (why === "gp_stake") {
    return `${head}, but this is a share of the general partner's interest: a share of a share, whose price no figure grosses up to the building's, so an IRR the memorandum states is not read as this stake's return.`;
  }
  if (why === "share_unstated") {
    return `${head}, but this share states no percentage of the owning entity: its price grosses up to no building's, so an IRR the memorandum states is not read as this share's return.`;
  }
  if (why === "note" || why === "under_water") {
    return `${head}, but this is a note: its price is a loan's, and an IRR the memorandum states is not read as the note's return — the collateral's is not a return the note's buyer earns.`;
  }
  if (why === "position") {
    return `${head}, but this is a preferred equity position: its price buys a rate and a redemption, never a slice of the building, and an IRR the memorandum states is not read as the position's return.`;
  }
  if (why === "leased_fee") {
    return `${head}, but the price buys the land under the ground lease: the screen does not read whether an IRR the memorandum states is the land's or the building's above it, so it is not held to the target.`;
  }
  return `${head}, but beside the loan its entity carries, this share's price grossed up is the equity's whole, not the building's: an IRR the memorandum states is not read as this share's return.`;
}

/**
 * Why a per-unit figure the memorandum states is no basis of the building's
 * (lib/deal-strategy `statedBasisIsBuildings`, carried in by the reads), in
 * the words the basis check says it — the collateral's, the land's, the
 * whole's or the share's, never the building bought outright. Null where the
 * figure stands, and on a raw extraction.
 */
export function basisWithheldWhy(ex: ExtractionLike | null | undefined, noun: string): string | null {
  if (ex?.statedBasisIsBuildings !== false) return null;
  switch (ex.interest?.kind) {
    case "note":
      return `this is a note: its price is a loan's, and a per-${noun} figure on it is the collateral's, not a basis the note's buyer pays`;
    case "preferred_equity":
      return "this is a preferred equity position: its price buys a rate and a redemption, never a slice of the building, and no basis is struck on it";
    case "leased_fee":
      return "the price buys the land under the ground lease, and is never divided over the building";
    case "partial_interest":
      if (ex.holding === "gp_stake") {
        return `this sells a share of the general partner's interest, a share of a share: its price is never grossed up or divided over the building, and no per-${noun} basis is struck on it`;
      }
      if (ex.holding === "tic") {
        return `this sells an undivided interest held as a tenant in common: a per-${noun} figure the memorandum states is on a basis it never says, the whole's or the interest's`;
      }
      return `this sells a share of the owning entity: a per-${noun} figure the memorandum states is on a basis it never says, the whole's or the share's`;
    default:
      return `a per-${noun} figure the memorandum states is not the building's basis`;
  }
}

export function findMetric(
  metrics: MetricLike[],
  include: RegExp,
  exclude?: RegExp,
): MetricLike | null {
  return (
    metrics.find(
      (m) => include.test(m.label) && !(exclude && exclude.test(m.label)),
    ) ?? null
  );
}

// ── The building's size ──────────────────────────────────────────────────
//
// A row IS the building's size only when its label, read whole, has the
// shape of a size label: optional prefixes (total, net, gross, rentable,
// leasable, building, proposed, planned …), the noun (SF, sq ft, square
// feet / footage, RSF, NRA, GLA, RBA, GBA, NLA, area, size, floor area,
// improvements) and nothing after it. Everything else that carries "SF" —
// a land, site or lot area, an average unit size, a component ("Retail
// SF", "Office SF" in a mixed-use deck), a partial ("Vacant SF", "Leased
// SF"), a rate per SF — is not the building, and reading one as the
// building puts a wrong size on the buy-box check, the mandate score and
// every $/SF basis. One reader for all of them, as for the unit count.
const SIZE_LABEL =
  /^(?:(?:total|net|gross|rentable|leasable|building|property|asset|overall|proposed|planned|existing|current|as[- ]built|approx\.?|approximate|±)\s+)*(?:sf|s\.f|sq\.? ?ft|sqft|square (?:feet|foot|footage)|rsf|nrsf|gsf|usf|nra|gla|rba|gba|nla|area|size|floor area|improvements?)(?:\s+(?:sf|s\.f|sq\.? ?ft|sqft|square (?:feet|footage)|area|size))?(?:\s+(?:total|rentable|gross|net|leasable|proposed|planned))?$/i;
// A parenthetical naming a subset or another thing entirely — "(office)",
// "(Phase II)", "(land)", "(2 buildings)" — keeps the row from being the
// building's size; any other ("(SF)", "(rentable)", "(proposed)") is
// dropped before the shape is read.
const SIZE_SUBSET_PAREN =
  /land|site|lot|parcel|acre|retail|office|industrial|residential|warehouse|phase|bldg|building|tower|floor|wing|unit|\bof\b|\d/i;

/** Whether a metric label is the row that states the building's size —
 *  the whole building, never the land, a unit, a component or a partial. */
export function isSizeLabel(label: string): boolean {
  for (const p of label.toLowerCase().match(/\([^)]*\)/g) ?? []) if (SIZE_SUBSET_PAREN.test(p)) return false;
  const s = sizeLabelCore(label);
  // "Building Size / SF": two size nouns either side of a slash are still
  // one size label; "Units / SF" or "Price / SF" are not.
  if (s.includes("/")) return s.split("/").every((part) => SIZE_LABEL.test(part.trim()));
  return SIZE_LABEL.test(s);
}

/** A size label with its parentheticals, dashes and trailing punctuation
 *  removed — the form the shape test AND the bare-label test read, so
 *  "Size:" and "Size (SF)" are as bare as "Size". */
function sizeLabelCore(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:.]+$/, "")
    .trim();
}

// A bare "Size" / "Area" / "Property size" label says nothing about WHAT is
// measured — on a land OM "Size: 545,000 SF" is the lot — so its value must
// carry a square-footage noun to count as the building.
const BARE_SIZE_LABEL = /^(?:(?:total|property|asset|overall)\s+)*(?:area|size)$/i;

const SF_NOUN = /\b(?:rsf|nrsf|gsf|usf|nra|gla|rba|gba|nla|sf|s\.?f\.?|sq\.?\s?ft\.?|sqft|square\s+(?:feet|foot|footage))(?![a-z])/i;
// The number the square footage follows: "250,000 SF", "±250,000 SF",
// "1.2 million SF", "250,000 Sq. Ft.", "250k sq ft", "250,000 SF+".
const SF_FIGURE =
  /(?:±|\+\/-|approx(?:imately|\.)?|about|~|≈|c\.)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|mm|m|million|thousand)?\s*(?:\+|±)?(?:\s+(?:net\s+)?(?:rentable|gross|leasable|usable|total|building))?\s*(?:rsf|nrsf|gsf|usf|nra|gla|rba|gba|nla|sf|s\.?f\.?|sq\.?\s?ft\.?|sqft|square\s+(?:feet|foot|footage))(?![a-z])/i;

function sfNumber(n: string, unit: string | undefined): number | null {
  const base = Number(n.replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const u = (unit ?? "").toLowerCase();
  const mult = u === "k" || u === "thousand" ? 1e3 : u === "m" || u === "mm" || u === "million" ? 1e6 : 1;
  return base * mult;
}

/** Square feet from a metric's value — "250,000", "250,000 SF", "250,000
 *  Sq. Ft.", "±250,000 SF", "250k sq ft", "1.2 million SF", "250,000 SF
 *  (rentable)", "250,000 SF on 12.5 acres" (the figure the SF noun
 *  follows) — or null when the value is not one building area: a ratio or
 *  a range ("250,000 / 12,000 SF", "250,000–300,000 SF"), a rate, an
 *  acreage or a unit count with no square footage, or too small to be a
 *  building. */
export function parseSf(value: string): number | null {
  const v = value.replace(/\([^)]*\)/g, " ").trim();
  // A pair or a range is two figures, not one.
  if (/\/|–|—|\bto\b|\d\s*-\s*\d/.test(v)) return null;
  // Two square footages in one value — "40,000 SF office and 210,000 SF
  // warehouse" — are components, and neither is the building.
  const figures = [...v.matchAll(new RegExp(SF_FIGURE.source, "gi"))];
  if (figures.length > 1) return null;
  const withNoun = figures[0] ?? null;
  let n: number | null;
  if (withNoun) {
    n = sfNumber(withNoun[1], withNoun[2]);
  } else {
    // No square-footage noun: only a bare figure counts, and never one that
    // names another unit.
    if (/acre|\bac\b|unit|key|bed|room|%|\$|\bper\b/i.test(v)) return null;
    const bare = v
      .replace(/^(?:±|\+\/-|approx(?:imately|\.)?|about|~|≈|c\.)\s*/i, "")
      .replace(/\s*(?:\+|±|total|gross|net)$/i, "")
      .trim()
      .match(/^(\d[\d,]*(?:\.\d+)?)\s*(k|mm|m|million|thousand)?$/i);
    if (!bare) return null;
    n = sfNumber(bare[1], bare[2]);
  }
  return n != null && n >= 100 ? n : null;
}

/** The row that states the building's size — the first row that IS one,
 *  so a "Land SF" or "Average unit size" row ahead of "Total SF" never
 *  shadows it — or null. For surfaces that show the OM's own wording or
 *  cite its page. */
export function buildingSfRow(metrics: MetricLike[]): MetricLike | null {
  // A bare "Size" row on a deck that also states the lot — as an acreage
  // ("Acres: 12.5", "Site: 12.5 acres") or in square feet ("Lot size:
  // 544,500 SF") — is the land's when the two agree: 12.5 acres is 544,500
  // SF, so "Size: 545,000 SF" beside "Acres: 12.5" is the lot. Beside "Land
  // area: 4.2 acres", a "Total area: 285,000 SF" is still the building.
  const lotSf: number[] = [];
  for (const m of metrics) {
    if (!/acre|\bland\b|\blot\b|\bsite\b|\bparcel\b/i.test(m.label)) continue;
    const withUnit = m.value.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:acres?|\bac\b)/i);
    // Under an "Acres" label the bare figure is the acreage.
    const bare = /acre/i.test(m.label)
      ? m.value
          .replace(/\([^)]*\)/g, " ")
          .trim()
          .match(/^(?:±|~|≈|approx\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\+|±)?$/i)
      : null;
    const hit = withUnit ?? bare;
    const acres = hit ? Number(hit[1].replace(/,/g, "")) : NaN;
    if (Number.isFinite(acres) && acres > 0) lotSf.push(acres * 43_560);
    else if (!hit) {
      const sf = parseSf(m.value);
      if (sf != null) lotSf.push(sf);
    }
  }
  const isLotSize = (sf: number) => lotSf.some((l) => Math.abs(sf - l) / l < 0.05);
  for (const m of metrics) {
    if (!isSizeLabel(m.label)) continue;
    const sf = parseSf(m.value);
    if (sf == null) continue;
    // A bare label needs the square-footage noun somewhere — in the value
    // ("250,000 SF") or in the label's own parenthetical ("Size (SF)") —
    // and even then a figure that matches the stated lot is the lot.
    if (
      BARE_SIZE_LABEL.test(sizeLabelCore(m.label)) &&
      (!(SF_NOUN.test(m.value) || SF_NOUN.test(m.label)) || isLotSize(sf))
    )
      continue;
    return m;
  }
  return null;
}

/** The building's size in square feet, or null when the OM states none.
 *  One reader for the buy-box check, the mandate score, the market and
 *  comp memories, the plausibility check, the Excel inputs and the deal
 *  page's Size slot, so every $/SF figure divides by the same area. */
export function buildingSfFromMetrics(metrics: MetricLike[]): number | null {
  const row = buildingSfRow(metrics);
  return row ? parseSf(row.value) : null;
}

// ── The unit count ───────────────────────────────────────────────────────
//
// The size reader's sibling, and kept beside it for the same reason: the
// buy box's count band, the mandate score, the plan summary, the comp and
// market memories, the plausibility check and the Excel model all divide by
// this one number, so there is one reader. (lib/deal-strategy re-exports
// these under the names every surface already imports.)
//
// A row COUNTS the units only when its label, read whole, has the shape of
// a count label: an optional "total" / "number of" / "#" prefix, an
// optional physical qualifier (residential, apartment, rental, guest,
// storage, student, licensed, certified, wet …), the noun (units, doors,
// keys, rooms, beds, pads, sites, campsites, suites, apartments, homes,
// lots, spaces, slips) and nothing after it but
// "count" / "total" / "proposed" / "planned". Everything that merely
// mentions units — "Unit mix", "Unit sizes", "Units per acre", a price per
// unit — and every PARTIAL count — "Vacant units", "Affordable units",
// "Units under renovation", "Units offline", "Units (Phase I)" — is not the
// count, and reading one as the count puts a wrong basis on every per-unit
// surface. Whitelisting the shape beats blacklisting adjectives: the next
// OM's "Units delivered" needs no new word.
// A care facility's licensed or certified beds, a marina's (wet) slips and a
// campground's campsites are each the whole count in the deck's own noun
// (research pass 28): an SNF's per-bed and a marina's per-slip basis had
// never been struck.
const COUNT_LABEL =
  /^(?:(?:total|net rentable|rentable|gross|overall)\s+)?(?:(?:number|no\.?|count|#)\s+(?:of\s+)?)?(?:total\s+)?(?:(?:proposed|planned|existing|current|as[- ]built|approved|entitled|zoned|permitted)\s+)?(?:(?:residential|apartment|apt\.?|rental|multi[- ]?family|dwelling|leasable|rentable|living|guest|hotel|storage|self[- ]storage|student|mobile[- ]home|manufactured[- ]home|mh|rv|senior(?: living)?|licensed|certified|wet)\s+)?(?:units?|doors?|keys?|rooms?|guest ?rooms?|beds?|pads?|sites?|home ?sites?|camp ?sites?|suites?|apartments?|apartment homes?|homes?|lots?|spaces?|slips?)(?:\s+(?:count|total|proposed|planned))?$/i;
// A parenthetical naming a subset — "(Phase I)", "(Building A)", "(of 312)"
// — keeps the row from being the count; any other ("(proposed)", "(per
// OM)", "(IL/AL/MC)") is dropped before the shape is read.
const SUBSET_PAREN = /phase|bldg|building|tower|wing|floor|\bof\b|\d/i;

/** Whether a metric label is the row that counts the units (or keys, beds,
 *  pads, sites …) — the whole count, never a subset or a row about them. */
export function isCountLabel(label: string): boolean {
  let s = label.toLowerCase().replace(FOOTNOTE_MARK, "").trim();
  for (const p of s.match(/\([^)]*\)/g) ?? []) {
    if (FOOTNOTE_PAREN.test(p)) continue; // "Units (1)" — a footnote, not a subset
    if (SUBSET_PAREN.test(p)) return false;
  }
  s = s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:.]+$/, "")
    .trim();
  // "Keys / Rooms", "Units / Keys", "Total Beds / Units": two count nouns
  // either side of a slash are one count label; "Units / SF" is not.
  if (s.includes("/")) return s.split("/").every((part) => COUNT_LABEL.test(part.trim()));
  return COUNT_LABEL.test(s);
}

// A count is a whole number, on its own or with what it counts — "312",
// "312 units", "248-unit", "312 (proposed)", "approx. 300 apartments",
// "248 total". Anything else ("40% studio / 60% 1BR", "650–1,200 SF",
// "312 / 285,000 SF", "248 (of 312)") is not the whole count, and reading
// its first digits as one puts a wrong basis on every per-unit surface.
// The value can repeat the label's own qualifier — "312 residential units",
// "150 guest rooms", "240 rental units" — so the qualifiers COUNT_LABEL
// admits are stripped here too.
const COUNT_WORD =
  /\b(units?|keys?|doors?|apartments?|apts?\.?|homes?|residences?|beds?|pads?|rooms?|sites?|camp ?sites?|lots?|spaces?|suites?|slips?|total|residential|rental|multi[- ]?family|dwelling|leasable|rentable|living|guest|hotel|storage|self[- ]storage|student|senior|manufactured|mobile[- ]home|mh|rv|licensed|certified|wet)\b/gi;
// A footnote marker on a label or a value — "Units*", "312¹", "Units (1)"
// — is not part of the count.
const FOOTNOTE_MARK = /[*†‡¹²³⁴]+/g;
const FOOTNOTE_PAREN = /^\(\s*\d{1,2}\s*\)$/;
const COUNT_PREFIX = /^(approx(imately|\.)?|about|circa|c\.|~|≈|±)\s*/i;

/** A whole-number count from a metric's value, or null when the value is
 *  not one (a zero is not a count — a blank is null, never zero). Exported
 *  so every surface that needs a count reads it the same way. */
export function parseCount(value: string): number | null {
  // "248 (of 312)" is a subset of a count, and "312 units (Phase I)" or
  // "120 units (Building A)" a part's, not the count; "312 units (285
  // market-rate, 27 affordable)" and "312 units (2 buildings)" — a
  // parenthetical that opens with a figure — are the count with its
  // breakdown.
  for (const p of value.match(/\([^)]*\)/g) ?? []) {
    if (/^\(\s*\d/.test(p)) continue;
    if (/\bof\b|out of|\/|phase|bldg|building|tower|wing|floor/i.test(p)) return null;
  }
  const s = value
    .replace(FOOTNOTE_MARK, " ") // "312*", "312¹"
    .replace(/^[a-z][a-z .#]*:\s*/i, "") // "Units: 248"
    .replace(/\([^)]*\)/g, " ")
    .replace(/(\d)[-–](?=[a-z])/gi, "$1 ") // "248-unit"
    .replace(COUNT_WORD, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(COUNT_PREFIX, "")
    .replace(/\+$/, "")
    .replace(/\.0+$/, "")
    .trim();
  if (!/^(\d{1,3}(,\d{3})+|\d+)$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** The row that counts the units — the first row that IS a count, so a
 *  "Unit mix" row ahead of "Units" never shadows it — or null. For surfaces
 *  that show the OM's own wording ("248 units", "612 (proposed)") or cite
 *  its page. */
export function unitCountRow<M extends MetricLike>(metrics: readonly M[]): M | null {
  let rv: M | null = null;
  for (const m of metrics) {
    if (!isCountLabel(m.label)) continue;
    const n = parseCount(m.value);
    if (n == null || n < 1 || n > 50_000) continue;
    // An RV site is not a pad (#470): a park that states both is counted by
    // its pads, whichever row comes first; an RV resort's sites are its
    // count where nothing else is.
    if (/^\s*(?:rv|r\.v\.)\s/i.test(m.label)) {
      rv ??= m;
      continue;
    }
    return m;
  }
  return rv;
}

/** The unit count — on a plan deal the finished product's ("Units
 *  (proposed)") — as a positive number, or null when no row parses. One
 *  reader for the plan summary, analytics, the deal context, the comp and
 *  market memories, the plausibility check and the Excel model, so every
 *  per-unit figure divides by the same count. */
export function unitCountFromMetrics(metrics: MetricLike[]): number | null {
  const row = unitCountRow(metrics);
  return row ? parseCount(row.value) : null;
}

/** A count row that names the finished product: "Units (proposed)", "Keys
 *  (proposed)" — the extraction's own label for a plan's count — "Proposed
 *  units", "Planned keys". */
const PLANNED_COUNT = /\b(?:proposed|planned)\b/i;

/**
 * The row that counts what a plan's total cost buys. On a conversion or a
 * development — whose building is not yet the finished product — only a
 * count row the memorandum labels proposed or planned, in that row's own
 * noun: a count of today's building ("Units 40" beside "Keys (proposed)
 * 160" on an office-to-hotel conversion) is no count of the finished
 * product, and the all-in cost over it had read $1.5M a unit where the key
 * costs $375k (the audit of 2026-10-05). Null where it states none. On any
 * other kind the count row (`unitCountRow`): a value-add's or a lease-up's
 * units stand.
 */
export function planCountRow<M extends MetricLike>(metrics: readonly M[], kind: string | null | undefined): M | null {
  if (kind !== "conversion" && kind !== "development") return unitCountRow(metrics);
  return unitCountRow(metrics.filter((m) => PLANNED_COUNT.test(m.label)));
}

/** What one of what that count counts is called, singular and plural: the
 *  counting row's own noun (`countNoun` — a hotel counting "Rooms" is per
 *  room), else the class's, else units. The plan's basis on the deal page,
 *  the shared screen and the report reads it, as the workbook's and the
 *  pipeline card's per-unit figures do (research pass 34: the plan said
 *  "key" beside their "room"). Given the deal's kind, the row the plan's
 *  basis divides by (`planCountRow`): on a conversion, the proposed keys'
 *  noun, never today's units'. */
export function countNounOf(
  metrics: readonly MetricLike[],
  cls: string | null | undefined,
  kind?: string | null,
): { one: string; many: string } {
  const row = kind === undefined ? unitCountRow(metrics) : (planCountRow(metrics, kind) ?? unitCountRow(metrics));
  const many = countNoun(row?.label, cls);
  return { one: many.replace(/s$/, ""), many };
}

// ── Today's occupancy ────────────────────────────────────────────────────
//
// The occupancy an OM states for the building as it stands — never the
// sponsor's stabilized / pro forma / target figure, a break-even, a market
// average, or a development's pre-leasing — for the cell the Excel model
// labels "In-Place Occupancy" and the retrade diff's Occupancy row. An OM
// that lists "Stabilized occupancy: 95%" above "Current occupancy: 42%"
// must read 42%; one that states only the stabilized figure states no
// occupancy today.
const OCC_INCLUDE = /occupancy|occupied|\bleased\b/i;
// Not a projection, a break-even, a market or comp average, a
// development's pre-leasing — and not a retail tenant's occupancy COST
// (a share of sales) or an occupancy growth rate. A T-12 average IS
// today's occupancy.
const OCC_EXCLUDE =
  /economic|physical vacancy|stabili[sz]|pro ?forma|projected|forward|target|underwritten|year ?\d|\byr ?\d|\by\d\b|at (completion|stabili[sz]ation)|pre-?leas|break-?even|market|submarket|comp|(market|submarket|comp\w*)\s+(average|avg)|cost|growth|\bratio\b/i;
const OCC_IN_PLACE = /current|in[- ]?place|physical|actual|as of|t-?12|ttm|trailing|existing|today|in place/i;
// The VALUE can carry the projection too — "95% (stabilized)", "95% at
// stabilization", "95% pro forma" — and such a row states no occupancy
// today. (An "88% physical / 84% economic" value is today's: the first
// figure reads.)
const OCC_VALUE_EXCLUDE =
  /stabili[sz]|pro ?forma|projected|(at|upon) (completion|stabili[sz]ation)|target|underwritten|pre-?leas/i;
// The forward word has to QUALIFY the stated figure. A parenthetical or a
// clause carrying its own percentage — "94% (Target: 95%)", "88% occupied,
// 95% pre-leased" — is a second figure, and the first one is today's.
const occupancyHead = (value: string): string =>
  value.replace(/\([^)]*\d\s*%[^)]*\)/g, " ").split(/[,;]|\band\b/i)[0];

/** The metric row stating today's occupancy: an explicitly in-place row
 *  first, else a plain occupancy row that carries no forward word in its
 *  label or its value — and only a row whose value IS a percentage, so a
 *  "Leased SF" or "Occupied units" row never shadows it. Null when the OM
 *  states only the finished project's figure. */
export function occupancyRow(metrics: MetricLike[]): MetricLike | null {
  const eligible = metrics.filter(
    (m) =>
      OCC_INCLUDE.test(m.label) &&
      !OCC_EXCLUDE.test(m.label) &&
      !OCC_VALUE_EXCLUDE.test(occupancyHead(m.value)) &&
      parsePct(m.value) != null,
  );
  return eligible.find((m) => OCC_IN_PLACE.test(m.label)) ?? eligible[0] ?? null;
}

/** Today's occupancy as a percentage (0–100), or null. */
export function occupancyPctFromMetrics(metrics: MetricLike[]): number | null {
  const row = occupancyRow(metrics);
  const n = row ? parsePct(row.value) : null;
  return n != null && n >= 0 && n <= 100 ? n : null;
}

/** The effective price band, folding the legacy max-only field in. */
export function priceBand(box: BuyBox): { min?: number; max?: number } {
  return {
    min: box.priceMinM != null ? box.priceMinM * 1e6 : undefined,
    max:
      box.priceMaxM != null
        ? box.priceMaxM * 1e6
        : box.maxPriceM != null
          ? box.maxPriceM * 1e6
          : undefined,
  };
}

/** Parse + sanitize the geography-chips JSON the picker submits. Pure and
 *  shared with the save action so what the picker can build, the save can
 *  keep — dropping a field here (aliases, once) silently neutered the
 *  one-tap market territories after reload. Caps mirror the picker's 24. */
export function sanitizeGeoTargets(raw: unknown): GeoTarget[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return undefined;
    const out: GeoTarget[] = [];
    for (const item of arr.slice(0, 24)) {
      const label = String(item?.label ?? "").slice(0, 80).trim();
      if (!label) continue;
      const aliases = Array.isArray(item?.aliases)
        ? item.aliases
            .map((a: unknown) => String(a).toLowerCase().trim().slice(0, 40))
            .filter((a: string) => a.length > 1)
            .slice(0, 16)
        : [];
      out.push({
        label,
        city: item?.city ? String(item.city).slice(0, 60) : undefined,
        state: item?.state ? String(item.state).slice(0, 30) : undefined,
        county: item?.county ? String(item.county).slice(0, 60) : undefined,
        ...(aliases.length ? { aliases } : {}),
      });
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** All geography targets, folding the legacy comma-string in as bare labels. */
export function geoTargets(box: BuyBox): GeoTarget[] {
  const chips = [...(box.geos ?? [])];
  for (const raw of (box.markets ?? "").split(",")) {
    const label = raw.trim();
    if (label && !chips.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      chips.push({ label });
    }
  }
  return chips;
}

/**
 * Check a screened deal against the mandate. Only criteria the buyer set
 * produce rows; anything the screen hasn't yielded parseable data for is
 * reported "unknown", never silently passed.
 */
/** Fields of FirstSignal / StructuredAddress the check source consumes —
 *  structural so this stays importable everywhere without heavy types. */
interface SignalLike {
  assetClass: string;
  market: string;
  askPrice: string;
  goingInCap: string;
  perUnit: string;
}
interface AddressLike {
  label?: string;
  county?: string;
  state?: string;
}

/**
 * What the buy box reads off a deal beside its rows, by the readers every
 * slot of the deal reads — readers this module cannot import (lib/deal-
 * strategy imports it, and the pipeline's client bundle must not load the
 * interest reader): lib/buy-box-chip's `dealCheckSource` makes them, and
 * every page, route and document builds its source there.
 */
export interface SourceReads {
  /** what the price buys, as lib/interest `interestOf` reads it — a share
   *  the extraction filed whose rows say a preferred equity position is one */
  interestKind: string;
  /** why the deal's cap slot holds no cap of its own (lib/compare-interest
   *  `capSlotWithheld`): a note, a position, a share beside the loan its
   *  entity carries; null where the stated cap stands */
  capWithheld: CapWithheldKind | null;
  /** whether a per-unit figure the memorandum states is the building's
   *  (lib/deal-strategy `statedBasisIsBuildings`): false for a note, a
   *  position, a leased fee and a share */
  statedBasisIsBuildings: boolean;
  /** on a share of the owning entity, what it is (`ShareRead`): a GP stake
   *  and a share of no stated percentage hold no stated IRR to the target;
   *  null on anything but a share */
  share?: ShareRead | null;
  /** the first signal's going-in cap, as the deal header reads it
   *  (lib/deal-strategy `signalGoingInCap`): only where it can be a cap on
   *  the price at all; null otherwise */
  signalCap: { text: string; pct: number } | null;
  /** what a partial interest holds (`Holding`): absent where it is neither */
  holding?: Holding | null;
  /** the loan stated on a tenancy in common's property, in lib/interest's
   *  `entityLoanWords`: absent where none is stated */
  loanWords?: string | null;
}

/**
 * Build the pseudo-extraction the buy box is judged against: the full
 * extraction when it's in, else the ~30s first signal standing in, with the
 * user-entered address widening the location haystack either way. ONE
 * implementation — the deal page, the triage endpoint, and anything else
 * must agree on what "fits the box" means mid-screen. Every caller goes
 * through lib/buy-box-chip's `dealCheckSource`, which hands in the kind and
 * the reads; built without the reads, the extraction's stored interest is
 * read as before.
 */
export function buyBoxCheckSource(
  extraction: ExtractionLike | null,
  firstSignal: SignalLike | null,
  dealAddress: AddressLike | null,
  /** the deal's kind as the page inferred it (extraction + first signal),
   *  when the caller has it — so a bare land OM the extraction called
   *  "unknown" still judges its land cost as the price and a plan deal
   *  keeps its "no going-in cap" reading */
  strategyKind?: string | null,
  /** what the price buys, by the deal's own readers (`SourceReads`) */
  reads?: SourceReads | null,
): ExtractionLike | null {
  const addressHaystack = [
    extraction?.address,
    dealAddress?.label,
    dealAddress?.county,
    dealAddress?.state,
  ]
    .filter(Boolean)
    .join(" ");
  // The first signal's cap is a fast read with no label to check. It counts
  // as the going-in cap only when it can be a cap on the price at all: a
  // yield on cost or a stabilized pro forma on a plan deal reads as "105%"
  // here, and a buy-box check on that would be confidently wrong. Read by
  // the deal header's own reader (the reads' `signalCap`), so the cap the
  // header prints is the cap the box judges — at the figure that reader
  // read, whatever else its text carries.
  const signalCapRow = reads?.signalCap ? { label: "Going-in cap rate", value: `${reads.signalCap.pct}%` } : null;
  const signalMetrics = firstSignal
    ? [
        { label: "Asking price", value: firstSignal.askPrice },
        ...(signalCapRow ? [signalCapRow] : []),
        {
          // Broad per-area test: "sf", "psf", "sq ft", "square foot", "/ft"
          // must all count — a per-SF figure misread as per-unit would give
          // the buy-box check a confidently wrong basis.
          label: /sf|sq|square|psf|\/\s?ft/i.test(firstSignal.perUnit)
            ? "Price per SF"
            : "Price per unit",
          value: firstSignal.perUnit,
        },
      ].filter((m) => m.value.trim())
    : [];
  if (!extraction && !firstSignal && !dealAddress) return null;
  // Where the memorandum states no going-in cap, the header prints the first
  // signal's (lib/pipeline-slots `statedCapSlot`) — none on a plan deal,
  // none where the cap slot is withheld — and the box judges the same
  // figure: it had said "no parseable cap rate" beside the cap the header
  // printed (the audit of 2026-10-05).
  const kind = strategyKind ?? extraction?.strategy?.kind ?? null;
  const planDeal = !!kind && kind !== "stabilized" && kind !== "unknown";
  const stated = extraction?.metrics;
  const metrics = stated
    ? signalCapRow && !planDeal && !reads?.capWithheld && !findGoingInCap(stated)
      ? [...stated, signalCapRow]
      : stated
    : signalMetrics;
  return {
    assetClass: extraction?.assetClass ?? firstSignal?.assetClass ?? "",
    market: extraction?.market ?? firstSignal?.market ?? "",
    address: addressHaystack,
    metrics,
    // The kind rides along: without it the buy box loses the plan deal's
    // cap reading and the development's land price on the very page that
    // shows them.
    strategy: strategyKind ? { kind: strategyKind } : (extraction?.strategy ?? null),
    // What the price buys rides along too: without it a note's collateral
    // cap is held to the box's cap floor and the mandate's dealbreaker on
    // every page, where the rule is that a note's price is a loan's. With the
    // deal's own reads, as its cap slot reads it: a position's price and a
    // share's beside its entity's loan strike no cap either, and a per-unit
    // figure on a price that is not the building's is no basis.
    interest: reads ? { kind: reads.interestKind } : (extraction?.interest ?? null),
    ...(reads ? { capWithheld: reads.capWithheld, statedBasisIsBuildings: reads.statedBasisIsBuildings } : {}),
    ...(reads?.holding ? { holding: reads.holding } : {}),
    ...(reads?.loanWords ? { loanWords: reads.loanWords } : {}),
    ...(reads?.share ? { shareRead: reads.share } : {}),
    // So does the day the screen read the memorandum: the price band and
    // the mandate's ceiling read a label's year against it, as the page's
    // price slot does.
    screenedOn: extraction?.screenedOn ?? null,
  };
}

/** Fold a check list to one call, matching the pipeline table's semantics:
 *  any miss → outside; else any near → near; else any pass → fits; nothing
 *  checkable → null. ONE fold — every surface must agree on what a deal's
 *  fit is, or adjacent chips contradict each other. */
export function foldBuyBoxChecks(
  checks: BuyBoxCheck[],
): "fits" | "near" | "outside" | null {
  if (checks.some((c) => c.status === "miss")) return "outside";
  if (checks.some((c) => c.status === "near")) return "near";
  if (checks.some((c) => c.status === "pass")) return "fits";
  return null;
}

/** How much of the box the fit stands on (research pass 35). */
export interface BuyBoxCoverage {
  /** the criteria the screen could judge, pass, near or miss */
  checked: number;
  /** every criterion the box sets: the checks the deal page lists, its
   *  cash-on-cash floor and each red line that applies */
  total: number;
  /** the criteria it could not judge, by the deal page's own labels */
  unchecked: string[];
  /** one of those turns on the price (`BuyBoxCheck.onPrice`, the
   *  cash-on-cash floor, a price, cap or basis red line) */
  priceUnchecked: boolean;
}

/** What the coverage reads off the mandate-fit score (lib/mandate
 *  `MandateScore`): its dimensions, and the red lines as criteria. */
interface MandateCoverageLike {
  dimensions: ReadonlyArray<{ key: string; label: string; status: string }>;
  dealbreakerCriteria?: ReadonlyArray<{ label: string; checked: boolean; onPrice: boolean }>;
}

/**
 * How many of the box's criteria the fold and the score were judged on —
 * ONE count, beside the fold, that every surface drawing the fit reads (lib/
 * fit-label says it): the deal header's chip and the screen-complete email
 * (lib/buy-box-chip), the pipeline's card, list and CSV, the meeting
 * workbook, the compare table, the batch upload's chip, the verdict's brief
 * and the deal page's mandate gauge. The fold calls a
 * deal "fits" on any pass with no miss, and the mandate-fit score rescales
 * over what it could read (lib/mandate), so a note whose cap and return the
 * box cannot judge read "Fit 100 · Pursue" and "Fits" on two of its four
 * criteria. The count is of the checks the deal page lists, and of the
 * criteria the mandate-fit score judges that no check lists: the box's
 * cash-on-cash floor, and each red line (the audit of 2026-10-05 — a fit
 * whose cash-on-cash floor or whose cap-rate dealbreaker could not be
 * checked had read a green "Pursue"). Each of those turns on the price but
 * the asset-class and location red lines. A caller with no score passes
 * null, and the checks alone are counted.
 */
export function buyBoxCoverage(checks: BuyBoxCheck[], mandate: MandateCoverageLike | null): BuyBoxCoverage {
  const unknown = checks.filter((c) => c.status === "unknown");
  let checked = checks.length - unknown.length;
  let total = checks.length;
  const unchecked = unknown.map((c) => c.label);
  let priceUnchecked = unknown.some((c) => c.onPrice === true);
  // The year-one cash-on-cash floor: the score judges it, no check lists it.
  // A return on the equity the price sets, so it turns on the price.
  for (const d of mandate?.dimensions ?? []) {
    if (d.key !== "coc") continue;
    total += 1;
    if (d.status === "unknown") {
      unchecked.push(d.label);
      priceUnchecked = true;
    } else {
      checked += 1;
    }
  }
  // Each red line the box sets, tripped, clear or not checked.
  for (const red of mandate?.dealbreakerCriteria ?? []) {
    total += 1;
    if (red.checked) {
      checked += 1;
    } else {
      unchecked.push(red.label);
      if (red.onPrice) priceUnchecked = true;
    }
  }
  return { checked, total, unchecked, priceUnchecked };
}

export function evaluateBuyBox(
  dealAssetClass: string,
  extraction: ExtractionLike | null,
  box: BuyBox,
): BuyBoxCheck[] {
  const checks: BuyBoxCheck[] = [];
  const metrics = extraction?.metrics ?? [];
  // The deal's class: the explicit override, else what the screen read —
  // the noun the count and basis checks speak comes from it.
  const cls =
    dealAssetClass && dealAssetClass !== "auto"
      ? dealAssetClass
      : (extraction?.assetClass ?? "");

  // ---- Asset class -------------------------------------------------------
  if (box.assetClasses && box.assetClasses.length) {
    const wanted = box.assetClasses.map((a) => a.toLowerCase());
    const mandate = box.assetClasses.join(" or ");
    const actual = cls;
    if (!actual) {
      checks.push({
        label: "Asset class",
        status: "unknown",
        detail: `Mandate is ${mandate}; the screen hasn't identified this deal's asset class yet.`,
      });
    } else if (wanted.includes(actual.toLowerCase())) {
      checks.push({
        label: "Asset class",
        status: "pass",
        detail: `Mandate is ${mandate} — this is ${actual}. In scope.`,
      });
    } else {
      checks.push({
        label: "Asset class",
        status: "miss",
        detail: `Mandate is ${mandate} — this is ${actual}. Outside the mandate.`,
      });
    }
  }

  // ---- Geography ---------------------------------------------------------
  const targets = geoTargets(box);
  if (targets.length) {
    const haystack = `${extraction?.market ?? ""} ${extraction?.address ?? ""}`
      .toLowerCase()
      .trim();
    const mandate = targets.map((t) => t.label).join("; ");
    if (!haystack) {
      checks.push({
        label: "Geography",
        status: "unknown",
        detail: `Mandate covers ${mandate}; the screen hasn't placed this deal yet.`,
      });
    } else {
      const hit = targets.find((t) => {
        const needles = [t.city, t.county, t.label]
          .filter((s): s is string => !!s && s.trim().length > 1)
          .map((s) => s.toLowerCase());
        // Alias needles are market-level keywords ("king", "essex",
        // "wilmington") that collide across states as bare substrings — a
        // Seattle chip must not hit "King St, Washington, DC". They only
        // count when the chip's state abbreviation appears as its own word
        // in the haystack (US address text virtually always carries it).
        const st = (t.state ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
        const aliasesOk = !st || new RegExp(`\\b${st}\\b`).test(haystack);
        if (aliasesOk) {
          needles.push(
            ...(t.aliases ?? [])
              .filter((s) => s.trim().length > 1)
              .map((s) => s.toLowerCase())
          );
        }
        return needles.some((n) => haystack.includes(n));
      });
      checks.push({
        label: "Geography",
        status: hit ? "pass" : "miss",
        detail: hit
          ? `Mandate covers ${mandate} — this deal sits in ${hit.label}. In territory.`
          : `Mandate covers ${mandate} — this deal reads ${extraction?.market || "elsewhere"}. Off the map.`,
      });
    }
  }

  // ---- Size (SF) ---------------------------------------------------------
  if (box.sfMin != null || box.sfMax != null) {
    // The shared size reader: the building, never the land or a unit.
    const sf = buildingSfFromMetrics(metrics);
    const bandText = [
      box.sfMin != null ? `${fmtSf(box.sfMin)} min` : null,
      box.sfMax != null ? `${fmtSf(box.sfMax)} max` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (sf == null) {
      checks.push({
        label: "Size",
        status: "unknown",
        detail: `Mandate is ${bandText}; no parseable square footage in the screen yet.`,
      });
    } else {
      const belowMin = box.sfMin != null && sf < box.sfMin;
      const aboveMax = box.sfMax != null && sf > box.sfMax;
      if (!belowMin && !aboveMax) {
        checks.push({
          label: "Size",
          status: "pass",
          detail: `Mandate is ${bandText} — this is ${fmtSf(sf)}. Inside the band.`,
        });
      } else {
        const bound = belowMin ? box.sfMin! : box.sfMax!;
        const off = Math.abs(sf - bound) / bound;
        const near = off <= NEAR_REL;
        checks.push({
          label: "Size",
          status: near ? "near" : "miss",
          detail: near
            ? `Mandate is ${bandText} — this is ${fmtSf(sf)}, ${Math.round(off * 100)}% ${belowMin ? "under" : "over"}. A near-miss, not a dealbreaker.`
            : `Mandate is ${bandText} — this is ${fmtSf(sf)}. ${belowMin ? "Too small" : "Too large"} for the mandate.`,
        });
      }
    }
  }

  // ---- Count (units, keys, pads …) ---------------------------------------
  if (box.unitsMin != null || box.unitsMax != null) {
    // The shared count reader: the whole count, never a subset or a row
    // about the units — and the OM's own noun where it stated one, the
    // class's where it did not, so a hotel is held to the band in keys.
    const row = unitCountRow(metrics);
    const n = row ? parseCount(row.value) : null;
    const noun = countNoun(row?.label, cls);
    const label = capWord(noun);
    const bandText = [
      box.unitsMin != null ? `${fmtCount(box.unitsMin)} ${noun} min` : null,
      box.unitsMax != null ? `${fmtCount(box.unitsMax)} ${noun} max` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (n == null) {
      checks.push({
        label,
        status: "unknown",
        detail: `Mandate is ${bandText}; no parseable ${noun} count in the screen yet.`,
      });
    } else {
      const belowMin = box.unitsMin != null && n < box.unitsMin;
      const aboveMax = box.unitsMax != null && n > box.unitsMax;
      if (!belowMin && !aboveMax) {
        checks.push({
          label,
          status: "pass",
          detail: `Mandate is ${bandText} — this is ${fmtCount(n)} ${noun}. Inside the band.`,
        });
      } else {
        const bound = belowMin ? box.unitsMin! : box.unitsMax!;
        const off = Math.abs(n - bound) / bound;
        const near = off <= NEAR_REL;
        checks.push({
          label,
          status: near ? "near" : "miss",
          detail: near
            ? `Mandate is ${bandText} — this is ${fmtCount(n)} ${noun}, ${Math.round(off * 100)}% ${belowMin ? "under" : "over"}. A near-miss, not a dealbreaker.`
            : `Mandate is ${bandText} — this is ${fmtCount(n)} ${noun}. ${belowMin ? "Too few" : "Too many"} for the mandate.`,
        });
      }
    }
  }

  // ---- Price band --------------------------------------------------------
  const band = priceBand(box);
  if (band.min != null || band.max != null) {
    // The shared price row — on a development the land cost, the same row
    // the deal page and the pipeline print, read against the screen's year
    // — so the band never says "no asking price" beside a printed one.
    const metric = findPriceRow(metrics, extraction?.strategy?.kind, screenYearOf(extraction));
    // A range (#466) is judged by the end that tests the band: its bottom
    // where it reaches under a floor, else its top — never the flattering
    // end against a ceiling — and said as the range it is.
    const range = metric ? priceRange(metric.value) : null;
    const dollars = range
      ? band.min != null && range.low < band.min
        ? range.low
        : range.high
      : metric
        ? parsePrice(metric.value)
        : null;
    const shown = (n: number) => (range ? `${fmtM(range.low)}–${fmtM(range.high)}` : fmtM(n));
    const noun = metric && /\b(land|site)\b/i.test(metric.label) ? "land cost" : "ask";
    const bandText = [
      band.min != null ? `${fmtM(band.min)} min` : null,
      band.max != null ? `${fmtM(band.max)} max` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (dollars == null) {
      // Name the figure a development would be judged on: its land cost.
      const missing =
        noun === "land cost"
          ? "land cost"
          : extraction?.strategy?.kind === "development"
            ? "asking price or land cost"
            : "asking price";
      checks.push({
        label: "Price",
        onPrice: true,
        status: "unknown",
        detail: `Mandate is ${bandText}; no parseable ${missing} in the screen yet.`,
      });
    } else {
      const belowMin = band.min != null && dollars < band.min;
      const aboveMax = band.max != null && dollars > band.max;
      if (!belowMin && !aboveMax) {
        checks.push({
          label: "Price",
          onPrice: true,
          status: "pass",
          detail: `Mandate is ${bandText} — the ${noun} is ${shown(dollars)}. Inside the band.`,
        });
      } else {
        const bound = belowMin ? band.min! : band.max!;
        const off = Math.abs(dollars - bound) / bound;
        const near = off <= NEAR_REL;
        // Which end of a range missed.
        const end = range ? `its ${belowMin ? "bottom" : "top"} ` : "";
        checks.push({
          label: "Price",
          onPrice: true,
          status: near ? "near" : "miss",
          detail: near
            ? `Mandate is ${bandText} — the ${noun} is ${shown(dollars)}, ${end}${Math.round(off * 100)}% ${belowMin ? "under" : "over"}. Close enough to price; a retrade could land it inside.`
            : range
              ? `Mandate is ${bandText} — the ${noun} is ${shown(dollars)}, ${end}${belowMin ? "below" : "beyond"} the mandate.`
              : `Mandate is ${bandText} — the ${noun} is ${fmtM(dollars)}. ${belowMin ? "Below" : "Beyond"} the mandate.`,
        });
      }
    }
  }

  // ---- Price per unit ----------------------------------------------------
  if (box.maxPerUnitK != null) {
    const metric = findMetric(metrics, METRIC_FIND.perUnit.inc, METRIC_FIND.perUnit.exc);
    const dollars = metric ? parseMoney(metric.value) : null;
    const max = box.maxPerUnitK * 1e3;
    // The deal's own noun (lib/asset-words): a hotel is held to the mandate
    // per key, a park per pad — the figure the OM quotes is the one tested.
    const noun = assetWords(cls).noun?.one ?? "unit";
    // On a plan deal the figure is the price over the units, and the deal's
    // basis is its total cost (lib/deal-strategy `planSummary`): the check
    // is labelled by what it divides, the mandate's own "max price per
    // unit", never as a second basis beside the plan's (research pass 41).
    const onPlan = planKindLabel(extraction) != null;
    const label = `${onPlan ? "Price" : "Basis"} / ${noun}`;
    const caps = onPlan ? "Mandate caps the price" : "Mandate caps basis";
    const what = onPlan ? `per-${noun} price` : `per-${noun} figure`;
    // A per-unit figure on a price that is not the building's — a note's, a
    // position's, the land's, a share's — is on a basis the memorandum never
    // says: the box's ceiling is never held to it (the audit of 2026-10-05).
    const withheld = basisWithheldWhy(extraction, noun);
    if (withheld) {
      checks.push({
        label,
        onPrice: true,
        status: "unknown",
        detail: `${caps} at ${fmtM(max)}/${noun}, but ${withheld}.`,
      });
    } else if (dollars == null) {
      checks.push({
        label,
        onPrice: true,
        status: "unknown",
        detail: `${caps} at ${fmtM(max)}/${noun}; no parseable ${what} yet.`,
      });
    } else if (dollars <= max) {
      checks.push({
        label,
        onPrice: true,
        status: "pass",
        detail: `${caps} at ${fmtM(max)}/${noun} — this is ${fmtM(dollars)}/${noun}. Inside.`,
      });
    } else {
      const off = (dollars - max) / max;
      const near = off <= NEAR_REL;
      checks.push({
        label,
        onPrice: true,
        status: near ? "near" : "miss",
        detail: near
          ? `${caps} at ${fmtM(max)}/${noun} — this is ${fmtM(dollars)}/${noun}, ${Math.round(off * 100)}% over. Within negotiating range.`
          : `${caps} at ${fmtM(max)}/${noun} — this is ${fmtM(dollars)}/${noun}. Rich for the mandate.`,
      });
    }
  }

  // ---- Going-in cap ------------------------------------------------------
  if (box.minCapPct != null) {
    const metric = findGoingInCap(metrics);
    const pct = metric ? parsePct(metric.value) : null;
    const planKind = planKindLabel(extraction);
    const withheld = capWithheldOf(extraction);
    if (withheld) {
      // A note's price is a loan's: the cap the memorandum states is the
      // collateral's, which the buyer of the note does not earn (#414). A
      // preferred equity position's buys a rate and a redemption, and a
      // share's beside its entity's loan grosses up to the equity's whole:
      // the deal's cap slot holds no cap on any of them, and the box holds
      // none to its floor (the audit of 2026-10-05).
      checks.push({
        label: "Going-in cap",
        onPrice: true,
        status: "unknown",
        detail: capWithheldDetail(box.minCapPct, withheld, extraction),
      });
    } else if (pct == null) {
      checks.push({
        label: "Going-in cap",
        onPrice: true,
        status: "unknown",
        detail: planKind
          ? `Mandate wants ≥${box.minCapPct}% going-in, but ${withArticle(planKind)} deal is judged on its yield on total cost, not on a going-in cap — its stabilized figure is the finished project's, never a cap against the price.`
          : `Mandate wants ≥${box.minCapPct}% going-in; no parseable cap rate yet.`,
      });
    } else if (pct >= box.minCapPct) {
      checks.push({
        label: "Going-in cap",
        onPrice: true,
        status: "pass",
        detail: `Mandate wants ≥${box.minCapPct}% going-in — the deal shows ${pct.toFixed(2)}%. Clears the floor.`,
      });
    } else {
      const gapBps = Math.round((box.minCapPct - pct) * 100);
      const near = box.minCapPct - pct <= NEAR_CAP_PT;
      checks.push({
        label: "Going-in cap",
        onPrice: true,
        status: near ? "near" : "miss",
        detail: near
          ? `Mandate wants ≥${box.minCapPct}% going-in — the deal shows ${pct.toFixed(2)}%, ${gapBps}bps light. Close; a price cut could clear it.`
          : `Mandate wants ≥${box.minCapPct}% going-in — the deal shows ${pct.toFixed(2)}%, ${gapBps}bps short. Doesn't clear the floor.`,
      });
    }
  }

  // ---- Target return (IRR) ----------------------------------------------
  if (box.minIrrPct != null) {
    const metric = findMetric(metrics, METRIC_FIND.irr.inc);
    const pct = metric ? parsePct(metric.value) : null;
    // Where the price buys no building, the IRR the memorandum states is no
    // return its buyer earns, as the cap and the basis beside it are not
    // (research pass 41): the fit says it was not judged on it.
    const withheld = returnWithheldOf(extraction);
    if (withheld) {
      checks.push({
        label: "Target return",
        onPrice: true,
        status: "unknown",
        detail: returnWithheldDetail(box.minIrrPct, withheld),
      });
    } else if (pct == null) {
      checks.push({
        label: "Target return",
        onPrice: true,
        status: "unknown",
        detail: `Mandate targets ≥${box.minIrrPct}% IRR; no parseable IRR in the screen yet.`,
      });
    } else if (pct >= box.minIrrPct) {
      checks.push({
        label: "Target return",
        onPrice: true,
        status: "pass",
        detail: `Mandate targets ≥${box.minIrrPct}% IRR — the OM projects ${pct.toFixed(1)}%. On target (broker figure — verify).`,
      });
    } else {
      const near = box.minIrrPct - pct <= NEAR_IRR_PT;
      checks.push({
        label: "Target return",
        onPrice: true,
        status: near ? "near" : "miss",
        detail: near
          ? `Mandate targets ≥${box.minIrrPct}% IRR — the OM projects ${pct.toFixed(1)}%, ${(box.minIrrPct - pct).toFixed(1)}pt shy. Within reach if the assumptions hold up.`
          : `Mandate targets ≥${box.minIrrPct}% IRR — the OM projects ${pct.toFixed(1)}%. Short of the mandate even on the OM's own numbers.`,
      });
    }
  }

  return checks;
}

/** Human/prompt-readable one-liners describing the mandate (skips unset fields). */
export function buyBoxLines(box: BuyBox, opts: { exchange?: boolean } = {}): string[] {
  const lines: string[] = [];
  if (box.assetClasses?.length)
    lines.push(`Asset classes: ${box.assetClasses.join(", ")}`);
  const targets = geoTargets(box);
  if (targets.length)
    lines.push(`Geography: ${targets.map((t) => t.label).join("; ")}`);
  if (box.sfMin != null || box.sfMax != null)
    lines.push(
      `Size: ${box.sfMin != null ? `${fmtSf(box.sfMin)} min` : ""}${
        box.sfMin != null && box.sfMax != null ? ", " : ""
      }${box.sfMax != null ? `${fmtSf(box.sfMax)} max` : ""}`,
    );
  // The mandate's own noun is "units" — a box spans classes; the check
  // speaks the deal's (keys, pads, beds) once there is a deal.
  if (box.unitsMin != null || box.unitsMax != null)
    lines.push(
      `Count: ${box.unitsMin != null ? `${fmtCount(box.unitsMin)} units min` : ""}${
        box.unitsMin != null && box.unitsMax != null ? ", " : ""
      }${box.unitsMax != null ? `${fmtCount(box.unitsMax)} units max` : ""}`,
    );
  const band = priceBand(box);
  if (band.min != null || band.max != null)
    lines.push(
      `Price: ${band.min != null ? `${fmtM(band.min)} min` : ""}${
        band.min != null && band.max != null ? ", " : ""
      }${band.max != null ? `${fmtM(band.max)} max` : ""}`,
    );
  if (box.maxPerUnitK != null)
    lines.push(`Max basis per unit: $${box.maxPerUnitK}k`);
  if (box.minCapPct != null) lines.push(`Min going-in cap: ${box.minCapPct}%`);
  if (box.minCoCPct != null)
    lines.push(`Min year-one cash-on-cash: ${box.minCoCPct}%`);
  if (box.minIrrPct != null)
    lines.push(`Target base-case IRR: ${box.minIrrPct}%+`);
  const db = box.dealbreakers;
  if (!hasNoDealbreakers(db)) {
    const parts: string[] = [];
    if (db!.requireAssetClass) parts.push("asset class must be in the mandate");
    if (db!.requireGeography) parts.push("must sit in a target market");
    if (db!.maxPriceM != null) parts.push(`price ≤ $${db!.maxPriceM}M`);
    if (db!.minCapPct != null) parts.push(`going-in cap ≥ ${db!.minCapPct}%`);
    if (db!.maxPerUnitK != null) parts.push(`basis ≤ $${db!.maxPerUnitK}k/unit`);
    if (parts.length) lines.push(`Dealbreakers: ${parts.join("; ")}`);
  }
  if (box.notes?.trim()) lines.push(`Priorities: ${box.notes.trim()}`);
  // The buyer's 1031 exchange (lib/exchange-window), as the box holds it;
  // each deal's deadlines against it are the deal's own read. Never in the
  // lines a Claude step reads (`exchange: false`): the verdict's words reach
  // a shared screen, and a counterparty who learns the buyer must close by a
  // date holds the price.
  const exchange = opts.exchange === false ? null : sanitizeExchange(box.exchange);
  if (exchange) {
    const filer = EXCHANGE_FILERS.find((f) => f.id === exchange.filer);
    lines.push(
      `1031 exchange: the relinquished property transferred ${exchangeDay(exchange.relinquishedTransferOn!)}; ${
        // Only the article is lowercased: "an S corporation", never "an s
        // corporation" (the pre-merge audit).
        filer ? `${filer.label.charAt(0).toLowerCase()}${filer.label.slice(1)} files the return (${filer.form})` : "who files the return is not set, so it is read as an individual's"
      }${exchange.returnExtended ? "; the return is extended" : ""}`,
    );
  }
  return lines;
}
