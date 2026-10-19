// "From your past screens" and "From your pipeline" as pictures: the going-in
// cap and the basis each a min–max track, a dot a comparable, this deal a dark
// tick, the median dashed from three deals up (lib/comp-range).
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compRangeTracks, type RangeComp } from "@/lib/comp-range";
import { deriveInternalComps } from "@/lib/internal-comps";
import { buildComps, memoryMembers } from "@/lib/market-memory";
import { statedCapRead } from "@/lib/compare-interest";
import { CompRangeTracks } from "@/app/(app)/deals/[id]/comp-range-tracks";
import { a11yIssues, dumpView, gluedWords, visibleText } from "@/lib/render-lint";
import type { ExtractionResult } from "@/lib/anthropic/types";

const m = (label: string, value: string) => ({ label, value, flagged: false, page: "" });

const comp = (name: string, cap: number | null, basis: number | null, allIn = false): RangeComp => ({
  name,
  cap,
  basis: basis != null ? { value: basis, allIn } : null,
});

const UNIT = { unit: "unit" as const, noun: "unit" };

const count = (html: string, bar: string) => html.split(`data-bar="${bar}"`).length - 1;

describe("compRangeTracks — the tracks a set of comparables draws", () => {
  const three = [comp("A", 5.2, 240_000), comp("B", 5.4, 250_000), comp("C", 5.6, 262_000)];

  it("draws each figure from the lowest comparable to the highest, this deal ticked on it", () => {
    const [cap, basis] = compRangeTracks(three, { cap: 5.5, basis: 255_000 }, UNIT);
    expect(cap).toMatchObject({ key: "cap", label: "Going-in cap, at the ask", lo: 5.2, hi: 5.6, rangeText: "5.20–5.60%", subjectText: "5.50%" });
    expect(cap.dots.map((d) => d.title)).toEqual(["A: 5.20%", "B: 5.40%", "C: 5.60%"]);
    expect(basis).toMatchObject({ key: "basis", label: "Basis / unit, at the ask", rangeText: "$240k–$262k/unit", subjectText: "$255k/unit" });
    // A deal outside the comparables widens the scale to hold its tick.
    const [wide] = compRangeTracks(three, { cap: 6.4, basis: null }, UNIT);
    expect(wide.domain[1]).toBeGreaterThan(6.4);
    expect(wide.lo).toBe(5.2);
  });

  it("gives a median only from three deals up (lib/analytics `middleRead`)", () => {
    const [cap] = compRangeTracks(three, { cap: null, basis: null }, UNIT);
    expect(cap.median).toBe(5.4);
    expect(cap.medianText).toBe("5.40%");
    const [two] = compRangeTracks(three.slice(0, 2), { cap: null, basis: null }, UNIT);
    expect(two.median).toBeNull();
    expect(two.medianText).toBeNull();
  });

  it("draws no tick where this deal has no figure of its own, and never one past the memory's cap bound", () => {
    const [cap, basis] = compRangeTracks(three, { cap: null, basis: null }, UNIT);
    expect(cap.subject).toBeNull();
    expect(basis.subject).toBeNull();
    expect(compRangeTracks(three, { cap: 300, basis: null }, UNIT)[0].subject).toBeNull();
    // A misread comparable's 300% cap is no dot either.
    expect(compRangeTracks([...three, comp("Z", 300, null)], { cap: null, basis: null }, UNIT)[0].dots).toHaveLength(3);
  });

  it("puts a plan deal's all-in basis on a track of its own, never this deal's tick on it", () => {
    const tracks = compRangeTracks(
      [comp("Shell", null, 290_000, true), comp("Tower", null, 310_000, true), comp("Maddox", 5.7, 201_000)],
      { cap: 5.5, basis: 205_000 },
      UNIT,
    );
    expect(tracks.map((t) => t.key)).toEqual(["cap", "basis", "basis_all_in"]);
    const building = tracks.find((t) => t.key === "basis")!;
    expect(building.dots.map((d) => d.value)).toEqual([201_000]);
    const allIn = tracks.find((t) => t.key === "basis_all_in")!;
    expect(allIn.label).toBe("All-in basis / unit (plan deals), at the ask");
    expect(allIn.dots.map((d) => d.value)).toEqual([290_000, 310_000]);
    expect(allIn.subject).toBeNull();
  });

  it("draws nothing with nothing to draw", () => {
    expect(compRangeTracks([], { cap: 5.5, basis: 200_000 }, UNIT)).toEqual([]);
    expect(compRangeTracks([comp("A", null, 200_000)], { cap: 5.5, basis: null }, null)).toEqual([]);
  });
});

