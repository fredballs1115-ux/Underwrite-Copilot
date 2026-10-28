import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { METHOD_CHANGED, OM_FIGURE_CHANGED, driftSummary, labelInSentence, stressDrift } from "@/lib/stress-drift";
import { SEEDED_RATE_LABEL, SEEDED_RATE_ONLY_LABEL, T12_NOI_LABEL } from "@/lib/stress-deciders";
import { readStressSnapshot, stressSnapshotOf, type StressSnapshot } from "@/lib/stress-snapshot";
import type { StressEvidence, StressHeadline, StressRow, StressTest } from "@/lib/stress-test-types";
import { sampleStressTest } from "@/lib/sample-stress";
import { StressDriftView } from "@/app/stress-drift";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";

const ev = (over: Partial<StressEvidence>): StressEvidence => ({
  kind: "published",
  label: "Rental vacancy, metro area",
  text: "",
  value: 6.2,
  asOf: "2026-01-01",
  publisher: "Census Bureau",
  scope: "metro",
  ...over,
});
const row = (over: Partial<StressRow>): StressRow => ({
  key: "vacancy",
  title: "Stabilized vacancy",
  omSays: { text: "Vacancy 6.0%", value: 6, page: 9 },
  evidence: [ev({})],
  gap: null,
  verdict: "holds",
  decidedBy: 0,
  impact: null,
  challenge: null,
  method: "",
  ...over,
});
const headline = (evidenceIrrPct: number): StressHeadline => ({
  omIrrPct: 9.3,
  evidenceIrrPct,
  omMultiple: 1.8,
  evidenceMultiple: 1.6,
  omKeys: [],
  parts: [],
  omitted: [],
  unsolved: 0,
});
const test = (rows: StressRow[], h?: StressHeadline | null): StressTest => ({ rows, readOn: "2026-10-20", publishedRead: true, impactsWithheld: null, ...(h !== undefined ? { headline: h } : {}) });
/** What the verdict keeps, as the database hands it back. */
const kept = (t: StressTest): StressSnapshot => readStressSnapshot(JSON.parse(JSON.stringify(stressSnapshotOf(t))))!;

// At the call (Oct 20): the survey's Q1 figure holds the vacancy, the 10-year
// of Oct 1 holds the exit, the T-12 sinks the NOI, Zillow stretches the rent
// growth, the taxes go unchecked and the debt holds on the rate's default.
const atCall = test(
  [
    row({ evidence: [ev({ text: "6.2% ±2.2 pts (Q1 2026)" })] }),
    row({ key: "exit_cap", title: "Exit cap", omSays: { text: "Exit 5.50%", value: 5.5, page: 12 }, evidence: [ev({ label: "10-yr Treasury", value: 4.1, asOf: "2026-10-01", publisher: "U.S. Treasury via FRED", scope: "nation" })] }),
    row({ key: "noi", title: "NOI", verdict: "unsupported", omSays: { text: "NOI $1,200,000", value: 1_200_000, page: 5 }, evidence: [ev({ kind: "document", label: "The deal's T-12", value: 1_000_000, asOf: "2026-06-30", publisher: "the deal's T-12", scope: "deal" })] }),
    row({ key: "rent_growth", title: "Rent growth", verdict: "stretched", omSays: { text: "3.5%/yr", value: 3.5, page: 14 }, evidence: [ev({ label: "Asking rents, apartments", value: 1.1, asOf: "2026-08-31", publisher: "Zillow Research" })] }),
    row({ key: "taxes", title: "Taxes", verdict: "unchecked", decidedBy: null, omSays: { text: "Taxes $300,000", value: 300_000, page: 7 }, evidence: [] }),
    row({ key: "debt", title: "Loan rate", omSays: { text: "6.00%", value: 6, page: 20 }, evidence: [ev({ kind: "rule_of_thumb", label: "A screening default", value: 6.2, asOf: null, publisher: "a rule of thumb", scope: "class" })] }),
  ],
  headline(7.1),
);

