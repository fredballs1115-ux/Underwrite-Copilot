// How many of the stress test's rows can be scored today, and by what (the
// review of 2026-10-28: "whether it was right is scored as evidence
// arrives" overclaimed, since most rows have nothing yet that can score
// them). Read off lib/track-record's `scorableGrid` — the scorer itself run
// against each kind of later evidence — so no count here is typed by hand.
// The homepage, /how-we-test and the FAQ say the same counts. Pure.

import { scorableGrid, type LaterSource, type ScorableRow } from "@/lib/track-record";
import { STRESS_METHODS } from "@/lib/stress-test-types";

/** The kinds of later evidence that score a row as a figure; a decision
 *  answers one as a direction, counted apart and in no share. */
const FIGURE_SOURCES = ["t12", "rent_roll", "trade"] as const satisfies readonly LaterSource[];

const SOURCE_WORD: Record<(typeof FIGURE_SOURCES)[number], string> = {
  t12: "a T-12",
  rent_roll: "a rent roll",
  // A Closed deal's own purchase price is a decision, never a trade that
  // scores the price row (lib/track-record): a trade scores it on a Dead deal.
  trade: "a reported trade on a Dead deal",
};

export interface ScorableSummary {
  /** the assumptions the test reads, the challenger's own rows left out */
  total: number;
  /** rows a later figure can score */
  byFigure: ScorableRow[];
  /** rows only a decision answers */
  byDecisionOnly: ScorableRow[];
  /** rows nothing on the deal can score yet */
  none: ScorableRow[];
}

const figureSources = (r: ScorableRow) => FIGURE_SOURCES.filter((s) => r.by[s]);

/** What can score the vacancy row in each of its cases, read off the scorer
 *  itself (`scorableGrid` on the deal conditions that change it): one counted
 *  by doors and one in dollars, each for a figure the documents may score
 *  and for a stabilized figure the market's published figure decided. */
function vacancyCases(): { doors: string[]; dollars: string[]; doorsHeld: string[]; dollarsHeld: string[] } {
  const by = (ctx: Parameters<typeof scorableGrid>[0]) => {
    const r = scorableGrid(ctx).find((x) => x.key === "vacancy");
    return r ? figureSources(r).map((s) => SOURCE_WORD[s]) : [];
  };
  return {
    doors: by({ vacancyEconomic: false }),
    dollars: by({ vacancyEconomic: true }),
    doorsHeld: by({ vacancyHeldToMarket: true, vacancyEconomic: false }),
    dollarsHeld: by({ vacancyHeldToMarket: true, vacancyEconomic: true }),
  };
}

const orWords = (words: string[]) => (words.length > 0 ? words.join(" or ") : "no document");
const sameWords = (a: string[], b: string[]) => a.join("|") === b.join("|");

const later = (words: string[]) => (words.length > 0 ? `a later ${words.map((w) => w.replace(/^an? /, "")).join(" or ")}` : "no document");

/** "A vacancy counted by doors is scored by a later rent roll and one in
 *  dollars by a later T-12, but a stabilized vacancy in doors the market's
 *  figure decided by no document." — the vacancy's cases as the scorer
 *  scores them (`vacancyCases`), said beside the count line, which names
 *  the row as scored by the document of its own measure. */
export function scorableVacancyLine(): string {
  const c = vacancyCases();
  const lead = `A vacancy counted by doors is scored by ${later(c.doors)} and one in dollars by ${later(c.dollars)}`;
  const held = [
    sameWords(c.doorsHeld, c.doors) ? "" : `a stabilized vacancy in doors the market's figure decided by ${later(c.doorsHeld)}`,
    sameWords(c.dollarsHeld, c.dollars) ? "" : `a stabilized one in dollars the market's figure held by ${later(c.dollarsHeld)}`,
  ].filter(Boolean);
  return `${lead}${held.length > 0 ? `, but ${held.join(", and ")}` : ""}.`;
}

