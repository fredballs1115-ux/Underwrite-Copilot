// The buy box, drawn (the buy box page): each band the box sets — the price,
// the going-in cap, the size in square feet and in units, the basis — as a
// track with the band filled, its red line where the box draws one, and the
// reader's live deals as dots on it. A dot sits at the figure the band's own
// check judged (lib/criteria `boxFigures`, the readers `evaluateBuyBox`
// reads through) and wears that check's call, so the picture and the deal's
// chip never disagree. A deal whose figure the box cannot judge — none
// stated, a note's or a position's cap, a basis on a price that is not the
// building's — is not drawn, and is counted as not judged.
//
// Pure and server-computed: the page hands the drawing plain data.

import {
  boxFigures,
  evaluateBuyBox,
  priceBand,
  type BuyBox,
  type BuyBoxSource,
  type BuyBoxStatus,
} from "@/lib/criteria";
import { compactUsd } from "@/lib/money";

export type BandKey = "price" | "cap" | "sf" | "units" | "basis";

/** A dot's tone: the band's check's call, or `line` on a track that holds a
 *  red line and no scored band, where no check calls it. */
export type BandDotTone = "pass" | "near" | "miss" | "line";

export interface BandDot {
  id: string;
  name: string;
  /** where the figure falls, 0–100 along the track */
  at: number;
  /** the figure as the deal's check says it: "$42.0M", "6.10%", "248 keys" */
  text: string;
  tone: BandDotTone;
  /** past the track's drawn end, held at it */
  off: "low" | "high" | null;
  /** the row the dot is lifted to, so two close figures do not hide each
   *  other: 0 sits on the track */
  lane: number;
  /** a stated price range, 0–100 along the track, the dot at the end the
   *  band tests */
  range?: { from: number; to: number };
}

export interface BoxBand {
  key: BandKey;
  /** the band's name: "Price", "Going-in cap", "Size", "Count", "Basis" */
  label: string;
  /** the band as the box sets it: "$10M – $80M", "≥ 5.50%", "≤ $250k / unit" */
  bandText: string;
  /** the band's filled stretch, 0–100; null where the box sets only a red
   *  line on this figure */
  fill: { from: number; to: number } | null;
  /** the hard red line on the same figure, where the box sets one */
  redLine: { at: number; text: string } | null;
  /** the track's two ends, in the band's own words */
  ends: { low: string; high: string };
  dots: BandDot[];
  /** how many rows the dots take */
  lanes: number;
  /** live deals the box cannot judge on this figure */
  notJudged: number;
}

/** One live deal, as the page reads it: its class and the buy box's source
 *  (lib/buy-box-chip `dealCheckSource`). */
export interface BandDeal {
  id: string;
  name: string;
  assetClass: string;
  source: BuyBoxSource | null;
}

/** The most live deals the page reads to draw: a picture of the pipeline,
 *  read in one query. */
export const BAND_DEALS_MAX = 200;

/** The most rows the dots are lifted to; past it they share the lowest. */
export const BAND_MAX_LANES = 6;
/** How close two dots may sit, in percent of the track, before the second is
 *  lifted a row. */
const LANE_GAP = 3;

const pct2 = (n: number) => `${n.toFixed(2)}%`;
const sfText = (sf: number) =>
  sf >= 1e6 ? `${(sf / 1e6).toFixed(2).replace(/\.?0+$/, "")}M SF` : `${Math.round(sf / 1e3).toLocaleString("en-US")}k SF`;
const countText = (n: number) => Math.round(n).toLocaleString("en-US");
/** A dot's dollar figure, as the deal's check says it ("$42.0M"). */
const usd = (n: number) => compactUsd(n);
/** A bound's, as the form sets it ("$10M"). */
const usdBound = (n: number) => compactUsd(n, { trim: true });

interface Spec {
  key: BandKey;
  label: string;
  min?: number;
  max?: number;
  /** the red line, and which side of it is out */
  red?: { at: number; out: "above" | "below" };
  /** the box narrowed to this one band, so `evaluateBuyBox` answers its
   *  check alone */
  only: BuyBox;
  fmt: (n: number) => string;
  /** the deal's figure on this band, as the check reads it */
  figure: (f: ReturnType<typeof boxFigures>) => { value: number; text: string; range?: { low: number; high: number } } | null;
}