// Today (Oct 28): the survey's Q2 figure stretches the vacancy, a newer
// 10-year still holds the exit, the NOI is as it was, the rent growth is
// decided by the CPI's rent now, the taxes are tested, the debt row is gone
// and a market rent row is new.
const today = test(
  [
    row({ verdict: "stretched", evidence: [ev({ value: 7.4, asOf: "2026-04-01", text: "7.4% ±1.0 pts (Q2 2026)" })] }),
    row({ key: "exit_cap", title: "Exit cap", omSays: { text: "Exit 5.50%", value: 5.5, page: 12 }, evidence: [ev({ label: "10-yr Treasury", value: 4.3, asOf: "2026-10-27", publisher: "U.S. Treasury via FRED", scope: "nation" })] }),
    atCall.rows[2],
    row({ key: "rent_growth", title: "Rent growth", verdict: "stretched", omSays: { text: "3.5%/yr", value: 3.5, page: 14 }, evidence: [ev({ label: "Asking rents, apartments", value: 1.0, asOf: "2026-09-30", publisher: "Zillow Research" }), ev({ label: "CPI rent, metro area", value: 2.4, asOf: "2026-09-01", publisher: "BLS" })], decidedBy: 1 }),
    row({ key: "taxes", title: "Taxes", verdict: "stretched", omSays: { text: "Taxes $300,000", value: 300_000, page: 7 }, evidence: [ev({ kind: "document", label: "The deal's T-12", value: 360_000, asOf: "2026-06-30", publisher: "the deal's T-12", scope: "deal" })] }),
    row({ key: "market_rent", title: "Market rent", verdict: "holds", omSays: { text: "$2,600/mo", value: 2600, page: 15 }, evidence: [ev({ label: "Lease comps", value: 2650, asOf: null, kind: "om_internal", publisher: "the offering memorandum" })], yardstick: "/mo" }),
  ],
  headline(6.4),
);

