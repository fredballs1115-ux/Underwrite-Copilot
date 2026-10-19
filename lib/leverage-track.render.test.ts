// The leverage check as a picture: one percent track with the deal's going-in
// cap, the 30-year mortgage survey as a dashed one-sided floor (never a
// quote), the seeded index plus the class spread and the 10-year as ticks,
// each dated in the key — and nothing drawn where the model's reads are
// withheld.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeverageTrack } from "@/app/(app)/deals/[id]/leverage-track";
import { ResearchPanelView } from "@/app/(app)/deals/[id]/research-panel";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const count = (html: string, bar: string) => html.split(`data-bar="${bar}"`).length - 1;

const SEED = {
  pct: 6.94,
  note: "5-yr Treasury 4.94% (FRED, Sep 17, 2026) + 200 bps multifamily spread, a screening default — enter your quote",
};

describe("LeverageTrack — the picture", () => {
  const html = renderToStaticMarkup(
    React.createElement(LeverageTrack, {
      figures: {
        capPct: 5.45,
        survey: { pct: 6.95, source: "Freddie Mac's Primary Mortgage Market Survey® via FRED · MORTGAGE30US", dated: "Sep 17, 2026" },
        seed: SEED,
        tenYear: { pct: 4.94, dated: "Sep 17, 2026" },
      },
    }),
  );
  const text = visibleText(html);

  it("draws the cap, the survey's floor, the seeded rate and the 10-year on one track", () => {
    for (const bar of ["lev-cap", "lev-survey", "lev-floor", "lev-seed", "lev-tenyear"]) expect(count(html, bar), bar).toBe(1);
    // The survey is a dashed tick: a floor, never a quote.
    expect(html).toMatch(/border-dashed[^"]*"[^>]*data-bar="lev-survey"/);
  });

  it("puts the cap where it falls among the rates: below the survey and the seed, above the 10-year", () => {
    const left = (bar: string) => Number(html.match(new RegExp(`data-bar="${bar}" style="left:([\\d.]+)%`))?.[1]);
    expect(left("lev-tenyear")).toBeLessThan(left("lev-cap"));
    expect(left("lev-cap")).toBeLessThan(left("lev-seed"));
    expect(left("lev-seed")).toBeLessThan(left("lev-survey"));
  });

  it("dates every figure in the key and calls the survey a floor, never a quote", () => {
    expect(text).toContain("Going-in cap 5.45%, the deal's own");
    expect(text).toContain(
      "30-yr fixed 6.95% (Freddie Mac's Primary Mortgage Market Survey® via FRED · MORTGAGE30US, Sep 17, 2026) — an owner-occupier floor investor debt usually prices above, never a quote",
    );
    expect(text).toContain(`Screening rate 6.94%: ${SEED.note}`);
    expect(text).toContain("10-yr Treasury 4.94% (FRED, Sep 17, 2026)");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says a screening rate under the owner-occupier survey is no quote, and only then", () => {
    expect(text).toContain(
      `${SEED.note}. The screening rate sits under the owner-occupier survey; as a rule of thumb, not a quote, a lender's rate is likely higher.`,
    );
    const over = visibleText(
      renderToStaticMarkup(
        React.createElement(LeverageTrack, {
          figures: { capPct: 5.45, survey: { pct: 6.5, source: "FRED · MORTGAGE30US", dated: "Sep 17, 2026" }, seed: SEED, tenYear: null },
        }),
      ),
    );
    expect(over).not.toContain("sits under the owner-occupier survey");
  });

  it("rounds the track's ends outward to the half percent, a scale rather than data", () => {
    // 4.94 to 6.95, padded by a tenth of the spread: 4.739 to 7.151.
    expect(text).toContain("4.5%");
    expect(text).toContain("7.5%");
    expect(text).not.toMatch(/4\.74%|7\.15%/);
  });

  it("draws nothing with no rate to set the cap against", () => {
    expect(
      renderToStaticMarkup(React.createElement(LeverageTrack, { figures: { capPct: 5.45, survey: null, seed: null, tenYear: null } })),
    ).toBe("");
  });
});

describe("the research panel's leverage check", () => {
  const props = {
    address: { label: "1500 Market St, Philadelphia, PA 19102", street: "1500 Market St", city: "Philadelphia", state: "PA", zip: "19102", county: "", submarket: "" },
    capText: "5.45%",
    assetClass: "multifamily",
    rateSeed: SEED,
    tenYear: { id: "DGS10", short: "10-yr Treasury", pct: 4.94, asOf: "2026-09-17", kind: "treasury" as const },
    survey30: { id: "MORTGAGE30US" as const, pct: 6.95, asOf: "2026-09-17", fresh: true },
    rules: [],
    benchmarks: [],
  };

  it("draws the track above the check's words, which stay as they were", () => {
    const html = renderToStaticMarkup(React.createElement(ResearchPanelView, props));
    const text = visibleText(html);
    expect(html).toContain('data-qa="leverage-track"');
    expect(count(html, "lev-cap")).toBe(1);
    expect(text).toContain("10-yr Treasury 4.94% (FRED, Sep 17, 2026)");
    expect(text).toContain("Negative leverage: going-in cap sits 150 bps below the 30-yr fixed");
    expect(text).toContain("Against the latest curve: the cap is 51 bps over the 10-year Treasury (4.94% on Sep 17, 2026, FRED).");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("draws nothing where the model's reads are withheld, and keeps the words", () => {
    const html = renderToStaticMarkup(React.createElement(ResearchPanelView, { ...props, readsWithheld: true }));
    expect(html).not.toContain('data-qa="leverage-track"');
    expect(html).not.toContain('data-bar="lev-');
    expect(visibleText(html)).toContain("Negative leverage: going-in cap sits 150 bps below the 30-yr fixed");
  });

  it("draws no track on a note, whose cap is withheld", () => {
    const html = renderToStaticMarkup(React.createElement(ResearchPanelView, { ...props, capText: null, capWithheld: "note" as const }));
    expect(html).not.toContain('data-bar="lev-');
    expect(html).toContain('data-qa="leverage-note"');
  });
});

describe("the data-bar markers are this picture's own", () => {
  it("no other source names them", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("git", ["grep", "--untracked", "-l", "-E", '"lev-', "--", "app", "lib"], { encoding: "utf8" });
    expect(out.split("\n").filter(Boolean).sort()).toEqual(["app/(app)/deals/[id]/leverage-track.tsx", "lib/leverage-track.render.test.ts"]);
  });
});
