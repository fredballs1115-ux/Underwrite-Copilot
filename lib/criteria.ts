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
export const METRIC_FIND = {
  sf: {
    inc: /\b(total sf|square (foot|feet|footage)|sq\.? ?ft|rentable|nra|gla|building size|\bsf\b)/i,
    exc: /price|\$|per|\/|psf/i,
  },
  price: {
    inc: /purchase price|asking price|\bprice\b/i,
    exc: /unit|\/sf|per sf|per unit|psf/i,
  },
  perUnit: { inc: /per unit|\/unit|price\/unit|unit price/i },
  goingInCap: { inc: /going[- ]?in cap/i },
  capRate: { inc: /\bcap rate\b/i, exc: /exit|terminal|reversion/i },
  irr: { inc: /\birr\b/i },
  // Cash-on-cash isn't a required extraction field, so it's often absent —
  // when it is, the score reports the CoC dimension "unknown", never a pass.
  coc: { inc: /cash[- ]?on[- ]?cash|cash[- ]?on[- ]?equity|cash yield|\bcoc\b/i },
} as const;

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

/** "$70.7M" / "$70,700,000" / "285k" / "1.2 mm" → dollars (or plain number), or null. */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[,$\s]/g, "").toLowerCase();
  const m = s.match(/^\$?(\d+(?:\.\d+)?)(mm|m|k|b)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = m[2];
  if (suffix === "b") return n * 1e9;
  if (suffix === "m" || suffix === "mm") return n * 1e6;
  if (suffix === "k") return n * 1e3;
  return n;
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
): ExtractionLike | null {
  const addressHaystack = [
    extraction?.address,
    dealAddress?.label,
    dealAddress?.county,
    dealAddress?.state,
  ]
    .filter(Boolean)
    .join(" ");
  const signalMetrics = firstSignal
    ? [
        { label: "Asking price", value: firstSignal.askPrice },
        { label: "Going-in cap rate", value: firstSignal.goingInCap },
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
    const metric = findMetric(metrics, METRIC_FIND.sf.inc, METRIC_FIND.sf.exc);
    const sf = metric ? parseMoney(metric.value) : null;
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
    const metric = findMetric(
      metrics,
      METRIC_FIND.price.inc,
      METRIC_FIND.price.exc,
    );
    const dollars = metric ? parseMoney(metric.value) : null;
    const bandText = [
      band.min != null ? `${fmtM(band.min)} min` : null,
      band.max != null ? `${fmtM(band.max)} max` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (dollars == null) {
      checks.push({
        label: "Price",
        status: "unknown",
        detail: `Mandate is ${bandText}; no parseable asking price in the screen yet.`,
      });
    } else {
      const belowMin = band.min != null && dollars < band.min;
      const aboveMax = band.max != null && dollars > band.max;
      if (!belowMin && !aboveMax) {
        checks.push({
          label: "Price",
          status: "pass",
          detail: `Mandate is ${bandText} — the ask is ${fmtM(dollars)}. Inside the band.`,
        });
      } else {
        const bound = belowMin ? band.min! : band.max!;
        const off = Math.abs(dollars - bound) / bound;
        const near = off <= NEAR_REL;
        checks.push({
          label: "Price",
          status: near ? "near" : "miss",
          detail: near
            ? `Mandate is ${bandText} — the ask is ${fmtM(dollars)}, ${Math.round(off * 100)}% ${belowMin ? "under" : "over"}. Close enough to price; a retrade could land it inside.`
            : `Mandate is ${bandText} — the ask is ${fmtM(dollars)}. ${belowMin ? "Below" : "Beyond"} the mandate.`,
        });
      }
    }
  }

  // ---- Price per unit ----------------------------------------------------
  if (box.maxPerUnitK != null) {
    const metric = findMetric(metrics, METRIC_FIND.perUnit.inc);
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
    const metric =
      findMetric(metrics, METRIC_FIND.goingInCap.inc) ??
      findMetric(metrics, METRIC_FIND.capRate.inc, METRIC_FIND.capRate.exc);
    const pct = metric ? parsePct(metric.value) : null;
    if (pct == null) {
      checks.push({
        label: "Going-in cap",
        status: "unknown",
        detail: `Mandate wants ≥${box.minCapPct}% going-in; no parseable cap rate yet.`,
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
