import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import metrosSeed from "@/data/research/metros.json";
import { FmrRow } from "@/app/market/fmr-row";
import { MarketCompare } from "@/app/market/market-compare";
import { COMPARE_METROS } from "@/app/market/compare-metros";
import { benchItems, fmrLine, type BenchItem } from "@/app/(app)/deals/[id]/research-panel";
import { DC_AREA_METRO, fmrLabel, fmrOf } from "./fmr";
import { benchmarksForDeal, mergeBenchmarks } from "./research-data";
import type { Benchmark } from "./research";
import { a11yIssues, dumpView, gluedWords, visibleText } from "./render-lint";

// The market brief's fair market rent row and the compare card, drawn on the
// research file's own blocks. Both had the fiscal year typed into their
// words, so on the day HUD's next year took effect they went on printing
// last year's rents as current; the year is the block's now, and the brief
// says when a year has ended.

const metros = metrosSeed.metros as { id: string; name: string }[];
const philly = metros.find((m) => m.id === "philadelphia")!;
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("the market brief's fair market rent row", () => {
  const html = render(React.createElement(FmrRow, { name: philly.name, fmr: fmrOf(philly), today: "2026-10-01" }));
  const text = visibleText(html);

  it("names the year, HUD's area and the day from the block, and draws the whole bedroom row", () => {
    expect(text).toContain("FY2027 fair market rent");
    for (const [bed, rent] of [
      ["0BR", "$1,438"],
      ["1BR", "$1,558"],
      ["2BR", "$1,860"],
      ["3BR", "$2,216"],
      ["4BR", "$2,445"],
    ]) {
      expect(text).toContain(bed);
      expect(text).toContain(rent);
    }
    expect(text).toContain("Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA · effective Oct 1, 2026");
    expect(text).toContain("verified");
    expect(html).toContain('href="https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_FMRs.xlsx"');
    expect((html.match(/data-bar="fmr"/g) ?? []).length).toBe(5);
    expect(text).toContain("copy citation");
    // The note folds: its first sentence shows, the rest is one click away.
    expect(text).toContain("One HUD area across Philadelphia, Camden and Wilmington.");
    dumpView("fmr-row", html);
  });

  it("the day before the year takes effect it says the day; past the year's end it says it has ended", () => {
    const eve = visibleText(render(React.createElement(FmrRow, { name: philly.name, fmr: fmrOf(philly), today: "2026-09-30" })));
    expect(eve).toContain("effective Oct 1, 2026");
    const after = render(React.createElement(FmrRow, { name: philly.name, fmr: fmrOf(philly), today: "2027-10-01" }));
    const afterText = visibleText(after);
    expect(afterText).toContain("ended Sep 30, 2027");
    expect(afterText).not.toContain("effective");
    expect(after).toMatch(/text-caution[^>]*data-qa="fmr-when"/);
  });

  it("with no figure it says so, naming the year only where the block names one", () => {
    expect(visibleText(render(React.createElement(FmrRow, { name: "Nowhere", fmr: null, today: "2026-10-01" }))).trim()).toBe(
      "Fair market rent for this metro: not yet confirmed — queued in the research gaps.",
    );
    const empty = { ...fmrOf(philly)!, rents: { "0br": null, "1br": null, "2br": null, "3br": null, "4br": null }, note: "HUD's file is not yet read." };
    expect(visibleText(render(React.createElement(FmrRow, { name: philly.name, fmr: empty, today: "2026-10-01" }))).trim()).toBe(
      "FY2027 fair market rent for this metro: not yet confirmed — HUD's file is not yet read.",
    );
  });

  it("every covered metro's row reads clean, its year its own block's", () => {
    for (const m of metros) {
      const fmr = fmrOf(m)!;
      const row = render(React.createElement(FmrRow, { name: m.name, fmr, today: "2026-10-01" }));
      const rowText = visibleText(row);
      expect(rowText, m.id).toContain(`${fmrLabel(fmr.fy)} fair market rent`);
      expect(rowText, m.id).toContain(fmr.area);
      expect(a11yIssues(row), m.id).toEqual([]);
      expect(gluedWords(rowText), m.id).toEqual([]);
    }
  });

  it("the page draws the row through the view, never a year of its own", () => {
    const page = readFileSync(join(process.cwd(), "app/market/page.tsx"), "utf8");
    expect(page).toContain("<FmrRow name={active.name} fmr={fmr} today={todayIso()} />");
    expect(page).toContain("fmr2br={fmrTwoBed(fmr)}");
    expect(page).not.toMatch(/fmr_fy|hud_fmr_fy\d/);
  });
});

