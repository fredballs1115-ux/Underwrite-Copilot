// The buy box: the buyer's standing investment criteria, checked against
// every screened deal. Deliberately deterministic — parsing and comparison in
// code, no model in the loop — so the same deal always gets the same fit call.
// (Universal module: used by server pages and the background pipeline.)

export interface BuyBox {
  /** e.g. ["multifamily", "industrial"] — empty/undefined = any */
  assetClasses?: string[];
  /** comma-separated market substrings, e.g. "Dallas, Fort Worth, Austin" */
  markets?: string;
  /** max total purchase price, $ millions */
  maxPriceM?: number;
  /** max price per unit, $ thousands */
  maxPerUnitK?: number;
  /** minimum going-in cap rate, % */
  minCapPct?: number;
  /** minimum base-case IRR, % */
  minIrrPct?: number;
  /** free-text priorities, fed to the verdict synthesizer verbatim */
  notes?: string;
}

export interface BuyBoxCheck {
  label: string;
  status: "pass" | "fail" | "unknown";
  detail: string;
}

export function isEmptyBuyBox(box: BuyBox | null | undefined): boolean {
  if (!box) return true;
  return (
    !(box.assetClasses && box.assetClasses.length) &&
    !box.markets?.trim() &&
    box.maxPriceM == null &&
    box.maxPerUnitK == null &&
    box.minCapPct == null &&
    box.minIrrPct == null &&
    !box.notes?.trim()
  );
}

/** "$70.7M" / "$70,700,000" / "285k" / "1.2 mm" → dollars, or null. */
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
    : `$${Math.round(dollars / 1e3)}k`;

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

function findMetric(
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

/**
 * Check a screened deal against the buy box. Only criteria the buyer actually
 * set produce rows; anything the OM didn't yield parseable data for is
 * reported "unknown", never silently passed.
 */
export function evaluateBuyBox(
  dealAssetClass: string,
  extraction: ExtractionLike | null,
  box: BuyBox,
): BuyBoxCheck[] {
  const checks: BuyBoxCheck[] = [];
  const metrics = extraction?.metrics ?? [];

  if (box.assetClasses && box.assetClasses.length) {
    const actual =
      dealAssetClass && dealAssetClass !== "auto"
        ? dealAssetClass
        : (extraction?.assetClass ?? "");
    if (!actual) {
      checks.push({
        label: "Asset class",
        status: "unknown",
        detail: "Asset class not identified yet.",
      });
    } else {
      const ok = box.assetClasses.includes(actual.toLowerCase());
      checks.push({
        label: "Asset class",
        status: ok ? "pass" : "fail",
        detail: ok
          ? `${actual} is in your buy box.`
          : `${actual} — your box is ${box.assetClasses.join(", ")}.`,
      });
    }
  }

  if (box.markets?.trim()) {
    const haystack = `${extraction?.market ?? ""} ${extraction?.address ?? ""}`
      .toLowerCase()
      .trim();
    const wanted = box.markets
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!haystack) {
      checks.push({
        label: "Market",
        status: "unknown",
        detail: "The screen hasn't identified the market yet.",
      });
    } else {
      const hit = wanted.find((w) => haystack.includes(w));
      checks.push({
        label: "Market",
        status: hit ? "pass" : "fail",
        detail: hit
          ? `${extraction?.market ?? "Market"} matches "${hit}".`
          : `${extraction?.market ?? "This market"} isn't in your list (${box.markets}).`,
      });
    }
  }

  if (box.maxPriceM != null) {
    const metric = findMetric(
      metrics,
      /purchase price|asking price|\bprice\b/i,
      /unit|\/sf|per sf|per unit|psf/i,
    );
    const dollars = metric ? parseMoney(metric.value) : null;
    if (dollars == null) {
      checks.push({
        label: "Price",
        status: "unknown",
        detail: "No parseable price in the extraction.",
      });
    } else {
      const max = box.maxPriceM * 1e6;
      checks.push({
        label: "Price",
        status: dollars <= max ? "pass" : "fail",
        detail: `OM ${fmtM(dollars)} vs your max ${fmtM(max)}.`,
      });
    }
  }

  if (box.maxPerUnitK != null) {
    const metric = findMetric(metrics, /per unit|\/unit|price\/unit|unit price/i);
    const dollars = metric ? parseMoney(metric.value) : null;
    if (dollars == null) {
      checks.push({
        label: "Price / unit",
        status: "unknown",
        detail: "No parseable per-unit basis in the extraction.",
      });
    } else {
      const max = box.maxPerUnitK * 1e3;
      checks.push({
        label: "Price / unit",
        status: dollars <= max ? "pass" : "fail",
        detail: `OM ${fmtM(dollars)}/unit vs your max ${fmtM(max)}/unit.`,
      });
    }
  }

  if (box.minCapPct != null) {
    const metric =
      findMetric(metrics, /going[- ]?in cap/i) ??
      findMetric(metrics, /\bcap rate\b/i, /exit|terminal|reversion/i);
    const pct = metric ? parsePct(metric.value) : null;
    if (pct == null) {
      checks.push({
        label: "Going-in cap",
        status: "unknown",
        detail: "No parseable going-in cap in the extraction.",
      });
    } else {
      checks.push({
        label: "Going-in cap",
        status: pct >= box.minCapPct ? "pass" : "fail",
        detail: `OM ${pct.toFixed(2)}% vs your min ${box.minCapPct}%.`,
      });
    }
  }

  if (box.minIrrPct != null) {
    const metric = findMetric(metrics, /\birr\b/i);
    const pct = metric ? parsePct(metric.value) : null;
    if (pct == null) {
      checks.push({
        label: "IRR",
        status: "unknown",
        detail: "No parseable IRR in the extraction.",
      });
    } else {
      checks.push({
        label: "IRR",
        status: pct >= box.minIrrPct ? "pass" : "fail",
        detail: `OM ${pct.toFixed(1)}% vs your min ${box.minIrrPct}% (broker figure — verify).`,
      });
    }
  }

  return checks;
}

/** Human/prompt-readable one-liners describing the box (skips unset fields). */
export function buyBoxLines(box: BuyBox): string[] {
  const lines: string[] = [];
  if (box.assetClasses?.length)
    lines.push(`Asset classes: ${box.assetClasses.join(", ")}`);
  if (box.markets?.trim()) lines.push(`Target markets: ${box.markets}`);
  if (box.maxPriceM != null)
    lines.push(`Max purchase price: $${box.maxPriceM}M`);
  if (box.maxPerUnitK != null)
    lines.push(`Max price per unit: $${box.maxPerUnitK}k`);
  if (box.minCapPct != null) lines.push(`Min going-in cap: ${box.minCapPct}%`);
  if (box.minIrrPct != null) lines.push(`Min base-case IRR: ${box.minIrrPct}%`);
  if (box.notes?.trim()) lines.push(`Priorities: ${box.notes.trim()}`);
  return lines;
}