function specsOf(box: BuyBox): Spec[] {
  const db = box.dealbreakers ?? {};
  const band = priceBand(box);
  const out: Spec[] = [];
  if (band.min != null || band.max != null || db.maxPriceM != null) {
    out.push({
      key: "price",
      label: "Price",
      min: band.min,
      max: band.max,
      red: db.maxPriceM != null ? { at: db.maxPriceM * 1e6, out: "above" } : undefined,
      only: { priceMinM: box.priceMinM, priceMaxM: band.max != null ? band.max / 1e6 : undefined },
      fmt: usdBound,
      figure: (f) =>
        f.price
          ? {
              value: f.price.value,
              text: f.price.range ? `${usd(f.price.range.low)}–${usd(f.price.range.high)}` : usd(f.price.value),
              range: f.price.range ?? undefined,
            }
          : null,
    });
  }
  if (box.minCapPct != null || db.minCapPct != null) {
    out.push({
      key: "cap",
      label: "Going-in cap",
      min: box.minCapPct,
      red: db.minCapPct != null ? { at: db.minCapPct, out: "below" } : undefined,
      only: { minCapPct: box.minCapPct },
      fmt: pct2,
      figure: (f) => (f.cap != null ? { value: f.cap, text: pct2(f.cap) } : null),
    });
  }
  if (box.sfMin != null || box.sfMax != null) {
    out.push({
      key: "sf",
      label: "Size",
      min: box.sfMin,
      max: box.sfMax,
      only: { sfMin: box.sfMin, sfMax: box.sfMax },
      fmt: sfText,
      figure: (f) => (f.sf != null ? { value: f.sf, text: sfText(f.sf) } : null),
    });
  }
  if (box.unitsMin != null || box.unitsMax != null) {
    out.push({
      key: "units",
      label: "Count",
      min: box.unitsMin,
      max: box.unitsMax,
      only: { unitsMin: box.unitsMin, unitsMax: box.unitsMax },
      fmt: (n) => `${countText(n)} units`,
      // The deal's own noun: a hotel's keys, a park's pads.
      figure: (f) => (f.count ? { value: f.count.n, text: `${countText(f.count.n)} ${f.count.noun}` } : null),
    });
  }
  if (box.maxPerUnitK != null || db.maxPerUnitK != null) {
    out.push({
      key: "basis",
      label: "Basis",
      max: box.maxPerUnitK != null ? box.maxPerUnitK * 1e3 : undefined,
      red: db.maxPerUnitK != null ? { at: db.maxPerUnitK * 1e3, out: "above" } : undefined,
      only: { maxPerUnitK: box.maxPerUnitK },
      fmt: (n) => `${usdBound(n)} / unit`,
      figure: (f) => (f.basis ? { value: f.basis.value, text: `${usd(f.basis.value)} / ${f.basis.noun}` } : null),
    });
  }
  return out;
}

/** The band in words, as the form sets it. */
function bandTextOf(s: Spec): string {
  const parts: string[] = [];
  if (s.min != null && s.max != null) parts.push(`${s.fmt(s.min)} – ${s.fmt(s.max)}`);
  else if (s.min != null) parts.push(`≥ ${s.fmt(s.min)}`);
  else if (s.max != null) parts.push(`≤ ${s.fmt(s.max)}`);
  if (s.red) parts.push(`red line ${s.red.out === "above" ? "≤" : "≥"} ${s.fmt(s.red.at)}`);
  return parts.join(" · ");
}

/** The stretch the track draws: the box's bounds, widened to the deals' own
 *  figures but never past one band's width beyond the bounds, so one
 *  outlier never shrinks the band to a sliver; then a margin a side. */