describe("the readers the tracks take their figures from", () => {
  it("a note's cap slot is withheld, so this deal draws no cap tick (lib/compare-interest `capSlotWithheld`)", () => {
    const note = {
      assetClass: "multifamily",
      interest: { kind: "note", statement: "The offering is the first mortgage note.", sharePct: "", groundLease: "", loan: "", page: "" },
      metrics: [m("Asking price", "$20,000,000"), m("Going-in cap rate", "6.00%")],
    } as unknown as ExtractionResult;
    expect(statedCapRead(note, false, null)).toBeNull();
    expect(compRangeTracks([comp("A", 5.2, null), comp("B", 5.6, null)], { cap: statedCapRead(note, false, null)?.pct ?? null, basis: null }, null)[0].subject).toBeNull();
  });

  it("the pipeline's comps carry their cap and basis as figures, a plan deal's basis marked all-in", () => {
    const sib = (id: string, name: string, metrics: ReturnType<typeof m>[], strategy?: unknown) => ({
      id,
      name,
      asset_class: "multifamily",
      created_at: "2026-09-01T00:00:00Z",
      is_sample: false,
      verdict: { verdict: "pass" },
      extraction: { assetClass: "multifamily", market: "Dallas, TX", metrics, ...(strategy ? { strategy } : {}) },
    });
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      sib("a", "Maddox", [m("Asking price", "$50,000,000"), m("Going-in cap rate", "5.70%"), m("Units", "250")]),
      sib("b", "1200 K", [
        m("Purchase price", "$20,000,000"),
        m("Stabilized NOI (pro forma)", "$21,000,000"),
        m("Total project cost", "$180,000,000"),
        m("Units (proposed)", "600"),
      ], { kind: "conversion", summary: "Office to residential", capitalBudget: "", timeline: "" }),
    ]);
    expect(comps[0]).toMatchObject({ capPct: 5.7, basisFigure: { value: 200_000, unit: "unit", noun: "unit", allIn: false } });
    expect(comps[0].basisLabel).toBe("$200k/unit");
    const plan = comps.find((c) => c.dealId === "b")!;
    expect(plan.basisFigure).toMatchObject({ value: 300_000, allIn: true });
    expect(plan.capPct).toBeUndefined();
  });

  it("the past screens' members are the group's, one by one", () => {
    const row = (id: string, cap: string) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: "2026-09-01T00:00:00Z",
      is_sample: false,
      verdict: null,
      extraction: { assetClass: "multifamily", market: "Dallas, TX", metrics: [m("Going-in cap rate", cap)] },
    });
    const all = buildComps([row("a", "5.2%"), row("b", "5.6%"), row("me", "5.4%")]);
    expect(memoryMembers(all, "me", "multifamily", "Dallas TX").map((c) => c.capPct)).toEqual([5.2, 5.6]);
  });
});

describe("CompRangeTracks — the picture", () => {
  const tracks = compRangeTracks(
    [comp("A", 5.2, 240_000), comp("B", 5.4, 250_000), comp("C", 5.6, 262_000), comp("Shell", null, 300_000, true)],
    { cap: 5.5, basis: 255_000 },
    UNIT,
  );
  const html = renderToStaticMarkup(React.createElement(CompRangeTracks, { tracks, bar: "pastscreens", qa: "past-screens-tracks" }));
  const text = visibleText(html);
  dumpView("comp-range-tracks", html);

  it("draws a dot a comparable, this deal a tick, the median and the span", () => {
    expect(count(html, "pastscreens-dot")).toBe(3 + 3 + 1);
    expect(count(html, "pastscreens-subject")).toBe(2);
    expect(count(html, "pastscreens-median")).toBe(2);
    expect(count(html, "pastscreens-span")).toBe(3);
  });

  it("says each figure is at the ask, and keys the marks", () => {
    expect(text).toContain("Going-in cap, at the ask");
    expect(text).toContain("Basis / unit, at the ask");
    expect(text).toContain("All-in basis / unit (plan deals), at the ask");
    expect(text).toContain("This deal, 5.50%");
    expect(text).toContain("Median, 5.40%");
    expect(text).toContain("3 past screens");
    expect(text).toContain("One past screen");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("draws nothing with no tracks", () => {
    expect(renderToStaticMarkup(React.createElement(CompRangeTracks, { tracks: [], bar: "pipelinecomps" }))).toBe("");
  });
});

describe("the data-bar markers are this picture's own", () => {
  it("no other source names them", async () => {
    const { execFileSync } = await import("node:child_process");
    // The component builds them from its `bar` ("pastscreens-dot"); the
    // deal view names the two families, and nothing else does.
    const out = execFileSync("git", ["grep", "--untracked", "-l", "-E", "pastscreens|pipelinecomps", "--", "app", "lib"], { encoding: "utf8" });
    const files = out.split("\n").filter(Boolean).sort();
    expect(files).toEqual([
      "app/(app)/deals/[id]/comp-range-tracks.tsx",
      "app/(app)/deals/[id]/deal-view.tsx",
      "lib/comp-range.render.test.ts",
      "lib/deal-view.render.test.ts",
    ]);
  });
});
