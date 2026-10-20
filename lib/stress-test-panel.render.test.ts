// Render smoke tests for the stress test's panel (app/stress-test-panel): a
// static server render on hand-built rows, so the markup is held to the
// contract — most severe first, the OM's figure a dark tick, each piece of
// evidence typed, dated and attributed, the impact a before-and-after pair
// (one figure where the model already runs at the evidence's), the
// challenge folded, the method linked, the unchecked rows one folded group
// at the end — and its markers to the panel.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { StressTestPanel, sortStressRows, stressReadLine, testedByHint, uncheckedLine, uncheckedName } from "@/app/stress-test-panel";
import { HEADLINE_NOI_LEFT_OUT, STRESS_KEYS, STRESS_METHODS, type StressHeadline, type StressRow, type StressTest } from "./stress-test-types";
import { HEADLINE_WITHHELD, HOLDS_NO_RERUN } from "./stress-test-words";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;
const render = (test: StressTest | null) => renderToStaticMarkup(h(StressTestPanel, { test }));

// ── Fixtures ──────────────────────────────────────────────────────────────

/** An unsupported row with an impact: the OM's 6% vacancy against the
 *  deal's T-12 (a document) and the survey's metro figure with its margin
 *  (a published figure, the whisker), then the class's rule of thumb. */
const VACANCY: StressRow = {
  key: "vacancy",
  title: "Stabilized vacancy",
  omSays: { text: "Occupancy: 94% as stated, which leaves 6.0% vacancy", value: 6, page: 8 },
  evidence: [
    {
      kind: "document",
      label: "The deal's T-12: vacancy loss over scheduled rent",
      text: "9.1% ($400k of $4.4M, TTM to 2026-06-30)",
      value: 9.1,
      asOf: "2026-06-30",
      publisher: "the deal's T-12",
      scope: "deal",
    },
    {
      kind: "published",
      label: "Rental vacancy, metro area",
      text: "6.2% ±2.2 pts (Q2 2026)",
      value: 6.2,
      asOf: "2026-04-01",
      publisher: "Census Bureau",
      scope: "metro",
      href: "https://www.census.gov/housing/hvs/",
    },
    {
      kind: "rule_of_thumb",
      label: "Multifamily vacancy, a rule of thumb",
      text: "5.0% — the class's screening default, a rule of thumb, not this market's figure",
      value: 5,
      asOf: null,
      publisher: "a rule of thumb",
      scope: "class",
    },
  ],
  gap: { value: 3.1, unit: "pts", text: "The OM's 6.0% is 3.1 points under the evidence's 9.1%." },
  verdict: "unsupported",
  impact: {
    input: "vacancyPct",
    evidenceIndex: 0,
    omValue: 0.06,
    altValue: 0.091,
    baseIrrPct: 9.31,
    altIrrPct: 7.14,
    baseMultiple: 1.53,
    altMultiple: 1.41,
    note: "If vacancy is the deal's T-12's 9.1%, not the OM's 6.0%, the levered IRR moves from 9.3% to 7.1% (1.53x to 1.41x equity multiple).",
  },
  challenge: {
    severity: "high",
    challenge: "In-place vacancy runs 9%; the 6% stabilized figure assumes a lease-up that isn't underwritten.",
    question: "What was occupancy each month of the trailing twelve?",
  },
  method: "The OM's stabilized vacancy against the deal's T-12: vacancy loss over scheduled rent (the deal's T-12), then rental vacancy, metro area (Census Bureau) and multifamily vacancy, a rule of thumb (a rule of thumb).",
};

/** A stretched row: the exit against the going-in cap, the OM against itself. */
const EXIT: StressRow = {
  key: "exit_cap",
  title: "Exit cap",
  omSays: { text: "Exit cap rate: 5.50%", value: 5.5, page: 21 },
  evidence: [
    {
      kind: "om_internal",
      label: "The OM's going-in cap",
      text: "5.71% (Going-in cap rate): an exit tighter than it is cap compression",
      value: 5.71,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
    },
  ],
  gap: { value: 21, unit: "bps", text: "The OM's 5.50% exit is 21 bps tighter than its 5.71% going-in cap — cap compression." },
  verdict: "stretched",
  impact: {
    input: "exitCapPct",
    evidenceIndex: 0,
    omValue: 0.055,
    altValue: 0.0571,
    baseIrrPct: 9.31,
    altIrrPct: 8.62,
    baseMultiple: 1.53,
    altMultiple: 1.49,
    note: "If the exit cap is the going-in cap's 5.71%, not the OM's 5.50%, the levered IRR moves from 9.3% to 8.6% (1.53x to 1.49x equity multiple).",
  },
  challenge: null,
  method: "The OM's exit cap against the OM's going-in cap (the offering memorandum).",
};

