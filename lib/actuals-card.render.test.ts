// Render smoke test for the Property actuals card: the OM figure is named
// for what it is, and a plan deal's note says which figure the T-12 is held
// against — or why nothing is compared at all.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compareNoi } from "@/lib/actuals/analyze";
import type { T12Summary } from "@/lib/actuals/types";
import { PropertyActuals } from "@/app/(app)/deals/[id]/property-actuals";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const T12: T12Summary = {
  collectedRent: 2_400_000,
  vacancyLoss: -120_000,
  otherIncome: 60_000,
  egi: 2_340_000,
  opex: [],
  totalOpex: 1_190_000,
  noi: 1_150_000,
  noiDerived: false,
};

const render = (props: Parameters<typeof PropertyActuals>[0]["data"]) =>
  renderToStaticMarkup(React.createElement(PropertyActuals, { data: props }));

describe("PropertyActuals — the OM figure is named for what it is", () => {
  it("a conversion's in-place figure is compared, and the note says why the pro forma is not", () => {
    const html = render({
      rentRoll: null,
      t12: { periodEnd: "2026-06-30", summary: T12 },
      noiComparison: compareNoi(1_200_000, 1_150_000, { label: "NOI (in-place)", basis: "in_place" }),
      noiNote:
        "A conversion: the T-12 is held against the OM's in-place NOI. The stabilized pro forma describes the finished project and is judged on yield on cost, never against today's actuals.",
    });
    expect(html).toContain("OM in-place NOI");
    expect(html).not.toContain("OM assumed NOI");
    expect(html).toContain("$1.20M");
    expect(html).toContain("$1.15M");
    expect(html).toContain("In line");
    expect(html).toContain("judged on yield on cost, never against today");
  });

  it("a stabilized asset's pro forma story is named as such", () => {
    const html = render({
      rentRoll: null,
      t12: { periodEnd: "2026-06-30", summary: T12 },
      noiComparison: compareNoi(1_300_000, 1_150_000, { label: "Stabilized NOI", basis: "stabilized" }),
      noiNote: null,
    });
    expect(html).toContain("OM pro forma NOI");
    expect(html).toContain("Red flag");
    expect(html).toContain("OM over actual");
  });

  it("with only the finished project's NOI stated there is no comparison, and the card says so", () => {
    const html = render({
      rentRoll: null,
      t12: { periodEnd: "2026-06-30", summary: T12 },
      noiComparison: null,
      noiNote:
        "A conversion: the OM states only the finished project's NOI, so there is nothing to hold the T-12 against until an in-place figure is stated. The stabilized pro forma is judged on yield on cost.",
    });
    expect(html).not.toContain("OM in-place NOI");
    expect(html).not.toContain("OM pro forma NOI");
    expect(html).toContain("nothing to hold the T-12 against");
  });

  it("reads an apartment roll per unit a month, as the memorandum does, and writes its dates as the page does (2026-09-30)", () => {
    // The research pass: the apartment sample's card said "Avg rent
    // $32.40/SF" and "Lease expiry (% of occupied SF)" where the memorandum
    // and the reconciler speak of "$2,400/mo", and printed "as of 2026-05-31".
    const apartments = {
      rentRoll: { asOf: SAMPLE_DEAL.rentRoll.as_of_date, summary: SAMPLE_DEAL.rentRoll.summary },
      t12: { periodEnd: SAMPLE_DEAL.t12.period_end_date, summary: SAMPLE_DEAL.t12.summary },
      noiComparison: null,
      assetClass: "multifamily",
    };
    const html = render(apartments);
    const text = visibleText(html);
    // $32.40/SF a year over 200,635 occupied SF ÷ 12 ÷ 225 units.
    expect(text).toMatch(/Avg rent\s*\$2,408\/unit\/mo/);
    expect(text).not.toContain("$32.40/SF");
    expect(text).not.toContain("Lease expiry");
    expect(text).toMatch(/as of May 31, 2026/);
    expect(text).toMatch(/TTM to May 31, 2026/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);

    // A summary stored before the monthly figure was read keeps the rent per
    // foot, with its period said.
    const { avgRentMonthly: _, ...older } = SAMPLE_DEAL.rentRoll.summary;
    void _;
    expect(visibleText(render({ ...apartments, rentRoll: { ...apartments.rentRoll, summary: older } }))).toMatch(
      /Avg rent\s*\$32\.40\/SF\/yr/,
    );
    // An average over fewer units than are occupied says so.
    const partial = { ...SAMPLE_DEAL.rentRoll.summary, rentUnits: 200 };
    expect(visibleText(render({ ...apartments, rentRoll: { ...apartments.rentRoll, summary: partial } }))).toMatch(
      /over 200 of 225 occupied units/,
    );
    // A roll with no stated as-of date says the screen date it was measured from, as a date.
    const undated = { ...SAMPLE_DEAL.rentRoll.summary, asOfUsed: "2026-09-08" };
    expect(visibleText(render({ ...apartments, rentRoll: { asOf: null, summary: undated } }))).toMatch(
      /measured at screen date Sep 8, 2026/,
    );
  });

  it("reads an office roll by the foot, with its expiry ladder", () => {
    const text = visibleText(
      render({
        rentRoll: { asOf: "2026-06-30", summary: SAMPLE_DEAL.rentRoll.summary },
        t12: null,
        noiComparison: null,
        assetClass: "office",
      }),
    );
    expect(text).toMatch(/Avg rent\s*\$32\.40\/SF/);
    expect(text).not.toContain("/unit/mo");
    expect(text).toContain("Lease expiry (% of occupied SF)");
    expect(text).toMatch(/as of Jun 30, 2026/);
  });

  it("an older comparison without a basis still reads 'OM assumed NOI'", () => {
    const html = render({
      rentRoll: null,
      t12: { periodEnd: "2026-06-30", summary: T12 },
      noiComparison: compareNoi(1_200_000, 1_150_000),
    });
    expect(html).toContain("OM assumed NOI");
  });
});