function domainOf(s: Spec, values: number[]): { lo: number; hi: number } {
  const bounds = [s.min, s.max, s.red?.at].filter((v): v is number => v != null);
  let lo = Math.min(...bounds);
  let hi = Math.max(...bounds);
  if (hi === lo) {
    // One figure only: a ceiling reads down to half of it, a floor up to
    // half again over it.
    const ceiling = s.max != null || s.red?.out === "above";
    if (ceiling) lo = hi / 2;
    else hi = lo * 1.5;
    if (hi === lo) hi = lo + 1;
  }
  const w = hi - lo;
  const allowLo = Math.max(0, lo - w);
  const allowHi = hi + w;
  for (const v of values) {
    lo = Math.min(lo, Math.max(allowLo, v));
    hi = Math.max(hi, Math.min(allowHi, v));
  }
  const pad = (hi - lo) * 0.06;
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}

/** Lift each dot to the lowest row where it clears the last dot on it. */
function laneDots(dots: Omit<BandDot, "lane">[]): { dots: BandDot[]; lanes: number } {
  const sorted = [...dots].sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
  const last: number[] = [];
  const out: BandDot[] = [];
  for (const d of sorted) {
    let lane = last.findIndex((x) => d.at - x >= LANE_GAP);
    if (lane < 0) {
      if (last.length < BAND_MAX_LANES) lane = last.length;
      else lane = last.indexOf(Math.min(...last));
    }
    last[lane] = d.at;
    out.push({ ...d, lane });
  }
  return { dots: out, lanes: Math.max(1, last.length) };
}

const TONE_OF: Record<Exclude<BuyBoxStatus, "unknown">, BandDotTone> = { pass: "pass", near: "near", miss: "miss" };

/**
 * Every band the box sets, with the deals on it. A track is drawn for each
 * band the box sets, or its red line where the box sets only that, in the
 * form's order: price, cap, size, count, basis. Each deal is judged by the
 * band's own check (`evaluateBuyBox` over the box narrowed to that band),
 * drawn at the figure `boxFigures` reads for it, and counted as not judged
 * where that check reads none.
 */
export function boxBands(box: BuyBox, deals: readonly BandDeal[]): BoxBand[] {
  return specsOf(box).map((s) => {
    const scored = s.min != null || s.max != null;
    const read: { d: BandDeal; value: number; text: string; range?: { low: number; high: number }; tone: BandDotTone }[] = [];
    let notJudged = 0;
    for (const d of deals) {
      const fig = d.source ? s.figure(boxFigures(d.assetClass, d.source, box)) : null;
      if (!fig) {
        notJudged += 1;
        continue;
      }
      let tone: BandDotTone = "line";
      if (scored) {
        const check = evaluateBuyBox(d.assetClass, d.source, s.only)[0];
        if (!check || check.status === "unknown") {
          notJudged += 1;
          continue;
        }
        tone = TONE_OF[check.status];
      }
      read.push({ d, ...fig, tone });
    }
    const values = read.flatMap((r) => (r.range ? [r.value, r.range.low, r.range.high] : [r.value]));
    const { lo, hi } = domainOf(s, values);
    const at = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
    const round = (n: number) => Math.round(n * 10) / 10;
    const { dots, lanes } = laneDots(
      read.map((r) => ({
        id: r.d.id,
        name: r.d.name,
        at: round(at(r.value)),
        text: r.text,
        tone: r.tone,
        off: r.value < lo ? "low" : r.value > hi ? "high" : null,
        ...(r.range ? { range: { from: round(at(r.range.low)), to: round(at(r.range.high)) } } : {}),
      })),
    );
    return {
      key: s.key,
      label: s.label,
      bandText: bandTextOf(s),
      fill: scored ? { from: round(at(s.min ?? lo)), to: round(at(s.max ?? hi)) } : null,
      redLine: s.red ? { at: round(at(s.red.at)), text: `Red line ${s.fmt(s.red.at)}` } : null,
      ends: { low: s.fmt(lo), high: s.fmt(hi) },
      dots,
      lanes,
      notJudged,
    };
  });
}

/** What a dot's call is, in words, for its name to a screen reader. */
export const DOT_WORDS: Record<BandDotTone, string> = {
  pass: "inside the box",
  near: "a near-miss",
  miss: "outside the box",
  line: "against the red line",
};

/** "3 not judged": the deals the box cannot judge on a band. */
export function notJudgedText(n: number): string | null {
  return n > 0 ? `${n} not judged` : null;
}
