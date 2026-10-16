// The pipeline card's builder (lib/pipeline-card) on the sample deal: the
// card a reader's pipeline shows once they add the sample, which the empty
// pipeline and the public pages draw too — so it must be the pipeline's own
// card, read by the deal header's readers, and ask no deal's own route.
import { describe, expect, it } from "vitest";
import { pipelineCard, sampleDealCard } from "@/lib/pipeline-card";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { marketPictureFor } from "@/lib/market-picture";
import { metroForAddress } from "@/lib/market-match";
import { coverFor } from "@/lib/deal-cover";

const TODAY = "2026-10-16";

describe("the sample deal's pipeline card", () => {
  const card = sampleDealCard({ today: TODAY });

  it("leads with its market's photograph, named and credited as the market's", () => {
    const market = marketPictureFor(SAMPLE_DEAL.address, SAMPLE_DEAL.extraction.market, metroForAddress(SAMPLE_DEAL.address));
    expect(market?.id).toBe("philadelphia");
    expect(card.pictures).toHaveLength(1);
    const [lead] = card.pictures!;
    expect(lead.kind).toBe("market");
    expect(lead.marketId).toBe(market!.id);
    expect(lead.src).toBe(market!.src);
    expect(lead.credit).toBe(market!.credit);
    expect(lead.market).toBe(market!.name);
    expect(lead.marketCredit).toEqual({ place: market!.place, author: market!.author, license: market!.license });
  });

  it("asks no deal's own route: the sample states no street and stores no photograph", () => {
    const srcs = [...(card.pictures ?? []), ...(card.thumbs ?? []), ...(card.slides ?? [])].map((p) => p.src);
    expect(srcs.some((s) => s.startsWith("/api/deals/"))).toBe(false);
    expect(card.thumbs).toEqual([]);
    expect(card.photos).toBe(0);
  });

  it("wears its own cover where the photograph fails, seeded by its id", () => {
    expect(card.cover).toEqual(coverFor({ seed: "sample", assetClass: "multifamily", place: "Philadelphia, PA" }));
  });

  it("carries the call, the figures and the fit the deal header reads", () => {
    expect(card.verdict).toBe(SAMPLE_DEAL.verdict.verdict);
    expect(card.name).toBe(SAMPLE_DEAL.name);
    expect(card.coveredMarket).toBe(metroForAddress(SAMPLE_DEAL.address)?.name);
    const read = buyBoxRead(SAMPLE_DEAL.asset_class, dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address), SAMPLE_DEMO_BOX);
    expect(card.score).toBe(read.mandate?.score);
    expect(card.mandateVerdict).toBe(read.mandate?.verdict);
    expect(card.fitCoverage?.total).toBeGreaterThan(card.fitCoverage?.checked ?? 0);
    // The stated price and cap, the basis under the price.
    const stated = (label: RegExp) => SAMPLE_DEAL.extraction.metrics.find((m) => label.test(m.label))?.value;
    expect(card.slots.price).toBe(stated(/^asking price/i));
    expect(card.slots.cap).toBe(stated(/^going-in cap/i));
    expect(card.slots.basis).toMatch(/\/unit$/);
    expect(card.reading).toBe(false);
    expect(card.jobStatus).toBeNull();
  });

  it("is the card the pipeline builds for the sample's row", () => {
    const row = {
      id: "sample",
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      created_at: `${TODAY}T12:00:00.000Z`,
      verdict: SAMPLE_DEAL.verdict,
      extraction: SAMPLE_DEAL.extraction,
      address: SAMPLE_DEAL.address,
      first_signal: null,
      user_id: "",
      team_id: null,
      stage: "screening",
      is_sample: true,
    };
    expect(pipelineCard(row, { viewerId: null, onTeam: false, box: SAMPLE_DEMO_BOX, offersDue: null, today: TODAY, googleEnabled: false })).toEqual(card);
  });

  it("is judged against no box where the reader has none", () => {
    const bare = sampleDealCard({ today: TODAY, box: null });
    expect(bare.score).toBeNull();
    expect(bare.fit).toBeNull();
    expect(bare.hasBox).toBe(false);
  });
});
