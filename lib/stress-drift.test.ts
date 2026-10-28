import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { driftSummary, stressDrift } from "@/lib/stress-drift";
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
    expect(d.counts).toEqual({ moved: 2, newer_figure: 1, revised: 0, decider_changed: 1, new_row: 1, gone_row: 1 });
    // Changed rows first, the move away from holding leading.
    expect(d.rows.map((r) => r.key).slice(0, 2)).toEqual(["vacancy", "taxes"]);
    expect(d.rows.at(-1)!.key).toBe("noi");
    expect(d.changed).toBe(true);
    expect(d.wordsOnly).toBe(false);
  });

  it("sets the headline's evidence case then against now where both stand on one measure", () => {
    expect(d.headline).toEqual({ measure: "levered_irr", then: 7.1, now: 6.4 });
    expect(driftSummary(d)).toBe("2 rows moved, 1 decider changed, 1 newer figure, 1 row new, 1 row not read today, the evidence's case moved");
    // A plan's yield on cost is never set against a levered IRR.
    const plan = test(today.rows, { ...headline(6.4), measure: "yield_on_cost", omYocPct: 6.1, evidenceYocPct: 5.8, omIrrPct: null, evidenceIrrPct: null });
    expect(stressDrift(kept(atCall), plan)!.headline).toBeNull();
    // Withheld today, or none at the call: none.
    expect(stressDrift(kept(atCall), { ...today, impactsWithheld: "No return is re-run." })!.headline).toBeNull();
    expect(stressDrift(kept(test(atCall.rows)), today)!.headline).toBeNull();
  });

  it("calls the same period at another figure revised, and the same piece unchanged the same", () => {
    const revised = test([row({ evidence: [ev({ value: 6.4 })] })]);
    expect(stressDrift(kept(test([row({})])), revised)!.rows[0].kind).toBe("revised");
    const same = stressDrift(kept(test([row({})])), test([row({})]))!;
    expect(same.rows[0].kind).toBe("same");
    expect(same.changed).toBe(false);
    expect(driftSummary(same)).toBe("");
  });

  it("reads a snapshot kept before its rows named their decider for its verdict words alone", () => {
    const old = JSON.parse(JSON.stringify(stressSnapshotOf(atCall)));
    for (const r of old.rows) {
      delete r.decided;
      if (r.evidence) delete r.evidence.period;
    }
    delete old.headline;
    const w = stressDrift(readStressSnapshot(old), today)!;
    expect(w.wordsOnly).toBe(true);
    const ofW = (key: string) => w.rows.find((r) => r.key === key)!;
    expect(ofW("vacancy")).toMatchObject({ kind: "moved", thenFigure: null, nowFigure: null, wordsOnly: true });
    // A newer figure and a changed decider are not read off verdict words.
    expect(ofW("exit_cap").kind).toBe("same");
    expect(ofW("rent_growth").kind).toBe("same");
    expect(w.headline).toBeNull();
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
    expect(text).toContain("Oct 20, 2026: 2 rows moved, 1 decider changed, 1 newer figure, 1 row new, 1 row not read today, the evidence's case moved");
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
    expect(visibleText(rowOf("rent_growth"))).toContain("Decided now by CPI rent, metro area, not Asking rents, apartments");
    expect(visibleText(rowOf("taxes"))).toContain("Unchecked");
    expect(visibleText(rowOf("debt"))).toContain("Not read today");
    expect(visibleText(rowOf("market_rent"))).toContain("Not tested");
    // The unchanged NOI is not drawn; the headline's two bars are.
    expect(html).not.toContain('data-qa="drift-noi"');
    expect(html).toContain('data-bar="drift-then"');
    expect(html).toContain('data-bar="drift-now"');
    expect(text).toContain("The evidence's case, levered IRR");
    // Nothing moved, nothing drawn.
    expect(renderToStaticMarkup(React.createElement(StressDriftView, { drift: stressDrift(kept(test([row({})])), test([row({})])) }))).toBe("");
  });
});