describe("the compare card's fair market rent", () => {
  const html = render(React.createElement(MarketCompare, { metros: COMPARE_METROS }));
  const text = visibleText(html);

  it("reads every metro's block through the one reader, with its year", () => {
    expect(COMPARE_METROS).toHaveLength(metros.length);
    for (const m of COMPARE_METROS) {
      const fmr = fmrOf(metros.find((x) => x.id === m.id))!;
      expect(m.fmr.fy, m.id).toBe(fmr.fy);
      expect(m.fmr["2br"], m.id).toBe(fmr.rents["2br"]);
      expect(m.fmr["4br"], m.id).toBe(fmr.rents["4br"]);
    }
  });

  it("opens on Philadelphia against Washington, each ladder headed by the block's year, one scale", () => {
    expect(text.match(/FY2027 fair market rent/g)?.length).toBe(2);
    // Five bedrooms a ladder, both drawn.
    for (const bed of ["0BR", "1BR", "2BR", "3BR", "4BR"]) expect(text).toContain(bed);
    expect(text).toContain("$1,860");
    expect(text).toContain("$2,438");
    // 1,860 − 2,438: Philadelphia's two-bedroom $578 under Washington's.
    expect(text).toContain("−$578/mo");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    dumpView("market-compare", html);
  });

  it("names no year where a block names none, and sets no spread across two years", () => {
    const [a, b] = COMPARE_METROS.filter((m) => m.id === "philadelphia" || m.id === "dc");
    const noYear = visibleText(render(React.createElement(MarketCompare, { metros: [{ ...a, fmr: {} }, b] })));
    expect(noYear).toContain("Fair market rent not yet confirmed for this metro — an honest gap, never an estimate.");
    const twoYears = visibleText(render(React.createElement(MarketCompare, { metros: [{ ...a, fmr: { ...a.fmr, fy: 2028 } }, b] })));
    expect(twoYears).toContain("FY2028 fair market rent");
    expect(twoYears).not.toContain("2BR spread");
  });
});

describe("the deal page's research panel reads a metro's fair market rents as one line", () => {
  // What the table may still hold from last year's seed, merged in.
  const stale: Benchmark = {
    sector: "multifamily",
    metro: DC_AREA_METRO,
    metric: "hud_fmr_fy2026_2br",
    low: 2246,
    high: 2246,
    unit: "usd_month",
    source: "https://www.dchousing.org/api/files/board/610.pdf",
    as_of: "2026-08-21",
    status: "verified",
    note: "FY2026, effective 2025-10-01 through 2026-09-30",
  };
  const rows = benchmarksForDeal(mergeBenchmarks([stale]), "Washington", "Washington DC");
  const items = benchItems(rows);
  const fmrItems = items.filter((i): i is Extract<BenchItem, { kind: "fmr" }> => i.kind === "fmr");

  it("one line for the Washington area, the newest year only, its day from the row's note", () => {
    expect(fmrItems).toHaveLength(1);
    const line = fmrLine(fmrItems[0]);
    expect(line.heading).toBe("FY2027 fair market rent, effective Oct 1, 2026");
    expect(line.figures).toBe("studio $2,111 · 1BR $2,204 · 2BR $2,438 · 3BR $3,107 · 4BR $3,658");
    expect(line.head).toMatchObject({ metric: "hud_fmr_fy2027_2br", status: "verified", as_of: "2026-09-30" });
    expect(gluedWords(`${line.heading}: ${line.figures}`)).toEqual([]);
  });

  it("every other row stays its own", () => {
    const others = items.filter((i) => i.kind === "row");
    expect(others.length).toBe(rows.length - 5);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((i) => i.kind === "row" && !i.b.metric.startsWith("hud_fmr_"))).toBe(true);
  });

  it("a line with no effective day in its note says the year alone", () => {
    const bare = { ...fmrItems[0], rows: fmrItems[0].rows.map((r) => ({ ...r, b: { ...r.b, note: null } })) };
    expect(fmrLine(bare).heading).toBe(`${fmrLabel(bare.fy)} fair market rent`);
  });
});
