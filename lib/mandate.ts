// The mandate-fit SCORE: a single 0–100 read on how well a screened deal fits
// the buyer's standing mandate, plus a PURSUE / WATCH / PASS call. Where the
// buy-box CHECK (lib/criteria.ts evaluateBuyBox) answers each criterion
// pass/near/miss, this rolls the same evidence into one number so a pipeline
// can be sorted and triaged by fit.
//
// Deterministic by construction: parsing and arithmetic in code, no model in
// the loop — the same deal against the same box always scores the same. The
// figures are read out of the extraction with the SAME patterns the check
// uses (METRIC_FIND), so the score and the chip never disagree about which
// number they looked at.
//
// Weighting (max 100 when every dimension applies):
//   asset 15 · market 15 · size 10 · cap 15 · CoC 15 · IRR 15 · dealbreakers 15
// A partly-configured box scores over the dimensions it actually sets — the
// weight is rescaled to the applicable-and-known total, so 0–100 stays honest
// (see `scoreMandateFit`). Unknowns (a criterion set, but no parseable figure
// in the screen yet) are excluded from the denominator, never counted as a
// pass or a fail. Any tripped dealbreaker caps the verdict at PASS.

import {
  type BuyBox,
  findMetric,
  parseMoney,
  parsePct,
  geoTargets,
  hasNoDealbreakers,
  METRIC_FIND,
  NEAR_REL,
  NEAR_CAP_PT,
  NEAR_IRR_PT,
} from "./criteria";

export type MandateVerdict = "PURSUE" | "WATCH" | "PASS";
export type DimensionStatus = "pass" | "partial" | "miss" | "unknown";
export type DimensionKey =
  | "asset"
  | "market"
  | "size"
  | "cap"
  | "coc"
  | "irr"
  | "dealbreakers";

/** Point allocation per dimension. Sums to 100 when all apply. */
export const WEIGHTS: Record<DimensionKey, number> = {
  asset: 15,
  market: 15,
  size: 10,
  cap: 15,
  coc: 15,
  irr: 15,
  dealbreakers: 15,
};

// Verdict thresholds on the 0–100 score.
export const PURSUE_MIN = 75;
export const WATCH_MIN = 50;

export interface MandateDimension {
  key: DimensionKey;
  label: string;
  /** max points this dimension can earn */
  weight: number;
  /** points earned, 0..weight (0 when unknown — then excluded from the total) */
  earned: number;
  status: DimensionStatus;
  /** one plain-English analyst line: mandate, deal figure, call */
  detail: string;
}

export interface MandateScore {
  /** 0..100, or null when nothing in the box is checkable against this deal */
  score: number | null;
  verdict: MandateVerdict | null;
  /** every dimension the box configured (unknowns included, so the UI can
   *  show what's still pending) — dimensions the box left unset are omitted */
  dimensions: MandateDimension[];
  /** true when at least one hard dealbreaker was violated */
  dealbreakerTripped: boolean;
  /** dealbreakers configured but not evaluable against this screen yet */
  unresolvedDealbreakers: number;
}

/** Structural shape of the extraction the score reads — kept local so this
 *  module stays importable everywhere without dragging in heavy types. */
interface MetricLike {
  label: string;
  value: string;
}
interface ExtractionLike {
  assetClass?: string;
  market?: string;
  address?: string;
  metrics: MetricLike[];
}

type Pattern = { readonly inc: RegExp; readonly exc?: RegExp };

function pctOf(metrics: MetricLike[], pat: Pattern): number | null {
  const m = findMetric(metrics, pat.inc, pat.exc);
  return m ? parsePct(m.value) : null;
}
function moneyOf(metrics: MetricLike[], pat: Pattern): number | null {
  const m = findMetric(metrics, pat.inc, pat.exc);
  return m ? parseMoney(m.value) : null;
}

/** Going-in cap: prefer the labelled going-in figure, else a generic cap rate
 *  that isn't the exit/terminal cap. Mirrors evaluateBuyBox exactly. */
function goingInCapPct(metrics: MetricLike[]): number | null {
  const m =
    findMetric(metrics, METRIC_FIND.goingInCap.inc) ??
    findMetric(metrics, METRIC_FIND.capRate.inc, METRIC_FIND.capRate.exc);
  return m ? parsePct(m.value) : null;
}

/** The deal's asset class: the explicit override wins, else what the screen
 *  read. Mirrors evaluateBuyBox. */
function resolveAssetClass(
  dealAssetClass: string,
  extraction: ExtractionLike | null,
): string {
  return dealAssetClass && dealAssetClass !== "auto"
    ? dealAssetClass
    : (extraction?.assetClass ?? "");
}

