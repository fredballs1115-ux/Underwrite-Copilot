// The sample deal's own pipeline card, drawn where the reader's pipeline is
// empty and wherever a page shows the sample's card (`DealTilePreview`): the
// pipeline's `DealTile` on lib/pipeline-card's card, its market photograph
// credited under it, and no control a preview cannot offer.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));

// The server actions the pipeline binds to forms — never called in a render.
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return { createDeal: noop, createDealFromBatch: noop, createManualDeal: noop, createSampleDeal: noop, setStage: noop };
});
import { DealTilePreview, Pipeline } from "@/app/(app)/deals/pipeline";
import { ToastProvider } from "@/app/(app)/toaster";
import { sampleDealCard } from "@/lib/pipeline-card";
import { dealAllowance } from "@/lib/deal-allowance";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const TODAY = "2026-10-16";
const render = (node: React.ReactElement) => renderToStaticMarkup(React.createElement(ToastProvider, null, node));
const card = sampleDealCard({ today: TODAY });

describe("the sample deal's card outside the pipeline", () => {
  it("draws the pipeline's card: its market's photograph and caption, the call, the figures, the fit", () => {
    const html = render(React.createElement(DealTilePreview, { d: card, href: "/demo", title: "Open the sample deal", todayIso: TODAY }));
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain("data-deal-tile=\"sample\"");
    expect(html).toContain('href="/demo"');
    expect(text).toContain(SAMPLE_DEAL.name);
    expect(text).toContain("Caution");
    expect(text).toContain(card.coveredMarket!);
    expect(text).toContain(card.slots.basis!);
    expect(text).toContain(card.slots.cap!);
    expect(text).toContain(String(card.score));
    // The market photograph, asked at the public skyline route, and no
    // deal's own route anywhere on the card.
    expect(html).toContain(card.pictures![0].src.replace(/&/g, "&amp;"));
    expect(html).not.toContain("/api/deals/");
    // The stage as words, never the stage control, and no photographs to flip.
    expect(html).toContain('data-qa="tile-stage"');
    expect(html).not.toContain("<select");
    expect(html).not.toContain('data-flip="photos"');
  });

  it("is a still card where no page is given: no button, no form, no link round the card (audit C7, L7)", () => {
    // A button round the card was invalid (its picture, name and figures are
    // block content) and read the whole card as its accessible name.
    const html = render(React.createElement(DealTilePreview, { d: card, note: "Sample deal", todayIso: TODAY }));
    expect(a11yIssues(html)).toEqual([]);
    expect(html).toContain('data-qa="tile-still"');
    expect(html).not.toMatch(/<button|<form|<a [^>]*href="\/(?:demo|deals)/);
    // Nothing to click, so nothing lifts on hover.
    expect(html).not.toContain("hover:-translate-y-0.5");
    expect(visibleText(html)).toContain("Sample deal");
  });
});

describe("the empty pipeline", () => {
  it("shows the sample's own card beside the ways in, in place of the drawing", () => {
    const html = render(
      React.createElement(Pipeline, {
        deals: [],
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: false, sampleId: null, hasScreenedOm: false },
        billing: { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 0, team: null }) },
        todayIso: TODAY,
        sampleCard: sampleDealCard({ today: TODAY, box: null }),
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-deal-tile="sample"');
    expect(text).toContain("Start your pipeline");
    expect(text).toContain("Try a sample deal");
    expect(text).toContain("Browse the covered markets");
    // One control adds the sample: the PendingButton beside the card, its
    // name short and its pending words said (app/(app)/pending-button). The
    // card is still, never a second button with the card's text as its name.
    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => visibleText(m[1]).trim());
    expect(buttons.filter((b) => /sample/i.test(b))).toEqual(["Try a sample deal"]);
    expect(html).toContain('data-qa="tile-still"');
    // No buy box, no fit: the card the reader's sample would show them.
    expect(html).not.toContain('data-qa="fit-checked"');
  });
});

// Audit C8, M6: the price's move sat inline after the price inside a
// truncating <dd> about 75–100px wide, so "$40–42M ▼4.4%" clipped the
// percentage. It is a line of its own under the price.
describe("the price's move on a card", () => {
  it("sits on its own line under the price, never inside the truncating figure", async () => {
    const { priceChangeOf } = await import("@/lib/price-change");
    const change = priceChangeOf(
      { at: "2026-10-16T09:00:00Z", extraction: { metrics: [{ label: "Asking price", value: "$42,000,000" }] }, verdict: null },
      { metrics: [{ label: "Asking price", value: "$40,150,000" }] },
    );
    expect(change?.direction).toBe("cut");
    const html = render(React.createElement(DealTilePreview, { d: { ...card, priceChange: change }, note: "Sample deal", todayIso: TODAY }));
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    const badge = html.match(/<dd class="mt-0\.5 leading-none" data-qa="tile-badge">([\s\S]*?)<\/dd>/);
    expect(badge?.[1]).toContain('data-qa="price-change"');
    // No truncating <dd> holds it.
    for (const dd of html.match(/<dd class="[^"]*truncate[^"]*"[^>]*>[\s\S]*?<\/dd>/g) ?? []) expect(dd).not.toContain("price-change");
    expect(visibleText(html)).toContain("since the last screen");
  });
});

// A card's footer: the offers-due deadline where one is set, else the day
// the deal was added, said as that — a bare date in the deadline's place
// had read as a deadline (the signed-in survey of 2026-10-17).
describe("a pipeline card's footer date", () => {
  const pipeline = (offersDue: string | null) =>
    render(
      React.createElement(Pipeline, {
        deals: [{ ...card, id: "d-footer", offersDue, createdAt: "2026-09-02T12:00:00Z" }],
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
        billing: { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 1, team: null }) },
        todayIso: TODAY,
        initialView: "cards",
      }),
    );

  it("says the day the deal was added as Added, never a bare date", () => {
    const html = pipeline(null);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    const added = html.match(/data-qa="tile-added">([\s\S]*?)<\/span><\/span>/)?.[1] ?? "";
    expect(visibleText(added).replace(/\s+/g, " ").trim()).toBe("Added Sep 2, 2026");
  });

  it("shows the deadline in its place where one is set, and no Added", () => {
    const html = pipeline("2026-10-20");
    expect(html).not.toContain('data-qa="tile-added"');
  });
});
