// A reissued memorandum's new ask on the pipeline (research pass 24, B14).
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { priceChangeOf, priceChangePct, priceChangeWords } from "./price-change";
import { PriceChangeBadge } from "@/app/(app)/deals/price-change-badge";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const m = (label: string, value: string, basis?: string) => ({ label, value, ...(basis ? { basis } : {}) });
const prior = (metrics: ReturnType<typeof m>[]) => ({ at: "2026-09-03T14:00:00Z", extraction: { metrics }, verdict: null });

describe("priceChangeOf", () => {
  it("reads the ask's cut and its raise since the previous screen", () => {
    const cut = priceChangeOf(prior([m("Asking price", "$68,000,000")]), { metrics: [m("Asking price", "$65,000,000")] })!;
    expect(cut).toMatchObject({ direction: "cut", from: "$68,000,000", to: "$65,000,000", since: "2026-09-03T14:00:00Z" });
    expect(priceChangePct(cut)).toBe("4.4%");
    expect(priceChangeWords(cut)).toBe("Price cut 4.4% since the screen of Sep 3, 2026: $68,000,000 to $65,000,000");
    const raise = priceChangeOf(prior([m("Asking price", "$50,000,000")]), { metrics: [m("Asking price", "$56,000,000")] })!;
    expect(raise.direction).toBe("raise");
    expect(priceChangePct(raise)).toBe("12%");
  });

  it("says nothing where the ask did not move, moved by formatting noise, or the two screens read no comparable price", () => {
    expect(priceChangeOf(prior([m("Asking price", "$68,000,000")]), { metrics: [m("Asking price", "$68.0M")] })).toBeNull();
    expect(priceChangeOf(prior([m("Asking price", "$68,000,000")]), { metrics: [m("Asking price", "$68,100,000")] })).toBeNull();
    expect(priceChangeOf(prior([m("Going-in cap rate", "5.5%")]), { metrics: [m("Asking price", "$60,000,000")] })).toBeNull();
    // Two different figures that each could be "the price", on different
    // bases, are never set against each other.
    expect(
      priceChangeOf(prior([m("Price", "$68,000,000", "in_place")]), { metrics: [m("Purchase price", "$60,000,000", "stabilized")] }),
    ).toBeNull();
    expect(priceChangeOf(null, { metrics: [m("Asking price", "$65,000,000")] })).toBeNull();
  });
});

// Audit C8, M4: the two asks are compared only where they buy the same
// thing.
describe("a price for something else is no cut", () => {
  const interest = (kind: string, share = "") => ({ kind, summary: "", share, groundLease: "", loan: "", page: "" });
  const priorWith = (metrics: ReturnType<typeof m>[], i?: ReturnType<typeof interest>) => ({
    at: "2026-09-03T14:00:00Z",
    extraction: { metrics, ...(i ? { interest: i } : {}) },
    verdict: null,
  });

  it("the whole building to a 49% share of it, or to a note, or to the land, draws no badge", () => {
    const whole = priorWith([m("Asking price", "$68,000,000")]);
    expect(priceChangeOf(whole, { metrics: [m("Asking price", "$33,320,000")], interest: interest("partial_interest", "49% limited partnership interest") })).toBeNull();
    expect(priceChangeOf(whole, { metrics: [m("Asking price", "$50,000,000")], interest: interest("note") })).toBeNull();
    expect(priceChangeOf(whole, { metrics: [m("Asking price", "$20,000,000")], interest: interest("leased_fee") })).toBeNull();
    // a 49% share to a 30% share of the same entity
    const share49 = priorWith([m("Asking price", "$33,320,000")], interest("partial_interest", "49% limited partnership interest"));
    expect(priceChangeOf(share49, { metrics: [m("Asking price", "$20,400,000")], interest: interest("partial_interest", "30% limited partnership interest") })).toBeNull();
    // a share of the entity to a share of the general partner's interest
    expect(
      priceChangeOf(share49, { metrics: [m("Asking price", "$30,000,000")], interest: interest("partial_interest", "49% of the general partner interest") }),
    ).toBeNull();
  });

  it("the same thing bought keeps its badge: a fee simple read before the interest was, the same share, the same note", () => {
    const old = priorWith([m("Asking price", "$68,000,000")]);
    expect(priceChangeOf(old, { metrics: [m("Asking price", "$65,000,000")], interest: interest("fee_simple") })?.direction).toBe("cut");
    const share = priorWith([m("Asking price", "$33,320,000")], interest("partial_interest", "49% limited partnership interest"));
    expect(
      priceChangeOf(share, { metrics: [m("Asking price", "$31,000,000")], interest: interest("partial_interest", "49% limited partnership interest") })?.direction,
    ).toBe("cut");
    const note = priorWith([m("Asking price", "$50,000,000")], interest("note"));
    expect(priceChangeOf(note, { metrics: [m("Asking price", "$47,000,000")], interest: interest("note") })?.direction).toBe("cut");
  });
});

describe("the pipeline card carries the move", () => {
  it("reads the row's prior screen beside its extraction", async () => {
    const { pipelineCard } = await import("./pipeline-card");
    const card = pipelineCard(
      {
        id: "d1",
        name: "Harbor Point",
        asset_class: "multifamily",
        created_at: "2026-08-01T00:00:00Z",
        verdict: null,
        extraction: { dealName: "Harbor Point", assetClass: "multifamily", market: "", metrics: [m("Asking price", "$65,000,000")] },
        address: null,
        first_signal: null,
        user_id: "u1",
        team_id: null,
        stage: "screening",
        is_sample: false,
        prior_screen: prior([m("Asking price", "$68,000,000")]),
      },
      { viewerId: "u1", onTeam: false, box: null, offersDue: null, today: "2026-10-05", googleEnabled: false },
    );
    expect(card.priceChange?.direction).toBe("cut");
  });
});

describe("PriceChangeBadge", () => {
  it("draws the arrow and the share, the whole sentence for a screen reader, and nothing for no move", () => {
    const change = priceChangeOf(prior([m("Asking price", "$68,000,000")]), { metrics: [m("Asking price", "$65,000,000")] });
    const html = renderToStaticMarkup(React.createElement(PriceChangeBadge, { change }));
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(html).toContain("▼");
    expect(html).toContain("Price cut 4.4% since the screen of Sep 3, 2026");
    expect(renderToStaticMarkup(React.createElement(PriceChangeBadge, { change: null }))).toBe("");
  });
});