/** A row that holds: the tax bill at the one its own figures imply. */
const TAXES: StressRow = {
  key: "taxes",
  title: "Real estate taxes",
  omSays: { text: "Real estate taxes: $532,000", value: 532_000, page: 15 },
  evidence: [
    {
      kind: "om_internal",
      label: "The bill the OM's own figures imply on the price",
      text: "$532k over $42M assessed is 1.27%, which on the $42M price is $532k a year if the sale resets the assessment to the price",
      value: 532_000,
      asOf: null,
      publisher: "the memorandum's own figures",
      scope: "deal",
    },
  ],
  gap: { value: 0, unit: "usd", text: "The OM's $532k is at the $532k its own figures imply." },
  verdict: "holds",
  impact: null,
  challenge: null,
  method: "The OM's real estate taxes against the bill the OM's own figures imply on the price (the memorandum's own figures).",
};

/** An unchecked row: a growth rate with nothing fresh to read it against. */
const GROWTH: StressRow = {
  key: "rent_growth",
  title: "Rent growth",
  omSays: { text: "Rent growth: 4.0%/yr", value: 4, page: 40 },
  evidence: [],
  gap: null,
  verdict: "unchecked",
  impact: null,
  challenge: null,
  method: "The OM's rent growth: no evidence with a figure or words could be read for this deal, so it stands unchecked.",
  unchecked: "No evidence with a figure could be read for this deal.",
};

/** The challenger's own row, no reader behind it. */
const OTHER: StressRow = {
  key: "other",
  title: "The broker's narrative on the submarket",
  omSays: { text: "The broker's narrative on the submarket", value: null, page: null },
  evidence: [],
  gap: null,
  verdict: "unchecked",
  impact: null,
  challenge: { severity: "low", challenge: "Nothing numerate.", question: "Which comps?" },
  method: "The challenger's own critique; no reader tests it and no figure is swapped.",
  unchecked: "No reader tests this assumption; the challenger's words stand alone.",
};

// Out of severity order on purpose: the panel sorts.
const TEST: StressTest = { rows: [GROWTH, TAXES, EXIT, VACANCY, OTHER], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null };

const WITHHELD: StressTest = {
  rows: [{ ...VACANCY, impact: null }, { ...EXIT, impact: null }, GROWTH],
  readOn: "2026-09-21",
  publishedRead: true,
  impactsWithheld: "No return is re-run: the model runs on the $10,000,000 placeholder price, which no memorandum stated — enter the price.",
};

