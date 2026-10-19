/**
 * The bridge page's saved versions (app/(app)/deals/[id]/bridge/version-list):
 * each version's levered IRR a bar on one scale (lib/bridge/version-bars),
 * and a version with no IRR drawing none, saying why in lib/underwrite/
 * no-irr's words. The scale and the reason read, then the list rendered on
 * fixtures and linted.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/deals/[id]/bridge/actions", () => ({
  deleteDealVersion: async () => {},
  saveScenarioVersion: async () => {},
}));

import { VersionList, type VersionRow } from "@/app/(app)/deals/[id]/bridge/version-list";
import { ZERO_IRR_SPAN, irrBar, versionIrrScale, versionNoIrr } from "./bridge/version-bars";
import { SAMPLE_DEAL } from "./sample-deal";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { NO_IRR_WHY } from "./underwrite/no-irr";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;

const row = (over: Partial<VersionRow>): VersionRow => ({
  id: "v",
  label: "base 1",
  note: null,
  automatic: true,
  createdAt: "2026-10-01T12:00:00Z",
  leveredIrr: 0.12,
  leveredEquityMultiple: 1.7,
  noIrr: null,
  ...over,
});

describe("versionIrrScale — one scale for every version", () => {
  it("runs from zero to the highest IRR, or from the lowest where one is a loss", () => {
    expect(versionIrrScale([0.1, 0.2, null])).toEqual({ lo: 0, hi: 0.2, zeroAt: 0 });
    const s = versionIrrScale([-0.05, 0.15])!;
    expect(s.lo).toBe(-0.05);
    expect(s.hi).toBe(0.15);
    expect(s.zeroAt).toBeCloseTo(25, 9);
    // A bar runs from the zero line out to its value, either way.
    expect(irrBar(s, 0.15)).toEqual({ left: 25, width: 75 });
    const loss = irrBar(s, -0.05);
    expect(loss.left).toBeCloseTo(0, 9);
    expect(loss.width).toBeCloseTo(25, 9);
    expect(versionIrrScale([null, undefined])).toBeNull();
  });

  // The audit of #466: every version at 0% drew a scale of 0% to 100%.
  it("runs a small fixed span where every IRR is 0%", () => {
    const s = versionIrrScale([0, 0, null])!;
    expect(s).toEqual({ lo: 0, hi: ZERO_IRR_SPAN, zeroAt: 0 });
    expect(ZERO_IRR_SPAN).toBeLessThanOrEqual(0.1);
    expect(irrBar(s, 0)).toEqual({ left: 0, width: 0 });
  });

  it("says why no rate solved off the version's own assumptions, and nothing where one does", () => {
    const base = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name).inputs;
    expect(versionNoIrr(base)).toBeNull();
    // An exit no buyer pays the loan off at.
    expect(versionNoIrr({ ...base, exitCapPct: 1, ltc: 0.9 })).toBe("sale");
    expect(versionNoIrr(null)).toBeNull();
  });
});

describe("VersionList — each version's levered IRR a bar on one scale", () => {
  const versions: VersionRow[] = [
    row({ id: "a", label: "base 2", leveredIrr: 0.15, leveredEquityMultiple: 1.9 }),
    row({ id: "b", label: "broker case", automatic: false, note: "Retrade at $12.0M", leveredIrr: -0.05, leveredEquityMultiple: 0.8 }),
    row({ id: "c", label: "base 1", leveredIrr: null, leveredEquityMultiple: 0.4, noIrr: "sale" }),
  ];
  const html = renderToStaticMarkup(h(VersionList, { dealId: "d1", versions, liveId: "a", listCut: null }));
  const text = visibleText(html).replace(/\s+/g, " ");

  it("draws a bar a version with an IRR, on one scale, a loss left of the zero line", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    const bars = [...html.matchAll(/<span data-bar="version-irr" class="([^"]*)" style="([^"]*)"/g)];
    expect(bars).toHaveLength(2);
    expect(bars[0][1]).toContain("bg-brand");
    expect(bars[0][2]).toBe("left:25%;width:75%");
    expect(bars[1][1]).toContain("bg-kill");
    expect(bars[1][2]).toMatch(/^left:0%;width:25(\.0+\d*)?%$/);
    // The zero line ticked on each drawn track, the scale said in the key.
    expect((html.match(/data-bar="version-irr-zero"/g) ?? []).length).toBe(2);
    expect(text).toContain("Levered IRR, every version on one scale from -5.0% to 15.0%");
    expect(text).toContain("15.0%");
    expect(text).toContain("-5.0%");
    // The bars are tracks of one group, so they start at one x.
    expect(html).toContain("@container/bars");
  });

  it("draws no bar for a version with no IRR, and says why in no-irr's words", () => {
    const c = /<li [^>]*data-version="c"[\s\S]*?<\/li>/.exec(html)?.[0] ?? "";
    expect(c).not.toContain('data-bar="version-irr"');
    expect(visibleText(c)).toContain(`no IRR: ${NO_IRR_WHY.sale}`);
  });

  it("keeps each version's multiple, date, note and its Delete, the current one kept", () => {
    expect(text).toContain("1.90x");
    expect(text).toContain("saved · Oct 1, 2026");
    expect(text).toContain("Retrade at $12.0M");
    expect(text).toContain("current");
    expect((html.match(/aria-label="Delete version /g) ?? []).length).toBe(2);
    expect(html).not.toContain('aria-label="Delete version base 2"');
  });

  it("draws no scale where no version has an IRR, and says the list is cut where it is", () => {
    const none = renderToStaticMarkup(
      h(VersionList, { dealId: "d1", versions: [row({ id: "x", leveredIrr: null, noIrr: null })], liveId: null, listCut: "the newest 60 of 214" }),
    );
    expect(a11yIssues(none)).toEqual([]);
    expect(none).not.toContain('data-bar="version-irr"');
    expect(visibleText(none)).not.toContain("on one scale");
    expect(visibleText(none)).toContain("no IRR");
    expect(visibleText(none)).toContain("the newest 60 of 214");
  });
});
