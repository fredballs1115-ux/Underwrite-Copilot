import type { LiveBriefFigure } from "@/lib/anthropic/types";
import type { LiveFigure } from "@/lib/live-market-brief";

/**
 * What moved since the screen: the figures the market check read on the
 * day it ran (stored with the result — `MarketResult.liveBrief.figures`)
 * against the same figures read today. Pure.
 *
 * A screen is a snapshot, and a deal page is opened for weeks after it
 * ran: the model beside it already re-seeds its rate from today's curve,
 * but the market check's sentences are the day's, and nothing said whether
 * the world had moved since. This does, in the figure's own unit, and
 * says three different things apart: a figure with a NEWER observation
 * that moved, one with a newer observation that did not (a "0.0 pt"
 * that is a fact), and one the publisher has not updated since the screen
 * — which is not "unchanged", it is "no newer figure", and the two must
 * never read the same. A figure that was read then and cannot be read
 * now (a stale series, a pull that failed) is left out rather than shown
 * as a move to nothing.
 *
 * Units follow the figure: a share moves in points, a dollar figure and a
 * count in percent, days in days, a rank in places with a smaller rank
 * hotter — the hotness reader's rule, kept here so the sign cannot flip.
 */
export type MoveUnit = "pts" | "pct" | "days" | "places";

export interface FigureMove {
  key: string;
  label: string;
  unit: LiveFigure["unit"];
  from: number;
  to: number;
  fromAsOf: string;
  toAsOf: string;
  /** signed, in `moveUnit`; 0 where nothing moved or nothing newer */
  move: number;
  moveUnit: MoveUnit;
  kind: "moved" | "unchanged" | "no_newer";
}

export interface BriefDelta {
  /** the day the screen read its figures */
  since: string;
  moves: FigureMove[];
  /** how many of the stored figures have a newer observation today */
  newer: number;
  /** how many of those moved */
  moved: number;
}

/** The smallest change that counts as a move, per move unit — under it a
 *  newer observation is "unchanged", which is itself a fact worth saying. */
const FLOOR: Record<MoveUnit, number> = { pts: 0.05, pct: 0.05, days: 0.5, places: 0.5 };

function moveUnitFor(unit: LiveFigure["unit"]): MoveUnit {
  switch (unit) {
    case "pts":
    case "pct":
      return "pts";
    case "days":
      return "days";
    case "rank":
      return "places";
    case "usd":
    case "count":
    case "years":
      return "pct";
  }
}

function moveBetween(unit: LiveFigure["unit"], from: number, to: number): number {
  switch (moveUnitFor(unit)) {
    case "pts":
      return Math.round((to - from) * 10) / 10;
    case "days":
      return Math.round(to - from);
    case "places":
      // A smaller rank is hotter: rank 40 → 28 is 12 places hotter, +12.
      return Math.round(from - to);
    case "pct":
      return from === 0 ? 0 : Math.round(((to - from) / Math.abs(from)) * 1000) / 10;
  }
}

export function briefDelta(
  since: string,
  stored: readonly LiveBriefFigure[] | undefined,
  today: readonly LiveFigure[],
): BriefDelta | null {
  if (!stored || stored.length === 0) return null;
  const now = new Map(today.map((f) => [f.key, f]));
  const moves: FigureMove[] = [];
  for (const s of stored) {
    const t = now.get(s.key);
    if (!t || !Number.isFinite(s.value) || !Number.isFinite(t.value)) continue;
    const moveUnit = moveUnitFor(s.unit);
    if (t.asOf === s.asOf) {
      moves.push({ key: s.key, label: s.label, unit: s.unit, from: s.value, to: t.value, fromAsOf: s.asOf, toAsOf: t.asOf, move: 0, moveUnit, kind: "no_newer" });
      continue;
    }
    const move = moveBetween(s.unit, s.value, t.value);
    moves.push({
      key: s.key,
      label: s.label,
      unit: s.unit,
      from: s.value,
      to: t.value,
      fromAsOf: s.asOf,
      toAsOf: t.asOf,
      move,
      moveUnit,
      kind: Math.abs(move) >= FLOOR[moveUnit] ? "moved" : "unchanged",
    });
  }
  if (moves.length === 0) return null;
  const newer = moves.filter((m) => m.kind !== "no_newer").length;
  const moved = moves.filter((m) => m.kind === "moved").length;
  return { since, moves, newer, moved };
}

const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const signed = (v: number, dp: number): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}`;

/** A figure's value as the page prints it, in its own unit. */
export function figureValue(unit: LiveFigure["unit"], value: number): string {
  switch (unit) {
    case "pts":
    case "pct":
      return `${value.toFixed(1)}%`;
    case "usd":
      return usd(value);
    case "count":
      return Math.round(value).toLocaleString("en-US");
    case "days":
      return `${Math.round(value)} days`;
    case "rank":
      return `#${Math.round(value)}`;
    case "years":
      return `${value.toFixed(1)} years`;
  }
}

/** "+1.1% to $2,335 (Sep 30)" / "+0.4 pt to 6.6% (Q3 2026)" / "12 places hotter to #28" —
 *  one string per move, so a surface prints it whole. */
export function moveSentence(m: FigureMove): string {
  const to = figureValue(m.unit, m.to);
  switch (m.kind) {
    case "no_newer":
      return `${m.label}: no newer figure than the one the check read`;
    case "unchanged":
      return `${m.label}: unchanged at ${to}`;
    case "moved":
      switch (m.moveUnit) {
        case "pts":
          return `${m.label}: ${signed(m.move, 1)} pt to ${to}`;
        case "pct":
          return `${m.label}: ${signed(m.move, 1)}% to ${to}`;
        case "days":
          return `${m.label}: ${signed(m.move, 0)} days to ${to}`;
        case "places":
          return `${m.label}: ${Math.abs(m.move)} places ${m.move > 0 ? "hotter" : "cooler"}, now ${to}`;
      }
  }
}