/** Every app/ and lib/ source, for the marker scan. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === "node_modules" || f.startsWith(".")) continue;
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("StressTestPanel — the OM's assumptions, tested", () => {
  const html = render(TEST);
  const text = visibleText(html).replace(/&#x27;/g, "'").replace(/\s+/g, " ");

  it("reads clean", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(render(null)).toBe("");
    expect(render({ rows: [], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null })).toBe("");
  });

  it("heads with the count and leads most severe first: unsupported, stretched, holds, unchecked", () => {
    expect(html).toContain('<h2 class="text-[11px] font-semibold uppercase tracking-wider text-kill">The OM&#x27;s assumptions, tested</h2>');
    expect(text).toContain("5 assumptions: 1 unsupported, 1 stretched, 1 holds; 2 could not be checked");
    expect(stressReadLine([TAXES, TAXES])).toBe("2 assumptions: 2 hold");
    expect(stressReadLine([GROWTH])).toBe("1 assumption: none could be checked");
    expect(sortStressRows(TEST.rows).map((r) => r.key)).toEqual(["vacancy", "exit_cap", "taxes", "rent_growth", "other"]);
    const verdicts = [...html.matchAll(/data-verdict="([a-z]+)"/g)].map((m) => m[1]);
    expect(verdicts).toEqual(["unsupported", "stretched", "holds", "unchecked", "unchecked"]);
    // Every row is named for its key, so a test can find it.
    for (const k of ["vacancy", "exit_cap", "taxes", "rent_growth", "other"]) expect(html).toContain(`data-qa="stress-row-${k}"`);
    // The tested rows are the list; the unchecked ones come after it, as one group.
    expect(html.indexOf('data-qa="stress-unchecked-group"')).toBeGreaterThan(html.indexOf('data-qa="stress-row-taxes"'));
    expect(html.slice(html.indexOf('data-qa="stress-rows"'), html.indexOf('data-qa="stress-unchecked-group"'))).not.toContain('data-verdict="unchecked"');
  });

  it("collapses the unchecked rows into one folded group at the end: a line naming them, then 'Read why', each row two lines", () => {
    const group = html.slice(html.indexOf('data-qa="stress-unchecked-group"'), html.indexOf('data-qa="stress-key"'));
    const g = visibleText(group).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    // The read line at the top is unchanged: it still counts the unchecked.
    expect(text).toContain("5 assumptions: 1 unsupported, 1 stretched, 1 holds; 2 could not be checked");
    expect(g).toContain("2 could not be checked: rent growth, the broker's narrative on the submarket");
    expect(uncheckedLine([GROWTH])).toBe("1 could not be checked: rent growth");
    // The fold is PanelFold's own shape: the control a thumb's height on a
    // touch screen, the whole body in the HTML.
    expect(group).toMatch(/<details class="group mt-1"><summary class="[^"]*\bpointer-coarse:py-2\.5\b[^"]*">/);
    expect(g).toContain("Read why (2)");
    expect(group.indexOf("<details")).toBeLessThan(group.indexOf('data-qa="stress-row-rent_growth"'));
    // Each unchecked row is inside the fold, named for its key, two lines:
    // the title with the OM's figure and its page, then why.
    const growth = group.slice(group.indexOf('data-qa="stress-row-rent_growth"'), group.indexOf('data-qa="stress-row-other"'));
    const t = visibleText(growth).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(growth).toContain('data-verdict="unchecked"');
    expect(t).toContain("Rent growth Rent growth: 4.0%/yr OM p. 40 No evidence with a figure could be read for this deal.");
    expect(growth).not.toContain('data-qa="stress-track"');
    expect(growth).not.toContain('data-qa="stress-gap"');
    expect(growth).not.toContain('data-qa="stress-impact"');
    expect(growth).not.toContain('data-qa="stress-no-impact"');
    expect(growth).not.toContain('data-qa="stress-challenge"');
    expect(growth).toContain('href="/how-we-test#rent_growth"');
    expect(t).toContain(`How this was tested: ${GROWTH.method} The method`);
    // The challenger's own row: no page chip (it states no figure), its
    // title said once, its words folded under it.
    const other = group.slice(group.indexOf('data-qa="stress-row-other"'));
    const o = visibleText(other).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(o).toContain("The broker's narrative on the submarket No reader tests this assumption; the challenger's words stand alone.");
    expect(o.match(/The broker's narrative on the submarket/g)).toHaveLength(1);
    expect(other).not.toContain('data-qa="stress-page"');
    expect(o).toContain("The challenge · Low severity");
    expect(other).toContain("<details");
    expect(o).toContain("Nothing numerate. Ask the broker: Which comps?");
    expect(other).toContain('href="/how-we-test#other"');
    // Nothing unchecked, no group; nothing tested, no list.
    expect(render({ rows: [EXIT], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null })).not.toContain('data-qa="stress-unchecked-group"');
    const only = render({ rows: [GROWTH], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    expect(only).not.toContain('data-qa="stress-rows"');
    expect(only).toContain('data-qa="stress-row-rent_growth"');
    expect(a11yIssues(only)).toEqual([]);
  });

  it("says what would test an unchecked row only where the document named is one the test reads", () => {
    const noi: StressRow = { ...GROWTH, key: "noi", title: "NOI", omSays: { text: "NOI (pro forma): $3,880,000", value: 3_880_000, page: 8 }, unchecked: "No T-12 is on file, and the OM states no second NOI to hold its figure to." };
    expect(testedByHint(noi)).toBe("Add the T-12 to test this.");
    // The T-12's premium is the seller's history: it tests no new owner's
    // quote, so no sentence promises it does.
    expect(testedByHint({ ...noi, key: "insurance" })).toBeNull();
    expect(testedByHint({ ...noi, key: "vacancy" })).toBe("Add the rent roll or the T-12 to test this.");
    // A figure the OM does not state, a market figure, a tested row: none.
    expect(testedByHint({ ...noi, omSays: { ...noi.omSays, value: null } })).toBeNull();
    expect(testedByHint(GROWTH)).toBeNull();
    expect(testedByHint(VACANCY)).toBeNull();
    const s = render({ rows: [noi], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    expect(visibleText(s)).toContain("Add the T-12 to test this.");
    expect(s.match(/data-qa="stress-tested-by"/g)).toHaveLength(1);
  });

  it("names an unchecked row mid-sentence: the key's own name, or the challenger's title read as one", () => {
    expect(uncheckedName(GROWTH)).toBe("rent growth");
    expect(uncheckedName({ ...GROWTH, key: "debt" })).toBe("debt");
    expect(uncheckedName({ ...GROWTH, key: "taxes" })).toBe("real estate taxes");
    expect(uncheckedName({ ...GROWTH, key: "noi" })).toBe("the NOI");
    expect(uncheckedName({ ...GROWTH, key: "renovation_premium" })).toBe("the renovation premium");
    expect(uncheckedName(OTHER)).toBe("the broker's narrative on the submarket");
    // The sample's own: the challenger's "$200/mo renovation premium".
    expect(uncheckedName({ ...OTHER, title: "$200/mo renovation premium" })).toBe("the renovation premium");
    expect(uncheckedName({ ...OTHER, title: "A 4% management fee" })).toBe("a 4% management fee");
    expect(uncheckedName({ ...OTHER, title: "RUBS income" })).toBe("the RUBS income");
  });

  it("draws the pair as one figure where the OM's figure is the evidence's, read off the values, not the note", () => {
    // lib/stress-test's own note for one run opens on the OM's figure, so a
    // test of the note's words never matched it and printed "9.3% → 9.3%".
    const same: StressRow = {
      ...VACANCY,
      impact: {
        ...VACANCY.impact!,
        altValue: 0.06,
        altIrrPct: 9.31,
        altMultiple: 1.53,
        note: "The OM's vacancy, 6.0%, is the deal's T-12's 6.0%, so the levered IRR of 9.3% stands on it.",
      },
    };
    const s = render({ rows: [same], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    const t = visibleText(s).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(s.match(/data-qa="stress-impact-pair">([^<]*)</)?.[1]).toBe("Levered IRR 9.3%, run at the evidence&#x27;s figure");
    expect(t).not.toContain("→");
    expect(s).toContain('data-qa="stress-impact"');
    // One run, one bar: no second bar for the same figure.
    expect(s).not.toContain('data-bar="stress-impact-om"');
    expect(t).not.toContain("At the OM's figure");
    expect(t).toContain(same.impact!.note);
    expect(gluedWords(visibleText(s))).toEqual([]);
    // Two figures are a move, whatever the note's words.
    const moved = render({ rows: [{ ...VACANCY, impact: { ...VACANCY.impact!, note: same.impact!.note } }], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    expect(moved.match(/data-qa="stress-impact-pair">([^<]*)</)?.[1]).toBe("Levered IRR 9.3% → 7.1%");
  });

  it("an unsupported row: the OM's figure with its page, the track, the gap, the impact pair and the folded challenge", () => {
    const row = html.slice(html.indexOf('data-qa="stress-row-vacancy"'), html.indexOf('data-qa="stress-row-exit_cap"'));
    const t = visibleText(row).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(t).toContain("Unsupported Stabilized vacancy OM p. 8 Occupancy: 94% as stated, which leaves 6.0% vacancy");
    // The track: the OM's figure as a dark tick (the panels' own Tick, past
    // the track by a primary tick's 4px), the document's dot and the
    // published figure's diamond, the rule of thumb a dashed tick.
    expect(row).toContain('<div class="mt-3 text-[11px] leading-4" data-qa="stress-track">');
    expect(row).toMatch(/class="absolute -inset-y-1 -translate-x-1\/2 w-0\.5 rounded-full bg-ink" data-bar="stress-om" style="left:[\d.]+%"/);
    expect(row.match(/data-bar="stress-evidence" data-kind="document"/g)).toHaveLength(1);
    expect(row.match(/data-bar="stress-evidence" data-kind="published"/g)).toHaveLength(1);
    expect(row).toMatch(/rotate-45 rounded-\[1px\] bg-pass" data-bar="stress-evidence" data-kind="published"/);
    expect(row).toMatch(/border-l-2 border-dashed border-ink\/50" data-bar="stress-evidence"/);
    // The survey's margin as a whisker, read off its own text ("±2.2 pts").
    expect(row.match(/data-qa="stress-whisker"/g)).toHaveLength(1);
    expect(row).toMatch(/data-qa="stress-whisker" style="left:[\d.]+%;width:[\d.]+%"/);
    // The ticks are labelled where they are drawn: the OM's figure over the
    // track at its own tick, the evidence's span under it, from its lowest
    // figure to its highest, under a bracket over the same span.
    expect(t).toContain("The OM against the evidence OM 6.0% Evidence 5.0%–9.1%");
    const omAt = row.match(/data-bar="stress-om" style="left:([\d.]+)%"/)![1];
    expect(row).toContain(`data-qa="stress-om-label" style="left:${omAt}%"`);
    expect(row.match(/data-qa="stress-span"/g)).toHaveLength(1);
    // Each line of the list leads with its kind's glyph, the track's own.
    expect(row.match(/<li class="flex gap-2" data-evidence="[a-z_]+"><span class="flex h-4 w-2\.5 shrink-0 items-center justify-center"><span aria-hidden="true"/g)).toHaveLength(3);
    // Each piece of evidence: its kind, its publisher, its date, whose figure it is.
    expect(t).toContain("The deal's own document The deal's T-12: vacancy loss over scheduled rent: 9.1% ($400k of $4.4M, TTM to 2026-06-30) — the deal's T-12, Jun 30, 2026 · the deal's own figure");
    expect(t).toContain("A published figure Rental vacancy, metro area: 6.2% ±2.2 pts (Q2 2026) — Census Bureau, Apr 1, 2026 · the metro's figure, not the building's Source");
    expect(row).toContain('href="https://www.census.gov/housing/hvs/"');
    expect(t).toContain("A rule of thumb Multifamily vacancy, a rule of thumb: 5.0% — the class's screening default, a rule of thumb, not this market's figure — a rule of thumb · the class's, not this market's");
    // The gap in words, then the impact: the pair, the two runs as bars on
    // one scale (the OM's figure's, then the evidence's), and the sentence.
    expect(t).toContain("The OM's 6.0% is 3.1 points under the evidence's 9.1%.");
    expect(t).toContain("Levered IRR 9.3% → 7.1%");
    expect(row).toMatch(/data-bar="stress-impact" style="width:[\d.]+%"/);
    expect(row).toMatch(/data-bar="stress-impact-om" style="width:[\d.]+%"/);
    expect(t).toContain("At the OM's figure 9.3% At the evidence's figure 7.1%");
    // A fall is the warning tone; a re-run the evidence lifts never is.
    expect(row).toContain('class="h-full rounded-full bg-caution/70" data-direction="down" data-bar="stress-impact"');
    const up: StressRow = { ...VACANCY, verdict: "stretched", impact: { ...VACANCY.impact!, altValue: 0.058, altIrrPct: 9.6 } };
    const upRow = render({ rows: [up], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    expect(upRow).toContain('class="h-full rounded-full bg-pass/70" data-direction="up" data-bar="stress-impact"');
    expect(upRow).not.toContain("bg-caution/70");
    // A row that holds draws no re-run: its evidence side is the favourable
    // one (an office rent growth holding at +7.2% re-ran to 24.7%), so it
    // says so in one line, with no pair, no bars and no note.
    const held = render({ rows: [{ ...up, verdict: "holds" }], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    expect(visibleText(held).replace(/&#x27;/g, "'")).toContain(HOLDS_NO_RERUN);
    expect(HOLDS_NO_RERUN).toBe("The OM's figure is within the evidence; no re-run.");
    expect(held).not.toContain('data-qa="stress-impact"');
    expect(held).not.toContain('data-bar="stress-impact"');
    expect(held).not.toContain("data-bar=\"stress-impact-model\"");
    expect(visibleText(held).replace(/&#x27;/g, "'")).not.toContain(VACANCY.impact!.note);
    expect(t).toContain(VACANCY.impact!.note);
    // The challenger's words, folded whole under the row.
    expect(t).toContain("The challenge · High severity");
    expect(row).toContain("<details");
    expect(t).toContain(VACANCY.challenge!.challenge);
    expect(t).toContain(`Ask the broker: ${VACANCY.challenge!.question}`);
    // How it was tested, linking to the method's own section.
    expect(t).toContain(`How this was tested: ${VACANCY.method} The method`);
    expect(row).toContain('href="/how-we-test#vacancy"');
  });

  it("a stretched row against the OM's own figure draws a hollow dot; a holding row with no impact says no return was struck", () => {
    const exit = html.slice(html.indexOf('data-qa="stress-row-exit_cap"'), html.indexOf('data-qa="stress-row-taxes"'));
    expect(exit).toContain('data-bar="stress-evidence" data-kind="om_internal"');
    expect(exit).toMatch(/border-2 border-caution bg-surface" data-bar="stress-evidence"/);
    expect(visibleText(exit)).toContain("Stretched");
    expect(visibleText(exit)).toContain("Levered IRR 9.3% → 8.6%");
    const taxes = html.slice(html.indexOf('data-qa="stress-row-taxes"'), html.indexOf('data-qa="stress-unchecked-group"'));
    const t = visibleText(taxes).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(t).toContain("Holds Real estate taxes OM p. 15");
    // One figure of evidence: its label and no bracket.
    expect(t).toContain("The OM against the evidence OM $532k Evidence $532k");
    expect(taxes).not.toContain('data-qa="stress-span"');
    expect(t).toContain(HOLDS_NO_RERUN);
    expect(taxes).not.toContain('data-qa="stress-impact"');
  });

  it("draws a basis piece judged on its own yardstick in the list, never on the track shared with the OM's per-unit figure", () => {
    const basis: StressRow = {
      key: "basis",
      title: "Basis",
      omSays: { text: "$275k/unit, $300/SF (Asking price $42,000,000 over 153 units and over 140,000 SF)", value: 274_510, page: 5 },
      evidence: [
        { kind: "om_internal", label: "The memorandum's sale comps", text: "3 of 6 state a figure /unit — median $270k/unit over the 3", value: 270_000, asOf: null, publisher: "the offering memorandum", scope: "deal" },
        {
          kind: "om_internal",
          label: "The memorandum's sale comps stating a price per SF alone",
          text: "3 of 6 state a figure /SF alone, so they are judged per SF — median $250/SF over the 3",
          value: 250,
          asOf: null,
          publisher: "the offering memorandum",
          scope: "deal",
          ownYardstick: { om: 300, per: "/SF" },
        },
      ],
      gap: { value: 1.7, unit: "pct", text: "The ask's $275k/unit is 1.7% over the median of the memorandum's sale comps, $270k/unit." },
      verdict: "holds",
      impact: null,
      challenge: null,
      method: "The OM's basis against the memorandum's sale comps, then the memorandum's sale comps stating a price per SF alone.",
    };
    const out = render({ rows: [basis], readOn: "2026-09-21", publishedRead: false, impactsWithheld: null });
    // One evidence mark on the track — the per-unit median — and both pieces listed.
    expect(out.match(/data-bar="stress-evidence"/g)).toHaveLength(1);
    expect(visibleText(out)).toContain("median $250/SF over the 3");
  });

  it("draws a row held to a rule of thumb alone muted, never a green Holds, its word kept", () => {
    const thumb: StressRow = { ...TAXES, ruleOfThumbOnly: true };
    const s = render({ rows: [thumb], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null });
    expect(s).toMatch(/class="rounded-full px-2 py-0\.5 text-\[10px\] font-semibold uppercase tracking-wide bg-faint text-muted">Holds</);
    expect(s).not.toContain("bg-pass/10 text-pass\">Holds");
    // Held to evidence, it stays green.
    expect(render({ rows: [TAXES], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null })).toContain("bg-pass/10 text-pass\">Holds");
  });

  it("keys the marks it draws, and dates the published figures' read", () => {
    const key = html.slice(html.indexOf('data-qa="stress-key"'));
    const t = visibleText(key).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(t).toContain("The OM's figure");
    expect(t).toContain("The deal's own document");
    expect(t).toContain("A published figure");
    expect(t).toContain("A rule of thumb");
    expect(t).toContain("The OM against itself");
    expect(t).toContain("Published figures read Sep 21, 2026");
    // A test with no published figure dates nothing.
    expect(visibleText(render({ rows: [EXIT], readOn: "2026-09-21", publishedRead: true, impactsWithheld: null }))).not.toContain("Published figures read");
    // Published figures from the stored market check alone are the
    // screen's, never dated as read today.
    const stored = visibleText(render({ ...TEST, publishedRead: false })).replace(/&#x27;/g, "'");
    expect(stored).toContain("Published figures as of the screen's market check");
    expect(stored).not.toContain("Published figures read");
  });

  it("says once at the top why no return is struck where the model's reads are withheld, and each row points up", () => {
    const w = render(WITHHELD);
    const t = visibleText(w).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(a11yIssues(w)).toEqual([]);
    expect(gluedWords(visibleText(w))).toEqual([]);
    expect(t.match(/No return is re-run: the model runs on the \$10,000,000 placeholder price/g)).toHaveLength(1);
    expect(t).not.toContain("No return struck: No return");
    // The two tested rows point up; the unchecked row's reason is its own.
    expect(w.match(/data-qa="stress-no-impact"/g)).toHaveLength(2);
    expect(t).toContain("No return is re-run (see the note above).");
    expect(w).not.toContain('data-bar="stress-impact"');
    // The track still draws: the evidence stands whether or not the engine runs.
    expect(w).toContain('data-bar="stress-om"');
  });

  it("leads with the headline: the OM's case against the evidence's in one line, then the bridge between them", () => {
    const headline: StressHeadline = {
      omIrrPct: 16.71,
      evidenceIrrPct: 12.34,
      omMultiple: 2.1,
      evidenceMultiple: 1.76,
      omKeys: ["exit_cap", "noi", "vacancy", "taxes"],
      parts: [
        { key: "vacancy", label: "Stabilized vacancy", pts: -3.25, multiple: -0.25 },
        { key: "taxes", label: "Real estate taxes", pts: -2.47, multiple: -0.19 },
        { key: "exit_cap", label: "Exit cap", pts: 1.35, multiple: 0.1 },
      ],
      omitted: [{ key: "noi", label: "NOI", why: HEADLINE_NOI_LEFT_OUT }],
      unsolved: 0,
    };
    const hh = render({ ...TEST, headline });
    const t = visibleText(hh).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(a11yIssues(hh)).toEqual([]);
    expect(gluedWords(visibleText(hh))).toEqual([]);
    expect(t).toContain("Levered IRR on the OM's figures 16.7% → 12.3% with the evidence");
    // Above the rows.
    expect(hh.indexOf('data-qa="stress-headline"')).toBeLessThan(hh.indexOf('data-qa="stress-rows"'));
    // A bar for each case, a segment an assumption, each signed and labelled.
    expect(hh.match(/data-bar="stress-headline-part"/g)).toHaveLength(3);
    expect(hh.match(/data-bar="stress-headline-om"/g)).toHaveLength(1);
    expect(hh.match(/data-bar="stress-headline-evidence"/g)).toHaveLength(1);
    // Each part printed so the three add up to the printed 4.4-point gap
    // (16.7% to 12.3%), by largest remainder: the exit cap's 1.35 prints
    // +1.3, never the +1.4 that left the printed parts summing to 4.3.
    for (const s of ["−3.2 pts", "−2.5 pts", "+1.3 pts", "16.7%", "12.3%", "On the OM's figures", "With the evidence"]) expect(t).toContain(s);
    expect(t).not.toContain("+1.4 pts");
    // The walk ends where the evidence's case does: the last segment's far
    // end and the evidence's bar's end are one x.
    const style = (re: RegExp) => {
      const m = [...hh.matchAll(re)].pop()!;
      return { left: parseFloat(m[1]), width: parseFloat(m[2]) };
    };
    const last = style(/data-bar="stress-headline-part" data-key="exit_cap" style="left:([\d.]+)%;width:([\d.]+)%"/g);
    const ev = style(/data-bar="stress-headline-evidence" style="left:([\d.]+)%;width:([\d.]+)%"/g);
    expect(Math.abs(last.left + last.width - (ev.left + ev.width))).toBeLessThan(0.02);
    // What is left out is named, its reason folded, and the method linked.
    expect(t).toContain("Left out: the NOI.");
    expect(t).toContain(`NOI: ${HEADLINE_NOI_LEFT_OUT}.`);
    expect(hh).toContain('href="/how-we-test#headline"');
    // What the component swaps leave of the NOI's gap is said in the note,
    // after what is left out; a headline that carries none says nothing.
    expect(t).not.toContain("in neither case");
    const rest = visibleText(render({ ...TEST, headline: { ...headline, noiRest: { usd: 54_000, components: ["vacancy", "taxes"] } } })).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(rest).toContain("Left out: the NOI. The rest of the NOI's gap ($54k a year) is in neither case. How the headline is struck");
    // What the headline does not test, under its line, in words.
    expect(hh).not.toContain('data-qa="stress-headline-untested"');
    const un = render({ ...TEST, headline: { ...headline, untested: { keys: ["basis", "noi"], roll: { sharePct: 57, basis: "rent", through: "Oct 2028" } } } });
    expect(un.indexOf('data-qa="stress-headline-untested"')).toBeGreaterThan(un.indexOf('data-qa="stress-headline-line"'));
    expect(visibleText(un).replace(/&#x27;/g, "'")).toContain("This headline does not test the price, the NOI or the 57% of the listed rent rolling in the year to Oct 2028.");
    // With the re-runs withheld there is no headline, and the note says so.
    const w = visibleText(render({ ...WITHHELD, headline: null })).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(w).toContain(HEADLINE_WITHHELD.replace(/&#x27;/g, "'"));
    expect(render({ ...WITHHELD, headline: null })).not.toContain('data-qa="stress-headline"');
    // A test built before the headline draws none and says nothing of it.
    expect(html).not.toContain('data-qa="stress-headline"');
  });

  it("draws the model as it runs as a third mark, says why the evidence's case is not it, and names each re-run's base (the investor's walkthrough)", () => {
    const headline: StressHeadline = {
      omIrrPct: 16.67,
      evidenceIrrPct: 11.53,
      omMultiple: 2.1,
      evidenceMultiple: 1.7,
      omKeys: ["exit_cap", "noi", "vacancy", "rent_growth", "taxes"],
      parts: [
        { key: "taxes", label: "Real estate taxes", pts: -3.71, multiple: -0.28 },
        { key: "exit_cap", label: "Exit cap", pts: -1.43, multiple: -0.12 },
      ],
      omitted: [{ key: "noi", label: "NOI", why: HEADLINE_NOI_LEFT_OUT }],
      unsolved: 0,
      modelIrrPct: 9.28,
      keptAtOm: [
        { key: "noi", label: "NOI", why: "left_out", om: 7_330_000, model: 7_470_000, noi: 3_880_000 },
        { key: "vacancy", label: "Stabilized vacancy", why: "holds", om: 6, model: 9.1 },
        { key: "rent_growth", label: "Rent growth", why: "holds", om: 4, model: 3 },
      ],
      atEvidence: [{ key: "taxes", label: "Real estate taxes", evidence: 952_000, model: 728_000 }],
    };
    const hh = render({ ...TEST, headline });
    const t = visibleText(hh).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(a11yIssues(hh)).toEqual([]);
    expect(gluedWords(visibleText(hh))).toEqual([]);
    // The third mark: an outline from zero, its words beside it, after the
    // two filled cases.
    expect(hh.match(/data-bar="stress-headline-model"/g)).toHaveLength(1);
    expect(t).toContain("With the evidence 11.5% The model as it runs 9.3%");
    expect(hh).toMatch(/class="absolute inset-y-0 rounded-full border border-dashed border-ink\/60" data-bar="stress-headline-model" style="left:0\.00%;width:[\d.]+%"/);
    // Why the evidence's case is not the model, under the line.
    expect(t).toContain(
      "Against the model as it runs (9.3%), the evidence's case keeps the OM's figure where a row holds: vacancy 6.0% (the model's 9.1%) and rent growth 4.0%/yr (the model's 3.0%/yr); and where a row is left out: the rent line $7.33M that makes the OM's $3.88M NOI at the OM's vacancy and expenses (the model's rent line $7.47M). It runs the evidence's figure where the model runs another: the taxes $952k (the model's $728k).",
    );
    expect(hh.indexOf('data-qa="stress-headline-kept"')).toBeLessThan(hh.indexOf('data-qa="stress-headline-bridge"'));
    // Each re-run names its base, and the model's dashed tick stands on its
    // bars, the key saying what it is.
    expect(t).toContain("From the model's own 9.3% levered IRR, this input alone set to the OM's figure, then to the evidence's At the OM's figure 9.3% At the evidence's figure 7.1%");
    expect(hh.match(/data-bar="stress-impact-model"/g)!.length).toBeGreaterThanOrEqual(2);
    expect(t).toContain("The model as it runs, 9.3%: each re-run changes one input of it");
    // Nothing past its evidence: the OM's case and the model still drawn.
    const flat = render({ ...TEST, headline: { ...headline, evidenceIrrPct: 16.67, parts: [], omitted: [], keptAtOm: [], atEvidence: [] } });
    expect(flat).toContain('data-qa="stress-headline-cases"');
    expect(flat.match(/data-bar="stress-headline-model"/g)).toHaveLength(1);
    expect(flat).not.toContain('data-qa="stress-headline-kept"');
    // A headline struck before the model was carried draws no third mark.
    const { modelIrrPct: _m, keptAtOm: _k, atEvidence: _e, ...older } = headline;
    void _m;
    void _k;
    void _e;
    const old = render({ ...TEST, headline: older });
    expect(old).not.toContain("stress-headline-model");
    expect(old).not.toContain("stress-impact-model");
    expect(visibleText(old)).toContain("From the model as it runs, this input alone set to the OM");
  });

  it("marks a part struck against a rule of thumb, shows the mixes counted at the floor, and says why an unsolved case is not split (audit M1, M7, M8)", () => {
    const base: StressHeadline = {
      omIrrPct: 13.06,
      evidenceIrrPct: 3.55,
      omMultiple: 1.81,
      evidenceMultiple: 1.19,
      omKeys: ["debt", "vacancy"],
      parts: [
        { key: "vacancy", label: "Stabilized vacancy", pts: -7.6, multiple: -0.5 },
        { key: "debt", label: "Debt", pts: -1.91, multiple: -0.12, ruleOfThumb: true },
      ],
      omitted: [],
      unsolved: 2,
    };
    const hh = render({ ...TEST, headline: base });
    const t = visibleText(hh).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(gluedWords(visibleText(hh))).toEqual([]);
    expect(t).toContain("Debt (against a screening default)");
    expect(hh.match(/data-qa="stress-headline-against"/g)).toHaveLength(1);
    expect(t).toContain("2 mixes of the swaps had no IRR and were counted at the engine's floor in the split.");
    // An evidence's case with no IRR: a clause of its own, and the note says
    // why nothing is split rather than that both runs are at the OM's.
    const none = visibleText(render({ ...TEST, headline: { ...base, evidenceIrrPct: null, evidenceMultiple: null, parts: [], unsolved: 0 } }))
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ");
    expect(none).toContain("Levered IRR on the OM's figures 13.1%; with the evidence it does not solve");
    expect(none).not.toContain("to does not solve");
    expect(none).toContain("One of the two runs has no levered IRR, so the gap is not split.");
    expect(none).not.toContain("at the OM's in both runs");
  });

  it("its markers are its own: no other source draws them, and every key has a section on the methodology page", () => {
    const owned = [...sources(join(process.cwd(), "app")), ...sources(join(process.cwd(), "lib"))].filter((f) => /stress-headline-(?:om|part|evidence|zero)"/.test(readFileSync(f, "utf8")));
    expect(owned.map((f) => f.replace(process.cwd(), ""))).toEqual(["/app/stress-test-panel.tsx"]);
    expect(readFileSync(join(process.cwd(), "app/how-we-test/view.tsx"), "utf8")).toContain('id="headline"');
    const files = [...sources(join(process.cwd(), "app")), ...sources(join(process.cwd(), "lib"))];
    // A marker is written `data-bar="…"` on a fill and `bar="…"` on a Tick
    // (app/panel-parts); both spellings are the marker.
    for (const marker of ["stress-om", "stress-evidence", "stress-impact"]) {
      const where = files.filter((f) => readFileSync(f, "utf8").includes(`bar="${marker}"`)).map((f) => f.replace(process.cwd(), ""));
      expect(where, marker).toEqual(["/app/stress-test-panel.tsx"]);
    }
    expect(files.filter((f) => readFileSync(f, "utf8").includes('data-qa="stress-whisker"')).map((f) => f.replace(process.cwd(), ""))).toEqual(["/app/stress-test-panel.tsx"]);
    // The method link lands on the methodology page's own section for the
    // key (app/how-we-test/view.tsx gives each STRESS_METHODS entry its key
    // as its id).
    expect(STRESS_METHODS.map((m) => m.key).sort()).toEqual([...STRESS_KEYS].sort());
    expect(readFileSync(join(process.cwd(), "app/how-we-test/view.tsx"), "utf8")).toContain("<section id={method.key}");
  });
});
