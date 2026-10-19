// How long a deal sat in each stage, read off its stage history. Pure.
//
// The decision log listed the moves one line each ("Stage → Tracking, Sep
// 2, 2026"), which says when and never how long. This turns the same
// entries into spans: each stage from the day it was set to the day the
// next one was, the last one open to today, in whole UTC days (the log's
// dates are UTC days, so a span is the difference of two printed dates).
//
// Only what the history records: a deal created before its first recorded
// move has no span before it, and a history with no moves has none at all.
// A stage set again on the stage it already held is no move, so the two
// entries are one span. Closed and Dead end the ladder: a deal that reached
// either sits there, it does not run up days in it, so the last span is
// the one before it and the end is said as the day it came.

import { STAGE_LABEL, isOpenStage, type Stage, type StageChange } from "@/lib/stages";

export interface StageSpan {
  stage: Stage;
  label: string;
  /** ISO day the stage was set */
  from: string;
  /** ISO day the next stage was set, or today's for the stage it is in */
  to: string;
  /** whole days between the two; 0 where both fall on one day */
  days: number;
  /** the stage the deal is in now, its days still running */
  current: boolean;
}

export interface StageTimeline {
  spans: StageSpan[];
  /** where the deal ended, Closed or Dead, and the day it did; null while it
   *  is still on the ladder */
  end: { stage: Stage; label: string; on: string } | null;
}

const DAY_MS = 86_400_000;

function isoDay(at: string): string | null {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/**
 * The spans, oldest first. `today` is the reader's day (ISO); without it the
 * stage the deal is in has no end, and is left out rather than given one.
 */
export function stageTimeline(history: readonly StageChange[], today: string | null): StageTimeline {
  const moves = history
    .map((h) => ({ stage: h.stage, day: isoDay(h.at), at: h.at }))
    .filter((h): h is { stage: Stage; day: string; at: string } => h.day !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
  // One entry a move: the same stage set twice in a row is one span.
  const runs = moves.filter((m, i) => i === 0 || moves[i - 1].stage !== m.stage);
  const spans: StageSpan[] = [];
  let end: StageTimeline["end"] = null;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const next = runs[i + 1];
    if (!next && !isOpenStage(r.stage)) {
      end = { stage: r.stage, label: STAGE_LABEL[r.stage], on: r.day };
      break;
    }
    const to = next ? next.day : today && /^\d{4}-\d{2}-\d{2}$/.test(today) && today >= r.day ? today : null;
    if (!to) continue;
    spans.push({ stage: r.stage, label: STAGE_LABEL[r.stage], from: r.day, to, days: daysBetween(r.day, to), current: !next });
  }
  return { spans, end };
}

/** "12 days", "1 day", "under a day"; the stage it is in "so far". */
export function spanDaysWords(s: Pick<StageSpan, "days" | "current">): string {
  const n = s.days === 0 ? "under a day" : `${s.days} ${s.days === 1 ? "day" : "days"}`;
  return s.current ? `${n} so far` : n;
}