/** The location haystack the geography checks match against. */
function geoHaystack(extraction: ExtractionLike | null): string {
  return `${extraction?.market ?? ""} ${extraction?.address ?? ""}`
    .toLowerCase()
    .trim();
}

/** Does the haystack land in any target geography? Same needle logic as the
 *  buy-box check: city / county / label, ignoring 1-char noise. */
function inTargetGeo(box: BuyBox, haystack: string): boolean {
  return geoTargets(box).some((t) => {
    const needles = [t.city, t.county, t.label]
      .filter((s): s is string => !!s && s.trim().length > 1)
      .map((s) => s.toLowerCase());
    return needles.some((n) => haystack.includes(n));
  });
}

type Scored = { status: DimensionStatus; earned: number };

/** Score a "≥ floor" criterion with a linear partial-credit ramp: full points
 *  at/above the floor, zero at `tolPt` below it, straight line between. */
function scoreFloor(
  actual: number | null,
  floor: number,
  tolPt: number,
  weight: number,
): Scored {
  if (actual == null) return { status: "unknown", earned: 0 };
  if (actual >= floor) return { status: "pass", earned: weight };
  const gap = floor - actual;
  if (gap <= tolPt) {
    return { status: "partial", earned: weight * (1 - gap / tolPt) };
  }
  return { status: "miss", earned: 0 };
}

/** Score a min–max band with a proportional ramp `NEAR_REL` beyond either
 *  bound: full inside, zero once more than NEAR_REL past the nearer bound. */
function scoreBand(
  value: number | null,
  min: number | undefined,
  max: number | undefined,
  weight: number,
): Scored {
  if (value == null) return { status: "unknown", earned: 0 };
  const belowMin = min != null && value < min;
  const aboveMax = max != null && value > max;
  if (!belowMin && !aboveMax) return { status: "pass", earned: weight };
  const bound = belowMin ? min! : max!;
  const off = Math.abs(value - bound) / bound;
  if (off <= NEAR_REL) {
    return { status: "partial", earned: weight * (1 - off / NEAR_REL) };
  }
  return { status: "miss", earned: 0 };
}

const fmtM = (d: number) =>
  d >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : `$${Math.round(d / 1e3)}k`;

/** Evaluate the hard dealbreakers against the screen. Each returns a bucket:
 *  `tripped` (violated), `clear` (satisfied), or `unknown` (no figure yet). */
function evalDealbreakers(
  dealAssetClass: string,
  extraction: ExtractionLike | null,
  box: BuyBox,
): { tripped: string[]; clear: string[]; unknown: string[] } {
  const db = box.dealbreakers!;
  const metrics = extraction?.metrics ?? [];
  const tripped: string[] = [];
  const clear: string[] = [];
  const unknown: string[] = [];

  // Asset class must be in the mandate list (needs a mandate list to mean
  // anything — inert without one).
  if (db.requireAssetClass && box.assetClasses?.length) {
    const actual = resolveAssetClass(dealAssetClass, extraction);
    const wanted = box.assetClasses.map((a) => a.toLowerCase());
    if (!actual) unknown.push("asset class");
    else if (wanted.includes(actual.toLowerCase())) clear.push("asset class");
    else tripped.push(`asset class is ${actual}, outside the mandate`);
  }

  // Must sit in a target geography (needs targets to mean anything).
  if (db.requireGeography && geoTargets(box).length) {
    const haystack = geoHaystack(extraction);
    if (!haystack) unknown.push("location");
    else if (inTargetGeo(box, haystack)) clear.push("location");
    else tripped.push("location outside every target market");
  }

  // Hard purchase-price ceiling.
  if (db.maxPriceM != null) {
    const price = moneyOf(metrics, METRIC_FIND.price);
    const ceiling = db.maxPriceM * 1e6;
    if (price == null) unknown.push("price");
    else if (price <= ceiling) clear.push("price");
    else tripped.push(`price ${fmtM(price)} over the ${fmtM(ceiling)} ceiling`);
  }

  // Hard going-in cap floor.
  if (db.minCapPct != null) {
    const cap = goingInCapPct(metrics);
    if (cap == null) unknown.push("cap rate");
    else if (cap >= db.minCapPct) clear.push("cap rate");
    else tripped.push(`going-in cap ${cap.toFixed(2)}% under the ${db.minCapPct}% floor`);
  }

  // Hard basis-per-unit ceiling.
  if (db.maxPerUnitK != null) {
    const perUnit = moneyOf(metrics, METRIC_FIND.perUnit);
    const ceiling = db.maxPerUnitK * 1e3;
    if (perUnit == null) unknown.push("basis / unit");
    else if (perUnit <= ceiling) clear.push("basis / unit");
    else tripped.push(`basis ${fmtM(perUnit)}/unit over the ${fmtM(ceiling)}/unit ceiling`);
  }

  return { tripped, clear, unknown };
}

