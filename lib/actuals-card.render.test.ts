// Render smoke test for the Property actuals card: the OM figure is named
// for what it is, and a plan deal's note says which figure the T-12 is held
// against — or why nothing is compared at all.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compareNoi } from "@/lib/actuals/analyze";
import type { T12Summary } from "@/lib/actuals/types";
import { PropertyActuals } from "@/app/(app)/deals/[id]/property-actuals";

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

  it("an older comparison without a basis still reads 'OM assumed NOI'", () => {
    const html = render({
      rentRoll: null,
      t12: { periodEnd: "2026-06-30", summary: T12 },
      noiComparison: compareNoi(1_200_000, 1_150_000),
    });
    expect(html).toContain("OM assumed NOI");
  });
});