export function scorableSummary(rows: readonly ScorableRow[] = scorableGrid()): ScorableSummary {
  const tested = rows.filter((r) => r.key !== "other");
  return {
    total: tested.length,
    byFigure: tested.filter((r) => figureSources(r).length > 0),
    byDecisionOnly: tested.filter((r) => figureSources(r).length === 0 && r.by.outcome),
    none: tested.filter((r) => figureSources(r).length === 0 && !r.by.outcome),
  };
}

/** "the price", "the NOI", "the stabilized vacancy": a row by the
 *  methodology's own title (lib/stress-test-types `STRESS_METHODS`),
 *  mid-sentence, an acronym keeping its capitals. */
const titleOf = (r: ScorableRow) => STRESS_METHODS.find((m) => m.key === r.key)?.title ?? r.title;
const titleIn = (r: ScorableRow) => {
  const t = titleOf(r).replace(/^The /, "");
  return `the ${/^[A-Z]{2,}/.test(t) ? t : `${t[0].toLowerCase()}${t.slice(1)}`}`;
};

const joinAnd = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** What can score a row, as the overview table's cell says it. */
export function scoredByWords(row: ScorableRow | undefined): string {
  if (!row || row.key === "other") return "Not scored: no figure";
  // The vacancy is scored by the document of its own measure, and not by
  // either where the market's doors decided it (`vacancyCases`).
  if (row.key === "vacancy" && figureSources(row).length > 0) {
    const c = vacancyCases();
    const doors = orWords(c.doors);
    return `${doors[0].toUpperCase()}${doors.slice(1)} (doors) or ${orWords(c.dollars)} (dollars) dated after the verdict${c.doorsHeld.length === 0 ? "; none for a stabilized vacancy in doors the market decided" : ""}`;
  }
  const words = figureSources(row).map((s) => SOURCE_WORD[s]);
  if (words.length > 0) return `${words.join(" or ")[0].toUpperCase()}${words.join(" or ").slice(1)} dated after the verdict${row.by.outcome ? "; a decision, counted apart" : ""}`;
  return row.by.outcome ? "Only a decision, counted apart" : "Nothing yet";
}

/** "Today 4 of the 12 assumptions the test reads can be scored by a later
 *  figure: the price by a reported trade on a Dead deal; the NOI and the
 *  operating expenses by a T-12; the vacancy by the document of its own
 *  measure." Its cases are said in `scorableVacancyLine`, never as the two
 *  documents the account's grid marks between them. */
export function scorableCountLine(s: ScorableSummary = scorableSummary()): string {
  const groups = new Map<string, string[]>();
  for (const r of s.byFigure) {
    // The vacancy's documents turn on its measure and on whether the
    // market decided it: said whole in `scorableVacancyLine`.
    if (r.key === "vacancy") {
      groups.set("the vacancy by the document of its own measure", []);
      continue;
    }
    const by = figureSources(r)
      .map((x) => SOURCE_WORD[x])
      .join(" or ");
    groups.set(by, [...(groups.get(by) ?? []), titleIn(r)]);
  }
  const parts = [...groups].map(([by, titles]) => (titles.length === 0 ? by : `${joinAnd(titles)} by ${by}`));
  return `Today ${s.byFigure.length} of the ${s.total} assumptions the test reads can be scored by a later figure: ${parts.join("; ")}.`;
}

/** "The debt is answered only by your decision; the other 7 have nothing
 *  yet that can score them." */
export function scorableRestLine(s: ScorableSummary = scorableSummary()): string {
  const decision = s.byDecisionOnly.map(titleIn);
  const lead = decision.length > 0 ? `${joinAnd(decision).replace(/^t/, "T")} ${decision.length === 1 ? "is" : "are"} answered only by your decision; the` : "The";
  return `${lead} other ${s.none.length} have nothing yet that can score them.`;
}
