// Render tests for the first-draft model card's stress tiles and its
// sensitivity grid (app/(app)/deals/[id]/model-panels.tsx), drawn on the
// sample deal's model: what each tile says beside its figure, and the grid's
// cells shaded by their figure with a legend.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sensitivity, StressPanel } from "@/app/(app)/deals/[id]/model-panels";
import { irrShade } from "@/app/(app)/deals/[id]/irr-shade";
import { computeSensitivityGrid } from "@/lib/model/sensitivity";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

function clean(html: string) {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
}

describe("the sensitivity grid is a heat map by the figure, with a legend", () => {
  const html = renderToStaticMarkup(React.createElement(Sensitivity, { model: SAMPLE_DEAL.model }));
  const text = visibleText(html);
  const grid = computeSensitivityGrid(SAMPLE_DEAL.model.inputs);
  const irrs = grid.flatMap((r) => r.cells.map((c) => c.irrPct)).filter((v): v is number => v != null);

  it("shades every cell with a figure, keeps the figure as text, and outlines the base case", () => {
    clean(html);
    expect((html.match(/data-heat="irr"/g) ?? []).length).toBe(irrs.length);
    for (const v of irrs) expect(text).toContain(`${v.toFixed(1)}%`);
    expect((html.match(/ring-inset ring-brand"[^>]*>[^<]*<span class="sr-only"> \(base case\)/g) ?? []).length).toBe(1);
  });

  it("shades in one hue, the highest IRR deepest and the lowest lightest — never green for good (audit C11, L1)", () => {
    const hi = Math.max(...irrs);
    const lo = Math.min(...irrs);
    const bg = (v: number) =>
      new RegExp(`style="background-color:${irrShade(v === hi ? 1 : 0).replace(/[().]/g, "\\$&")}"[^>]*>${v.toFixed(1)}%`);
    expect(html).toMatch(bg(hi));
    expect(html).toMatch(bg(lo));
    // One hue: every shade is the brand's teal, only its depth moves.
    for (const m of html.matchAll(/data-heat="irr" style="background-color:(rgba\([^)]*\))"/g)) expect(m[1]).toMatch(/^rgba\(17, 78, 84, /);
    expect(irrShade(0)).not.toBe(irrShade(1));
  });

  it("on a grid where every IRR is negative, the least-bad cell is the deepest teal and its figure stays red", () => {
    const losing = { ...SAMPLE_DEAL.model, inputs: { ...SAMPLE_DEAL.model.inputs, exitCapPct: 9 } };
    const grid2 = computeSensitivityGrid(losing.inputs).flatMap((r) => r.cells.map((c) => c.irrPct)).filter((v): v is number => v != null);
    expect(grid2.length).toBeGreaterThan(0);
    expect(Math.max(...grid2)).toBeLessThan(0);
    const out = renderToStaticMarkup(React.createElement(Sensitivity, { model: losing }));
    clean(out);
    const best = Math.max(...grid2);
    const cell = new RegExp(`style="background-color:([^"]*)" class="([^"]*)">${best.toFixed(1).replace(/[.-]/g, "\\$&")}%`).exec(out);
    expect(cell?.[1]).toBe(irrShade(1));
    expect(cell?.[2] ?? "").toMatch(/text-kill/);
    expect(out).not.toContain("rgba(16, 185, 129");
  });

  it("keys the shades from the grid's lowest IRR to its highest, and the base case's outline", () => {
    expect(html).toContain('data-bar="sensitivity-scale"');
    expect(text).toContain(`${Math.min(...irrs).toFixed(1)}%`);
    expect(text).toContain("the grid's lowest IRR to its highest");
    expect(text).toContain("Your base case");
  });
});

describe("the stress tiles say each figure's change from the base case", () => {
  const html = renderToStaticMarkup(React.createElement(StressPanel, { model: SAMPLE_DEAL.model }));
  const text = visibleText(html);

  it("carries a signed change in the figure's own unit beside every tile's figure — at the base case, none", () => {
    clean(html);
    expect((html.match(/data-qa="stress-delta"/g) ?? []).length).toBe(4);
    // The IRR and the cash-on-cash move in points, the multiple and the
    // coverage in x — and at the base case each reads no change.
    expect((text.match(/±0\.00 pts from the base case/g) ?? []).length).toBe(2);
    expect((text.match(/±0\.00x from the base case/g) ?? []).length).toBe(2);
    expect(text).toContain("each figure carries its change from the base case");
  });

  it("spells the space between a figure and its change, so a screen reader hears two words", () => {
    const r = SAMPLE_DEAL.model.returns;
    expect(html).toContain(`${r.leveredIrrPct!.toFixed(2)}% <span data-qa="stress-delta"`);
  });
});
