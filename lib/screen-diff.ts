// "Since last screen" — the deterministic diff between the previous screen's
// numbers and the current one's. Pure parsing and comparison in code (no model
// in the loop), so a retraded deal shows exactly what moved and by how much.
// (Universal module: used by the deal page; snapshots are written by the
// pipeline into deals.prior_screen — see migration 0010.)

import { parseMoney, parsePct } from "./criteria";

interface MetricLike {
  label: string;
  value: string;
  basis?: string;
}
interface ExtractionLike {
  metrics: MetricLike[];
}
interface VerdictLike {
  verdict?: string;
}

/** What the pipeline snapshots before overwriting a previous run's results. */
export interface PriorScreen {
  at: string;
  extraction: ExtractionLike | null;
  verdict: VerdictLike | null;
}

export interface DiffRow {
  label: string;
  before: string;
  after: string;
  /** formatted signed change, e.g. "−$2.3M (−3.2%)" or "+0.25pt" */
  delta: string;
  /** from the BUYER's perspective */
  direction: "better" | "worse" | "flat";
}

export interface ScreenDiff {
  /** ISO timestamp of the prior screen */
  at: string;
  verdictFrom: string | null;
  verdictTo: string | null;
  verdictChanged: boolean;
  rows: DiffRow[];
  /** true when every tracked metric parsed on both sides and none moved */
  allFlat: boolean;
}

interface Tracked {
  label: string;
  include: RegExp;
  exclude?: RegExp;
  kind: "money" | "pct";
  /** which way is good news for the buyer */
  betterWhen: "down" | "up";
}

// The deal-defining figures worth tracking across screens. Matching is
// label-based (same finder must hit on BOTH sides) so we never compare a
// stabilized figure against an in-place one.
const TRACKED: Tracked[] = [
  {
    label: "Asking price",
    include: /purchase price|asking price|\bprice\b/i,
    exclude: /unit|\/sf|per sf|per unit|psf/i,
    kind: "money",
    betterWhen: "down",
  },
  {
    label: "Price / unit",
    include: /per unit|\/unit|unit price/i,
    kind: "money",
    betterWhen: "down",
  },
  {
    label: "Going-in cap",
    include: /going[- ]?in cap/i,
    kind: "pct",
    betterWhen: "up",
  },
  {
    label: "NOI",
    include: /\bnoi\b/i,
    exclude: /stabilized|pro ?forma/i,
    kind: "money",
    betterWhen: "up",
  },
  {
    label: "Occupancy",
    include: /occupancy/i,
    kind: "pct",
    betterWhen: "up",
  },
  {
    label: "IRR",
    include: /\birr\b/i,
    kind: "pct",
    betterWhen: "up",
  },
];

const normLabel = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9%$/]+/g, " ").trim();

/**
 * Pick the before/after metric pair for a tracker. Extractions often carry
 * several candidates per tracker (T-12 NOI vs Year-1 NOI, current vs
 * stabilized occupancy) and their order isn't stable run to run — naively
 * taking the first match on each side can diff two DIFFERENT figures and
 * manufacture a phantom retrade. So: an exact (normalized) label match wins;
 * otherwise only an unambiguous single candidate on each side with the SAME
 * tagged basis qualifies; otherwise the tracker is skipped for this deal.
 */
function pickPair(
  before: MetricLike[],
  after: MetricLike[],
  t: Tracked,
): [MetricLike, MetricLike] | null {
  const match = (m: MetricLike) =>
    t.include.test(m.label) && !(t.exclude && t.exclude.test(m.label));
  const bs = before.filter(match);
  const as_ = after.filter(match);
  if (!bs.length || !as_.length) return null;

  for (const b of bs) {
    const a = as_.find((x) => normLabel(x.label) === normLabel(b.label));
    if (a) {
      if (b.basis && a.basis && b.basis !== a.basis) continue;
      return [b, a];
    }
  }
  if (
    bs.length === 1 &&
    as_.length === 1 &&
    bs[0].basis &&
    as_[0].basis &&
    bs[0].basis === as_[0].basis
  ) {
    return [bs[0], as_[0]];
  }
  return null;
}

const fmtMoney = (d: number) => {
  const abs = Math.abs(d);
  if (abs >= 1e6) return `$${(d / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(d / 1e3)}k`;
  return `$${Math.round(d)}`;
};

export function computeScreenDiff(
  prior: PriorScreen,
  currentExtraction: ExtractionLike,
  currentVerdict: VerdictLike | null,
): ScreenDiff | null {
  const before = prior.extraction?.metrics ?? [];
  const after = currentExtraction.metrics ?? [];
  if (!before.length || !after.length) return null;

  const rows: DiffRow[] = [];
  for (const t of TRACKED) {
    const pair = pickPair(before, after, t);
    if (!pair) continue;
    const [b, a] = pair;

    const parse = t.kind === "money" ? parseMoney : parsePct;
    const bv = parse(b.value);
    const av = parse(a.value);
    if (bv == null || av == null) continue;

    const delta = av - bv;
    // Tolerances so run-to-run formatting noise never reads as a retrade:
    // money within 0.5% relative is flat; rates within 0.05pt are flat.
    // (delta === 0 is always flat — including a $0 → $0 baseline.)
    const flat =
      delta === 0 ||
      (t.kind === "money"
        ? bv !== 0 && Math.abs(delta / bv) < 0.005
        : Math.abs(delta) < 0.05);

    let deltaText: string;
    if (flat) {
      deltaText = "unchanged";
    } else if (t.kind === "money") {
      const pctPart =
        bv !== 0 ? ` (${delta > 0 ? "+" : "−"}${Math.abs((delta / bv) * 100).toFixed(1)}%)` : "";
      deltaText = `${delta > 0 ? "+" : "−"}${fmtMoney(Math.abs(delta))}${pctPart}`;
    } else {
      deltaText = `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}pt`;
    }

    rows.push({
      label: t.label,
      before: b.value,
      after: a.value,
      delta: deltaText,
      direction: flat
        ? "flat"
        : (delta < 0 && t.betterWhen === "down") ||
            (delta > 0 && t.betterWhen === "up")
          ? "better"
          : "worse",
    });
  }

  if (!rows.length) return null;

  const verdictFrom = prior.verdict?.verdict ?? null;
  const verdictTo = currentVerdict?.verdict ?? null;
  return {
    at: prior.at,
    verdictFrom,
    verdictTo,
    verdictChanged: !!verdictFrom && !!verdictTo && verdictFrom !== verdictTo,
    rows,
    allFlat: rows.every((r) => r.direction === "flat"),
  };
}