/**
 * Score a screened deal against a mandate. Only dimensions the box configures
 * are scored; each is scored 0..weight, and the total is rescaled to the sum
 * of the weights that both applied AND had a parseable figure — so a deal the
 * screen has only partly measured still returns an honest 0–100 rather than
 * being silently zeroed on the blanks.
 */
export function scoreMandateFit(
  dealAssetClass: string,
  extraction: ExtractionLike | null,
  box: BuyBox,
): MandateScore {
  const metrics = extraction?.metrics ?? [];
  const dims: MandateDimension[] = [];
  let dealbreakerTripped = false;
  let unresolvedDealbreakers = 0;

  // ---- Asset class (binary) ---------------------------------------------
  if (box.assetClasses?.length) {
    const mandate = box.assetClasses.join(" or ");
    const actual = resolveAssetClass(dealAssetClass, extraction);
    const wanted = box.assetClasses.map((a) => a.toLowerCase());
    let status: DimensionStatus, earned: number, detail: string;
    if (!actual) {
      status = "unknown";
      earned = 0;
      detail = `Mandate is ${mandate}; the screen hasn't identified the asset class yet.`;
    } else if (wanted.includes(actual.toLowerCase())) {
      status = "pass";
      earned = WEIGHTS.asset;
      detail = `Mandate is ${mandate} — this is ${actual}. In scope.`;
    } else {
      status = "miss";
      earned = 0;
      detail = `Mandate is ${mandate} — this is ${actual}. Outside the mandate.`;
    }
    dims.push({ key: "asset", label: "Asset class", weight: WEIGHTS.asset, earned, status, detail });
  }

  // ---- Geography (binary) -----------------------------------------------
  if (geoTargets(box).length) {
    const mandate = geoTargets(box).map((t) => t.label).join("; ");
    const haystack = geoHaystack(extraction);
    let status: DimensionStatus, earned: number, detail: string;
    if (!haystack) {
      status = "unknown";
      earned = 0;
      detail = `Mandate covers ${mandate}; the screen hasn't placed this deal yet.`;
    } else if (inTargetGeo(box, haystack)) {
      status = "pass";
      earned = WEIGHTS.market;
      detail = `Mandate covers ${mandate} — this deal is in territory.`;
    } else {
      status = "miss";
      earned = 0;
      detail = `Mandate covers ${mandate} — this deal reads ${extraction?.market || "elsewhere"}. Off the map.`;
    }
    dims.push({ key: "market", label: "Market", weight: WEIGHTS.market, earned, status, detail });
  }

  // ---- Size (banded) ----------------------------------------------------
  if (box.sfMin != null || box.sfMax != null) {
    const sf = moneyOf(metrics, METRIC_FIND.sf);
    const s = scoreBand(sf, box.sfMin, box.sfMax, WEIGHTS.size);
    const bandText = [
      box.sfMin != null ? `${Math.round(box.sfMin / 1e3)}k SF min` : null,
      box.sfMax != null ? `${Math.round(box.sfMax / 1e3)}k SF max` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const detail =
      s.status === "unknown"
        ? `Mandate is ${bandText}; no parseable square footage in the screen yet.`
        : s.status === "pass"
          ? `Mandate is ${bandText} — inside the band.`
          : s.status === "partial"
            ? `Mandate is ${bandText} — a near-miss on size, partial credit.`
            : `Mandate is ${bandText} — outside the size band.`;
    dims.push({ key: "size", label: "Size", weight: WEIGHTS.size, earned: s.earned, status: s.status, detail });
  }

  // ---- Going-in cap (floor) ---------------------------------------------
  if (box.minCapPct != null) {
    const cap = goingInCapPct(metrics);
    const s = scoreFloor(cap, box.minCapPct, NEAR_CAP_PT, WEIGHTS.cap);
    const detail =
      s.status === "unknown"
        ? `Mandate wants ≥${box.minCapPct}% going-in; no parseable cap rate yet.`
        : s.status === "pass"
          ? `Mandate wants ≥${box.minCapPct}% going-in — the deal shows ${cap!.toFixed(2)}%. Clears the floor.`
          : s.status === "partial"
            ? `Mandate wants ≥${box.minCapPct}% going-in — ${cap!.toFixed(2)}%, just under. Partial credit.`
            : `Mandate wants ≥${box.minCapPct}% going-in — ${cap!.toFixed(2)}%. Short of the floor.`;
    dims.push({ key: "cap", label: "Going-in cap", weight: WEIGHTS.cap, earned: s.earned, status: s.status, detail });
  }

  // ---- Cash-on-cash (floor) ---------------------------------------------
  if (box.minCoCPct != null) {
    const coc = pctOf(metrics, METRIC_FIND.coc);
    const s = scoreFloor(coc, box.minCoCPct, NEAR_IRR_PT, WEIGHTS.coc);
    const detail =
      s.status === "unknown"
        ? `Mandate wants ≥${box.minCoCPct}% cash-on-cash; no parseable figure in the screen.`
        : s.status === "pass"
          ? `Mandate wants ≥${box.minCoCPct}% cash-on-cash — the OM shows ${coc!.toFixed(1)}%. On target (verify).`
          : s.status === "partial"
            ? `Mandate wants ≥${box.minCoCPct}% cash-on-cash — ${coc!.toFixed(1)}%, just shy. Partial credit.`
            : `Mandate wants ≥${box.minCoCPct}% cash-on-cash — ${coc!.toFixed(1)}%. Short of target.`;
    dims.push({ key: "coc", label: "Cash-on-cash", weight: WEIGHTS.coc, earned: s.earned, status: s.status, detail });
  }

  // ---- Target return / IRR (floor) --------------------------------------
  if (box.minIrrPct != null) {
    const irr = pctOf(metrics, METRIC_FIND.irr);
    const s = scoreFloor(irr, box.minIrrPct, NEAR_IRR_PT, WEIGHTS.irr);
    const detail =
      s.status === "unknown"
        ? `Mandate targets ≥${box.minIrrPct}% IRR; no parseable IRR in the screen.`
        : s.status === "pass"
          ? `Mandate targets ≥${box.minIrrPct}% IRR — the OM projects ${irr!.toFixed(1)}%. On target (broker figure — verify).`
          : s.status === "partial"
            ? `Mandate targets ≥${box.minIrrPct}% IRR — ${irr!.toFixed(1)}%, just shy. Partial credit.`
            : `Mandate targets ≥${box.minIrrPct}% IRR — ${irr!.toFixed(1)}%. Short even on the OM's numbers.`;
    dims.push({ key: "irr", label: "Target IRR", weight: WEIGHTS.irr, earned: s.earned, status: s.status, detail });
  }

  // ---- Dealbreakers (hard) ----------------------------------------------
  if (!hasNoDealbreakers(box.dealbreakers)) {
    const { tripped, clear, unknown } = evalDealbreakers(dealAssetClass, extraction, box);
    unresolvedDealbreakers = unknown.length;
    let status: DimensionStatus, earned: number, detail: string;
    if (tripped.length) {
      dealbreakerTripped = true;
      status = "miss";
      earned = 0;
      detail = `Dealbreaker: ${tripped.join("; ")}. Automatic PASS.`;
    } else if (clear.length) {
      status = "pass";
      earned = WEIGHTS.dealbreakers;
      detail = unknown.length
        ? `No dealbreaker tripped (${unknown.length} couldn't be checked — verify).`
        : "No dealbreaker tripped. All red lines clear.";
    } else {
      // Only unknowns — never claim the red lines passed when none could be
      // checked. Excluded from the score, surfaced for manual review.
      status = "unknown";
      earned = 0;
      detail = `${unknown.length} dealbreaker${unknown.length > 1 ? "s" : ""} couldn't be checked against the screen yet.`;
    }
    dims.push({ key: "dealbreakers", label: "Dealbreakers", weight: WEIGHTS.dealbreakers, earned, status, detail });
  }

  // ---- Roll up ----------------------------------------------------------
  // Rescale over the dimensions that both applied and had data. Unknowns drop
  // out of the denominator so a half-measured screen isn't penalised for the
  // blanks — the score reflects what's actually known.
  const scored = dims.filter((d) => d.status !== "unknown");
  const denom = scored.reduce((sum, d) => sum + d.weight, 0);
  const numer = scored.reduce((sum, d) => sum + d.earned, 0);
  const score = denom > 0 ? Math.round((numer / denom) * 100) : null;

  const verdict: MandateVerdict | null =
    score == null
      ? null
      : dealbreakerTripped
        ? "PASS"
        : score >= PURSUE_MIN
          ? "PURSUE"
          : score >= WATCH_MIN
            ? "WATCH"
            : "PASS";

  return { score, verdict, dimensions: dims, dealbreakerTripped, unresolvedDealbreakers };
}
