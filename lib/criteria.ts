// The buy box: the buyer's standing mandate, checked against every screened
// deal. Deliberately deterministic — parsing and comparison in code, no model
// in the loop — so the same deal always gets the same fit call. Each check
// reads like an analyst testing the deal against the firm's mandate: the
// mandate's bound, the deal's figure, and the call in plain English.
// (Universal module: used by server pages and the background pipeline.)

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

/** Any calendar year before this one, as a label fragment. "Sale price
 *  (2019)", "Purchase price (2019)" and "Acquired 2019" are what the building
 *  last traded for; a label carrying THIS year or a later one — "Asking price
 *  (2026)", "Purchase price (2027 close)" — is the ask. Built once, from
 *  today's year, for years 1900 through last year. */
export function pastYearSource(thisYear = new Date().getFullYear()): string {
  const last = Math.min(Math.max(thisYear - 1, 2000), 2099) - 2000;
  const tens = Math.floor(last / 10);
  const ones = last % 10;
  const parts = ["19\\d\\d"];
  if (tens > 0) parts.push(`20[0-${tens - 1}]\\d`);
  parts.push(`20${tens}[0-${ones}]`);
  return `\\b(?:${parts.join("|")})\\b`;
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
    // prior trade — a past year in the label ("2019 sale price", "Purchase
    // price (2019)"), or a sale / trade word beside any year, or "Year 5
    // sale price" — are not the ask either. A label carrying this year or a
    // later one ("Revised asking price (March 2026)") still is.
    exc: new RegExp(
      String.raw`unit|\bsf\b|\/ ?sf|per ?sf|per (square|sq)|psf|\bper\s+(?!(?:the|om|broker|seller|sponsor|offering|agent|marketing|guidance|psa|contract|loi)\b)|\/\s*(key|bed|room|pad|door|acre|lot|suite|stall|space|home|apartment|apt|bay|berth|slip|r?sf|nrsf|gsf|gla|nra|gba|nla)s?\b|\brent|yield|\bcap\b|\brate\b|spread|loan|debt|insurance|\bdate\b|exit|reversion|terminal|residual|disposition|projected|forward|pro ?forma|stabili[sz]|` +
        pastYearSource() +
        String.raw`|\b(sale|sold|trade|traded)\b(?=[\s\S]*\b(19|20)\d\d\b)|\b(19|20)\d\d\b(?=[\s\S]*\b(sale|sold|trade|traded)\b)|\b(year|yr)\s?\d|\b(last|prior|previous|historical|original|land|site|reduction|reserve|bid|strike|target|underwritten|range)\b`,
      "i",
    ),
  },
  // The price over the units, read by SHAPE: "Price per unit", "Price /
  // Unit", "$ / Unit", "Unit price", "Asking price per door", "Basis per
  // key" — never an NOI, a rent, a cost or a spend expressed per unit
  // (which would pass a basis ceiling at $2k/unit), and never a ratio row
  // the same KPI table prints per unit: "Avg SF / unit", "Parking spaces
  // per unit", "Beds per unit" (which would pass it at $912/unit).
  perUnit: {
    inc: /^(?:(?:avg\.?|average|asking|total|implied|blended|going[- ]?in)\s+)*(?:price|basis|\$)\s*(?:per|\/)\s*(?:unit|door|key|pad|bed|site)s?\b|\bunit price\b|\bprice\s*(?:per|\/)\s*unit\b/i,
    exc: /noi|income|rent\b|rents\b|cost|budget|expense|tax|reserve|revenue|insurance|utilit|payroll|debt|loan|equity|value|\begi\b|replacement|capex|capital|management|repairs?|maintenance|marketing|admin|contract|\bopex\b|operating|concession|turnover|\br ?& ?m\b|renovation|spend|fees?\b|\bg ?& ?a\b|payment|deposit|exit|reversion|terminal|residual|disposition|projected|pro ?forma|\b(last|prior|previous|historical|original)\b/i,
  },
  // The going-in cap is today's income against the price. A stabilized, pro
  // forma, forward or at-completion cap — or a yield on cost — describes a
  // plan deal's finished project, and reading it as the going-in cap is how
  // a conversion "cleared" a 6% floor at 11.7%.
  goingInCap: {
    inc: /going[- ]?in cap/i,
    exc: /stabili[sz]|pro ?forma|forward|projected|at completion|yield/i,
  },
  capRate: {
    // "Cap rate" or "Capitalization rate" — the OM's formal wording.
    inc: /\bcap(?:italization)? rate\b/i,
    // A Year-2+ cap ("Yr. 3", "Year 10"), a cap dated to a calendar year in
    // parentheses or a cap on cost is a projection, not today's income
    // against the price (a Year-1 cap is the going-in figure by another
    // name, so the shared year guard starts at 2 — as classifyNoi's does).
    exc: new RegExp(
      String.raw`exit|terminal|reversion|residual|stabili[sz]|pro ?forma|forward|projected|at completion|yield|on cost|\(\s*(19|20)\d\d|` +
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
 * the same row the page prints.
 */
export function findPriceRow(metrics: MetricLike[], kind?: string | null): MetricLike | null {
  const ask = findMetric(metrics, METRIC_FIND.price.inc, METRIC_FIND.price.exc);
  if (ask && parseMoney(ask.value) != null) return ask;
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
    box.priceMinM == null &&
    box.priceMaxM == null &&
    box.maxPriceM == null &&
    box.maxPerUnitK == null &&
    box.minCapPct == null &&
    box.minCoCPct == null &&
    box.minIrrPct == null &&
    hasNoDealbreakers(box.dealbreakers) &&
    !box.notes?.trim()
  );
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
  s = s.replace(/[,$\s]/g, "").toLowerCase();
  const m = s.match(/^\$?(\d+(?:\.\d+)?)(mm|m|k|b)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = m[2];
  const mult = suffix === "b" ? 1e9 : suffix === "m" || suffix === "mm" ? 1e6 : suffix === "k" ? 1e3 : 1;
  return sign * n * mult;
}

/** "5.25%" / "5.25 %" → 5.25, or null. */
export function parsePct(raw: string): number | null {
  const m = raw.replace(/\s/g, "").match(/(-?\d+(?:\.\d+)?)%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const fmtM = (dollars: number) =>
  dollars >= 1e6
    ? `$${(dollars / 1e6).toFixed(1)}M`
    : dollars >= 1e3
      ? `$${Math.round(dollars / 1e3)}k`
      : `$${Math.round(dollars)}`;

const fmtSf = (sf: number) =>
  sf >= 1e6
    ? `${(sf / 1e6).toFixed(2).replace(/\.?0+$/, "")}M SF`
    : `${Math.round(sf / 1e3)}k SF`;

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
 * Build the pseudo-extraction the buy box is judged against: the full
 * extraction when it's in, else the ~30s first signal standing in, with the
 * user-entered address widening the location haystack either way. ONE
 * implementation — the deal page, the triage endpoint, and anything else
 * must agree on what "fits the box" means mid-screen.
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
  // here, and a buy-box check on that would be confidently wrong.
  const signalCapPct = firstSignal ? parsePct(firstSignal.goingInCap) : null;
  const signalCapPlausible = signalCapPct != null && signalCapPct > 0.5 && signalCapPct <= 25;
  const signalMetrics = firstSignal
    ? [
        { label: "Asking price", value: firstSignal.askPrice },
        ...(signalCapPlausible ? [{ label: "Going-in cap rate", value: firstSignal.goingInCap }] : []),
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
  return {
    assetClass: extraction?.assetClass ?? firstSignal?.assetClass ?? "",
    market: extraction?.market ?? firstSignal?.market ?? "",
    address: addressHaystack,
    metrics: extraction?.metrics ?? signalMetrics,
    // The kind rides along: without it the buy box loses the plan deal's
    // cap reading and the development's land price on the very page that
    // shows them.
    strategy: strategyKind ? { kind: strategyKind } : (extraction?.strategy ?? null),
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

export function evaluateBuyBox(
  dealAssetClass: string,
  extraction: ExtractionLike | null,
  box: BuyBox,
): BuyBoxCheck[] {
  const checks: BuyBoxCheck[] = [];
  const metrics = extraction?.metrics ?? [];

  // ---- Asset class -------------------------------------------------------
  if (box.assetClasses && box.assetClasses.length) {
    const wanted = box.assetClasses.map((a) => a.toLowerCase());
    const mandate = box.assetClasses.join(" or ");
    const actual =
      dealAssetClass && dealAssetClass !== "auto"
        ? dealAssetClass
        : (extraction?.assetClass ?? "");
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

  // ---- Price band --------------------------------------------------------
  const band = priceBand(box);
  if (band.min != null || band.max != null) {
    // The shared price row — on a development the land cost, the same row
    // the deal page and the pipeline print — so the band never says
    // "no asking price" beside a printed one.
    const metric = findPriceRow(metrics, extraction?.strategy?.kind);
    const dollars = metric ? parseMoney(metric.value) : null;
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
        status: "unknown",
        detail: `Mandate is ${bandText}; no parseable ${missing} in the screen yet.`,
      });
    } else {
      const belowMin = band.min != null && dollars < band.min;
      const aboveMax = band.max != null && dollars > band.max;
      if (!belowMin && !aboveMax) {
        checks.push({
          label: "Price",
          status: "pass",
          detail: `Mandate is ${bandText} — the ${noun} is ${fmtM(dollars)}. Inside the band.`,
        });
      } else {
        const bound = belowMin ? band.min! : band.max!;
        const off = Math.abs(dollars - bound) / bound;
        const near = off <= NEAR_REL;
        checks.push({
          label: "Price",
          status: near ? "near" : "miss",
          detail: near
            ? `Mandate is ${bandText} — the ${noun} is ${fmtM(dollars)}, ${Math.round(off * 100)}% ${belowMin ? "under" : "over"}. Close enough to price; a retrade could land it inside.`
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
    if (dollars == null) {
      checks.push({
        label: "Basis / unit",
        status: "unknown",
        detail: `Mandate caps basis at ${fmtM(max)}/unit; no parseable per-unit figure yet.`,
      });
    } else if (dollars <= max) {
      checks.push({
        label: "Basis / unit",
        status: "pass",
        detail: `Mandate caps basis at ${fmtM(max)}/unit — this is ${fmtM(dollars)}/unit. Inside.`,
      });
    } else {
      const off = (dollars - max) / max;
      const near = off <= NEAR_REL;
      checks.push({
        label: "Basis / unit",
        status: near ? "near" : "miss",
        detail: near
          ? `Mandate caps basis at ${fmtM(max)}/unit — this is ${fmtM(dollars)}/unit, ${Math.round(off * 100)}% over. Within negotiating range.`
          : `Mandate caps basis at ${fmtM(max)}/unit — this is ${fmtM(dollars)}/unit. Rich for the mandate.`,
      });
    }
  }

  // ---- Going-in cap ------------------------------------------------------
  if (box.minCapPct != null) {
    const metric = findGoingInCap(metrics);
    const pct = metric ? parsePct(metric.value) : null;
    const planKind = planKindLabel(extraction);
    if (pct == null) {
      checks.push({
        label: "Going-in cap",
        status: "unknown",
        detail: planKind
          ? `Mandate wants ≥${box.minCapPct}% going-in, but a ${planKind} deal has no going-in cap — its stabilized figure is the finished project's, judged on yield on total cost, not on a cap against the price.`
          : `Mandate wants ≥${box.minCapPct}% going-in; no parseable cap rate yet.`,
      });
    } else if (pct >= box.minCapPct) {
      checks.push({
        label: "Going-in cap",
        status: "pass",
        detail: `Mandate wants ≥${box.minCapPct}% going-in — the deal shows ${pct.toFixed(2)}%. Clears the floor.`,
      });
    } else {
      const gapBps = Math.round((box.minCapPct - pct) * 100);
      const near = box.minCapPct - pct <= NEAR_CAP_PT;
      checks.push({
        label: "Going-in cap",
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
    if (pct == null) {
      checks.push({
        label: "Target return",
        status: "unknown",
        detail: `Mandate targets ≥${box.minIrrPct}% IRR; no parseable IRR in the screen yet.`,
      });
    } else if (pct >= box.minIrrPct) {
      checks.push({
        label: "Target return",
        status: "pass",
        detail: `Mandate targets ≥${box.minIrrPct}% IRR — the OM projects ${pct.toFixed(1)}%. On target (broker figure — verify).`,
      });
    } else {
      const near = box.minIrrPct - pct <= NEAR_IRR_PT;
      checks.push({
        label: "Target return",
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
export function buyBoxLines(box: BuyBox): string[] {
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
  return lines;
}
