import { describe, expect, it } from "vitest";
import { gapFigure, gapScale } from "./gap-detail";
import { SAMPLE_DEAL } from "./sample-deal";

describe("gapFigure — the magnitude a reconciliation gap states", () => {
  it("reads dollars in their usual shapes", () => {
    expect(gapFigure("$174k below the OM — heavier expense load")).toEqual({ value: 174_000, unit: "usd" });
    expect(gapFigure("−$120,000 vs the OM")).toEqual({ value: 120_000, unit: "usd" });
    expect(gapFigure("+$1.2M")).toEqual({ value: 1_200_000, unit: "usd" });
    expect(gapFigure("$45 per SF lighter")).toEqual({ value: 45, unit: "usd" });
  });

  it("reads basis points and percentages", () => {
    expect(gapFigure("300 bps higher, in line with in-place")).toEqual({ value: 300, unit: "bps" });
    expect(gapFigure("25 basis points tighter")).toEqual({ value: 25, unit: "bps" });
    expect(gapFigure("+4.2%")).toEqual({ value: 4.2, unit: "pct" });
    expect(gapFigure("about 3 percentage points below")).toEqual({ value: 3, unit: "pct" });
  });

  it("prefers the dollar figure when a line carries more than one yardstick", () => {
    expect(gapFigure("$174k (4.5%) below the OM")).toEqual({ value: 174_000, unit: "usd" });
  });

  it("reads nothing from agreement, a figureless note or an empty line", () => {
    expect(gapFigure("In agreement")).toBeNull();
    expect(gapFigure("Not modelled — the OM states no figure")).toBeNull();
    expect(gapFigure("")).toBeNull();
    expect(gapFigure(null)).toBeNull();
    expect(gapFigure(undefined)).toBeNull();
    // A year or a page is not a gap.
    expect(gapFigure("see p. 12")).toBeNull();
  });
});

describe("gapScale — each row on its own unit's track, signed by direction", () => {
  it("scales the sample's rows: a dollar gap and a bps gap each fill their own track, the neutral row draws none", () => {
    const scale = gapScale(SAMPLE_DEAL.reconciliation.rows);
    expect(scale.units).toEqual(["usd", "bps", null]);
    // Both are unfavorable to the buyer, each the widest of its unit.
    expect(scale.shares).toEqual([-1, -1, null]);
  });

  it("puts two gaps of one unit on one track and signs them by direction", () => {
    const scale = gapScale([
      { gap: "$200k below", direction: "unfavorable" },
      { gap: "$50k above", direction: "favorable" },
      { gap: "$100k", direction: "unfavorable" },
    ]);
    expect(scale.shares).toEqual([-1, 0.25, -0.5]);
    expect(scale.units).toEqual(["usd", "usd", "usd"]);
  });

  it("never mixes units and never draws a neutral or figureless row", () => {
    const scale = gapScale([
      { gap: "$1M light", direction: "unfavorable" },
      { gap: "50 bps wide", direction: "favorable" },
      { gap: "$1M light", direction: "neutral" },
      { gap: "Not modelled", direction: "unfavorable" },
    ]);
    expect(scale.shares).toEqual([-1, 1, null, null]);
    expect(gapScale([]).shares).toEqual([]);
  });
});
