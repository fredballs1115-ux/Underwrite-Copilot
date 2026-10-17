// Render tests for the first-draft model card's stress tiles and its
// sensitivity grid (app/(app)/deals/[id]/model-panels.tsx), drawn on the
// sample deal's model: what each tile says beside its figure, and the grid's
// cells shaded by their figure with a legend.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StressPanel } from "@/app/(app)/deals/[id]/model-panels";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

function clean(html: string) {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
}

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
