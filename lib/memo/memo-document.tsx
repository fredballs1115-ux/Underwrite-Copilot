import "server-only";
import {
  Document,
  Font,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { DealRow } from "@/lib/deals";

// react-pdf hyphenates by default, and a deal's name is a proper noun: the
// sample once printed as "The Maddox at Brewery-" / "town" the moment the
// title column narrowed. A word wraps whole; only a word too long for any
// column (a URL, a run of digits) is split, in plain twelve-letter pieces.
Font.registerHyphenationCallback((word) =>
  word.length <= 24 ? [word] : (word.match(/.{1,12}/g) ?? [word]),
);
import { screenYearOf, type BuyBoxCheck } from "@/lib/criteria";
import { pdfSafe } from "./pdf-text";
import { basePosition, rangeInOrder } from "@/lib/verdict-range";
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import { screenedOn } from "@/lib/screen-run";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  FirstSignal,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { askingPriceOf, findPriceMetric, inferStrategy, planSummary, type DealStrategy } from "@/lib/deal-strategy";
import { marketsPhrase, portfolioFacts, readPortfolio } from "@/lib/portfolio";
import { yieldOnCostText } from "@/lib/plan-facts";
import { dealTypeLabel, interestOf, interestShortLine, readInterest } from "@/lib/interest";
import { assumableLine, readAssumable } from "@/lib/assumable-debt";
import { affordableShortLine, readAffordable } from "@/lib/affordable";
import { readSingleTenant, singleTenantShortLine } from "@/lib/single-tenant";
import { hotelShortLine, readHotelDeal } from "@/lib/hotel-deal";
import { readSale, saleShortLine } from "@/lib/sale-terms";
import { readRoster, rosterShortLine } from "@/lib/tenant-roster";
import { readValueAdd, valueAddShortLine } from "@/lib/value-add";
import { readTaxAbatement, taxAbatementShortLine } from "@/lib/tax-abatement";
import { sellerFinancingDocLine } from "@/lib/seller-financing";
import { readSiteReports, siteReportsShortLine } from "@/lib/site-reports";
import { readStudentHousing, studentShortLine } from "@/lib/student-housing";
import { mhShortLine, readManufacturedHousing } from "@/lib/manufactured-housing";
import { readSelfStorage, storageShortLine } from "@/lib/self-storage";
import { storedFloodShortLine, type SiteFlagsResult } from "@/lib/site-flags/core";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import { keyTermRows } from "@/lib/key-terms";
import { assetClassLabel } from "@/lib/asset-class";
import { basisTag, shownAssetClass } from "@/lib/pipeline-slots";

const C = {
  brand: "#114e54",
  ink: "#18211f",
  muted: "#5f6b69",
  line: "#e7e4dd",
  faint: "#f3f5f4",
  pass: "#1b7a5e",
  caution: "#a05a1c",
  kill: "#b23a30",
};

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEV_COLOR: Record<string, string> = {
  high: C.kill,
  medium: C.caution,
  low: C.brand,
};
const CALL_COLOR: Record<string, string> = {
  Go: C.pass,
  Caution: C.caution,
  "No-go": C.kill,
};
// A range's confidence, in the deal page's colours (RANGE_CONF there).
const RANGE_CONF_COLOR: Record<string, string> = {
  high: C.pass,
  medium: C.caution,
  low: C.kill,
};
// Light tints for banner backgrounds — react-pdf has no alpha compositing
// against the page, so the tints are precomputed solids.
const VERDICT_TINT: Record<string, string> = {
  Go: "#e9f4ef",
  Caution: "#f8f0e3",
  "No-go": "#f9eae8",
};
// The marks are WinAnsi glyphs on purpose: standard Helvetica has no check
// mark, and a "✓" here once encoded to an undefined byte, so every passing
// criterion printed as an empty chip (the tints are indistinguishable in
// grayscale). pdf-text.ts holds the rule; the test asserts each mark
// survives it.
export const STATUS_CHIP: Record<
  "pass" | "near" | "miss" | "unknown",
  { color: string; bg: string; mark: string }
> = {
  pass: { color: C.pass, bg: "#e9f4ef", mark: "+" },
  near: { color: C.caution, bg: "#f8f0e3", mark: "±" },
  miss: { color: C.kill, bg: "#f9eae8", mark: "×" },
  unknown: { color: C.muted, bg: C.faint, mark: "—" },
};

/**
 * The deal type for the memo's subtitle — and, on a plan deal, the plan's
 * headline in one clause: the stabilized NOI over the total cost it takes to
 * earn it. A stabilized asset adds nothing (the subtitle already says what
 * the building is); an unknown strategy adds nothing rather than a guess.
 * The strategy is the deal page's own read (the extraction and the first
 * signal).
 */
function strategyLineFor(extraction: ExtractionResult | null, strategy: DealStrategy): string {
  if (strategy.kind === "unknown" || strategy.kind === "stabilized") return "";
  const plan = planSummary(extraction, strategy);
  // Whose strategy it is on a note or a leased fee, as the deal header says
  // it (lib/interest `dealTypeLabel`): the collateral's, or the building
  // someone else owns on the land.
  const kind = dealTypeLabel(strategy.label, extraction);
  const m = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString("en-US")}`;
  if (plan?.stabilizedNoi && plan.totalCost != null && plan.yieldOnCost != null) {
    return `${kind} · stabilized NOI ${m(plan.stabilizedNoi.value)} on ${m(plan.totalCost)} total cost (${yieldOnCostText(plan.yieldOnCost)} yield on cost${
      plan.costPerUnit != null ? `; ${m(plan.costPerUnit)} per planned unit all-in` : ""
    })`;
  }
  if (plan?.stabilizedNoi) return `${kind} · stabilized NOI ${m(plan.stabilizedNoi.value)}`;
  return kind;
}

/** A portfolio memorandum (lib/portfolio, #411), in one line for the memo's
 *  header: how many properties across which markets, then the facts a buyer
 *  should see before pricing any of it — the deal page's card's own
 *  sentences — so a three-market portfolio never reads as one building on
 *  page one. "" for a single property. */
function portfolioLineFor(extraction: ExtractionResult | null): string {
  const p = readPortfolio(extraction);
  return p ? [`A portfolio of ${p.assets.length} properties across ${marketsPhrase(p)}.`, ...portfolioFacts(p)].join(" ") : "";
}

/** What is being sold, in one line for the memo's header (lib/interest):
 *  "" for a plain fee simple, whose memo reads as it always did. */
function interestLineFor(extraction: ExtractionResult | null): string {
  const r = readInterest(extraction, askingPriceOf(extraction));
  return r ? interestShortLine(r) : "";
}

/** The seller's loan where it is offered for assumption, in one line for
 *  the memo's header (lib/assumable-debt, #419): the terms as stated — the
 *  pricing against today's rate is the deal page's and the report's, which
 *  carry the model. "" where none is offered. */
function assumableLineFor(extraction: ExtractionResult | null): string {
  const a = readAssumable(extraction, null);
  return a ? assumableLine(a) : "";
}

/** A covenant or a contract that sets the rents (lib/affordable, #453), in
 *  one line for the memo's header: how much is restricted, under what,
 *  until when. "" on a market-rate deal. */
function affordableLineFor(extraction: ExtractionResult | null): string {
  const r = readAffordable(extraction);
  return r ? affordableShortLine(r) : "";
}

/** The one lease a single-tenant property is (lib/single-tenant, #454), in
 *  one line for the memo's header: the tenant, its guarantor, when the
 *  lease ends and how its rent grows. "" on anything else. */
function singleTenantLineFor(extraction: ExtractionResult | null): string {
  const r = readSingleTenant(extraction);
  return r ? singleTenantShortLine(r) : "";
}

/** A multi-tenant property's listed tenants (lib/tenant-roster, #457), in
 *  one line for the memo's header: how much of the building the list
 *  covers, how much of its rent rolls before the model's sale, the anchors
 *  in and out of the sale. "" where fewer than two are listed. */
function rosterLineFor(extraction: ExtractionResult | null): string {
  const r = readRoster(extraction);
  return r ? rosterShortLine(r) : "";
}

/** A value-add renovation program (lib/value-add, #460), in one line for
 *  the memo's header: the doors, the cost of a door, the premium and
 *  whether it is proven. "" where the memorandum states none. */
function valueAddLineFor(extraction: ExtractionResult | null): string {
  const r = readValueAdd(extraction);
  return r ? valueAddShortLine(r) : "";
}

/** A note the seller offers to carry (lib/seller-financing, #462), in one
 *  line for the memo's header: the note as stated — the pricing needs the
 *  model, which the report carries; on a note, the financing of its
 *  purchase, said as that. "" where none is offered. */
function sellerNoteLineFor(extraction: ExtractionResult | null): string {
  return extraction ? sellerFinancingDocLine(extraction) : "";
}

/** A property-tax abatement (lib/tax-abatement, #461), in one line for the
 *  memo's header: the program, when it ends and the step-up. "" where the
 *  memorandum states none. */
/** What the third-party reports found (lib/site-reports, #465), in one
 *  line for the memo's header. "" where the memorandum cites none. */
function siteReportsLineFor(extraction: ExtractionResult | null): string {
  const r = readSiteReports(extraction);
  return r ? siteReportsShortLine(r) : "";
}

/** A student building (lib/student-housing, #468) in one line for the
 *  memo's header: the pre-leasing, the beds and the walk. "" otherwise. */
function studentLineFor(extraction: ExtractionResult | null): string {
  const r = readStudentHousing(extraction);
  return r ? studentShortLine(r) : "";
}

/** A manufactured-housing park (lib/manufactured-housing, #470) in one line
 *  for the memo's header: the pads, the lot rent against the market's, the
 *  park-owned homes and the water and sewer. "" otherwise. */
function mhLineFor(extraction: ExtractionResult | null): string {
  const r = readManufacturedHousing(extraction);
  return r ? mhShortLine(r) : "";
}

/** A self-storage facility (lib/self-storage, #471) in one line for the
 *  memo's header: the occupancies, the in-place rent against the street
 *  rate and the platform. "" otherwise. */
function storageLineFor(extraction: ExtractionResult | null): string {
  const r = readSelfStorage(extraction);
  return r ? storageShortLine(r) : "";
}

function taxAbatementLineFor(extraction: ExtractionResult | null): string {
  const r = readTaxAbatement(extraction);
  return r ? taxAbatementShortLine(r) : "";
}

/** How the property is sold (lib/sale-terms, #456), in one line for the
 *  memo's header: the auction's bid, premium, reserve and deadline, or who
 *  is selling. "" on a negotiated sale. */
function saleLineFor(extraction: ExtractionResult | null): string {
  const r = readSale(extraction);
  return r ? saleShortLine(r) : "";
}

/** What a hotel is sold with (lib/hotel-deal, #455), in one line for the
 *  memo's header: the flag, the encumbrance, the PIP, the franchise's end.
 *  "" on anything but a hotel. */
function hotelLineFor(extraction: ExtractionResult | null): string {
  const r = readHotelDeal(extraction);
  return r ? hotelShortLine(r) : "";
}

/** FEMA's flood zone at the building, from the stored site-flags lookup,
 *  in one line for the memo's header (#426): "" where there is nothing to
 *  say — minimal hazard, no digital map, a lookup still pending, or one made
 *  for an address the deal has since changed from. The address is the one
 *  the deal page reads the deal at: a blank one the memorandum's, a typed
 *  line its own fields (`addressUpgrade`), the sample's as stored. */
function floodLineFor(deal: DealRow, extraction: ExtractionResult | null): string {
  const flags = (deal as { site_flags?: SiteFlagsResult | null }).site_flags ?? null;
  const address =
    ((deal as { is_sample?: boolean }).is_sample ? null : addressUpgrade(deal.address, extraction)) ??
    ((deal.address as StructuredAddress | null | undefined) ?? null);
  return storedFloodShortLine(flags, address?.label) ?? "";
}

export type MemoData = {
  name: string;
  market: string;
  assetClass: string;
  /** deal type and, for a plan deal, the plan's headline figures ("" for a
   *  stabilized asset). Optional for callers built before it existed. */
  strategyLine?: string;
  /** a portfolio memorandum's properties and markets, and the facts to see
   *  before pricing it (lib/portfolio), in one line; "" for one property */
  portfolioLine?: string;
  /** what is being sold (lib/interest, #414) — a note, a share, a
   *  leasehold, in one line; "" for a plain fee simple */
  interestLine?: string;
  /** the seller's loan offered for assumption, as stated (#419); "" where
   *  none is */
  assumableLine?: string;
  /** a covenant or a contract that sets the rents (lib/affordable, #453),
   *  in one line; "" on a market-rate deal */
  affordableLine?: string;
  /** the one lease a single-tenant property is (lib/single-tenant, #454),
   *  in one line; "" on anything else */
  singleTenantLine?: string;
  /** what a hotel is sold with (lib/hotel-deal, #455), in one line; "" on
   *  anything but a hotel */
  hotelLine?: string;
  /** how the property is sold (lib/sale-terms, #456), in one line; "" on a
   *  negotiated sale */
  saleLine?: string;
  /** a multi-tenant property's listed tenants (lib/tenant-roster, #457),
   *  in one line; "" where fewer than two are listed */
  rosterLine?: string;
  /** a value-add renovation program (lib/value-add, #460), in one line; ""
   *  where none is stated */
  valueAddLine?: string;
  /** a property-tax abatement (lib/tax-abatement, #461), in one line; ""
   *  where none is stated */
  taxAbatementLine?: string;
  /** a note the seller offers to carry (lib/seller-financing, #462), in
   *  one line; "" where none is offered */
  sellerNoteLine?: string;
  /** what the third-party reports found (lib/site-reports, #465), in one
   *  line; "" where the memorandum cites none */
  siteReportsLine?: string;
  /** a student building's pre-leasing, beds and walk (lib/student-housing,
   *  #468), in one line; "" on anything else */
  studentLine?: string;
  /** a manufactured-housing park's pads, lot rent, homes and utilities
   *  (lib/manufactured-housing, #470), in one line; "" on anything else */
  mhLine?: string;
  /** a self-storage facility's occupancies, rates and platform
   *  (lib/self-storage, #471), in one line; "" on anything else */
  storageLine?: string;
  /** FEMA's flood zone at the building (lib/site-flags `floodShortLine`,
   *  #426) — a Special Flood Hazard Area or a drawn hazard; "" for minimal
   *  hazard, no digital map or a lookup that has not answered */
  floodLine?: string;
  dateStr: string;
  /** the day the verdict was written ("Screened Sep 12, 2026"), so a memo
   *  printed weeks later never passes an old call off as the day's; "" for
   *  a verdict saved before the pipeline stamped one */
  screened?: string;
  verdictWord: string | null;
  verdictColor: string;
  verdictSub: string;
  verdictReason: string;
  /** `sub` is the price tile's basis — "$274k/unit", "$200k/key", the
   *  pipeline card's own figure (lib/pipeline-slots `basisTag`) */
  keyTerms: { label: string; value: string; flagged: boolean; sub?: string }[];
  topRisks: string[];
  challenges: { severity: string; assumption: string; challenge: string }[];
  flags: { label: string; text: string }[];
  // The pre-model screen — ranges, deal-killers, and where the call flips.
  // Each range keeps the confidence the model gave it: a low-confidence
  // range and a high-confidence one must not read alike on the page.
  ranges: {
    label: string;
    low: string;
    base: string;
    high: string;
    source: string;
    confidence: "high" | "medium" | "low" | "";
  }[];
  dealKillers: { label: string; read: string; risk: string }[];
  sensitivity: { scenario: string; call: string; note: string }[];
  nextSteps: string[];
  // The buyer's standing criteria, checked deterministically (empty = no box set).
  buyBox: { label: string; status: "pass" | "near" | "miss" | "unknown" }[];
  // One-line retrade summary ("Caution → Go · Price −$1.8M (−2.5%) · …"), or null.
  sinceLast: string | null;
  /**
   * Submarket assumption checks the analyst dismissed, each with the reason
   * they gave (Phase 4). Overriding a check is normal. Doing it silently is
   * not — so the override travels with the memo, in the analyst's own words.
   */
  overrides: string[];
  /** Custom firm branding (Feature 6, Pro/Team) — null renders the default
   *  Underwrite Copilot identity. */
  branding: {
    firmName: string | null;
    logoDataUri: string | null;
    footerText: string | null;
  } | null;
  /** The building on the cover: its own photograph where the deal has one,
   *  else from above (#434) — a JPEG or PNG data URI and its credit line
   *  (lib/memo/cover-aerial.ts). Null or absent prints the cover as it
   *  always was. */
  cover?: MemoCover | null;
};

export interface MemoCover {
  dataUri: string;
  credit: string;
}

/** Analysis output and user-shaped rows can carry surprises — numbers where
 *  strings are expected, nulls inside arrays, glyphs standard Helvetica can't
 *  encode. Every rendered value passes through here (incl. pdfSafe, same as
 *  the report's str) so no data shape can throw or mis-render mid-render. */
const str = (v: unknown): string =>
  pdfSafe(typeof v === "string" ? v : v == null ? "" : String(v));

// A figure, with its unit and a range's other end: "$1,200", "9.3%", "180
// bps", "1.25x", "$2,400 \u2013 $2,600", "2.5 to 3.5%". A clamp never cuts
// inside one.
const FIGURE =
  /[$\u20ac\u00a3]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|bps|bp|pts?|x|[kKMB]|MM|SF)\b|%)?(?:\s*(?:\u2013|\u2014|-|to)\s*[$\u20ac\u00a3]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|bps|bp|pts?|x|[kKMB]|MM|SF)\b|%)?)?/g;
// Words a cut must not end on: a clause that stops at "from" or "the"
// promises a figure or a noun the reader never gets.
const DANGLING = new Set(
  "a an the of to from at by for in on with and or nor but vs vs. versus against than into over under as per if is are was were be its their which that".split(" "),
);

/**
 * Clamp to `n` characters for a fixed-size box on the one-page memo: cut at
 * a word boundary, never inside a figure, never after a word that leaves
 * the clause hanging, and say it was cut with an ellipsis. The rationale
 * once ended "\u2026the ramp is de-ris\u2026" and a deal-killer "\u2026to 9.3% from\u2026";
 * the full report's "The call, in full" page prints every word.
 */
export function clampWords(v: unknown, n: number): string {
  const s = str(v);
  if (s.length <= n) return s;
  const room = n - 1; // the ellipsis
  const figures = [...s.matchAll(FIGURE)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const insideFigure = (i: number) => figures.some(([a, b]) => i > a && i < b);
  let cut = -1;
  for (let i = Math.min(room, s.length - 1); i > 0; i--) {
    if (/\s/.test(s[i]) && !insideFigure(i)) {
      cut = i;
      break;
    }
  }
  // One word longer than the box (a URL, a run of digits): cut it.
  if (cut <= 0) return `${s.slice(0, room).trimEnd()}\u2026`;
  let head = s.slice(0, cut);
  for (;;) {
    const trimmed = head.replace(/[\s,;:(\u2013\u2014-]+$/, "");
    const last = trimmed.match(/(\S+)$/)?.[1] ?? "";
    if (DANGLING.has(last.toLowerCase()) && trimmed.length > last.length) {
      head = trimmed.slice(0, trimmed.length - last.length);
      continue;
    }
    head = trimmed;
    break;
  }
  return /[.!?]$/.test(head) ? `${head} \u2026` : `${head}\u2026`;
}

const clamp = clampWords;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A range's confidence as the model gave it, or "" for anything else. */
const confidenceOf = (v: unknown): MemoData["ranges"][number]["confidence"] =>
  v === "high" || v === "medium" || v === "low" ? v : "";

// Where the base sits inside low → high: the shared reader, re-exported for
// the full report's market reads (lib/verdict-range).
export { basePosition };

// WinAnsi-only text (standard Helvetica can't encode anything else) \u2014 the
// full filter lives in pdf-text.ts (universal, unit-tested); re-exported here
// for the full report and any other document module.
export { pdfSafe };

/** Shape the stored analysis into the flat data the one-page memo renders. */
export function buildMemoData(
  deal: DealRow,
  dateStr: string,
  buyBoxChecks?: BuyBoxCheck[] | null,
  branding?: MemoData["branding"],
  overrides?: string[] | null,
  cover?: MemoCover | null,
): MemoData {
  const extraction = deal.extraction as ExtractionResult | null;
  const challenges = deal.challenges as ChallengerResult | null;
  const comps = deal.comps as BrokerCompsResult | null;
  const market = deal.market as MarketResult | null;
  const verdict = deal.verdict as VerdictResult | null;

  const vmeta = verdict
    ? (
        {
          pass: { word: "Go", color: C.pass, sub: "Worth deeper work" },
          caution: {
            word: "Caution",
            color: C.caution,
            sub: "Proceed only with named conditions",
          },
          pass_on: { word: "No-go", color: C.kill, sub: "Recommend passing" },
        } as const
      )[verdict.verdict]
    : null;

  const metrics = list(extraction?.metrics) as ExtractionResult["metrics"];
  // The deal's kind as its page reads it — the extraction and the first
  // signal — so the memo never calls a deal stabilized that the page calls
  // a conversion, nor orders its key terms by a different kind.
  const firstSignal = (deal.first_signal as FirstSignal | null | undefined) ?? null;
  const strategy = inferStrategy(extraction ?? null, firstSignal);
  // The deal-defining rows first (price, cap or the plan's figures, units),
  // then the flagged ones — so the block never opens on four speculative
  // pro-forma figures and omits the asking price (lib/key-terms.ts).
  // The price tile carries the basis under it, as a pipeline card does: the
  // building's price over its count in the memorandum's own noun, or its
  // area — none on a note, the land or a plan deal (lib/pipeline-slots).
  // The price row's label is read against the year the screen read the
  // memorandum, as every surface reads it.
  const screenYear = screenYearOf(extraction);
  const priceRow = findPriceMetric(metrics ?? [], strategy.kind, screenYear);
  const priceBasis = extraction && priceRow ? basisTag(extraction, strategy.kind, str(deal.asset_class)) : null;
  const keyTerms = keyTermRows(metrics, strategy.kind, screenYear, 8, interestOf(extraction ?? null).kind).map((m) => ({
    label: str(m.label),
    value: str(m.value),
    flagged: !!m.flagged,
    ...(priceBasis && priceRow && m.label === priceRow.label && m.value === priceRow.value ? { sub: str(priceBasis) } : {}),
  }));

  const ch = (list(challenges?.challenges) as ChallengerResult["challenges"])
    .slice()
    .sort((a, b) => (SEV_RANK[a?.severity] ?? 1) - (SEV_RANK[b?.severity] ?? 1))
    .slice(0, 3)
    .map((c) => ({
      severity: str(c?.severity),
      assumption: str(c?.assumption),
      challenge: str(c?.challenge),
    }));

  const flags: { label: string; text: string }[] = [];
  for (const f of list(comps?.redFlags)) flags.push({ label: "Comps", text: str(f) });
  for (const c of list(market?.checks) as MarketResult["checks"]) {
    if (c?.assessment === "aggressive") {
      // The typical range is the market check's rule of thumb, never a comps
      // feed — the deal page's market section and the report's market page
      // say so, and a flag lifted out of them says so too.
      flags.push({
        label: "Market",
        text: `${str(c.assumption)}: OM ${str(c.omSays)} vs. typical ${str(c.typicalRange)} (a rule of thumb, not a live comps feed)`,
      });
    }
  }

  // The pre-model screen (added to verdicts later — older deals won't have it).
  const screen = verdict?.screen;
  const LEVER_LABEL: Record<string, string> = {
    basis: "Basis",
    exit: "Exit",
    debt: "Debt",
  };
  const SCENARIO_LABEL: Record<string, string> = {
    conservative: "Conservative",
    base: "Base",
    sponsor: "Sponsor",
  };
  const CALL_LABEL: Record<string, string> = {
    pass: "Go",
    caution: "Caution",
    pass_on: "No-go",
  };
  const ranges = (list(screen?.ranges) as NonNullable<typeof screen>["ranges"])
    .slice(0, 4)
    .map((r) =>
      // Read in numeric order (lib/verdict-range): a verdict stored when the
      // conservative end came first can hold its larger figure as "low".
      rangeInOrder({
        label: clamp(r?.label, 28),
        low: str(r?.low),
        base: str(r?.base),
        high: str(r?.high),
        source: clamp(r?.source, 56),
        confidence: confidenceOf(r?.confidence),
      }),
    );
  const dealKillers = (
    list(screen?.dealKillers) as NonNullable<typeof screen>["dealKillers"]
  )
    .slice(0, 3)
    .map((k) => ({
      label: LEVER_LABEL[k?.lever] ?? str(k?.lever),
      read: clamp(k?.read, 72),
      risk: clamp(k?.risk ?? "", 72),
    }));
  const sensitivity = (
    list(screen?.sensitivity) as NonNullable<typeof screen>["sensitivity"]
  ).map((sc) => ({
    scenario: SCENARIO_LABEL[sc?.scenario] ?? str(sc?.scenario),
    call: CALL_LABEL[sc?.call] ?? str(sc?.call),
    note: clamp(sc?.note ?? "", 90),
  }));

  // When the screen is present it earns the page space — tighten the older
  // sections so the memo stays one page.
  const hasScreen = ranges.length > 0;

  // Retrade line: what moved since the previous screen, compressed to one
  // sentence-length string. Only when something actually moved.
  let sinceLast: string | null = null;
  const prior = (deal.prior_screen as PriorScreen | undefined) ?? null;
  if (prior && extraction) {
    try {
      const diff = computeScreenDiff(prior, extraction, verdict);
      if (diff && (!diff.allFlat || diff.verdictChanged)) {
        const parts: string[] = [];
        if (diff.verdictFrom && diff.verdictTo) {
          parts.push(
            `${CALL_LABEL_GLOBAL[diff.verdictFrom] ?? diff.verdictFrom} › ${CALL_LABEL_GLOBAL[diff.verdictTo] ?? diff.verdictTo}`,
          );
        }
        for (const r of diff.rows.filter((x) => x.direction !== "flat").slice(0, 3)) {
          parts.push(`${r.label} ${r.delta}`);
        }
        const when = new Date(diff.at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
        sinceLast = pdfSafe(
          clamp(`Since last screen (${when}): ${parts.join("  ·  ")}`, 150),
        );
      }
    } catch {
      sinceLast = null;
    }
  }

  return {
    name: str(deal.name) || "Deal",
    market: str(extraction?.market),
    // On a deal filed "Auto-detect", what the deck turned out to be.
    assetClass: shownAssetClass(str(deal.asset_class), extraction ?? null),
    strategyLine: pdfSafe(strategyLineFor(extraction ?? null, strategy)),
    portfolioLine: pdfSafe(portfolioLineFor(extraction ?? null)),
    interestLine: pdfSafe(interestLineFor(extraction ?? null)),
    assumableLine: pdfSafe(assumableLineFor(extraction ?? null)),
    affordableLine: pdfSafe(affordableLineFor(extraction ?? null)),
    singleTenantLine: pdfSafe(singleTenantLineFor(extraction ?? null)),
    hotelLine: pdfSafe(hotelLineFor(extraction ?? null)),
    saleLine: pdfSafe(saleLineFor(extraction ?? null)),
    rosterLine: pdfSafe(rosterLineFor(extraction ?? null)),
    valueAddLine: pdfSafe(valueAddLineFor(extraction ?? null)),
    taxAbatementLine: pdfSafe(taxAbatementLineFor(extraction ?? null)),
    sellerNoteLine: pdfSafe(sellerNoteLineFor(extraction ?? null)),
    siteReportsLine: pdfSafe(siteReportsLineFor(extraction ?? null)),
    studentLine: pdfSafe(studentLineFor(extraction ?? null)),
    mhLine: pdfSafe(mhLineFor(extraction ?? null)),
    storageLine: pdfSafe(storageLineFor(extraction ?? null)),
    floodLine: pdfSafe(floodLineFor(deal, extraction ?? null)),
    dateStr,
    screened: screenedOn(verdict?.generatedAt) ? `Screened ${screenedOn(verdict?.generatedAt)}` : "",
    verdictWord: vmeta?.word ?? null,
    verdictColor: vmeta?.color ?? C.muted,
    verdictSub: vmeta?.sub ?? "",
    verdictReason: clamp(verdict?.reason ?? "", 280),
    keyTerms: hasScreen ? keyTerms.slice(0, 4) : keyTerms,
    topRisks: list(verdict?.topRisks).map(str).slice(0, hasScreen ? 2 : 4),
    // With the screen present, the deal-killers + top risks already carry the
    // critique and the ranges carry the comp/market story — drop the two
    // overlapping sections so the memo stays one page.
    challenges: hasScreen ? [] : ch,
    flags: hasScreen ? [] : flags.slice(0, 4),
    ranges,
    dealKillers,
    sensitivity,
    nextSteps: list(verdict?.nextSteps).map(str).slice(0, hasScreen ? 2 : 4),
    buyBox: (buyBoxChecks ?? []).map((c) => ({
      label: clamp(c.label, 20),
      status: c.status,
    })),
    sinceLast,
    // The analyst's own words, clamped but never paraphrased.
    overrides: (overrides ?? []).map((o) => clamp(o, 220)).slice(0, 4),
    branding: branding ?? null,
    cover: cover ?? null,
  };
}

// Verdict-call display names, shared by the retrade line above.
const CALL_LABEL_GLOBAL: Record<string, string> = {
  pass: "Go",
  caution: "Caution",
  pass_on: "No-go",
};

const s = StyleSheet.create({
  // The footer is absolutely positioned at 28pt from the foot; the bottom
  // padding reserves its band (its rule, its line of text) so a memo that
  // cannot fit flows to a second page instead of over its own footer — the
  // sample once ended within a few points of it. The margins below were
  // trimmed to give the reservation back, so the sample still fits one page.
  page: {
    paddingTop: 26,
    paddingBottom: 46,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: C.brand,
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 5,
    marginRight: 6,
  },
  brandText: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  brandLogo: { height: 22, maxWidth: 130, objectFit: "contain", marginRight: 6 },
  metaRight: { textAlign: "right", color: C.muted, fontSize: 9 },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: C.brand,
    marginTop: 8,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 19,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.2,
    lineHeight: 1.15,
  },
  sub: { fontSize: 10, color: C.muted, marginTop: 4 },
  titleChipBox: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 11,
    marginLeft: 10,
  },
  titleChipText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  // The masthead row: everything above the verdict box on the left, the
  // cover aerial (when there is one) on the right, top-aligned with the
  // brand line and shorter than the three rows it sits beside.
  masthead: { flexDirection: "row", alignItems: "flex-start" },
  // 96 wide leaves the title 414pt: a name of some forty characters still
  // sits on one line, and the memo's bottom edge — which the sample already
  // runs to within a few points of the footer — does not move.
  coverBox: { marginLeft: 12, alignItems: "flex-end" },
  cover: {
    width: 96,
    height: 54,
    borderRadius: 5,
    objectFit: "cover",
  },
  coverCredit: { fontSize: 5.5, color: C.muted, marginTop: 2 },

  verdictBox: {
    marginTop: 9,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 4,
    borderRadius: 6,
    padding: 10,
  },
  verdictHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  verdictWord: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
    lineHeight: 1.05,
  },
  verdictSub: { fontSize: 9.5, color: C.muted },
  verdictReason: { marginTop: 6, fontSize: 10, color: C.ink },
  sinceLast: { marginTop: 6, fontSize: 8, color: C.muted },

  buyBoxRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 7,
  },
  buyBoxTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginRight: 8,
  },
  buyBoxChip: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 5,
    marginBottom: 3,
    borderWidth: 0.75,
    borderRadius: 8,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
  },
  buyBoxMark: { fontSize: 8, fontFamily: "Helvetica-Bold", marginRight: 3 },
  buyBoxLabel: { fontSize: 8, color: C.ink },

  section: { marginTop: 11 },
  twoCol: { flexDirection: "row", marginTop: 11, gap: 14 },
  col: { flex: 1 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  sectionTick: {
    width: 3,
    height: 8,
    backgroundColor: C.brand,
    borderRadius: 1.5,
    marginRight: 5,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  termsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  term: {
    width: "25%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 0.5,
    borderRightColor: C.line,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  termLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  termValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 1.5 },
  verify: { fontSize: 6.5, color: C.caution, marginTop: 1 },
  termSub: { fontSize: 7, color: C.muted, marginTop: 1 },

  row: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 10, color: C.muted },
  itemText: { flex: 1, fontSize: 9.5 },

  challenge: { marginBottom: 6 },
  chHead: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  chTag: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    marginRight: 6,
  },
  chTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 },
  chBody: { fontSize: 9, color: C.muted },

  flagRow: { flexDirection: "row", marginBottom: 5 },
  flagTag: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.kill,
    width: 38,
    textTransform: "uppercase",
  },

  // The screen: ranges table
  rangeHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 3,
    marginBottom: 3,
  },
  rangeRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 3.25,
    paddingHorizontal: 2,
  },
  rangeRowAlt: { backgroundColor: C.faint },
  rangeLabel: { width: "23%", fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  rangeCell: { width: "10%", fontSize: 8.5, textAlign: "right", paddingRight: 6 },
  rangeConf: { width: "8%", fontSize: 7.5, textAlign: "right" },
  rangeCellBase: {
    width: "12%",
    fontSize: 8.5,
    textAlign: "right",
    paddingRight: 6,
    fontFamily: "Helvetica-Bold",
    color: C.brand,
    backgroundColor: "#e8f1ef",
    borderRadius: 3,
  },
  // Where the base sits inside the range, as the deal page and the shared
  // screen draw it: a track, the span up to the base, and a dot, in one
  // neutral colour. The higher figure is not always the sponsor's end (a
  // higher vacancy or exit cap is the buyer's), so the dot never grades
  // the position. Plain Views, so nothing to decode and no height beyond
  // the row's text.
  rangeBar: { width: "9%", paddingTop: 4, paddingRight: 8 },
  barTrack: { height: 2.5, borderRadius: 1.25, backgroundColor: C.line, position: "relative" },
  barFill: { position: "absolute", left: 0, top: 0, height: 2.5, borderRadius: 1.25, backgroundColor: "#b5cdc9" },
  barDot: { position: "absolute", top: -1.75, width: 6, height: 6, borderRadius: 3 },
  rangeSource: { width: "28%", fontSize: 7.5, color: C.muted },
  rangeHeadText: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // The screen: deal-killers as cards + the scenario trio
  killersRow: { flexDirection: "row", marginTop: 7, gap: 6 },
  killerCard: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: C.line,
    borderLeftWidth: 3,
    borderLeftColor: C.brand,
    borderRadius: 5,
    padding: 5.5,
    backgroundColor: "#fbfcfb",
  },
  killerName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.brand },
  killerRead: { fontSize: 8, color: C.muted, marginTop: 2 },
  killerRisk: { fontSize: 7.5, color: C.kill, marginTop: 2 },
  sensBlock: { marginTop: 7 },
  sensCallRow: { flexDirection: "row", alignItems: "center", marginTop: 1.5 },
  sensDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 3 },
  sensLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  sensRow: {
    flexDirection: "row",
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 5,
    overflow: "hidden",
  },
  sensCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRightWidth: 0.5,
    borderRightColor: C.line,
  },
  sensScenario: {
    fontSize: 6.5,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sensCall: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 1 },
  sensNote: { fontSize: 7, color: C.muted, marginTop: 1.5 },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.muted },
  footerLeft: { flex: 1, paddingRight: 12 },
  // The continuation pages' heading, inside the page's top padding.
  continued: {
    position: "absolute",
    top: 11,
    left: 44,
    right: 44,
    fontSize: 7.5,
    lineHeight: 1,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
  },
  poweredBy: {
    position: "absolute",
    bottom: 13,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#8f9995",
    textAlign: "center",
  },
});

function Section({
  title,
  keep = false,
  children,
}: {
  title: string;
  /** a short section moves to the next page whole rather than leave its
   *  heading at the foot of this one (a memo too long for one page) */
  keep?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section} wrap={!keep}>
      <View style={s.sectionTitleRow}>
        <View style={s.sectionTick} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function MemoDocument({ data }: { data: MemoData }) {
  return (
    <Document
      title={`${data.name} — Screening Memo`}
      author={data.branding?.firmName ?? "Underwrite Copilot"}
    >
      <MemoPage data={data} />
    </Document>
  );
}

/** The memo's single page, exported so the full report can lead with it. */
export function MemoPage({ data }: { data: MemoData }) {
  // The class as the label map says it — a stored "self_storage" reads
  // "Self-storage" on paper, never "Self_storage".
  const subParts = [data.market, assetClassLabel(data.assetClass), data.strategyLine ?? ""].filter(Boolean);
  const b = data.branding;
  const branded = !!(b && (b.firmName || b.logoDataUri || b.footerText));
  return (
    <Page size="LETTER" style={s.page}>
        {/* A memo that cannot fit one page flows to a second, which had no
            heading: a sheet read on its own did not say whose it was. Every
            page after the first carries the deal's name, in the top
            padding so page one's layout does not move. */}
        <Text
          fixed
          style={s.continued}
          render={({ pageNumber }) => (pageNumber > 1 ? `${data.name} — screening memo, continued` : "")}
        />
        {/* The masthead: brand and date, the rule, the title and its chip —
            and, when there is one, the cover aerial at the far right spanning
            all three rows. It borrows the height the masthead already spends,
            so a memo that fit one page without it still does. */}
        <View style={s.masthead}>
          <View style={{ flex: 1 }}>
        <View style={s.header}>
          <View style={s.brandRow}>
            {b?.logoDataUri ? (
              // react-pdf's Image has no alt concept (print canvas, not DOM)
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={b.logoDataUri} style={s.brandLogo} />
            ) : null}
            {!b?.logoDataUri && !b?.firmName ? (
              <Text style={s.badge}>UC</Text>
            ) : null}
            {b?.firmName ? (
              <Text style={s.brandText}>{pdfSafe(b.firmName)}</Text>
            ) : !b?.logoDataUri ? (
              <Text style={s.brandText}>Underwrite Copilot</Text>
            ) : null}
          </View>
          <View>
            <Text style={s.metaRight}>Deal Screening Memo</Text>
            <Text style={s.metaRight}>{data.dateStr}</Text>
            {data.screened ? <Text style={s.metaRight}>{data.screened}</Text> : null}
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{data.name}</Text>
            {subParts.length > 0 && (
              <Text style={s.sub}>{subParts.join("  ·  ")}</Text>
            )}
            {/* A portfolio (#411): how many properties across which markets,
                and what to see before pricing any of it. */}
            {data.portfolioLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.portfolioLine}</Text>}
            {/* What is being sold (#414) — a note, a share, a leasehold, said
                under the title before any figure is read. */}
            {data.interestLine && (
              <Text style={[s.sub, { color: "#114e54", fontFamily: "Helvetica-Bold" }]}>{data.interestLine}</Text>
            )}
            {/* How it is sold (#456): an auction's starting bid is where the
                price starts, and a court's or a lender's sale is as-is. */}
            {data.saleLine && <Text style={[s.sub, { color: "#8a5a00", fontFamily: "Helvetica-Bold" }]}>{data.saleLine}</Text>}
            {/* The seller's loan offered for assumption (#419), as stated. */}
            {data.assumableLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.assumableLine}</Text>}
            {/* A note the seller offers to carry (#462), as stated. */}
            {data.sellerNoteLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.sellerNoteLine}</Text>}
            {/* A covenant or a contract that sets the rents (#453): the
                restricted units' rents move with the limits, not the market. */}
            {data.affordableLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.affordableLine}</Text>}
            {/* The one lease a single-tenant property is (#454): the
                tenant, its guarantor, the term and the increases. */}
            {data.singleTenantLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.singleTenantLine}</Text>}
            {/* A multi-tenant property's listed tenants (#457): the roll
                before the sale, the anchors in and out of it. */}
            {data.rosterLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.rosterLine}</Text>}
            {/* A value-add renovation program (#460): the doors, the cost
                of a door, the premium and its proof. */}
            {data.valueAddLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.valueAddLine}</Text>}
            {/* A property-tax abatement (#461): when it ends and what the
                owner pays more once it does. */}
            {data.taxAbatementLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.taxAbatementLine}</Text>}
            {/* What the third-party reports found (#465): the Phase I, the
                immediate repairs, the seismic PML and the zoning. */}
            {data.siteReportsLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.siteReportsLine}</Text>}
            {/* A student building (#468): the pre-leasing against last
                year's, the beds and the walk to campus. */}
            {data.studentLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.studentLine}</Text>}
            {/* A manufactured-housing park (#470): the lot rent against the
                market's, the park-owned homes and the water and sewer. */}
            {data.mhLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.mhLine}</Text>}
            {/* A self-storage facility (#471): the two occupancies and the
                in-place rent against the street rate. */}
            {data.storageLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.storageLine}</Text>}
            {/* What a hotel is sold with (#455): the flag, the encumbrance,
                the PIP and the franchise's end. */}
            {data.hotelLine && <Text style={[s.sub, { color: "#114e54" }]}>{data.hotelLine}</Text>}
            {/* FEMA's flood zone at the building (#426): a Special Flood
                Hazard Area is a cost and a lender's condition. */}
            {data.floodLine && <Text style={[s.sub, { color: "#9b1c1c" }]}>{data.floodLine}</Text>}
          </View>
          {data.verdictWord ? (
            <View
              style={[s.titleChipBox, { backgroundColor: data.verdictColor }]}
            >
              <Text style={s.titleChipText}>{data.verdictWord}</Text>
            </View>
          ) : null}
        </View>
          </View>
          {data.cover ? (
            <View style={s.coverBox}>
              {/* react-pdf's Image has no alt concept (print canvas, not DOM) */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.cover.dataUri} style={s.cover} />
              <Text style={s.coverCredit}>{pdfSafe(data.cover.credit)}</Text>
            </View>
          ) : null}
        </View>

        {data.verdictWord && (
          <View
            style={[
              s.verdictBox,
              {
                borderLeftColor: data.verdictColor,
                backgroundColor: VERDICT_TINT[data.verdictWord] ?? C.faint,
              },
            ]}
          >
            <View style={s.verdictHead}>
              <Text style={[s.verdictWord, { color: data.verdictColor }]}>
                {data.verdictWord}
              </Text>
              {data.verdictSub ? (
                <Text style={s.verdictSub}>{data.verdictSub}</Text>
              ) : null}
            </View>
            {data.verdictReason ? (
              <Text style={s.verdictReason}>{data.verdictReason}</Text>
            ) : null}
            {data.sinceLast ? (
              <Text style={s.sinceLast}>{data.sinceLast}</Text>
            ) : null}
          </View>
        )}

        {data.buyBox.length > 0 && (
          <View style={s.buyBoxRow}>
            <Text style={s.buyBoxTitle}>Buy box</Text>
            {data.buyBox.map((c, i) => {
              const chip = STATUS_CHIP[c.status] ?? STATUS_CHIP.unknown;
              return (
                <View
                  key={i}
                  style={[
                    s.buyBoxChip,
                    { borderColor: chip.color, backgroundColor: chip.bg },
                  ]}
                >
                  <Text style={[s.buyBoxMark, { color: chip.color }]}>
                    {chip.mark}
                  </Text>
                  <Text style={s.buyBoxLabel}>{c.label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {data.ranges.length > 0 && (
          <Section title="The screen — ranges, not hero numbers">
            <View style={s.rangeHead}>
              <Text style={[s.rangeLabel, s.rangeHeadText]}>Assumption</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>Low</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>Base</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>High</Text>
              <Text style={[s.rangeBar, s.rangeHeadText, { paddingTop: 0 }]}>In range</Text>
              <Text style={[s.rangeSource, s.rangeHeadText]}>Source</Text>
              <Text style={[s.rangeConf, s.rangeHeadText]}>Conf.</Text>
            </View>
            {data.ranges.map((r, i) => {
              const pos = basePosition(r);
              // The track is the column less its right padding (9% of the
              // 524pt row is 47pt); the dot is centred on the base's point.
              const track = 39;
              return (
                <View
                  key={i}
                  style={i % 2 === 1 ? [s.rangeRow, s.rangeRowAlt] : s.rangeRow}
                >
                  <Text style={s.rangeLabel}>{r.label}</Text>
                  <Text style={s.rangeCell}>{r.low}</Text>
                  <Text style={s.rangeCellBase}>{r.base}</Text>
                  <Text style={s.rangeCell}>{r.high}</Text>
                  <View style={s.rangeBar}>
                    {pos != null ? (
                      <View style={[s.barTrack, { width: track }]}>
                        <View style={[s.barFill, { width: pos * track }]} />
                        <View
                          style={[
                            s.barDot,
                            {
                              left: pos * track - 3,
                              backgroundColor: C.brand,
                            },
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.rangeSource}>{r.source}</Text>
                  <Text style={[s.rangeConf, { color: RANGE_CONF_COLOR[r.confidence] ?? C.muted }]}>
                    {r.confidence}
                  </Text>
                </View>
              );
            })}

            {/* A memo that cannot fit one page flows to a second; a card
                is never cut across the break, so the row of three moves
                whole, and so does the scenario block under it. */}
            {data.dealKillers.length > 0 && (
              <View style={s.killersRow} wrap={false}>
                {data.dealKillers.map((k, i) => (
                  <View key={i} style={s.killerCard}>
                    <Text style={s.killerName}>
                      {i + 1}. {k.label}
                    </Text>
                    <Text style={s.killerRead}>{k.read}</Text>
                    {/* The verdict step reads what breaks the deal without
                        the engine: its IRR moves are estimates, said so. */}
                    {k.risk ? (
                      <Text style={s.killerRisk}>Breaks if (screen&apos;s estimate): {k.risk}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {data.sensitivity.length > 0 && (
              <View style={s.sensBlock} wrap={false}>
                <Text style={s.sensLabel}>Where the call flips — the screen&apos;s estimate, not the model&apos;s</Text>
                <View style={s.sensRow}>
                  {data.sensitivity.map((sc, i) => (
                    <View key={i} style={s.sensCell}>
                      <Text style={s.sensScenario}>{sc.scenario}</Text>
                      {/* The call's dot, as the deal page's flip strip and
                          the shared screen draw it; the word still carries
                          the meaning on a grayscale print. */}
                      <View style={s.sensCallRow}>
                        <View
                          style={[s.sensDot, { backgroundColor: CALL_COLOR[sc.call] ?? C.ink }]}
                        />
                        <Text
                          style={[
                            s.sensCall,
                            { color: CALL_COLOR[sc.call] ?? C.ink, marginTop: 0 },
                          ]}
                        >
                          {sc.call}
                        </Text>
                      </View>
                      {sc.note ? <Text style={s.sensNote}>{sc.note}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Section>
        )}

        {data.keyTerms.length > 0 && (
          <Section title="Key terms" keep>
            <View style={s.termsWrap}>
              {data.keyTerms.map((t, i) => (
                <View key={i} style={s.term}>
                  <Text style={s.termLabel}>{t.label}</Text>
                  <Text style={s.termValue}>{t.value}</Text>
                  {t.sub ? <Text style={s.termSub}>{t.sub}</Text> : null}
                  {t.flagged ? <Text style={s.verify}>verify vs. source</Text> : null}
                </View>
              ))}
            </View>
          </Section>
        )}

        {(data.topRisks.length > 0 || data.nextSteps.length > 0) && (
          <View style={s.twoCol} wrap={false}>
            {data.topRisks.length > 0 && (
              <View style={s.col}>
                <Text style={s.sectionTitle}>Top risks</Text>
                {data.topRisks.map((r, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.itemText}>{r}</Text>
                  </View>
                ))}
              </View>
            )}
            {data.nextSteps.length > 0 && (
              <View style={s.col}>
                <Text style={s.sectionTitle}>Next steps</Text>
                {data.nextSteps.map((n, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.bullet}>{i + 1}.</Text>
                    <Text style={s.itemText}>{n}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {data.challenges.length > 0 && (
          <Section title="Headline challenges" keep>
            {data.challenges.map((c, i) => (
              <View key={i} style={s.challenge}>
                <View style={s.chHead}>
                  <Text
                    style={[
                      s.chTag,
                      { backgroundColor: SEV_COLOR[c.severity] ?? C.caution },
                    ]}
                  >
                    {c.severity}
                  </Text>
                  <Text style={s.chTitle}>{c.assumption}</Text>
                </View>
                <Text style={s.chBody}>{c.challenge}</Text>
              </View>
            ))}
          </Section>
        )}

        {data.overrides.length > 0 && (
          <Section title="Submarket checks overridden" keep>
            {data.overrides.map((o, i) => (
              <View key={i} style={s.flagRow}>
                <Text style={s.flagTag}>Override</Text>
                <Text style={s.itemText}>{o}</Text>
              </View>
            ))}
          </Section>
        )}

        {data.flags.length > 0 && (
          <Section title="Comp & market flags" keep>
            {data.flags.map((f, i) => (
              <View key={i} style={s.flagRow}>
                <Text style={s.flagTag}>{f.label}</Text>
                <Text style={s.itemText}>{f.text}</Text>
              </View>
            ))}
          </Section>
        )}

        <View style={s.footer} fixed>
          <View style={s.footerLeft}>
            {b?.footerText ? (
              <Text style={s.footerText}>{pdfSafe(b.footerText)}</Text>
            ) : null}
            <Text style={s.footerText}>
              First-pass screen, not investment advice. Verify flagged figures
              against source documents.
            </Text>
          </View>
          <Text style={s.footerText}>
            {b?.firmName ? pdfSafe(b.firmName) : "Underwrite Copilot"}
          </Text>
        </View>
        {branded ? (
          <Text style={s.poweredBy} fixed>
            Powered by Underwrite Copilot
          </Text>
        ) : null}
      </Page>
  );
}

