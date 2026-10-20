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
import { StressTestPanel, sortStressRows, stressReadLine, uncheckedLine, uncheckedName } from "@/app/stress-test-panel";
import { STRESS_KEYS, STRESS_METHODS, type StressRow, type StressTest } from "./stress-test-types";
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
  impactsWithheld: "The model runs on the $10,000,000 placeholder price, which no memorandum stated — enter the price.",
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
    expect(text).toContain("5 assumptions tested: 1 unsupported, 1 stretched, 1 holds, 2 unchecked");
    expect(stressReadLine([TAXES, TAXES])).toBe("2 assumptions tested: 2 hold");
    expect(stressReadLine([GROWTH])).toBe("1 assumption tested: 1 unchecked");
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
    expect(text).toContain("5 assumptions tested: 1 unsupported, 1 stretched, 1 holds, 2 unchecked");
    expect(g).toContain("2 assumptions unchecked: rent growth, the broker's narrative on the submarket");
    expect(uncheckedLine([GROWTH])).toBe("1 assumption unchecked: rent growth");
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
    // The track: the OM's figure as a dark tick, the document's and the
    // published figure's dots, the rule of thumb a dashed tick, drawn with
    // the panels' own parts on a track of the group's length.
    expect(row).toContain('class="@container/bars mt-2 text-[11px]" data-qa="stress-track"');
    expect(row).toMatch(/class="absolute -inset-y-0\.5 -translate-x-1\/2 w-0\.5 rounded-full bg-ink" data-bar="stress-om" style="left:[\d.]+%"/);
    expect(row.match(/data-bar="stress-evidence" data-kind="document"/g)).toHaveLength(1);
    expect(row.match(/data-bar="stress-evidence" data-kind="published"/g)).toHaveLength(1);
    expect(row).toMatch(/border-l-2 border-dashed border-ink\/50" data-bar="stress-evidence"/);
    // The survey's margin as a whisker, read off its own text ("±2.2 pts").
    expect(row.match(/data-qa="stress-whisker"/g)).toHaveLength(1);
    expect(row).toMatch(/data-qa="stress-whisker" style="left:[\d.]+%;width:[\d.]+%"/);
    expect(t).toContain("The OM against the evidence 6.0%");
    // Each piece of evidence: its kind, its publisher, its date, whose figure it is.
    expect(t).toContain("The deal's own document The deal's T-12: vacancy loss over scheduled rent: 9.1% ($400k of $4.4M, TTM to 2026-06-30) — the deal's T-12, Jun 30, 2026 · the deal's own figure");
    expect(t).toContain("A published figure Rental vacancy, metro area: 6.2% ±2.2 pts (Q2 2026) — Census Bureau, Apr 1, 2026 · the metro's figure, not the building's Source");
    expect(row).toContain('href="https://www.census.gov/housing/hvs/"');
    expect(t).toContain("A rule of thumb Multifamily vacancy, a rule of thumb: 5.0% — the class's screening default, a rule of thumb, not this market's figure — a rule of thumb · the class's, not this market's");
    // The gap in words, then the impact: the pair, the small track with the
    // base as a tick, and the sentence.
    expect(t).toContain("The OM's 6.0% is 3.1 points under the evidence's 9.1%.");
    expect(t).toContain("Levered IRR 9.3% → 7.1%");
    expect(row).toMatch(/data-bar="stress-impact" style="width:[\d.]+%"/);
    expect(t).toContain("At the evidence's figure 7.1%");
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
    expect(t).toContain("The OM against the evidence $532k");
    expect(t).toContain("No return struck: no figure the engine can take.");
    expect(taxes).not.toContain('data-qa="stress-impact"');
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
    expect(t.match(/No return struck: The model runs on the \$10,000,000 placeholder price/g)).toHaveLength(1);
    // The two tested rows point up; the unchecked row's reason is its own.
    expect(w.match(/data-qa="stress-no-impact"/g)).toHaveLength(2);
    expect(t).toContain("No return struck: the model's reads are withheld (see above).");
    expect(w).not.toContain('data-bar="stress-impact"');
    // The track still draws: the evidence stands whether or not the engine runs.
    expect(w).toContain('data-bar="stress-om"');
  });

  it("its markers are its own: no other source draws them, and every key has a section on the methodology page", () => {
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