describe("stressDrift — what moved in the stress test since the call (display only)", () => {
  const d = stressDrift(kept(atCall), today, { calledOn: "Oct 20, 2026" })!;
  const of = (key: string) => d.rows.find((r) => r.key === key)!;

  it("names each row's kind: a verdict that changed, a newer figure of the same piece, a decider that changed, a new row and a gone one", () => {
    expect(of("vacancy")).toMatchObject({ kind: "moved", then: "holds", now: "stretched", direction: "worse", deciderChanged: false });
    // The same piece both times: its figure then and now, each by its period.
    expect(of("vacancy").thenFigure).toMatchObject({ text: "6.2%", period: "Q1 2026", label: "Rental vacancy, metro area" });
    expect(of("vacancy").nowFigure).toMatchObject({ text: "7.4%", period: "Q2 2026" });
    expect(of("exit_cap")).toMatchObject({ kind: "newer_figure", then: "holds", now: "holds" });
    expect(of("exit_cap").thenFigure!.text).toBe("4.10%");
    expect(of("exit_cap").nowFigure!.text).toBe("4.30%");
    expect(of("noi").kind).toBe("same");
    // Another piece decides today: said so, never a move between the two.
    expect(of("rent_growth")).toMatchObject({ kind: "decider_changed", deciderChanged: true });
    expect(of("rent_growth").nowFigure!.label).toBe("CPI rent, metro area");
    expect(of("taxes")).toMatchObject({ kind: "moved", then: "unchecked", now: "stretched", unchecked: "then", direction: null, thenFigure: null });
    expect(of("debt")).toMatchObject({ kind: "gone_row", then: "holds", now: null });
    expect(of("market_rent")).toMatchObject({ kind: "new_row", then: null, now: "holds" });
    expect(d.counts).toEqual({ moved: 2, om_changed: 0, newer_figure: 1, revised: 0, decider_changed: 1, new_row: 1, gone_row: 1 });
    // Changed rows first, the move away from holding leading.
    expect(d.rows.map((r) => r.key).slice(0, 2)).toEqual(["vacancy", "taxes"]);
    expect(d.rows.at(-1)!.key).toBe("noi");
    expect(d.changed).toBe(true);
    expect(d.wordsOnly).toBe(false);
    expect(d.methodChanged).toBe(false);
  });

  it("sets the headline's evidence case then against now where both stand on one measure", () => {
    expect(d.headline).toEqual({ measure: "levered_irr", then: 7.1, now: 6.4 });
    // Today's case is struck with today's figures (the rate's seed among
    // them), and the summary says so.
    expect(driftSummary(d)).toBe("2 rows moved, 1 decider changed, 1 newer figure, 1 row new, 1 row not read today, the evidence's case moved with today's figures");
    // A plan's yield on cost is never set against a levered IRR.
    const plan = test(today.rows, { ...headline(6.4), measure: "yield_on_cost", omYocPct: 6.1, evidenceYocPct: 5.8, omIrrPct: null, evidenceIrrPct: null });
    expect(stressDrift(kept(atCall), plan)!.headline).toBeNull();
    // Withheld today, or none at the call: none.
    expect(stressDrift(kept(atCall), { ...today, impactsWithheld: "No return is re-run." })!.headline).toBeNull();
    expect(stressDrift(kept(test(atCall.rows)), today)!.headline).toBeNull();
  });

  it("calls the same period at another figure revised, as printed, and the same piece unchanged the same", () => {
    const revised = test([row({ evidence: [ev({ value: 6.4 })] })]);
    expect(stressDrift(kept(test([row({})])), revised)!.rows[0].kind).toBe("revised");
    const same = stressDrift(kept(test([row({})])), test([row({})]))!;
    expect(same.rows[0].kind).toBe("same");
    expect(same.changed).toBe(false);
    expect(driftSummary(same)).toBe("");
    // A figure that moved under the printed place is not a revision.
    const hair = stressDrift(kept(test([row({ evidence: [ev({ value: 6.21 })] })])), test([row({ evidence: [ev({ value: 6.24 })] })]))!;
    expect(hair.rows[0].kind).toBe("same");
    expect(hair.changed).toBe(false);
  });

  it("matches a decider by its step of the row's order, never by its label", () => {
    // The debt row's two labels are one step, today's index plus the class's
    // spread: a seed read with its index one day and without it the next is
    // the same piece, at a newer figure, never a decider that changed.
    const debt = (label: string, value: number, asOf: string) =>
      row({ key: "debt", title: "Loan rate", omSays: { text: "6.00%", value: 6, page: 20 }, evidence: [ev({ kind: "rule_of_thumb", label, value, asOf, publisher: "FRED", scope: "class" })] });
    const r = stressDrift(kept(test([debt(SEEDED_RATE_LABEL, 6.6, "2026-10-01")])), test([debt(SEEDED_RATE_ONLY_LABEL, 6.8, "2026-10-27")]))!.rows[0];
    expect(r).toMatchObject({ kind: "newer_figure", deciderChanged: false });
    expect(r.thenFigure!.text).toBe("6.60%");
    expect(r.nowFigure!.text).toBe("6.80%");
  });

  it("says the OM's figure changed since the call rather than a move", () => {
    const moved = test([row({ verdict: "stretched", omSays: { text: "Vacancy 5.0%", value: 5, page: 9 } })]);
    const o = stressDrift(kept(test([row({})])), moved)!;
    expect(o.rows[0]).toMatchObject({ kind: "om_changed", thenFigure: null, nowFigure: null, direction: null });
    expect(o.counts.om_changed).toBe(1);
    expect(o.counts.moved).toBe(0);
    expect(driftSummary(o)).toBe("1 OM figure changed");
    const html = renderToStaticMarkup(React.createElement(StressDriftView, { drift: o }));
    expect(a11yIssues(html)).toEqual([]);
    expect(visibleText(html).replace(/&#x27;/g, "'")).toContain(`${OM_FIGURE_CHANGED}, so its verdicts are not compared.`);
    expect(html).not.toContain('data-qa="drift-verdicts"');
  });

  it("compares nothing where the call was struck under other rules, and says so", () => {
    // A version-1 snapshot, kept before the rules were stamped.
    const old = JSON.parse(JSON.stringify(stressSnapshotOf(atCall)));
    old.v = 1;
    delete old.rules;
    const v1 = readStressSnapshot(old)!;
    expect(v1.v).toBe(1);
    expect(v1.rules).toBeUndefined();
    expect(v1.rows.some((r) => r.decided)).toBe(false);
    const w = stressDrift(v1, today, { calledOn: "Oct 20, 2026" })!;
    expect(w).toMatchObject({ methodChanged: true, rows: [], headline: null, wordsOnly: true, changed: true });
    // A version-2 snapshot struck under rules other than today's.
    const other = JSON.parse(JSON.stringify(stressSnapshotOf(atCall)));
    other.rules = 0;
    const m = stressDrift(readStressSnapshot(other), today, { calledOn: "Oct 20, 2026" })!;
    expect(m).toMatchObject({ methodChanged: true, rows: [], headline: null, wordsOnly: false });
    expect(driftSummary(m)).toBe("");
    const html = renderToStaticMarkup(React.createElement(StressDriftView, { drift: m }));
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Called Oct 20, 2026");
    expect(text).toContain(METHOD_CHANGED);
    expect(METHOD_CHANGED).toBe("The test's method changed since the call; re-screen to compare.");
    expect(html).not.toContain('data-qa="stress-drift-rows"');
    expect(html).not.toContain('data-bar="drift-then"');
  });

  it("is withheld while the call is behind a re-screen that failed, stalled or is running", () => {
    for (const behind of ["failed", "stalled", "running"] as const) expect(stressDrift(kept(atCall), today, { behind })).toBeNull();
    expect(stressDrift(kept(atCall), today, { behind: null })).not.toBeNull();
  });

  it("says a piece's label inside a sentence with its first common word lowered", () => {
    expect(labelInSentence(T12_NOI_LABEL)).toBe("the deal's T-12 NOI");
    expect(labelInSentence("Rental vacancy, metro area")).toBe("rental vacancy, metro area");
    expect(labelInSentence("CPI rent, metro area")).toBe("CPI rent, metro area");
    expect(labelInSentence("Zillow's asking rents")).toBe("Zillow's asking rents");
    expect(labelInSentence("NOI per unit")).toBe("NOI per unit");
    expect(labelInSentence("A scenario: today's tax rate")).toBe("a scenario: today's tax rate");
  });

  it("shows nothing on the sample, with no snapshot, or with no test today", () => {
    const sample = sampleStressTest({ today: "2026-10-28" });
    expect(stressDrift(kept(sampleStressTest({ today: "2026-10-12" })), sample)).toBeNull();
    expect(stressDrift(kept(atCall), today, { sample: true })).toBeNull();
    expect(stressDrift(null, today)).toBeNull();
    expect(stressDrift(kept(atCall), null)).toBeNull();
    expect(stressDrift(kept(atCall), test([]))).toBeNull();
  });

  it("draws a then→now chip a row that moved, the figure line only for one piece, and reads clean", () => {
    const html = renderToStaticMarkup(React.createElement(StressDriftView, { drift: d }));
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html).replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Since the call");
    expect(text).toContain("Oct 20, 2026: 2 rows moved, 1 decider changed, 1 newer figure, 1 row new, 1 row not read today, the evidence's case moved with today's figures");
    const rowOf = (key: string) => {
      const from = html.indexOf(`data-qa="drift-${key}"`);
      return html.slice(from, html.indexOf("</li>", from));
    };
    expect(rowOf("vacancy")).toContain('data-drift="moved"');
    expect(visibleText(rowOf("vacancy")).replace(/\s+/g, " ")).toContain("Rental vacancy, metro area: 6.2% (Q1 2026) → now 7.4% (Q2 2026)");
    expect(rowOf("vacancy")).toContain("text-kill");
    // Two pieces are named, never joined by an arrow.
    expect(rowOf("rent_growth")).toContain('data-qa="drift-decider"');
    expect(rowOf("rent_growth")).not.toContain('data-qa="drift-figure"');
    expect(visibleText(rowOf("rent_growth"))).toContain("Decided now by CPI rent, metro area, not asking rents, apartments");
    // The chips read as words to a screen reader: the spaces are spelt.
    expect(visibleText(rowOf("vacancy")).replace(/\s+/g, " ")).toContain("At the call: Holds → today: Stretched");
    expect(visibleText(rowOf("taxes"))).toContain("Unchecked");
    expect(visibleText(rowOf("debt"))).toContain("Not read today");
    expect(visibleText(rowOf("market_rent"))).toContain("Not tested");
    // The unchanged NOI is not drawn; the headline's two bars are.
    expect(html).not.toContain('data-qa="drift-noi"');
    expect(html).toContain('data-bar="drift-then"');
    expect(html).toContain('data-bar="drift-now"');
    expect(text).toContain("The evidence's case, levered IRR, at the call and with today's figures");
    // Nothing moved, nothing drawn.
    expect(renderToStaticMarkup(React.createElement(StressDriftView, { drift: stressDrift(kept(test([row({})])), test([row({})])) }))).toBe("");
  });
});
