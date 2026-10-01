// Render smoke tests for the signed-in views a crawl never reaches: the
// pipeline (the first screen every account opens), the model tab and the
// compare table. Each is rendered statically on a fixture that carries
// every shape the real data takes — a stabilized asset, a conversion with a
// yield on cost, a development priced at its land, an office deal, a deal
// still screening, a failed job, a dead deal, a teammate's deal — and the
// visible text is read for a runtime error, a sentence glued to a number, a
// word doubled; the markup for an image with no alt, a button or link with
// no accessible name, a form control with no label, an id used twice. Same
// components, same props the server pages hand them.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect() is not expected in a static render");
  },
}));

// The server actions the views bind to forms — never called in a render.
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return {
    createDeal: noop,
    createDealFromBatch: noop,
    createManualDeal: noop,
    updateManualFacts: noop,
    createSampleDeal: noop,
    setStage: noop,
    setOffersDue: noop,
    renameDeal: noop,
    deleteDeal: noop,
    rerunAnalysis: noop,
    replaceOm: noop,
    reconcileWithModel: noop,
    addDealNote: noop,
    deleteDealNote: noop,
    replacePicture: noop,
  };
});

import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ModelView } from "@/app/(app)/deals/[id]/model-view";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { CARD, THUMB, bannerSources } from "@/lib/deal-banner";
import { coverFor } from "@/lib/deal-cover";
import { marketPictureFor } from "@/lib/market-picture";
import { landingView, remembersView } from "@/lib/pipeline-view";
import { dealAllowance } from "@/lib/deal-allowance";
import { ToastProvider } from "@/app/(app)/toaster";
import { ScoredFeedView, type AlertRow, type ItemRow } from "@/app/(app)/news/scored-feed";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { capSpreadRead, leverageRead } from "@/lib/leverage";
import { a11yIssues, dumpView, gluedWords, positionConflicts, visibleText } from "./render-lint";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(ToastProvider, null, node));
}

const card = (over: Partial<DealCard> & Pick<DealCard, "id" | "name">): DealCard => ({
  assetClass: "multifamily",
  createdAt: "2026-09-01T12:00:00Z",
  verdict: null,
  stage: "screening",
  addedBy: null,
  fit: null,
  score: null,
  mandateVerdict: null,
  market: "North Dallas, TX",
  coveredMarket: "Dallas–Fort Worth",
  offersDue: null,
  slots: { cap: null, price: null, yoc: null },
  jobStatus: null,
  hasAddress: true,
  ...over,
});

// Each deal sits on a real rung of the ladder (lib/stages): the fixture's
// "underwriting" and "loi" were no stage at all, so every deal folded onto
// Screening and the funnel's middle rungs were never drawn lit. One deal a
// middle rung: Harbor View tracking, the Maddox in active pursuit, 1400
// Market's LOI submitted, Elm Street Lofts under contract.
const CARDS: DealCard[] = [
  // A renovation program stated a door at a time (#460).
  card({ id: "a", name: "The Maddox at Brewerytown", verdict: "caution", stage: "active_pursuit", fit: "near", score: 71, mandateVerdict: "WATCH", slots: { cap: "5.6%", price: "$68,000,000", yoc: null, valueAdd: "Reno $250/mo, 20% on cost", basis: "$274k/unit" }, offersDue: "2026-09-30" }),
  card({ id: "b", name: "1400 Market — office to residential", verdict: "pass", stage: "loi_submitted", fit: "fits", score: 88, mandateVerdict: "PURSUE", slots: { cap: null, price: "$20,000,000", yoc: "11.7%" }, market: "Center City, Philadelphia, PA", coveredMarket: "Philadelphia" }),
  // Frisco names no place the Dallas market's list knows: its county placed it (#447).
  card({ id: "c", name: "Riverbend Site — 240 units", verdict: "pass", stage: "screening", fit: "outside", score: 42, mandateVerdict: "PASS", slots: { cap: null, price: "$4,000,000", yoc: "7.2%" }, market: "Frisco, TX", coveredMarket: null, readMarket: "Dallas–Fort Worth", readCounty: "Collin County, TX" }),
  // A deal in a metro area the site reads without a brief: named as read, not briefed.
  // …and it carries the seller's loan, offered for assumption (#419).
  card({ id: "p", name: "Strip District Lofts", verdict: "pass", stage: "screening", fit: "near", score: 60, mandateVerdict: "WATCH", slots: { cap: "6.4%", price: "$18,000,000", yoc: null, debt: "Assumable 3.45%", abatement: "Tax abated, 4 yrs left, +$450k/yr" }, market: "Strip District, Pittsburgh, PA", coveredMarket: null, readMarket: "Pittsburgh PA" }),
  card({ id: "d", name: "Tysons Corner Plaza", assetClass: "office", verdict: "pass_on", stage: "dead", fit: "outside", score: 18, mandateVerdict: "PASS", slots: { cap: "8.1%", price: "$60,000,000", yoc: null }, market: "Tysons, VA", coveredMarket: "Northern Virginia" }),
  // …sold at auction, the figure the opening bid (#456), beside an anchor
  // that is not in the sale and a roll before the model's (#457).
  card({ id: "e", name: "Logan Square Retail", assetClass: "retail", verdict: null, stage: "screening", jobStatus: "running", slots: { cap: null, price: "$12,500,000", yoc: null, sale: "Auction, 5% premium", roster: "Shadow-anchored, 56% rolls in 5 yrs" }, market: "Chicago, IL", coveredMarket: "Chicago", hasAddress: false }),
  // A hotel sold encumbered by its manager, with the brand's PIP (#455).
  card({ id: "f", name: "Courtyard Newark Airport", assetClass: "hospitality_str", verdict: null, stage: "screening", jobStatus: "failed", slots: { cap: null, price: null, yoc: null, hotel: "Mgmt encumbered, PIP $35k/key" }, market: "Newark, NJ", coveredMarket: "Northern New Jersey" }),
  // A 49% LP interest: the row says what the price buys beside the figure.
  card({ id: "g", name: "Harbor View Apartments", verdict: "caution", stage: "tracking", addedBy: "Jordan Lee", fit: "fits", score: 79, mandateVerdict: "PURSUE", slots: { cap: "5.9%", price: "$41,250,000", yoc: null, interest: "49% share" }, market: "Baltimore, MD", coveredMarket: "Baltimore" }),
  card({ id: "h", name: "Sample — The Maddox at Brewerytown", verdict: "caution", stage: "screening", fit: "near", score: 71, mandateVerdict: "WATCH", slots: { cap: "5.6%", price: "$68,000,000", yoc: null }, market: "Brewerytown, Philadelphia, PA", coveredMarket: "Philadelphia" }),
  // A note the seller will carry (#462).
  card({ id: "i", name: "Lakewood Self Storage", assetClass: "self_storage", verdict: "pass", stage: "closed", fit: null, slots: { cap: "6.4%", price: "$9,800,000", yoc: null, sellerNote: "Seller financing 5.00%" }, market: "Lakewood, CO", coveredMarket: null }),
  card({ id: "j", name: "Unpriced land — Route 1 parcel", verdict: "caution", stage: "screening", fit: null, slots: { cap: null, price: null, yoc: null }, market: "Laurel, MD", coveredMarket: "Baltimore" }),
  // A run whose process died mid-screen, and a re-screen that failed before
  // its verdict — the stored verdict must not read as the current call.
  // …and one tenant leasing the whole building (#454), priced as guidance:
  // a range stays a range (#466).
  card({ id: "k", name: "Arlington Flex Park", assetClass: "industrial", stage: "screening", jobStatus: "stalled", slots: { cap: null, price: "$9,000,000 – $9,500,000", yoc: null, tenancy: "Single tenant, 6 yrs left" }, market: "Arlington, TX", coveredMarket: "Dallas–Fort Worth", hasAddress: false }),
  // …and a LIHTC regulatory agreement on three units in four (#453).
  card({ id: "l", name: "Elm Street Lofts", verdict: "pass", stage: "under_contract", jobStatus: "failed", fit: "fits", score: 84, mandateVerdict: "PURSUE", slots: { cap: "6.0%", price: "$14,000,000", yoc: null, affordable: "LIHTC, 75% restricted" }, market: "Dallas, TX", coveredMarket: "Dallas–Fort Worth", flood: { tag: "Flood AE", cell: "AE (SFHA)" } }),
];

const BILLING = { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 1, team: null }) };

/**
 * The cards as the pipeline page hands them over (#442): each row's
 * thumbnail sources at its own frame, no overhead among them, and each
 * deal's cover. The Maddox has a memorandum nobody has read the cover of
 * yet; 1400 Market has its own photograph.
 */
const withThumbs = (cards: DealCard[]): DealCard[] =>
  cards.map((c) => ({
    ...c,
    thumbs: bannerSources(
      {
        dealId: c.id,
        pictureCredit: c.id === "b" ? "Photograph added to the deal" : null,
        memorandumUnread: c.id === "a",
        googleEnabled: false,
        hasStreetAddress: c.hasAddress,
        hasAddress: c.hasAddress,
        aerial: false,
      },
      THUMB,
    ),
    cover: coverFor({ seed: c.id, assetClass: c.assetClass, place: c.market || null }),
  }));

/** The stage funnel's rungs as the markup draws them: each button's title
 *  ("Tracking · 1 deal") and whether it can be tapped, in ladder order. */
function funnelRungs(html: string): { title: string; disabled: boolean; markup: string }[] {
  const funnel = html.match(/<ol[^>]*aria-label="Deals by stage"[^>]*>[\s\S]*?<\/ol>/)?.[0] ?? "";
  return [...funnel.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    title: m[1].match(/title="([^"]*)"/)?.[1] ?? "",
    disabled: /\sdisabled=""/.test(m[1]),
    markup: m[0],
  }));
}

/** The picture-width tiers a chip or a tag line is drawn at, read back from
 *  its container-query classes (lib/pipeline-tags `PICTURE_TIERS`: under
 *  278px, from 278, from 348). */
function shownAtTiers(cls: string): boolean[] {
  let on = !/(^|\s)hidden(\s|$)/.test(cls);
  const out = [on];
  for (const w of [278, 348]) {
    if (cls.includes(`@min-[${w}px]/card:hidden`)) on = false;
    if (cls.includes(`@min-[${w}px]/card:block`) || cls.includes(`@min-[${w}px]/card:flex`)) on = true;
    out.push(on);
  }
  return out;
}

/** Each card's chips — on its picture, and on its line under the figures —
 *  with the tiers each is drawn at (a line's chip only where its line is). */
function cardChips(html: string): Map<string, { text: string; where: "picture" | "line"; tiers: boolean[]; cls: string }[]> {
  const cards = new Map<string, { text: string; where: "picture" | "line"; tiers: boolean[]; cls: string }[]>();
  const chipsIn = (markup: string) => [...markup.matchAll(/<span title="[^"]*" class="([^"]*)">([^<]*)<\/span>/g)].map((m) => ({ cls: m[1], text: m[2].replace(/&amp;/g, "&") }));
  for (const part of html.split(/(?=<li [^>]*data-deal-tile=")/).slice(1)) {
    const id = part.match(/data-deal-tile="([^"]+)"/)?.[1] ?? "";
    const list: { text: string; where: "picture" | "line"; tiers: boolean[]; cls: string }[] = [];
    const picture = part.match(/data-tags="picture">([\s\S]*?<\/span>)<\/span>/)?.[1] ?? "";
    for (const c of chipsIn(picture)) list.push({ ...c, where: "picture", tiers: shownAtTiers(c.cls) });
    const line = part.match(/<p class="([^"]*)" data-tags="line">([\s\S]*?)<\/p>/);
    if (line) {
      const lineAt = shownAtTiers(line[1]);
      for (const c of chipsIn(line[2])) list.push({ ...c, where: "line", tiers: shownAtTiers(c.cls).map((on, k) => on && lineAt[k]) });
    }
    if (list.length) cards.set(id, list);
  }
  return cards;
}

describe("Pipeline — every card shape renders and reads clean", () => {
  it("renders the pipeline with twelve deals in every state", () => {
    const html = render(
      React.createElement(Pipeline, {
        deals: withThumbs(CARDS),
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: "h", hasScreenedOm: true },
        billing: BILLING,
        initialView: "list",
      }),
    );
    expect(html.length).toBeGreaterThan(5_000);
    dumpView("pipeline", html);
    expect(a11yIssues(html), "a11y pipeline").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // The ladder as the fixture fills it: every live rung drawn with its
    // count and a filter to tap, the four middle rungs included (the dead
    // deal has its own toggle and no rung) — and a section of the list a
    // stage, each under its own name with its count.
    expect(funnelRungs(html).map((r) => [r.title, r.disabled])).toEqual([
      ["Screening · 7 deals", false],
      ["Tracking · 1 deal", false],
      ["Active pursuit · 1 deal", false],
      ["LOI submitted · 1 deal", false],
      ["Under contract / DD · 1 deal", false],
      ["Closed · 1 deal", false],
    ]);
    for (const r of funnelRungs(html).slice(1, 5)) expect(r.markup, r.title).toMatch(/bg-brand\/10 text-brand[^"]*">1</);
    for (const [label, n] of [["Screening", 7], ["Tracking", 1], ["Active pursuit", 1], ["LOI submitted", 1], ["Under contract / DD", 1], ["Closed", 1]] as const) {
      expect(html, label).toMatch(new RegExp(`aria-expanded="true"[^>]*>[\\s\\S]{0,600}?>${label}</span><span[^>]*>${n}</span>`));
    }
    // Every live deal is on the page under its own name; the dead one is
    // folded away until asked for.
    for (const c of CARDS) {
      if (c.stage === "dead") continue;
      expect(text, c.name).toContain(c.name);
    }
    // The plan deals show their yield on cost where a cap would sit, the
    // stabilized ones their cap; the teammate's deal names who added it.
    expect(text).toContain("11.7%");
    expect(text).toContain("5.6%");
    // Guidance stated as a range shows as one, never its bottom alone (#466).
    expect(text).toContain("$9–9.5M");
    expect(text).not.toContain("$9.0M");
    expect(text).toContain("Jordan Lee");
    // A deal in a metro area the site reads without a brief says so on its
    // row — read, not briefed — where a covered market's says covered.
    expect(text).toContain("Pittsburgh PA · read");
    // A deal in FEMA's Special Flood Hazard Area says so on its row (#426).
    expect(text).toContain("Flood AE");
    expect(html).toContain("FEMA&#x27;s Special Flood Hazard Area");
    expect(html).toContain("Pittsburgh PA is read, not briefed");
    // A deal its county placed names the county rather than "read" (#447).
    expect(text).toContain("Dallas–Fort Worth · Collin County");
    expect(html).toContain("Collin County, TX lies in the Dallas–Fort Worth metro area");
    expect(html).toContain("Dallas–Fort Worth is a covered market");
    // The stalled run and the failed re-screen each say so in the status
    // column; the failed one's stored "Go" does not stand in for the call.
    expect(text).toContain("Stalled");
    expect(text).toContain("Failed");
    expect(text).not.toMatch(/Elm Street Lofts[^]*?\bGo\b[^]*?Arlington Flex Park|Elm Street Lofts[\s\S]{0,400}\bGo\b/);
    // The mandate fit is drawn, not said: the six scored live deals (the
    // dead one is folded away) each draw the bar twice — once in the `lg`
    // score column, once on the line the narrower widths show — and the
    // words a screen reader gets appear once per deal, not once per meta
    // line as they did when the fit was a word the truncation cut first.
    // (seven now: the Pittsburgh deal, read without a brief, is scored too)
    expect((html.match(/data-fit-bar/g) ?? []).length).toBe(14);
    expect((html.match(/Fit 71 · Watch/g) ?? []).length).toBe(2);
    expect((html.match(/Fit 60 · Watch/g) ?? []).length).toBe(1);
    expect((html.match(/Fit 88 · Pursue/g) ?? []).length).toBe(1);
    expect((html.match(/Fit 42 · Outside box/g) ?? []).length).toBe(1);
    // Every row keeps a picture slot of the same size, so the names line
    // up, and none of them is a map (#442): the deal with its own
    // photograph shows it, the memorandum nobody has looked in yet is
    // searched over its cover, and every other row wears its cover — the
    // two with no address (Logan Square, Arlington Flex Park) included.
    // The dead one is folded away.
    expect((html.match(/data-deal-thumb="photo"/g) ?? []).length).toBe(1);
    expect((html.match(/data-deal-thumb="cover"/g) ?? []).length).toBe(11);
    expect((html.match(/data-deal-thumb="blank"/g) ?? []).length).toBe(0);
    expect(html).not.toContain("/aerial?");
    expect(html).toContain('src="/api/deals/b/picture?size=thumb"');
    expect(html).toMatch(/<img[^>]*data-lift="photo"[^>]*>/);
    // The cover under a loading photograph is laid over the slot, never in
    // it (#448): positioned twice, it took the slot and pushed the row's
    // photograph out of sight.
    expect(positionConflicts(html)).toEqual([]);
    // …at every width (#420): the picture was hidden on a phone. The row's
    // call leads the price line there instead of taking a column from the
    // name — the column is hidden below `sm`, so each live row carries its
    // call once for each width (one stalled run, two failed ones).
    const rows = (html.match(/data-deal-thumb=/g) ?? []).length;
    expect((html.match(/class="flex shrink-0 sm:hidden"/g) ?? []).length).toBe(rows);
    expect((html.match(/class="hidden w-24 shrink-0 justify-end sm:flex"/g) ?? []).length).toBe(rows);
    expect((html.match(/>Stalled</g) ?? []).length).toBe(2);
    expect((html.match(/>Failed</g) ?? []).length).toBe(4);
    // The two exports travel together at the filter row's right edge.
    expect(html).toMatch(/class="flex items-center gap-2 md:ml-auto"/);
    // A stored class prints its words: the storage deal's row and the
    // asset filter both say "Self-storage", and the key never shows.
    expect(text).toContain("Self-storage");
    expect(text).not.toMatch(/self_storage|Self_storage/);
    // A deal's tags are said once, on a line of their own under its
    // figures (lib/pipeline-tags), drawn at every width — no breakpoint
    // hides the line and no chip truncates — and the price line a phone
    // truncates holds the figures alone: it had read "$41.3M · 49% share ·
    // 5…", the cap cut, and from `md` up the tags rode a meta line that
    // cut them off whole.
    const tagLines = html.match(/<p class="[^"]*" data-tags="line">[\s\S]*?<\/p>/g) ?? [];
    expect(tagLines).toHaveLength(8);
    for (const line of tagLines) {
      expect(line.match(/class="([^"]*)"/)?.[1]).toBe("flex-wrap gap-1 col-start-2 mt-1.5 flex");
      expect(line).not.toMatch(/truncate|hidden/);
    }
    const priceLines = html.match(/<div class="mt-1 flex items-center gap-2 md:hidden">[\s\S]*?<\/div>/g) ?? [];
    expect(priceLines.length).toBeGreaterThan(0);
    for (const l of priceLines) expect(visibleText(l)).not.toMatch(/share|Assumable|LIHTC|tenant|Mgmt|Auction|Shadow|Reno|abated|Seller financing|Flood/);
    expect(visibleText(priceLines.find((l) => l.includes("$41.3M")) ?? "").replace(/\s+/g, " ")).toContain("$41.3M · 5.9% cap");
    // A share's price is said as a share's under the figure, and the wide
    // price column's tooltip carries it too; a deal bought outright says
    // nothing more.
    expect((text.match(/49% share/g) ?? []).length).toBe(1);
    expect(html).toContain("49% share: the price does not buy the building outright");
    expect(html).toContain('title="$41,250,000 — 49% share"');
    // The seller's loan offered for assumption (#419); a deal financed
    // fresh says nothing.
    expect((text.match(/Assumable 3\.45%/g) ?? []).length).toBe(1);
    expect(html).toContain("Assumable 3.45%: the seller&#x27;s loan is offered for assumption");
    // A covenant on the rents (#453); a market-rate deal says nothing.
    expect((text.match(/LIHTC, 75% restricted/g) ?? []).length).toBe(1);
    expect(html).toContain("LIHTC, 75% restricted: a covenant or a contract sets these rents");
    // One tenant's lease (#454); a multi-tenant deal says nothing.
    expect((text.match(/Single tenant, 6 yrs left/g) ?? []).length).toBe(1);
    expect(html).toContain("Single tenant, 6 yrs left: one lease is the whole income");
    // What a hotel is sold with (#455).
    expect((text.match(/Mgmt encumbered, PIP \$35k\/key/g) ?? []).length).toBe(1);
    expect(html).toContain("Mgmt encumbered, PIP $35k/key: what the hotel is sold with");
    // How the property is sold (#456): the figure beside it is where the
    // bidding opens, not a price.
    expect((text.match(/Auction, 5% premium/g) ?? []).length).toBe(1);
    expect(html).toContain("Auction, 5% premium: the figure is where the bidding opens or the seller is not an owner");
    // The listed tenants (#457): an anchor not in the sale, and the rent
    // rolling before the model's.
    expect((text.match(/Shadow-anchored, 56% rolls in 5 yrs/g) ?? []).length).toBe(1);
    expect(html).toContain("Shadow-anchored, 56% rolls in 5 yrs: the listed tenants against the model&#x27;s sale");
    // A renovation program (#460): the premium and the memorandum's own
    // return on cost.
    expect((text.match(/Reno \$250\/mo, 20% on cost/g) ?? []).length).toBe(1);
    expect(html).toContain("Reno $250/mo, 20% on cost: the renovation program as stated");
    // A tax abatement (#461): the years left and the step-up when it ends.
    expect((text.match(/Tax abated, 4 yrs left, \+\$450k\/yr/g) ?? []).length).toBe(1);
    expect(html).toContain("Tax abated, 4 yrs left, +$450k/yr: the NOI is on an abated tax bill");
    // A note the seller will carry (#462).
    expect((text.match(/Seller financing 5\.00%/g) ?? []).length).toBe(1);
    expect(html).toContain("Seller financing 5.00%: the seller offers to carry financing");
    // A flood zone (#426) rides the same line, in the warning's red.
    expect((text.match(/Flood AE/g) ?? []).length).toBe(1);
  });

  it("names every rung of the funnel, an empty one included, for sight and for a screen reader", () => {
    // Two deals, on two middle rungs: four rungs stand empty.
    const html = render(
      React.createElement(Pipeline, {
        deals: withThumbs(CARDS.slice(0, 2)),
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
        billing: BILLING,
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    const rungs = funnelRungs(html);
    expect(rungs.map((r) => [r.title, r.disabled])).toEqual([
      ["Screening · 0 deals", true],
      ["Tracking · 0 deals", true],
      ["Active pursuit · 1 deal", false],
      ["LOI submitted · 1 deal", false],
      ["Under contract / DD · 0 deals", true],
      ["Closed · 0 deals", true],
    ]);
    const names = ["Screening", "Tracking", "Pursuit", "LOI", "Contract", "Closed"];
    rungs.forEach((r, k) => {
      // The name is drawn at every width: an empty rung's label was
      // `hidden` below `sm`, a blank circle a screen reader called "0 deals".
      const label = r.markup.match(/<span class="([^"]*)">([^<]*)<\/span><span class="sr-only">/);
      expect(label?.[2], r.title).toBe(names[k]);
      expect(label?.[1], r.title).not.toMatch(/(^|\s)hidden(\s|$)/);
      // What a screen reader hears: the name, then the count — the disc
      // that draws the count is hidden from it.
      const heard = visibleText(r.markup.replace(/<span aria-hidden="true"[^>]*><span[^>]*>[^<]*<\/span><\/span>/, ""));
      expect(heard.replace(/\s+/g, " ").trim(), r.title).toBe(`${names[k]} ${r.disabled ? "0 deals" : "1 deal"}`);
    });
    // The six share the width, but none is ever narrower than its own name
    // (a phone, or beside the calls' split at `lg`, cut "Screening" short).
    expect((html.match(/<li class="relative min-w-max flex-1">/g) ?? []).length).toBe(6);
  });

  it("draws the pipeline as photograph-led cards by default: the building's picture, the call over it, the three figures (#428)", () => {
    // Each deal's pictures as the page resolves them: the Maddox has a
    // memorandum nobody has read the cover of yet, 1400 Market its own
    // photograph, and no overhead for anyone (#442) — the rest wear their
    // covers, the two with no address included.
    const withPictures = CARDS.map((c) => ({
      ...c,
      pictures: bannerSources(
        {
          dealId: c.id,
          pictureCredit: c.id === "b" ? "Photograph added to the deal" : null,
          memorandumUnread: c.id === "a",
          googleEnabled: false,
          hasStreetAddress: c.hasAddress && c.id !== "h",
          hasAddress: c.hasAddress,
          aerial: false,
        },
        CARD,
      ),
      cover: coverFor({ seed: c.id, assetClass: c.assetClass, place: c.market || null }),
      // The deal with its own photograph holds five on its page (#448),
      // four of them flipped through on the card (#450).
      photos: c.id === "b" ? 5 : 0,
      slides:
        c.id === "b"
          ? [3, 5, 8, 11].map((page, k) => ({
              kind: "photo" as const,
              src: `/api/deals/b/picture?size=hero&g=${k + 1}`,
              credit: `From the offering memorandum, page ${page}`,
              alt: `Photograph from page ${page} of the memorandum for ${c.name}`,
            }))
          : [],
    }));
    const html = render(
      React.createElement(Pipeline, {
        deals: withPictures,
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: "h", hasScreenedOm: true },
        billing: BILLING,
      }),
    );
    dumpView("pipeline-cards", html);
    expect(a11yIssues(html), "a11y pipeline cards").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-view="cards"');
    expect(html).not.toContain('data-view="list"');
    // The price by the unit under the price, as a listing card prints it
    // (#469) — only where the deal has one.
    expect(text).toContain("$274k/unit");
    expect((html.match(/data-qa="tile-sub"/g) ?? []).length).toBe(1);
    // A card a live deal (the dead one is folded away), each under its name.
    const live = CARDS.filter((c) => c.stage !== "dead");
    expect((html.match(/data-deal-tile=/g) ?? []).length).toBe(live.length);
    for (const c of live) expect(text, c.name).toContain(c.name);
    // The first picture each card shows: the deal's own photograph, else its
    // cover (#442) — its gradient, its building type and its place, named
    // as having no photograph yet. Never a map, and never the blank plate.
    expect(html).toContain('src="/api/deals/b/picture?size=hero"');
    expect(html).not.toContain("/aerial?");
    expect(html).not.toContain('data-picture="banner-pin"');
    expect((html.match(/data-deal-banner="blank"/g) ?? []).length).toBe(0);
    expect((html.match(/data-deal-banner="cover"/g) ?? []).length).toBe(live.length - 1);
    expect(html).toContain('data-deal-cover="housing"');
    expect(html).toContain('data-deal-cover="storage"');
    expect((text.match(/No photo yet/g) ?? []).length).toBe(live.length - 1);
    // A photograph shows only once it has loaded whole (#446), over the
    // deal's cover without its words, and the first cards on screen are
    // fetched at once, ahead of the rest.
    const photo = html.match(/<img[^>]*src="\/api\/deals\/b\/picture\?size=hero"[^>]*>/)?.[0] ?? "";
    expect(photo).toContain("opacity-0");
    expect(photo).toContain('loading="eager"');
    expect(photo).toContain('fetchPriority="high"');
    expect(photo).toContain("motion-safe:group-hover:scale-[1.03]");
    expect((html.match(/data-deal-cover=/g) ?? []).length).toBe(live.length);
    expect(positionConflicts(html)).toEqual([]);
    // Over the deal's own photograph, the card counts the photographs its
    // deal page holds (#448), and a reader hears the word; nowhere else.
    expect((html.match(/data-picture="photo-count"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/data-picture="photo-count"[^>]*>[\s\S]*?<span>5<\/span><span class="sr-only"> photographs<\/span>/);
    // …and flips through them there (#450): two arrows over the picture,
    // outside the card's link, named for the deal, and a dot a photograph.
    const flip = html.match(/<div data-flip="photos"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(flip).not.toBe("");
    expect((html.match(/data-flip="photos"/g) ?? []).length).toBe(1);
    expect(flip).toContain('aria-label="Previous photo of 1400 Market — office to residential"');
    expect(flip).toContain('aria-label="Next photo of 1400 Market — office to residential"');
    expect((flip.match(/rounded-full shadow-sm bg-white/g) ?? []).length).toBe(5);
    expect(html).toMatch(/<\/a><div data-flip="photos"/);
    // Nothing is asked for before it is wanted: the other photographs load
    // on a flip, never with the page.
    expect(html).not.toContain("picture?size=hero&amp;g=");
    // A memorandum nobody has read the cover of yet is searched OVER the
    // next picture (#440): the Maddox shows its cover at once, and the
    // memorandum's is asked for on top of it, unseen and unannounced until
    // it loads, then fades in under its own credit.
    const lifted = html.match(/<img[^>]*data-lift="photo"[^>]*>/g) ?? [];
    expect(lifted).toHaveLength(1);
    expect(lifted[0]).toContain('src="/api/deals/a/picture?size=hero"');
    expect(lifted[0]).toContain('alt=""');
    expect(lifted[0]).toContain('aria-hidden="true"');
    expect(lifted[0]).toContain("opacity-0");
    // The credit follows the picture on screen.
    expect(text).not.toContain("From the offering memorandum");
    expect(text).toContain("Photograph added to the deal");
    expect(text).not.toContain("Imagery: USGS The National Map");
    // The call rides on the picture, once a card: the failed re-screen and
    // the failed run each say Failed, the stalled one Stalled.
    expect((html.match(/>Failed</g) ?? []).length).toBe(2);
    expect((html.match(/>Stalled</g) ?? []).length).toBe(1);
    expect(text).toContain("Screening…");
    // What the picture must not hide is chipped on it where the chip fits
    // whole, and waits on the card's line under the figures where it does
    // not (lib/pipeline-tags): every tag shows exactly once at each width
    // the cards are drawn at, and no chip truncates — the picture's had
    // cut "Shadow-anchored, 56% rolls in 5 …" at 390px.
    const chips = cardChips(html);
    expect([...chips.values()].flat().map((c) => c.text).filter((t, k, all) => all.indexOf(t) === k).sort()).toEqual(
      ["49% share", "Assumable 3.45%", "Auction, 5% premium", "Flood AE", "LIHTC, 75% restricted", "Mgmt encumbered, PIP $35k/key", "Reno $250/mo, 20% on cost", "Seller financing 5.00%", "Shadow-anchored, 56% rolls in 5 yrs", "Single tenant, 6 yrs left", "Tax abated, 4 yrs left, +$450k/yr"],
    );
    for (const [id, list] of chips) {
      for (const t of new Set(list.map((c) => c.text))) {
        expect([0, 1, 2].map((k) => list.filter((c) => c.text === t && c.tiers[k]).length), `${id}: ${t}`).toEqual([1, 1, 1]);
      }
      for (const c of list) expect(c.cls, `${id}: ${c.text}`).not.toContain("truncate");
    }
    const where = (id: string, t: string) => [0, 1, 2].map((k) => chips.get(id)?.find((c) => c.text === t && c.tiers[k])?.where);
    // Short chips ride on every picture.
    expect(where("l", "Flood AE")).toEqual(["picture", "picture", "picture"]);
    expect(where("g", "49% share")).toEqual(["picture", "picture", "picture"]);
    expect(where("p", "Assumable 3.45%")).toEqual(["picture", "picture", "picture"]);
    // The chip found cut — 206.6px drawn, more room than any picture has —
    // never rides on one.
    expect(where("e", "Shadow-anchored, 56% rolls in 5 yrs")).toEqual(["line", "line", "line"]);
    // A chip whole only on the wider pictures rides on them, and waits on
    // the line under the figures on the narrower.
    expect(where("e", "Auction, 5% premium")).toEqual(["line", "picture", "picture"]);
    expect(where("p", "Tax abated, 4 yrs left, +$450k/yr")).toEqual(["line", "line", "picture"]);
    // The card's rows are the grid row's own, so a row of cards lines up
    // its figures whichever carry tags under them; the picture and the tag
    // row each ask their own width (a container cannot be a subgrid).
    expect((html.match(/<li [^>]*class="group relative row-span-5 grid grid-rows-subgrid gap-y-0 /g) ?? []).length).toBe(live.length);
    expect((html.match(/class="@container\/card relative"/g) ?? []).length).toBe(live.length);
    expect((html.match(/class="@container\/card pb-3\.5"/g) ?? []).length).toBe(live.length);
    // The three figures a pipeline is read by; a plan deal's yield on cost
    // takes the cap's slot under its own label.
    expect(text).toContain("$68.0M");
    expect(text).toContain("Yield on cost");
    expect(text).toContain("11.7%");
    // The view is one control, the current view pressed; the column heads
    // belong to the list, so the cards carry the sort select at every width.
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Cards/);
    expect(html).not.toContain('class="hidden items-center gap-3 px-5 pb-1.5 md:flex"');
  });

  it("shows a card whose building has no photograph its market's photograph, named as the market's — pictures, not maps (#438)", () => {
    const market = marketPictureFor({ city: "Pittsburgh", state: "PA" })!;
    const withMarket = CARDS.map((c) => ({
      ...c,
      pictures: bannerSources(
        {
          dealId: c.id,
          pictureCredit: c.id === "b" ? "Photograph added to the deal" : null,
          googleEnabled: false,
          hasStreetAddress: c.hasAddress && c.id !== "h",
          hasAddress: c.hasAddress,
          market: c.id === "c" ? market : null,
        },
        CARD,
      ),
    }));
    const html = render(
      React.createElement(Pipeline, {
        deals: withMarket,
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: "h", hasScreenedOm: true },
        billing: BILLING,
      }),
    );
    dumpView("pipeline-cards-market", html);
    expect(a11yIssues(html), "a11y pipeline market card").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // The market's photograph where the aerial was, the aerial left behind it.
    expect((html.match(/data-deal-banner="market"/g) ?? []).length).toBe(1);
    expect(html).toContain(`src="${market.src.replace(/&/g, "&amp;")}"`);
    expect(html).not.toContain(`src="/api/deals/c/aerial?src=usgs&amp;w=${CARD.w}&amp;h=${CARD.h}"`);
    // Named on its face as the market's, never passed for the building, and
    // credited to its photographer.
    expect((html.match(/data-picture="market"/g) ?? []).length).toBe(1);
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain(`Market photo ${market.name}`);
    expect(flat).toContain(market.credit);
    expect(html).toContain("No photograph of the building yet.");
    // A building's own photograph is untouched.
    expect(html).toContain('src="/api/deals/b/picture?size=hero"');
  });

  it("sorts by when offers are due — from the sort control, and from the list's own header beside the deal's name, where the deadline is drawn", () => {
    const props = {
      deals: withThumbs(CARDS),
      errorMessage: null,
      notice: null,
      onboarding: { hasBuyBox: true, sampleId: "h", hasScreenedOm: true },
      billing: BILLING,
    };
    const cards = render(React.createElement(Pipeline, props));
    expect(cards).toContain('<option value="due:asc">Offers due, earliest</option>');
    const list = render(React.createElement(Pipeline, { ...props, initialView: "list" as const }));
    expect(list).toContain('aria-label="Sort by offers due"');
    expect(list).toMatch(/aria-label="Sort by deal"[^>]*>Deal<\/button><button[^>]*aria-label="Sort by offers due"[^>]*>Offers due<\/button>/);
    expect(a11yIssues(list)).toEqual([]);
  });

  it("opens the new-deal form with its name field still required and editable — a chosen PDF only pre-fills it (lib/deal-name)", () => {
    const html = render(
      React.createElement(Pipeline, {
        deals: withThumbs(CARDS),
        errorMessage: null,
        notice: null,
        openNew: "1",
        onboarding: { hasBuyBox: true, sampleId: "h", hasScreenedOm: true },
        billing: BILLING,
      }),
    );
    expect(a11yIssues(html), "a11y new-deal form").toEqual([]);
    const field = html.match(/<input[^>]*aria-label="Deal name"[^>]*>/)?.[0] ?? "";
    expect(field).toContain('name="name"');
    expect(field).toContain("required");
    expect(field).not.toMatch(/readonly|disabled/i);
    expect(html).toContain('accept="application/pdf"');
    expect(html).toContain('data-qa="batch-upload"');
  });

  it("opens on the cards unless the reader chose the list, and never lands on the map (#438)", () => {
    expect(landingView(undefined)).toBe("cards");
    expect(landingView("cards")).toBe("cards");
    expect(landingView("list")).toBe("list");
    // A map chosen once no longer greets the reader on every visit.
    expect(landingView("map")).toBe("cards");
    expect(remembersView("map")).toBe(false);
    expect(remembersView("list")).toBe(true);
  });

  it("draws the pipeline on one map when the reader chose the map: the legend, the basemaps and where every deal is (#431)", () => {
    const placed = CARDS.map((c, i) =>
      c.id === "a" || c.id === "b" ? { ...c, place: { lat: 39.95 + i / 100, lng: -75.16, precision: "street" as const } } : c.id === "c" ? { ...c, placeMiss: true } : c,
    );
    const html = render(
      React.createElement(Pipeline, {
        deals: placed,
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: "h", hasScreenedOm: true },
        billing: BILLING,
        initialView: "map",
      }),
    );
    dumpView("pipeline-map", html);
    expect(a11yIssues(html), "a11y pipeline map").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-view="map"');
    expect(html).not.toContain('data-view="cards"');
    expect(html).not.toContain('data-view="list"');
    // The legend is the split bar's four calls; the basemaps are the deal
    // page's three.
    for (const w of ["Go", "Caution", "No-go", "Not screened", "Satellite", "Hybrid", "Map"]) expect(text).toContain(w);
    // Every live deal is counted in exactly one place: two resolved, one
    // no geocoder could place, the two with no address unplaceable too, the
    // rest waiting on the location route (the dead one is filtered away).
    const live = CARDS.filter((c) => c.stage !== "dead");
    const noAddress = live.filter((c) => !c.hasAddress).length;
    const waiting = live.length - 2 - 1 - noAddress;
    expect(text).toContain(
      `2 of ${live.length} deals on the map · ${waiting} being placed · ${1 + noAddress} with no address a geocoder could place`,
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Map/);
  });

  it("renders the empty pipeline with the getting-started state, and the at-limit notice", () => {
    const emptyHtml = render(
        React.createElement(Pipeline, {
          deals: [],
          errorMessage: null,
          notice: null,
          onboarding: { hasBuyBox: false, sampleId: null, hasScreenedOm: false },
          billing: BILLING,
        }),
      );
    dumpView("pipeline-empty", emptyHtml);
    expect(a11yIssues(emptyHtml), "a11y pipeline-empty").toEqual([]);
    const empty = visibleText(emptyHtml);
    expect(gluedWords(empty)).toEqual([]);
    // The empty state is a picture, a line and two ways in — not an essay.
    expect(empty).toContain("Start your pipeline");
    expect(empty).toContain("Try a sample deal");
    expect(empty).toContain("Browse the covered markets");
    // …to the metro explorer itself: /market opens a signed-in reader on
    // their own market data, and an empty pipeline has none.
    expect(emptyHtml).toMatch(/<a[^>]*href="\/market#explorer"[^>]*>Browse the covered markets →<\/a>/);
    const atLimitHtml = render(
        React.createElement(Pipeline, {
          deals: CARDS.slice(0, 2),
          errorMessage: "Could not read that PDF — try a text-based export of the OM.",
          notice: "Your deal was saved.",
          onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
          billing: { isPro: false, canCreateDeal: false, allowance: dealAllowance({ plan: "free", dealCount: 3, team: null }) },
        }),
      );
    dumpView("pipeline-at-limit", atLimitHtml);
    expect(a11yIssues(atLimitHtml), "a11y pipeline-at-limit").toEqual([]);
    const atLimit = visibleText(atLimitHtml);
    expect(gluedWords(atLimit)).toEqual([]);
    expect(atLimit).toContain("Could not read that PDF");
    expect(atLimit).toContain("Your deal was saved.");
  });
});

describe("Pipeline — the free-deal meter counts what the create action counts (lib/deal-allowance)", () => {
  const props = {
    deals: withThumbs(CARDS.slice(0, 2)),
    errorMessage: null,
    notice: null,
    onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
  };
  // The link to /billing that carries the count in its title.
  const meter = (html: string) => html.match(/<a\b(?=[^>]*\shref="\/billing")(?=[^>]*\stitle=")[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";

  it("a member on a team trial: the team's trial first, where the next deal comes from, then their own", () => {
    const allowance = dealAllowance({ plan: "free", dealCount: 0, team: { active: false, dealCount: 1 } });
    const html = render(React.createElement(Pipeline, { ...props, billing: { isPro: false, canCreateDeal: true, allowance } }));
    expect(a11yIssues(html)).toEqual([]);
    const m = meter(html);
    // It said "3 free deals left" through every deal the trial took.
    expect(visibleText(m)).toContain("5 free deals left");
    expect(m).toContain('title="Team trial: 1 of 3 deals used · Your own: 0 of 3 free deals used"');
    // Two tracks, the team's first, each as wide as its share.
    expect([...m.matchAll(/data-meter="(\w+)"/g)].map((x) => x[1])).toEqual(["team", "personal"]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("off a team: one track of the reader's own; at the cap, none left; on a plan, no meter", () => {
    const own = render(React.createElement(Pipeline, { ...props, billing: BILLING }));
    expect(visibleText(meter(own))).toContain("2 free deals left");
    expect([...meter(own).matchAll(/data-meter="(\w+)"/g)].map((x) => x[1])).toEqual(["personal"]);
    expect(meter(own)).toContain('title="1 of 3 free deals used"');
    const spent = render(
      React.createElement(Pipeline, {
        ...props,
        billing: { isPro: false, canCreateDeal: false, allowance: dealAllowance({ plan: "free", dealCount: 3, team: { active: false, dealCount: 3 } }) },
      }),
    );
    expect(visibleText(meter(spent))).toContain("0 free deals left");
    const team = render(
      React.createElement(Pipeline, {
        ...props,
        billing: { isPro: true, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 3, team: { active: true, dealCount: 9 } }) },
      }),
    );
    expect(visibleText(team)).not.toMatch(/free deals? left/);
    expect(team).not.toContain("data-meter=");
  });
});

describe("Pipeline — a deal screened again shows the run, never the call it is replacing", () => {
  // #479: a re-screen rewrites the terms first and the verdict last, so the
  // stored call is the previous screen's until the run reaches it.
  const rescreen = card({
    id: "r",
    name: "Harbor View Apartments",
    verdict: "pass",
    stage: "active_pursuit",
    jobStatus: "running",
    slots: { cap: "5.9%", price: "$41,250,000", yoc: null },
    market: "Baltimore, MD",
    coveredMarket: "Baltimore",
  });
  const props = {
    errorMessage: null,
    notice: null,
    onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
    billing: BILLING,
  };

  it("says Re-screening on the card and the row, with the previous call in the title", () => {
    for (const initialView of ["cards", "list"] as const) {
      const html = render(React.createElement(Pipeline, { ...props, deals: withThumbs([rescreen]), initialView }));
      dumpView(`pipeline-rescreen-${initialView}`, html);
      expect(a11yIssues(html), initialView).toEqual([]);
      const text = visibleText(html);
      expect(gluedWords(text)).toEqual([]);
      expect(text, initialView).toContain("Re-screening…");
      expect(html, initialView).toContain('title="Re-screening — the previous call was Go"');
      // The old call is not drawn as the deal's call.
      expect(text, initialView).not.toMatch(/(^|\n)Go(\n|$)/);
    }
    // A first screen still says Screening, and a finished one its call.
    const first = visibleText(render(React.createElement(Pipeline, { ...props, deals: withThumbs([{ ...rescreen, verdict: null }]) })));
    expect(first).toContain("Screening…");
    expect(first).not.toContain("Re-screening");
    const done = visibleText(render(React.createElement(Pipeline, { ...props, deals: withThumbs([{ ...rescreen, jobStatus: null }]) })));
    expect(done).not.toContain("screening…");
    expect(done).toMatch(/(^|\n)Go(\n|$)/);
  });
});

describe("Pipeline — a note's card withholds the collateral's cap (the audit of 2026-09-30)", () => {
  const props = {
    errorMessage: null,
    notice: null,
    onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
    billing: BILLING,
  };
  // The slots as lib/pipeline-slots reads a note: the collateral's cap is
  // withheld, and the note's yield to maturity stands in its place.
  const note = card({
    id: "n",
    name: "Harbor Point note",
    verdict: "caution",
    slots: { cap: null, price: "$20,000,000", yoc: null, interest: "Note", capWithheld: "note", noteYield: "13.8%" },
  });

  it("shows the note's yield to maturity where a building shows its cap, in the cards and the list", () => {
    for (const initialView of ["cards", "list"] as const) {
      const html = render(React.createElement(Pipeline, { ...props, deals: withThumbs([note]), initialView }));
      expect(a11yIssues(html), initialView).toEqual([]);
      const text = visibleText(html);
      expect(gluedWords(text), initialView).toEqual([]);
      expect(text, initialView).toContain("13.8%");
      expect(html, initialView).toContain("A note has no going-in cap");
    }
    const cards = visibleText(render(React.createElement(Pipeline, { ...props, deals: withThumbs([note]), initialView: "cards" })));
    expect(cards).toMatch(/Note yield\s*13\.8%\s*to maturity/);
  });

  it("says n/a where the note does not pay, never a dash a reader takes for an unstated cap", () => {
    const unpaid = { ...note, slots: { ...note.slots, noteYield: null } };
    const cards = visibleText(render(React.createElement(Pipeline, { ...props, deals: withThumbs([unpaid]), initialView: "cards" })));
    expect(cards).toMatch(/Cap\s*n\/a/);
  });
});

describe("Pipeline — a first screen's card reads the first signal, as the deal page does", () => {
  const props = {
    errorMessage: null,
    notice: null,
    onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
    billing: BILLING,
  };
  // The slots as lib/pipeline-slots reads a deal with a first signal and no
  // extraction yet (its ask, nothing else), and a fit judged on the signal;
  // the rest of its terms are still being read.
  const first = card({
    id: "s",
    name: "Cedar Court Apartments",
    jobStatus: "running",
    reading: true,
    hasBox: true,
    fit: "near",
    score: 64,
    mandateVerdict: "WATCH",
    fitFirstRead: true,
    slots: { cap: null, price: "$20,000,000", yoc: null },
  });

  it("prints the first signal's ask as the price and marks the fit first read, in the cards and the list", () => {
    for (const initialView of ["cards", "list"] as const) {
      const html = render(React.createElement(Pipeline, { ...props, deals: withThumbs([first]), initialView }));
      dumpView(`pipeline-first-read-${initialView}`, html);
      expect(a11yIssues(html), initialView).toEqual([]);
      const text = visibleText(html);
      expect(gluedWords(text), initialView).toEqual([]);
      expect(text, initialView).toContain("$20.0M");
      expect(text, initialView).toMatch(/first read/i);
      expect(html, initialView).toContain("First read — judged on the first pass over the memorandum");
    }
    const cards = render(React.createElement(Pipeline, { ...props, deals: withThumbs([first]), initialView: "cards" }));
    expect(visibleText(cards)).toMatch(/Price\s*\$20\.0M/);
    expect((cards.match(/data-qa="fit-first-read"/g) ?? []).length).toBe(1);
    // The list says it to a screen reader in the fit's own words.
    const list = render(React.createElement(Pipeline, { ...props, deals: withThumbs([first]), initialView: "list" }));
    expect(list).toContain("Fit 64 · Watch, first read");
    // Once the extraction lands the fit is the screen's own, and unmarked.
    const read = { ...first, fitFirstRead: false };
    for (const initialView of ["cards", "list"] as const) {
      const text = visibleText(render(React.createElement(Pipeline, { ...props, deals: withThumbs([read]), initialView })));
      expect(text, initialView).not.toMatch(/first read/i);
    }
  });

  it("draws an empty slot as not read yet while the screen reads the memorandum, and keeps the dash for a finished read's", () => {
    // A first screen before even the first signal: no figure, no fit, no
    // class read yet, a buy box standing.
    const blank = card({ id: "t", name: "Maple Row Townhomes", assetClass: "", jobStatus: "running", reading: true, hasBox: true, slots: { cap: null, price: null, yoc: null } });
    const shimmers = (html: string) => (html.match(/<span role="img" aria-label="Reading the memorandum"[^>]*data-reading[^>]*class="skeleton /g) ?? []).length;
    const tiles = (html: string) => html.match(/<dl class="grid[\s\S]*?<\/dl>/)?.[0] ?? "";
    const cards = render(React.createElement(Pipeline, { ...props, deals: withThumbs([blank]), initialView: "cards" }));
    dumpView("pipeline-reading-cards", cards);
    expect(a11yIssues(cards)).toEqual([]);
    expect(gluedWords(visibleText(cards))).toEqual([]);
    // Price, cap and fit: each a shimmer, none a dash.
    expect(shimmers(tiles(cards))).toBe(3);
    expect(visibleText(tiles(cards))).not.toContain("—");
    // The list's columns wait the same way: the class, the price, the cap, the fit.
    const list = render(React.createElement(Pipeline, { ...props, deals: withThumbs([blank]), initialView: "list" }));
    expect(a11yIssues(list)).toEqual([]);
    expect(shimmers(list)).toBe(4);
    // With no buy box the fit's dash is final, reading or not.
    expect(shimmers(tiles(render(React.createElement(Pipeline, { ...props, deals: withThumbs([{ ...blank, hasBox: false }]), initialView: "cards" }))))).toBe(2);
    // The first signal's ask and fit are in; the cap is still being read.
    expect(shimmers(tiles(render(React.createElement(Pipeline, { ...props, deals: withThumbs([first]), initialView: "cards" }))))).toBe(1);
    // A finished read that found no figure keeps its dash, and draws no shimmer.
    for (const initialView of ["cards", "list"] as const) {
      const done = render(React.createElement(Pipeline, { ...props, deals: withThumbs([{ ...blank, jobStatus: null, reading: false }]), initialView }));
      expect(shimmers(done), initialView).toBe(0);
      expect(done, initialView).not.toContain("Reading the memorandum");
      expect(visibleText(initialView === "cards" ? tiles(done) : done), initialView).toContain("—");
    }
  });
});

import { readFileSync } from "node:fs";
import PipelineLoading from "@/app/(app)/deals/loading";
import CompareLoading from "@/app/(app)/deals/compare/loading";
import AppLoading from "@/app/(app)/loading";

describe("Pipeline — its loading state, and the reads that stream after it", () => {
  it("draws the pipeline's own shape while it loads: the cards view's grid, each card led by a 16:10 picture", () => {
    const html = render(React.createElement(PipelineLoading));
    dumpView("pipeline-loading", html);
    expect(a11yIssues(html)).toEqual([]);
    expect(positionConflicts(html)).toEqual([]);
    expect(html).toMatch(/<div role="status" aria-label="Loading your pipeline"/);
    expect(visibleText(html)).toContain("Pipeline");
    expect((html.match(/<div class="skeleton aspect-\[16\/10\] w-full" data-card-picture="true">/g) ?? []).length).toBe(6);
    // Column for column the grid the cards view draws, so nothing jumps
    // when the pipeline replaces it (the view's own `stagger` aside).
    const cards = render(
      React.createElement(Pipeline, {
        deals: withThumbs(CARDS.slice(0, 2)),
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
        billing: BILLING,
      }),
    );
    const grid = cards.match(/<ul class="stagger ([^"]*)" data-view="cards">/)?.[1];
    expect(grid).toBeTruthy();
    expect(html).toContain(`<ul class="${grid}" data-loading="cards">`);
  });

  it("leaves the compare page the signed-in area's generic skeleton, rather than a grid of cards", () => {
    expect(CompareLoading).toBe(AppLoading);
  });

  it("streams the layout's alert banner and the pipeline's news strip in boundaries of their own", () => {
    // A layout's own reads are out of loading.js's reach: a hard load waited
    // on the banner's cookie and table before anything streamed.
    const layout = readFileSync("app/(app)/layout.tsx", "utf8");
    expect(layout).toMatch(/<Suspense fallback=\{null\}>\s*<RegulatoryAlertBanner \/>\s*<\/Suspense>/);
    const page = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(page).toMatch(/<Suspense fallback=\{null\}>\s*<TodaysNews \/>\s*<\/Suspense>/);
  });
});

describe("ModelView — the sample model renders every panel", () => {
  it("renders the returns, stress, sensitivity, assumptions, capex and cash-flow panels", () => {
    const html = render(
      React.createElement(ModelView, {
        dealId: "sample",
        model: SAMPLE_DEAL.model,
        documents: [],
        active: true,
        isPro: false,
      }),
    );
    expect(html.length).toBeGreaterThan(5_000);
    dumpView("model", html);
    expect(a11yIssues(html), "a11y model").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/IRR/);
    // The cash-flow panel itself (it used to be matched by accident through
    // a "Cash Flow tab" phrase in the inputs list, which is a tooltip now).
    expect(text).toMatch(/Operating cash flow/);
    // The first-draft workbook and its Conflicts sheet were retired: the card
    // names no sheet, claims no shared math with the Excel, and says the
    // download is a separate model.
    expect(text).not.toMatch(/Conflicts sheet/);
    expect(text).not.toMatch(/same math as the Excel/);
    expect(text).toMatch(/Upgrade to Pro to download the OM underwrite model \(\.xlsx\)/);
    expect(text).toMatch(/The workbook is a separate model, built from the memorandum’s terms/);
  });

  it("labels its download as the OM underwrite, a separate model from the card's returns", () => {
    const html = render(
      React.createElement(ModelView, {
        dealId: "d1",
        model: SAMPLE_DEAL.model,
        documents: [],
        active: false,
        isPro: true,
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(html).toMatch(
      /<a href="\/api\/deals\/d1\/underwrite\.xlsx"[^>]*>[\s\S]*?Download the OM underwrite model \(\.xlsx\)<\/a>/,
    );
    expect(visibleText(html)).toMatch(/The workbook is a separate model/);
  });

  it("renders the no-model state without a runtime error", () => {
    const text = visibleText(
      render(React.createElement(ModelView, { dealId: "d1", model: null, documents: [], active: true, isPro: true })),
    );
    expect(gluedWords(text)).toEqual([]);
    expect(text.length).toBeGreaterThan(100);
  });
});

describe("CompareTable — a stabilized asset, a conversion and a rejected deal side by side", () => {
  const col = (over: Partial<Col> & Pick<Col, "id" | "name">): Col => ({
    assetClass: "multifamily",
    market: "North Dallas, TX",
    coveredMarket: "Dallas–Fort Worth",
    verdict: "caution",
    reason: null,
    hasModel: true,
    fit: null,
    fitNote: null,
    strategy: "Stabilized",
    planDeal: false,
    irr: null,
    em: null,
    coc: null,
    cap: null,
    yoc: null,
    leverage: null,
    price: null,
    noi: null,
    ...over,
  });
  const COLS: Col[] = [
    col({ id: "a", name: "The Maddox at Brewerytown", reason: "Rents assume a premium the submarket has not printed.", fit: "near", fitNote: "Near on basis / unit", irr: 14.2, em: 1.82, coc: 6.1, cap: 5.6, leverage: leverageRead(5.6, 6.2), capOverTenYear: capSpreadRead(5.6, 4.94), price: "$68,000,000", noi: "$3,808,000" }),
    col({ id: "b", name: "1400 Market — office to residential", verdict: "pass", reason: "The plan holds a 567 bps spread in the worst corner.", fit: "fits", strategy: "Conversion", planDeal: true, irr: 18.9, em: 2.1, coc: null, cap: null, yoc: 11.7, price: "$20,000,000", noi: "$21,000,000", market: "Center City, Philadelphia, PA", coveredMarket: "Philadelphia" }),
    col({ id: "c", name: "Tysons Corner Plaza", assetClass: "office", verdict: "pass_on", reason: "Vacancy above 20% with no leasing story.", fit: "outside", fitNote: "Misses: size, price", irr: 22.0, em: 2.4, coc: 8.0, cap: 8.1, leverage: leverageRead(8.1, 6.2), capOverTenYear: capSpreadRead(8.1, 4.94), price: "$60,000,000", noi: "$4,860,000", market: "Tysons, VA", coveredMarket: "Northern Virginia" }),
    col({ id: "d", name: "Riverbend Site — 240 units", hasModel: false, verdict: null, strategy: "Development", planDeal: true, price: "$4,000,000", market: "Frisco, TX", coveredMarket: null, readMarket: "Dallas–Fort Worth", readCounty: "Collin County, TX" }),
  ];

  it("renders four columns and reads clean", () => {
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols: COLS }));
    dumpView("compare", html);
    expect(a11yIssues(html), "a11y compare").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    for (const c of COLS) expect(text, c.name).toContain(c.name);
    // The market row names how a county-placed deal reached its metro area (#447).
    expect(text).toContain("Dallas–Fort Worth (by its county, Collin County, TX)");
    // The conversion's cap cell says it is judged on the plan, never a
    // dark building's cap; the rejected deal's 22% IRR is never crowned.
    expect(text).toMatch(/n\/a|plan/);
    expect(text).toContain("11.7%");
    // Every figure in the return rows draws its spread bar: three IRRs,
    // three multiples, two cash-on-cash, two caps (the conversion's cap
    // cell draws none), one yield on cost — once in the table and once in
    // the phone cards (one layout shows at a time). The rejected deal's bar
    // is the longest in the IRR row but muted, and it carries no "best" pill.
    expect((html.match(/data-spread-bar/g) ?? []).length).toBe(22);
    expect(html).toContain("bg-muted/50");
    expect((html.match(/>best</g) ?? []).length).toBe(4);
    // The leverage row's spread is signed, so its bar runs from a centre
    // line: the Maddox's −60 bps to the left, scaled to the Tysons' +190
    // (the row's widest), the Tysons' the full half to the right — once per
    // layout; the two plan deals, judged on yield on cost, draw none. The
    // cap-over-10-year row is signed the same way: the Maddox's +66 bps
    // against the Tysons' +316, both to the right.
    expect((html.match(/data-signed-bar/g) ?? []).length).toBe(8);
    expect((html.match(/right:50%;width:16%/g) ?? []).length).toBe(2);
    expect((html.match(/left:50%;width:50%/g) ?? []).length).toBe(4);
    // A signed bar's width is its share of the half-track: 66 of 316 is a fifth of 50%.
    expect((html.match(/left:50%;width:10%/g) ?? []).length).toBe(2);
    expect(text).toContain("Cap over 10-yr Treasury");
    expect(text).toContain("+66 bps");
    expect(text).toContain("+316 bps");
    // The phone layout: a card per deal, the table hidden below `sm`.
    expect(html).toContain('aria-label="Deals compared"');
    expect((html.match(/<li /g) ?? []).length).toBe(COLS.length);
    expect(html).toMatch(/class="hidden overflow-x-auto[^"]*sm:block"/);
    // One deal alone has no spread to draw.
    const single = renderToStaticMarkup(React.createElement(CompareTable, { cols: [COLS[0]] }));
    expect(single).not.toContain("data-spread-bar");
    expect(single).not.toContain("data-signed-bar");
  });

  it("marks a call a running or failed re-screen is replacing, the pipeline card's way, and never crowns it", () => {
    // The Maddox leads both return rows but a re-screen is running toward
    // its verdict; the Tysons deal's re-screen failed before its verdict.
    // Both calls on file are the previous screen's (lib/screen-run).
    const cols: Col[] = [
      { ...COLS[0], irr: 24.0, em: 2.9, behind: "running" },
      COLS[1],
      { ...COLS[2], verdict: "caution", behind: "failed" },
      COLS[3],
    ];
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols }));
    dumpView("compare-rescreen", html);
    expect(a11yIssues(html), "a11y compare re-screen").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // The run, as the pipeline card says it, the previous call in the title
    // and said as the previous screen's under it — in both layouts.
    expect((text.match(/Re-screening…/g) ?? []).length).toBe(2);
    expect(html).toContain('title="Re-screening — the previous call was Caution"');
    expect(text).toContain("Previous screen's call: Caution — Rents assume a premium the submarket has not printed.");
    expect(html).toContain('title="The latest screen failed before it reached the verdict — the previous call was Caution"');
    expect((html.match(/data-qa="call-behind"/g) ?? []).length).toBe(4);
    // A deal nothing has screened says so, never "Screening".
    expect(text).toContain("Not screened");
    // "Best" goes to the conversion alone, the one call no run is replacing:
    // its IRR and its multiple, in its phone card and in the table's row.
    const cards = html.split("<li ").slice(1);
    expect((cards[0].match(/>best</g) ?? []).length).toBe(0);
    expect((cards[1].match(/>best</g) ?? []).length).toBe(2);
    expect((cards[2].match(/>best</g) ?? []).length).toBe(0);
    const tableRow = (label: string) =>
      (html.match(new RegExp(`<td class="sticky left-0[^"]*">${label}(?: · model)?</td>([\\s\\S]*?)</tr>`))?.[1] ?? "").split("<td ").slice(1);
    for (const label of ["Levered IRR", "Equity multiple"]) {
      const cells = tableRow(label);
      expect(cells, label).toHaveLength(4);
      expect(cells.map((c) => c.includes(">best<")), label).toEqual([false, true, false, false]);
    }
    // No run in flight: the call is drawn as the call, and crowned as before.
    const settled = renderToStaticMarkup(React.createElement(CompareTable, { cols: cols.map((c) => ({ ...c, behind: null })) }));
    expect(visibleText(settled)).not.toContain("Re-screening");
    expect(settled.split("<li ").slice(1)[0].match(/>best</g) ?? []).toHaveLength(2);
  });

  it("names the rows the first-draft model fills, and marks the memorandum's own figure where a deal's model has none", () => {
    // The table reads each deal's first-draft model, not the memorandum's
    // figures its header prints (the audit of 2026-09-30).
    const cols: Col[] = [
      { ...COLS[0], capFrom: "model", priceFrom: "model", noiFrom: "model" },
      // No model: the memorandum's going-in cap, price and NOI, as the
      // pipeline card and the header read them.
      col({
        id: "om",
        name: "Oak Terrace",
        hasModel: false,
        cap: 6.1,
        capFrom: "om",
        leverage: leverageRead(6.1, 6.2),
        capOverTenYear: capSpreadRead(6.1, 4.94),
        price: "$30,000,000",
        priceFrom: "om",
        noi: "$1,830,000",
        noiFrom: "om",
      }),
      // A plan deal with no model: the yield on cost its header prints.
      { ...COLS[1], hasModel: false, irr: null, em: null, yoc: 11.7, yocFrom: "om", price: "$20,000,000", priceFrom: "om", noi: null },
    ];
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols }));
    dumpView("compare-sources", html);
    expect(a11yIssues(html), "a11y compare sources").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    const tableLabels = [...html.matchAll(/<td class="sticky left-0[^"]*">([^<]+)<\/td>/g)].map((m) => m[1]);
    const cardLabels = [...html.matchAll(/<dt class="text-\[10px\][^"]*">([^<]+)<\/dt>/g)].map((m) => m[1]);
    // A row a model figure fills says so beside its name, in both layouts.
    for (const label of ["Levered IRR", "Equity multiple", "Going-in cap", "Leverage vs 30-yr", "Purchase price", "Year-1 NOI"]) {
      expect(tableLabels, label).toContain(`${label} · model`);
      expect(cardLabels.filter((l) => l === `${label} · model`), label).toHaveLength(cols.length);
    }
    // The yield on cost row holds the memorandum's figure alone: no mark.
    expect(tableLabels).toContain("Yield on cost (stabilized)");
    expect(tableLabels).not.toContain("Yield on cost (stabilized) · model");
    // Each figure of the memorandum's own is marked, once a layout.
    for (const figure of ["6.1%", "11.7%", "$30,000,000", "$1,830,000", "$20,000,000"]) {
      expect((text.match(new RegExp(`${figure.replace(/[$.]/g, "\\$&")} \\(OM\\)`, "g")) ?? []).length, figure).toBe(2);
    }
    // A model's figure is never marked.
    expect(text).not.toMatch(/5\.6% \(OM\)|\$68,000,000 \(OM\)/);
    // Deals with no model at all: nothing says "model".
    const noModels = renderToStaticMarkup(React.createElement(CompareTable, { cols: cols.slice(1) }));
    expect(noModels).not.toContain(" · model");
    expect(visibleText(noModels)).toContain("6.1% (OM)");
  });

  it("pictures each building at the head of its column and its phone card, the credit on the picture (#418)", () => {
    const pictured = [
      { ...COLS[0], pictures: bannerSources({ dealId: "a", pictureCredit: "From the offering memorandum", googleEnabled: false, hasStreetAddress: true, hasAddress: true }) },
      { ...COLS[1], pictures: bannerSources({ dealId: "b", pictureCredit: null, googleEnabled: false, hasStreetAddress: true, hasAddress: true }) },
      // No address and no photograph: a blank plate holds the slot.
      { ...COLS[2], pictures: bannerSources({ dealId: "c", pictureCredit: null, googleEnabled: false, hasStreetAddress: false, hasAddress: false }) },
      COLS[3],
    ];
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols: pictured }));
    dumpView("compare-pictured", html);
    // Once in the table and once in the phone cards: two photographs, two
    // aerials, two blank plates; the fourth column draws none.
    expect((html.match(/data-deal-banner="photo"/g) ?? []).length).toBe(2);
    expect((html.match(/data-deal-banner="aerial"/g) ?? []).length).toBe(2);
    expect((html.match(/data-deal-banner="blank"/g) ?? []).length).toBe(2);
    expect(html).toContain('src="/api/deals/a/picture?size=hero"');
    expect(html).toContain('alt="Photograph of The Maddox at Brewerytown"');
    expect(html).toContain('alt="Aerial photograph of 1400 Market — office to residential"');
    const text = visibleText(html);
    expect(text).toContain("From the offering memorandum");
    expect(text).toContain("Imagery: USGS The National Map");
    expect(a11yIssues(html), "a11y compare pictured").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    expect((html.match(/<li /g) ?? []).length).toBe(pictured.length);
  });

  it("sets FEMA's flood zone side by side, the Special Flood Hazard Area in red and a pending lookup as a dash (#426)", () => {
    const cols: Col[] = [
      col({ ...COLS[0], id: "f1", name: "Riverside Flats", flood: "AE (SFHA)" }),
      col({ ...COLS[0], id: "f2", name: "Hilltop Commons", flood: "X (minimal)" }),
      col({ ...COLS[0], id: "f3", name: "Unchecked Plaza", flood: "" }),
    ];
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols }));
    const text = visibleText(html);
    expect(text).toContain("Flood zone");
    expect(text).toContain("AE (SFHA)");
    expect(text).toContain("X (minimal)");
    expect(html).toMatch(/text-kill[^>]*>AE \(SFHA\)/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("leaves out a row blank for every deal compared, in the table and the phone cards, and keeps one with a figure for any deal", () => {
    // The row labels each layout draws: the table's sticky first cells, and
    // the phone cards' terms (a card each, so a row's label once a card) —
    // a row the model fills read without its "· model" mark.
    const bare = (label: string) => label.replace(/ · model$/, "");
    const tableRows = (html: string) => [...html.matchAll(/<td class="sticky left-0[^"]*">([^<]+)<\/td>/g)].map((m) => bare(m[1]));
    const cardRows = (html: string) => [...html.matchAll(/<dt class="text-\[10px\][^"]*">([^<]+)<\/dt>/g)].map((m) => bare(m[1]));
    const DEAL_TYPE_ROWS = ["Flood zone", "Affordability", "Tenancy", "Tenants", "Value-add", "Tax abatement", "Seller financing", "Hotel", "Sale", "Reports", "Broker", "Pre-leasing", "Manufactured housing", "Self-storage"];
    // Four deals none of which states a hotel, a sale, a restriction or any
    // of the other deal-type facts: no column of dashes for any of them.
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols: COLS }));
    const shown = tableRows(html);
    for (const label of DEAL_TYPE_ROWS) {
      expect(shown, label).not.toContain(label);
      expect(cardRows(html), label).not.toContain(label);
    }
    // Every row a figure fills stays — the development's blank yield on cost
    // and its missing returns included, since another deal has them.
    for (const label of ["Market", "Market read", "Asset class", "Deal type", "Levered IRR", "Equity multiple", "Cash-on-cash (Yr 1)", "Going-in cap", "Yield on cost (stabilized)", "Leverage vs 30-yr", "Cap over 10-yr Treasury", "Purchase price", "Year-1 NOI"]) {
      expect(shown, label).toContain(label);
    }
    expect(cardRows(html).filter((l) => l === "Market")).toHaveLength(COLS.length);
    // One hotel among them brings its row back, a dash beside each other deal.
    const withHotel = renderToStaticMarkup(
      React.createElement(CompareTable, { cols: [COLS[0], { ...COLS[1], hotel: "Mgmt encumbered, PIP $35k/key" }] }),
    );
    expect(tableRows(withHotel)).toContain("Hotel");
    expect(cardRows(withHotel).filter((l) => l === "Hotel")).toHaveLength(2);
    expect(visibleText(withHotel)).toContain("Mgmt encumbered, PIP $35k/key");
    expect(tableRows(withHotel)).not.toContain("Sale");
    expect(a11yIssues(withHotel)).toEqual([]);
    // A plan deal's cells send the reader to its yield on cost, so that row
    // stays even where no model states one (the audit of 2026-09-30), and the
    // plan deal's cell says so rather than a dash.
    const plan = COLS.find((c) => c.planDeal)!;
    const noYoc = renderToStaticMarkup(
      React.createElement(CompareTable, { cols: [{ ...COLS.find((c) => !c.planDeal)!, yoc: null }, { ...plan, yoc: null }] }),
    );
    expect(visibleText(noYoc)).toContain("judged on yield on cost");
    expect(tableRows(noYoc)).toContain("Yield on cost (stabilized)");
    expect(visibleText(noYoc)).toContain("not stated");
  });

  it("reads a note's and a share's price for what it buys (#423): the note's yield, the share's cap on the whole, returns withheld", () => {
    const cols: Col[] = [
      COLS[0],
      col({
        id: "n",
        name: "Harbor Point note",
        price: "$20,000,000",
        interest: "Note",
        noteYtm: 13.8,
        withheld: "note",
        noi: "$1,900,000",
      }),
      col({
        id: "s",
        name: "Harbor View Apartments",
        price: "$20,000,000",
        interest: "49% share",
        withheld: "share",
        cap: 4.66,
        leverage: leverageRead(4.66, 6.2),
        capOverTenYear: capSpreadRead(4.66, 4.94),
        noi: "$1,900,000",
      }),
    ];
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols }));
    const text = visibleText(html);
    // The note: no cap — its yield to maturity where the cap would sit —
    // and its model's returns withheld with the reason, in every return row.
    expect(text).toContain("13.8% to maturity");
    expect((text.match(/n\/a — note/g) ?? []).length).toBeGreaterThanOrEqual(5);
    // The share: its cap on the whole its price implies, and the returns
    // the share's price did not buy withheld.
    expect(text).toContain("4.7%");
    expect((text.match(/n\/a — share/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // What each price buys, beside it.
    expect(text).toContain("$20,000,000 · Note");
    expect(text).toContain("$20,000,000 · 49% share");
    expect(a11yIssues(html), "a11y compare interests").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── The bridge and the BOV reconciler ──────────────────────────────────────
import { BridgeView, type VersionOption } from "@/app/(app)/deals/[id]/bridge/bridge-view";
import { ValuationsView, type ColumnData } from "@/app/(app)/deals/[id]/valuations/valuations-view";
import { bridgeSentence, buildBridge } from "@/lib/bridge/attribution";
import { setPath } from "@/lib/bridge/fields";
import type { Assumptions } from "@/lib/bridge/model";
import { bridgeSummaryLine, reconcileValuations, scoreAggressiveness, type NamedValuation } from "@/lib/valuation/reconcile";

const BASE: Assumptions = {
  purchasePrice: 13_700_000,
  holdMonths: 60,
  acqFeePct: 0,
  acqFeeCap: 0,
  transferTaxPct: 0,
  recordationTaxPct: 0,
  generalHoldPct: 0.01,
  buyerLegal: 0,
  lenderLegal: 0,
  thirdPartyReports: 0,
  miscClosing: 0,
  inPlaceRentAnnual: 1_500_000,
  expenseRecoveriesAnnual: 0,
  otherRevenueAnnual: 0,
  vacancyPct: 0.05,
  rentGrowthPct: 0.03,
  expenseLines: [{ label: "Operating expenses", annual: 420_000 }],
  mgmtFeePct: 0,
  expenseGrowthPct: 0.03,
  rsf: 150_000,
  reservesPsf: 0.15,
  capitalImprovementsYr1: 0,
  tiPsf: 0,
  lcPct: 0,
  amFeePctEquity: 0.005,
  ltc: 0.6,
  allInRatePct: 0.06,
  ioMonths: 0,
  amortMonths: 360,
  financingCostPct: 0.01,
  exitCapPct: 0.08,
  saleCostPct: 0.02,
};

const version = (id: string, label: string, irr: number | null): VersionOption => ({
  id,
  label,
  note: id === "v2" ? "Retrade after the roof report." : null,
  createdAt: "2026-09-01T12:00:00Z",
  automatic: id === "v1",
  leveredIrrPct: irr,
});

describe("BridgeView — an IRR move attributed to its drivers renders and reads clean", () => {
  it("renders a three-driver bridge and the identical-assumptions state", () => {
    const to = setPath(setPath(setPath(BASE, "purchasePrice", 12_400_000), "exitCapPct", 0.07), "rentGrowthPct", 0.025);
    const bridge = buildBridge(BASE, to);
    expect(bridge.steps.length).toBe(3);
    const html = render(
      React.createElement(BridgeView, {
        bridge,
        sentence: bridgeSentence(bridge),
        fromVersion: version("v1", "Screen of Sep 1", bridge.fromIrr),
        toVersion: version("v2", "Retrade", bridge.toIrr),
      }),
    );
    dumpView("bridge", html);
    expect(a11yIssues(html), "a11y bridge").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/bps/);
    expect(text).toContain("Purchase price");
    // The before / after columns read in the field's units, never as the
    // raw numbers the model ran on.
    expect(text).toContain("$13.7M");
    expect(text).toContain("$12.4M");
    expect(text).toMatch(/8\.00?%/);
    expect(text).not.toMatch(/13700000/);
    const same = visibleText(
      render(
        React.createElement(BridgeView, {
          bridge: buildBridge(BASE, BASE),
          sentence: "",
          fromVersion: version("v1", "Screen of Sep 1", null),
          toVersion: version("v2", "Retrade", null),
        }),
      ),
    );
    expect(gluedWords(same)).toEqual([]);
    expect(same).toContain("identical");
  });
});

const JLL: NamedValuation = {
  sourceLabel: "JLL BOV",
  headlineValue: 71_500_000,
  year1Noi: 4_320_000,
  goingInCap: 0.06,
  exitCap: 0.0575,
  holdYears: 5,
  rentGrowth: 0.035,
  vacancyAssumption: 0.05,
  capexDeduction: 500_000,
  discountRate: 0.075,
};
const EASTDIL: NamedValuation = {
  sourceLabel: "Eastdil BOV",
  headlineValue: 65_000_000,
  year1Noi: 4_116_800,
  goingInCap: 0.062,
  exitCap: 0.0625,
  holdYears: 5,
  rentGrowth: 0.025,
  vacancyAssumption: 0.07,
  capexDeduction: 1_400_000,
  discountRate: 0.085,
};

const column = (id: string, v: NamedValuation, over: Partial<ColumnData> = {}): ColumnData => ({
  id,
  label: v.sourceLabel,
  sourceType: "broker",
  extracted: true,
  internal: false,
  documentUrl: null,
  note: null,
  values: {
    headlineValue: v.headlineValue,
    year1Noi: v.year1Noi,
    goingInCap: v.goingInCap,
    exitCap: v.exitCap,
    holdYears: v.holdYears,
    rentGrowth: v.rentGrowth,
    vacancyAssumption: v.vacancyAssumption,
    capexDeduction: v.capexDeduction,
    discountRate: v.discountRate,
  },
  citations: { headlineValue: { page: "3", snippet: "Our opinion of value is $71,500,000" } },
  derivedFields: [],
  implied: { ok: true, leveredIrrPct: 0.134, leveredEquityMultiple: 1.74, substitutions: [{ label: "Hold", reason: "the BOV states no hold; the model's 5 years used" }] },
  ...over,
});

describe("ValuationsView — two BOVs, the gap decomposed, renders and reads clean", () => {
  it("renders the comparison table, the bridge and the aggressiveness tally", () => {
    const bridge = reconcileValuations(JLL, EASTDIL);
    expect(bridge.ok).toBe(true);
    const html = render(
      React.createElement(ValuationsView, {
        columns: [
          column("a", JLL),
          column("b", EASTDIL, { note: "Marked to the Q2 trades." }),
          column("me", { ...EASTDIL, sourceLabel: "Your model" }, { sourceType: "internal", internal: true, extracted: false, derivedFields: ["goingInCap"], implied: { ok: false, error: "no model yet", leveredIrrPct: null, leveredEquityMultiple: null, substitutions: [] } }),
        ],
        bridge,
        summary: bridge.ok ? bridgeSummaryLine(bridge) : null,
        tally: scoreAggressiveness(JLL, EASTDIL),
        aLabel: "JLL BOV",
        bLabel: "Eastdil BOV",
      }),
    );
    dumpView("valuations", html);
    expect(a11yIssues(html), "a11y valuations").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("JLL BOV");
    expect(text).toContain("Eastdil BOV");
    expect(text).toMatch(/\$6\.5M|6\.5M/);
    expect(text).toContain("13.4%");
    expect(text).toMatch(/year-1 NOI/);
  });

  it("renders the no-bridge state when a side lacks a figure", () => {
    const thin: NamedValuation = { ...EASTDIL, year1Noi: null, goingInCap: null };
    const bridge = reconcileValuations(JLL, thin);
    expect(bridge.ok).toBe(false);
    const text = visibleText(
      render(
        React.createElement(ValuationsView, {
          columns: [column("a", JLL), column("b", thin)],
          bridge,
          summary: null,
          tally: scoreAggressiveness(JLL, thin),
          aLabel: "JLL BOV",
          bLabel: "Eastdil BOV",
        }),
      ),
    );
    expect(gluedWords(text)).toEqual([]);
    expect(text.length).toBeGreaterThan(300);
  });
});

// ── The rent roll, the analytics charts and the submarket trend ────────────
import { RentRollDashboard } from "@/app/(app)/deals/[id]/rent-roll/dashboard";
import { DotTimeline, StageFunnel, VerdictMix } from "@/app/(app)/analytics/charts";
import { DualAxisTrend } from "@/app/(app)/submarkets/[id]/trend-chart";
import { analyzeRentRoll, leaseUpCurve, markToMarket, rolloverCostForecast, rolloverSchedule } from "@/lib/rentroll/analytics";
import { parseCsv, suggestMapping, toLeases } from "@/lib/rentroll/parse";
import { PROFILE_DEFAULTS } from "@/lib/rentroll/profiles";
import { validateLeases } from "@/lib/rentroll/validate";
import { CLEAN_CSV, MESSY_CSV, MISSING_EXPIRIES_CSV, apartmentCsv } from "@/lib/rentroll/__fixtures__";
import { deriveAnalytics, type AnalyticsRow } from "@/lib/analytics";
import { rentTrend } from "@/lib/market/metrics";
import type { SubmarketPeriod } from "@/lib/market/types";

describe("RentRollDashboard — a parsed rent roll renders every panel", () => {
  const renderRoll = (
    csv: string,
    opts: { leasesShort?: boolean; nra?: number; asOfFrom?: "roll" | "today"; paceIsDefault?: boolean } = {},
  ) => {
    const grid = parseCsv(csv);
    const parsed = toLeases(grid, suggestMapping(grid));
    const leases = parsed.leases;
    const profile = opts.leasesShort ? PROFILE_DEFAULTS.multifamily : PROFILE_DEFAULTS.office;
    const analytics = analyzeRentRoll(leases, {
      asOf: "2026-01-01",
      nra: opts.nra ?? null,
      leasesShort: opts.leasesShort,
    });
    const schedule = rolloverSchedule(leases, { nra: null });
    const rent = profile.marketRentPsf;
    const mtm = markToMarket(leases, { default: rent, NNN: rent, MG: rent, FSG: rent });
    const html = render(
        React.createElement(RentRollDashboard, {
          analytics,
          mtm,
          cost: rolloverCostForecast(schedule, profile),
          leaseUp: leaseUpCurve({
            vacantSf: schedule.vacantSf,
            occupiedSf: analytics.occupiedSf,
            nra: analytics.totalSf,
            absorptionSfPerMonth: 2_500,
          }),
          issues: validateLeases(leases, { nra: null, parse: parsed }),
          filename: "rent-roll.csv",
          asOfFrom: opts.asOfFrom,
          paceIsDefault: opts.paceIsDefault,
        }),
      );
    dumpView(
      `rent-roll-${opts.leasesShort ? "apartments" : csv === CLEAN_CSV ? "clean" : csv === MESSY_CSV ? "messy" : "issues"}`,
      html,
    );
    expect(a11yIssues(html), "a11y rent roll").toEqual([]);
    return { text: visibleText(html), html, priced: Math.min(25, mtm.rows.length) };
  };

  it("the clean roll: WALT, rollover, mark-to-market, lease-up", () => {
    const { text, html, priced } = renderRoll(CLEAN_CSV);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/WALT/i);
    expect(text).toMatch(/rollover/i);
    // Every priced lease draws its rent against market as a bar from a
    // centre line — once in the table, once in the phone card (one layout
    // shows at a time) — and the phone gets a card per lease.
    expect(priced).toBeGreaterThan(0);
    expect((html.match(/data-mtm-bar/g) ?? []).length).toBe(priced * 2);
    expect(html).toContain('aria-label="Leases marked to market"');
    expect(html).toMatch(/data-mtm-bar[\s\S]{0,400}?(bg-pass|bg-kill)/);
    expect(html).toMatch(/class="mt-3 hidden overflow-x-auto sm:block"/);
  });

  it("a roll with missing expiries names what the import found", () => {
    const { text } = renderRoll(MISSING_EXPIRIES_CSV);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("What the import found in rent-roll.csv");
  });

  it("a roll with its own totals line says the line was left out, by row", () => {
    const { text } = renderRoll(MESSY_CSV);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Left out 1 totals line");
    expect(text).toContain("(row 11)");
  });

  it("says the day years to expiry count from, which area occupancy is over, and that the lease-up pace is a placeholder", () => {
    const today = renderRoll(CLEAN_CSV, { nra: 130_000, asOfFrom: "today", paceIsDefault: true });
    expect(gluedWords(today.text)).toEqual([]);
    expect(today.text).toContain("Years to expiry are counted from today, Jan 1, 2026 — the roll states no as-of date");
    expect(today.text).toContain("85,000 SF of the stated 130,000 SF NRA — the roll lists 100,000 SF");
    expect(today.text).toMatch(/an assumed pace, the vacancy leased over 36 months: a placeholder, not the market's absorption/);
    const stated = renderRoll(CLEAN_CSV);
    expect(stated.text).toContain("Years to expiry are counted from Jan 1, 2026, the roll's as-of date.");
    expect(stated.text).toContain("85,000 SF of 100,000 SF");
    expect(stated.text).not.toContain("a placeholder");
  });

  it("an apartment roll is read for loss to lease, with no rollover-cliff or WALT flag", () => {
    const { text, html } = renderRoll(apartmentCsv(), { leasesShort: true });
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-qa="loss-to-lease-note"');
    expect(text).toContain("read for loss to lease");
    expect(text).not.toMatch(/of NRA rolls in/);
    expect(text).not.toMatch(/shorter than the \d+-year hold/);
    // No year of one-year leases is drawn in the warning colour.
    expect(html).not.toContain("var(--color-caution)");
  });
});

describe("Analytics charts — timeline, verdict mix and stage funnel render and read clean", () => {
  const metric = (label: string, value: string) => ({ label, value, flagged: false, page: "" });
  const row = (id: string, name: string, metrics: ReturnType<typeof metric>[], over: Partial<AnalyticsRow> = {}): AnalyticsRow => ({
    id,
    name,
    asset_class: "multifamily",
    created_at: `2026-08-${(10 + Number(id)).toString().padStart(2, "0")}T12:00:00Z`,
    is_sample: false,
    stage: "screening",
    verdict: { verdict: "pass" },
    extraction: { dealName: name, assetClass: "multifamily", market: "Dallas, TX", address: "", metrics },
    ...over,
  });
  const deals = deriveAnalytics([
    row("1", "Maddox", [metric("Asking price", "$50,000,000"), metric("Going-in cap rate", "5.70%"), metric("Units", "248")]),
    row("2", "Harbor View", [metric("Asking price", "$41,250,000"), metric("Going-in cap rate", "5.90%"), metric("Units", "180")], { verdict: { verdict: "caution" }, stage: "underwriting" }),
    row("3", "Tysons Plaza", [metric("Asking price", "$60,000,000"), metric("Going-in cap rate", "8.10%"), metric("Total SF", "200,000 SF")], { asset_class: "office", verdict: { verdict: "pass_on" }, stage: "dead" }),
    row("4", "1400 Market", [metric("Purchase price", "$20,000,000"), metric("Stabilized NOI (pro forma)", "$21,000,000"), metric("Total project cost", "$180,000,000"), metric("Units (proposed)", "612")], { verdict: { verdict: "pass" }, stage: "loi", extraction: { dealName: "1400 Market", assetClass: "multifamily", market: "Philadelphia, PA", address: "", strategy: { kind: "conversion", summary: "Office to residential." }, metrics: [metric("Purchase price", "$20,000,000"), metric("Stabilized NOI (pro forma)", "$21,000,000"), metric("Total project cost", "$180,000,000"), metric("Units (proposed)", "612")] } }),
  ]);

  it("plots the cap and per-unit series, the verdict mix and the funnel", () => {
    expect(deals.length).toBe(4);
    const capPoints = deals.filter((d) => d.capPct != null).map((d) => ({ at: d.at, value: d.capPct!, name: d.name }));
    expect(capPoints.length).toBe(3); // the conversion has no going-in cap
    const unitPoints = deals.filter((d) => d.perUnit != null).map((d) => ({ at: d.at, value: d.perUnit!, name: d.name }));
    const html =
      renderToStaticMarkup(React.createElement(DotTimeline, { points: capPoints, format: (v: number) => `${v.toFixed(1)}%`, medianLabel: "median" })) +
      renderToStaticMarkup(React.createElement(DotTimeline, { points: unitPoints, format: (v: number) => `$${Math.round(v / 1000)}k`, medianLabel: "median" })) +
      renderToStaticMarkup(React.createElement(VerdictMix, { deals })) +
      renderToStaticMarkup(
        React.createElement(StageFunnel, {
          rows: [
            { label: "Screening", count: 1 },
            { label: "Underwriting", count: 1 },
            { label: "LOI", count: 1 },
          ],
        }),
      );
    dumpView("analytics-charts", html);
    expect(a11yIssues(html), "a11y analytics-charts").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Screening");
    expect(html).toContain("<svg");
  });
});

describe("DualAxisTrend — a submarket's vacancy bars and rent line render", () => {
  const period = (over: Partial<SubmarketPeriod> & { period: string }): SubmarketPeriod => ({
    id: over.period,
    submarketId: "sm",
    inventorySf: 20_000_000,
    vacancyPct: 0.06,
    netAbsorptionSf: 150_000,
    underConstructionSf: 1_200_000,
    askingRent: 9.5,
    rentBasis: "nnn_direct",
    source: "market-export.csv",
    unverified: false,
    sourceUrl: null,
    ...over,
  });
  const PERIODS = [
    period({ period: "2025-03-31", askingRent: 9.3, vacancyPct: 0.052 }),
    period({ period: "2025-06-30", askingRent: 9.35, vacancyPct: 0.048 }),
    period({ period: "2025-09-30", askingRent: 9.42, vacancyPct: 0.055, unverified: true }),
    period({ period: "2025-12-31", askingRent: 12.1, vacancyPct: 0.06, rentBasis: "gross_direct" }),
  ];

  it("draws four periods, breaks the rent line at the basis change, and reads clean", () => {
    const trend = rentTrend(PERIODS);
    expect(trend.basisChanged).toBe(true);
    const bars = PERIODS.map((p) => ({ period: p.period, value: p.vacancyPct!, source: p.source, unverified: p.unverified }));
    const html = renderToStaticMarkup(
      React.createElement(DualAxisTrend, {
        bars,
        barLabel: "Vacancy",
        segments: trend.segments,
        lineLabel: "Asking rent",
        formatBar: (n: number) => `${(n * 100).toFixed(1)}%`,
        formatLine: (n: number) => `$${n.toFixed(2)}`,
      }),
    );
    dumpView("submarket-trend", html);
    expect(a11yIssues(html), "a11y submarket-trend").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain("<svg");
    expect(text).toMatch(/Vacancy/);
    const empty = visibleText(
      renderToStaticMarkup(
        React.createElement(DualAxisTrend, { bars: [], barLabel: "Vacancy", segments: [], lineLabel: "Asking rent", formatBar: String, formatLine: String }),
      ),
    );
    expect(empty).toContain("No periods loaded yet.");
  });
});

// ── A submarket, opened on its metro's photograph (#424) ────────────────────
import { SubmarketCards } from "@/app/market/submarket-cards";
import { MarketBand } from "@/app/place-band";
import { EMPTY_RULES, type Submarket } from "@/lib/market/types";
import { SKYLINES, commonsPage, galleryCredit, skylineSrcSet } from "@/lib/skyline";

describe("SubmarketCards and the submarket's band — the metro its owner typed, pictured only where the text says which (#424)", () => {
  const sub = (over: Partial<Submarket> & Pick<Submarket, "id" | "name">): Submarket => ({
    userId: "u",
    metro: null,
    assetClass: "industrial",
    exclusionRules: EMPTY_RULES,
    supplyWarningMonths: 24,
    notes: null,
    createdAt: "2026-09-01T12:00:00Z",
    ...over,
  });
  const SUBS: Submarket[] = [
    sub({ id: "s1", name: "I-95 Corridor", metro: "Richmond, VA", exclusionRules: { ...EMPTY_RULES, subtypes: ["Data Center"] } }),
    sub({ id: "s2", name: "Rosslyn-Ballston", metro: "Arlington, VA", assetClass: "office" }),
    // A bare city is more than one place: no picture, the card as before.
    sub({ id: "s3", name: "Harbor East", metro: "Portland" }),
    sub({ id: "s4", name: "Airport flex", metro: null }),
  ];

  it("pictures each card whose metro names a market, wears the market's name on the strip, and owes one credit line under the grid", () => {
    const html = render(React.createElement(SubmarketCards, { submarkets: SUBS }));
    dumpView("submarket-cards", html);
    expect(a11yIssues(html), "a11y submarket-cards").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // Two of the four name a market; the other two keep the plain card.
    expect(html.match(/data-picture="submarket"/g)?.length).toBe(2);
    // Each strip offers the widths a dense screen needs (#446), rather than
    // one 480px file stretched twice over on a phone.
    expect(html).toContain(`srcSet="${skylineSrcSet("richmond").replaceAll("&", "&amp;")}"`);
    expect(html).toContain('sizes="(min-width: 1024px) 360px, (min-width: 640px) 47vw, 92vw"');
    expect(text).toContain("Richmond VA");
    expect(text).toContain("Northern Virginia");
    for (const s of SUBS) expect(html).toContain(`href="/submarkets/${s.id}"`);
    expect(text).toContain("Excludes: Data Center");
    // The one credit line names the photographers of the pictures shown.
    const credit = galleryCredit(["richmond", "nova"]);
    expect(credit).not.toBe("");
    // Its photographers and licences are links (visibleText breaks a line
    // after each), so the words are read with those breaks taken out.
    expect(text.replace(/\n/g, "")).toContain(credit);
    expect(html).toContain(`href="${commonsPage(SKYLINES.richmond.file)}"`);

    // No market named, no picture and no credit owed.
    const plain = render(React.createElement(SubmarketCards, { submarkets: SUBS.slice(2) }));
    expect(plain).not.toContain('data-picture="submarket"');
    expect(visibleText(plain)).not.toContain("Photographs by");
  });

  it("opens the submarket's page on the band with the submarket's name as the page's heading", () => {
    const html = render(
      React.createElement(MarketBand, { metro: "richmond", eyebrow: "Richmond VA", name: "I-95 Corridor", as: "h1" }),
    );
    dumpView("submarket-band", html);
    expect(a11yIssues(html), "a11y submarket band").toEqual([]);
    expect(html).toMatch(/<h1[^>]*>I-95 Corridor<\/h1>/);
    expect(html).not.toContain("<h3");
    expect(visibleText(html)).toContain("Richmond VA");
    // The market pages keep their section heading.
    const section = render(React.createElement(MarketBand, { metro: "richmond", eyebrow: "Mid-Atlantic", name: "Richmond VA" }));
    expect(section).toMatch(/<h3[^>]*>Richmond VA<\/h3>/);
  });
});

// ── /market in outline while it loads, and the explorer's anchor ───────────
import MarketLoading from "@/app/market/loading";
import { readFileSync as readSource } from "node:fs";
import { join as joinPath } from "node:path";

describe("/market's loading outline, and the metro explorer as its #explorer", () => {
  it("draws the page's own shape — the explorer's chips over the band, the cards — named for a screen reader", () => {
    const html = render(React.createElement(MarketLoading));
    dumpView("market-loading", html);
    expect(a11yIssues(html)).toEqual([]);
    expect(html).toContain('role="status" aria-label="Loading the markets"');
    // The band at MarketBand's own heights, 15rem and 21rem from sm.
    expect(html).toContain('class="skeleton mt-4 h-60 w-full rounded-2xl sm:h-84"');
    expect((html.match(/skeleton h-7 w-24 rounded-full/g) ?? []).length).toBe(10);
    // An outline, not words.
    expect(visibleText(html).trim()).toBe("");
  });

  it("the explorer's section is the page's #explorer, a briefed market's and a read-only one's alike", () => {
    const src = readSource(joinPath(process.cwd(), "app/market/page.tsx"), "utf8");
    expect(src.match(/<section id="explorer" className="[^"]*scroll-mt-6/g)?.length).toBe(2);
    // Its reads run together, never one after another.
    expect(src).not.toMatch(/const (live|national|zori|realtor) = await live/);
  });
});

// ── The shared screen (the one signed-out surface) ─────────────────────────
import { Expired, ShareView } from "@/app/share/[token]/share-view";
import type { BrokerCompsResult, ExtractionResult, MarketResult, VerdictResult } from "@/lib/anthropic/types";

describe("ShareView — the read-only screen a partner or lender opens", () => {
  it("renders the sample deal: the verdict mark, the flip dots, every range, the killers, key terms and the folded reads", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: SAMPLE_DEAL.name,
        assetClass: SAMPLE_DEAL.asset_class,
        expiresAt: "2026-09-30T12:00:00Z",
        verdictStale: false,
        picture: {
          sources: [
            {
              kind: "photo",
              src: "/api/share/0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6/picture?size=hero",
              credit: "From the offering memorandum",
            },
            {
              kind: "aerial",
              src: "/api/share/0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6/aerial?w=960&h=400",
              credit: "aerial imagery: USGS The National Map (public domain)",
            },
          ],
          place: "Brewerytown, Philadelphia, PA",
        },
        extraction: SAMPLE_DEAL.extraction,
        comps: SAMPLE_DEAL.comps,
        market: SAMPLE_DEAL.market,
        verdict: SAMPLE_DEAL.verdict,
      }),
    );
    expect(html.length).toBeGreaterThan(5_000);
    dumpView("share", html);
    expect(a11yIssues(html), "a11y share").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain(SAMPLE_DEAL.name);
    expect(text).toContain("expires Sep 30");
    // The building's own photograph leads (#434), through the token-scoped
    // route and credited as its own; the aerial waits behind it, drawn only
    // if the photograph fails, so its credit is not on the page.
    expect(html).toContain('data-share-picture="photo"');
    expect(html).toContain('alt="Photograph of Brewerytown, Philadelphia, PA"');
    expect(html).toContain("/api/share/0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6/picture?size=hero");
    expect(text).toContain("From the offering memorandum");
    expect(text).not.toContain("USGS The National Map");
    expect(text).toContain("Caution");
    // The call across the range, as three dots — No-go / Caution / Go.
    expect(text).toMatch(/Conservative\s*No-go/);
    expect(text).toMatch(/Sponsor\s*Go/);
    for (const r of SAMPLE_DEAL.verdict.screen?.ranges ?? []) expect(text, r.label).toContain(r.label);
    // Each range carries the deal page's positional read of where the base
    // sits, in one neutral colour: the vacancy base at 9.0% between 6.0% and
    // 9.5% hugs the high end, which on a vacancy is the buyer's end, not the
    // sponsor's — so nothing calls it optimistic or paints it in caution.
    expect(html).not.toContain("optimistic end");
    expect(html.match(/aria-label="Where the base sits inside the range"/g)?.length).toBe(SAMPLE_DEAL.verdict.screen?.ranges.length);
    // No dot on a range's track wears the caution colour (a chip's
    // `bg-caution/10` is the confidence, not the position).
    expect(html).not.toMatch(/class="[^"]*\bbg-caution\b(?!\/)[^"]*"\s+style="left:/);
    expect(text).toContain("Basis");
    expect(text).toContain("Breaks if:");
    expect(text).toContain("Key terms");
    expect(text).toContain("pro forma");
    // The comp and market reads: first sentence in the open, the rest folded
    // but still on the page.
    expect(html).toContain("<details");
    expect(text).toContain("sell-side selections usually do.");
    expect(text).toContain("the $274k ask is 7% rich");
    // Nothing editable, nothing of the buyer's.
    expect(text).not.toMatch(/Buy box|Notes|Documents/);
    expect(html).not.toMatch(/<(button|input|textarea|select)\b/);
    // The sample's market check read no published figures, so the market
    // read says nothing about any.
    expect(text).not.toContain("Checked beside");
  });

  it("the seller's loan offered for assumption is said under the title, as stated (#419)", () => {
    const withLoan = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Assumable loan balance", value: "$30,000,000", flagged: false, page: "p. 12", basis: "na" as const },
        { label: "Assumable loan rate", value: "3.45%", flagged: false, page: "p. 12", basis: "na" as const },
        { label: "Assumable loan maturity", value: "March 31, 2031", flagged: false, page: "p. 12", basis: "na" as const },
        { label: "Assumable loan amortization", value: "Interest-only", flagged: false, page: "p. 12", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withLoan }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="share-assumable"');
    expect(text).toContain("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031, interest-only as stated");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    // The sample itself offers no loan to assume.
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain(
      "share-assumable",
    );
  });

  it("reads the deal's kind as the sender's page does, from the extraction and the first signal", () => {
    // Nothing in the extraction names a plan; the first signal names the
    // conversion (the audit of 2026-09-30), so the page, and now the shared
    // screen, call it one. The budget is a whole one — a "Hard costs" line
    // alone is no stated total.
    const wexley = {
      dealName: "The Wexley",
      assetClass: "multifamily",
      market: "Washington, DC",
      address: "",
      metrics: [
        { label: "Asking price", value: "$20,000,000", flagged: false, page: "" },
        { label: "In-place NOI", value: "$900,000", flagged: false, page: "" },
        { label: "Construction budget", value: "$18,000,000", flagged: false, page: "" },
        { label: "Stabilized NOI", value: "$2,660,000", flagged: false, page: "" },
        { label: "Units", value: "180", flagged: false, page: "" },
      ],
    } as ExtractionResult;
    const signal = {
      dealName: "The Wexley",
      assetClass: "multifamily",
      market: "Washington, DC",
      askPrice: "$20,000,000",
      size: "180 units",
      goingInCap: "",
      perUnit: "",
      take: "An office-to-residential conversion of a 1962 tower, sold vacant.",
    };
    const props = {
      dealName: "The Wexley",
      assetClass: "multifamily",
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      extraction: wexley,
      comps: null,
      market: null,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, firstSignal: signal }));
    dumpView("share-signal-kind", html);
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Washington, DC · Multifamily · Conversion");
    // The plan block, as the page draws it, with its yield on total cost.
    expect(html).toContain('aria-label="The plan"');
    expect(text).toMatch(/Yield on cost\s*7\.00%/i);
    // A row screened before the first signal existed reads as before.
    const beforeHtml = renderToStaticMarkup(React.createElement(ShareView, props));
    expect(visibleText(beforeHtml)).toContain("Washington, DC · Multifamily · Stabilized");
    expect(beforeHtml).not.toContain('aria-label="The plan"');
  });

  it("says a covenant on the rents under the title, and nothing on a market-rate deal (#453)", () => {
    const restricted = {
      ...SAMPLE_DEAL.extraction,
      affordable: {
        programs: ["lihtc" as const],
        summary: "",
        agreement: "Extended Use Agreement with the state housing finance agency",
        assistance: "",
        tiers: [],
        page: "",
      },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Restricted units", value: "180", flagged: false, page: "", basis: "na" as const },
        { label: "Affordability expiration", value: "December 31, 2054", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: restricted }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="affordable-panel"');
    expect(text).toContain("This is an affordable-housing deal: 180 of the");
    expect(text).toContain("rent-restricted under a LIHTC regulatory agreement until Dec 2054");
    expect(text).toContain("The regulatory agreement as stated: Extended Use Agreement with the state housing finance agency");
    // The key terms lead with the restriction's rows after the unit count.
    expect(text).toContain("Restricted units");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain(
      "affordable-panel",
    );
  });

  it("falls back to the aerial where the deal has no photograph of its own, credited to USGS, and draws no frame with neither (#434)", () => {
    const base = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      extraction: SAMPLE_DEAL.extraction,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const aerialOnly = renderToStaticMarkup(
      React.createElement(ShareView, {
        ...base,
        picture: {
          sources: [
            {
              kind: "aerial" as const,
              src: "/api/share/0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6/aerial?w=960&h=400",
              credit: "aerial imagery: USGS The National Map (public domain)",
            },
          ],
          place: "Brewerytown, Philadelphia, PA",
        },
      }),
    );
    expect(a11yIssues(aerialOnly), "a11y share aerial").toEqual([]);
    expect(aerialOnly).toContain('data-share-picture="aerial"');
    expect(aerialOnly).toContain('alt="Aerial view of Brewerytown, Philadelphia, PA"');
    expect(visibleText(aerialOnly)).toContain("USGS The National Map");
    expect(aerialOnly).not.toContain("/picture?size=hero");
    const none = renderToStaticMarkup(React.createElement(ShareView, { ...base, picture: null }));
    expect(none).not.toContain("data-share-picture");
  });

  it("says FEMA's flood zone under the title where the building sits in one, and nothing without a line (#426)", () => {
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      extraction: SAMPLE_DEAL.extraction,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        ...props,
        floodLine: "Flood zone AE: a Special Flood Hazard Area, where flood insurance is required on federally backed debt (FEMA)",
      }),
    );
    expect(html).toContain('data-qa="share-flood"');
    expect(visibleText(html)).toContain("Flood zone AE: a Special Flood Hazard Area");
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, props))).not.toContain("share-flood");
  });

  it("a market read that was checked beside the metro's published figures says so, counted and dated", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: SAMPLE_DEAL.name,
        assetClass: SAMPLE_DEAL.asset_class,
        expiresAt: "2026-09-30T12:00:00Z",
        verdictStale: false,
        picture: null,
        extraction: SAMPLE_DEAL.extraction,
        comps: SAMPLE_DEAL.comps,
        market: {
          ...SAMPLE_DEAL.market,
          liveBrief: {
            metro: "Philadelphia, PA",
            readOn: "2026-09-23",
            lines: ["Unemployment 4.1% (Jul 2026, Philadelphia MSA; FRED)", "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED)"],
            figures: [],
          },
        },
        verdict: SAMPLE_DEAL.verdict,
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Checked beside 2 published figures for the Philadelphia, PA market, read on 2026-09-23");
  });

  it("renders a conversion with the plan block and a stale verdict, and the expired state", () => {
    const conversion: ExtractionResult = {
      dealName: "1200 K Street — Office-to-Residential Conversion",
      assetClass: "multifamily",
      market: "Washington, DC",
      address: "1200 K St NW, Washington, DC",
      strategy: {
        kind: "conversion",
        summary: "Convert a vacant 300,000 SF office building into 320 apartments.",
        capitalBudget: "$160M hard and soft costs",
        timeline: "24 months of construction, 12 months of lease-up",
      },
      metrics: [
        { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
        { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: true, page: "p. 12" },
        { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
      ],
    };
    const verdict: VerdictResult = {
      verdict: "pass",
      reason: "The plan holds a 567 bps spread over the exit cap in the worst corner of the grid.",
      topRisks: ["Entitlements are not yet in hand."],
      nextSteps: [],
      screen: {
        ranges: [
          { label: "Total cost", low: "$170M", base: "$180M", high: "$200M", source: "OM budget (p. 14)", basis: "High adds a 10% contingency.", confidence: "low" },
        ],
        dealKillers: [{ lever: "exit", read: "Stabilized value at a 6% cap.", risk: "" }],
        sensitivity: [],
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: conversion.dealName ?? "",
        assetClass: "multifamily",
        expiresAt: "2026-10-05T12:00:00Z",
        verdictStale: true,
        picture: null,
        extraction: conversion,
        comps: null,
        market: null,
        verdict,
      }),
    );
    dumpView("share-conversion", html);
    expect(a11yIssues(html), "a11y share-conversion").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/\bGo\b/);
    expect(text).toContain("From the previous completed screen");
    // The plan first: the conversion's finished-project figures and its yield
    // on cost, so the $21M NOI beside a $20M price reads as the plan.
    expect(text).toContain("The plan");
    expect(text).toContain("Conversion");
    expect(text).toContain("$21.0M");
    expect(text).toContain("11.67%");
    expect(text).toContain("A conversion deal has no going-in cap");
    expect(text).toContain("verify vs. source");
    expect(text).toContain("Exit");
    expect(text).not.toContain("Breaks if:");
    expect(text).not.toContain("Comp read");
    // No address, no picture — and no empty frame or credit line either.
    expect(html).not.toContain("<img");
    expect(text).not.toContain("USGS");

    // Mid re-screen (#123): the call and the reads the run has not reached
    // are the previous screen's, and the page says the sender is running it.
    const rescreening = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: conversion.dealName ?? "",
        assetClass: "multifamily",
        expiresAt: "2026-10-05T12:00:00Z",
        verdictStale: true,
        staleWhy: "running",
        staleReads: ["market"],
        picture: null,
        extraction: conversion,
        comps: { summary: "Three sales support the basis.", saleComps: [], leaseComps: [], redFlags: [] } as unknown as BrokerCompsResult,
        market: { summary: "Rents are firm.", checks: [] } as unknown as MarketResult,
        verdict: { ...verdict, generatedAt: "2026-09-12T14:03:00.000Z" },
      }),
    );
    dumpView("share-rescreening", rescreening);
    expect(a11yIssues(rescreening), "a11y share-rescreening").toEqual([]);
    const rs = visibleText(rescreening);
    expect(gluedWords(rs)).toEqual([]);
    expect(rs).toContain("the sender is re-screening this deal");
    expect(rs).not.toContain("did not finish");
    // The market read is the last run's; the comp read, already rewritten, is not marked.
    expect((rescreening.match(/data-qa="previous-read"/g) ?? []).length).toBe(1);
    expect(rs).toContain("From the previous screen — the sender’s re-screen has not reached it yet.");
    // The call is dated.
    expect(rs).toMatch(/First-pass verdict · Sep 12, 2026/);

    const expired = renderToStaticMarkup(
      React.createElement(Expired, { reason: "The sender revoked this link." }),
    );
    expect(a11yIssues(expired), "a11y share-expired").toEqual([]);
    const gone = visibleText(expired);
    expect(gone).toContain("This link isn’t available");
    expect(gone).toContain("The sender revoked this link.");
  });
});

// ── The News page's live section ─────────────────────────────────────────
// A pure view of one fetch: the ranked headlines, then one chip per source
// in the state it answered in (live, an earlier copy, did not answer) and
// the search host behind the topic searches. The page hands it the real
// fetch; this hands it a fixture with every state.
import { LiveHeadlinesView } from "@/app/(app)/news/live-headlines";
import type { LiveHeadlines, SourceStatus } from "@/lib/news/live";

describe("News live section", () => {
  const status = (id: string, name: string, over: Partial<SourceStatus> = {}): SourceStatus => ({
    id,
    name,
    home: `https://${id}.test/`,
    kind: "publisher",
    ok: true,
    count: 12,
    ms: 40,
    stale: false,
    cached: false,
    ...over,
  });
  const live: LiveHeadlines = {
    fetchedAt: "2026-09-14T19:00:00Z",
    headlines: [
      {
        title: "Investor takes over distressed Atlanta apartment asset",
        url: "https://a.test/1",
        publisher: "Connect CRE",
        publisherUrl: "https://a.test/",
        publishedAt: "2026-09-14T17:00:00Z",
        snippet: "The lender-controlled sale closed at a 6.4% cap.",
        sourceId: "connect",
        image: "https://cdn.a.test/atlanta.jpg",
        score: 3.2,
      },
      {
        title: "PGIM refis Manhattan office-to-storage conversion",
        url: "https://b.test/2",
        publisher: "Commercial Observer",
        publisherUrl: null,
        publishedAt: null,
        snippet: "",
        sourceId: "co",
        image: null,
        score: 2.1,
      },
    ],
    sources: [
      status("co", "Commercial Observer"),
      status("trd", "The Real Deal", { via: "Bing News · site:therealdeal.com" }),
      status("cpe", "Commercial Property Executive", {
        ok: false,
        stale: true,
        count: 100,
        ms: 4187,
        error: "HTTP 403 · Google News · site:commercialsearch.com: The operation was aborted due to timeout",
      }),
      status("gn-cre", "Google News · commercial real estate", { kind: "topic", via: "Bing News · commercial real estate" }),
      status("mhn", "Multi-Housing News", { ok: false, count: 0, ms: 8000, error: "HTTP 403" }),
    ],
  };

  it("leads with the top story — kicker, headline, dek, the publisher's picture — then the sources as one line, and reads clean", () => {
    const html = render(React.createElement(LiveHeadlinesView, { live }));
    const text = visibleText(html);
    expect(text).toContain("live from 4 of 5 sources");
    expect(text).toContain("Monday, September 14, 2026");
    expect(text).toContain("Investor takes over distressed Atlanta apartment asset");
    // the kicker: what the story touches, and the covered market it names
    expect(text).toContain("distress");
    expect(text).toContain("Atlanta");
    expect(html).toContain('href="/market?metro=atlanta"');
    expect(text).toContain("Connect CRE");
    expect(text).toContain("2h ago");
    // the publisher's picture, decorative beside its headline
    expect(html).toContain('src="https://cdn.a.test/atlanta.jpg"');
    expect(html).toMatch(/<img[^>]*\salt=""/);
    // two stories: the lead and one in the grid, no list yet
    expect((html.match(/<article/g) ?? []).length).toBe(2);
    expect(text).not.toContain("More headlines");
    // the topic source reads as its topic; the row already names the host
    expect(text).toContain("commercial real estate");
    expect(text).toContain("(earlier copy)");
    expect(text).toContain("(did not answer)");
    expect(text).toContain("via Bing News");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-live", html);
  });

  it("keeps the front page's shape at fourteen stories: one lead, six in the grid, the rest in the list", () => {
    const many: LiveHeadlines = {
      ...live,
      headlines: Array.from({ length: 14 }, (_, i) => ({
        ...live.headlines[i % 2],
        url: `https://m.test/${i}`,
        title: `${live.headlines[i % 2].title} (${i + 1})`,
      })),
    };
    const html = render(React.createElement(LiveHeadlinesView, { live: many }));
    const text = visibleText(html);
    expect((html.match(/<article/g) ?? []).length).toBe(7);
    expect(text).toContain("More headlines");
    expect(text).toContain("(14)");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-live-fold", html);
  });

  it("says so when nothing answered — a sentence, never a fake page", () => {
    const dark: LiveHeadlines = {
      ...live,
      headlines: [],
      sources: live.sources.map((s) => ({ ...s, ok: false, stale: false, count: 0, via: undefined, error: "HTTP 503" })),
    };
    const html = render(React.createElement(LiveHeadlinesView, { live: dark }));
    const text = visibleText(html);
    expect(text).toContain("None of the publishers answered just now");
    expect(text).toContain("live from 0 of 5 sources");
    expect(text).not.toContain("via ");
    expect(html).not.toContain("<article");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-live-dark", html);
  });
});

describe("News scored feed", () => {
  const item = (over: Partial<ItemRow>): ItemRow => ({
    url: "https://x.test/1",
    title: "t",
    source: "GlobeSt",
    sector: "multifamily",
    relevance: 7,
    summary: null,
    action: null,
    published_at: null,
    created_at: "2026-09-14T11:00:00Z",
    ...over,
  });
  const items: ItemRow[] = [
    item({
      url: "https://x.test/1",
      title: "Rent cap bill advances in Annapolis",
      sector: "regulation-md",
      relevance: 8,
      summary: "The bill would cap increases at CPI plus 3%.",
      action: "Re-run the Maryland deals' rent growth at the cap.",
    }),
    item({
      url: "https://x.test/2",
      title: "Fannie tightens agency debt terms",
      sector: "capital-markets",
      relevance: 3,
      created_at: "2026-09-13T11:00:00Z",
    }),
    item({ url: "https://x.test/3", title: "Local bakery opens second location", relevance: null }),
  ];
  const alerts: AlertRow[] = [
    // A rule the research file holds, and an id the intel sweep matched
    // that the file does not.
    {
      id: "a1",
      rule_id: "md-moco-rent-stabilization",
      headline: "Montgomery County sets its 2027 rent stabilization cap",
      url: "https://x.test/law",
      detail: null,
      detected_at: "2026-09-14T10:00:00Z",
    },
    {
      id: "a2",
      rule_id: "md-rent-cap",
      headline: "Maryland rent stabilization act signed",
      url: "https://x.test/law2",
      detail: null,
      detected_at: "2025-11-03T15:00:00Z",
    },
  ];

  it("groups the stories by the day the sweep picked them up, highest relevance first, with the sector chips and the law strip", () => {
    const html = render(React.createElement(ScoredFeedView, { items, alerts, wantSector: "" }));
    const text = visibleText(html);
    expect(text).toContain("rule changes");
    expect(text).toContain("Maryland rent stabilization act signed");
    // The strip says when, as the day headings do (with the year, since it
    // keeps the newest few whenever they came), and names the rule by the
    // research file's words — never an ISO date or a raw rule id; an id the
    // file does not hold says nothing.
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Montgomery County sets its 2027 rent stabilization cap Monday, Sep 14, 2026 · affects rent control (Montgomery County, MD)");
    expect(flat).toContain("Maryland rent stabilization act signed Monday, Nov 3, 2025");
    expect(flat).not.toMatch(/Nov 3, 2025 · affects/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toContain("md-rent-cap");
    expect(text).not.toContain("md-moco-rent-stabilization");
    expect(html).toContain('<time dateTime="2026-09-14T10:00:00Z" class="whitespace-nowrap">');
    expect(text).toContain("Monday, Sep 14");
    expect(text).toContain("Sunday, Sep 13");
    expect(text).toContain("8/10");
    expect(text).toContain("MD regulation");
    expect(text).toContain("capital markets");
    expect(html).toContain('href="/news?sector=regulation-md"');
    // within a day the scored story leads and the unscored one trails
    expect(text.indexOf("Rent cap bill")).toBeLessThan(text.indexOf("Local bakery"));
    expect(text).toContain("Re-run the Maryland deals");
    expect(text).not.toContain("starts with the weekday sweep");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-scored", html);
  });

  it("filters to the sector asked for, and ignores one the rows have never seen", () => {
    const one = visibleText(render(React.createElement(ScoredFeedView, { items, alerts: [], wantSector: "capital-markets" })));
    expect(one).toContain("Fannie tightens");
    expect(one).not.toContain("Rent cap bill");
    const all = visibleText(render(React.createElement(ScoredFeedView, { items, alerts: [], wantSector: "nope" })));
    expect(all).toContain("Rent cap bill");
    expect(all).toContain("Fannie tightens");
  });

  it("says the sweep has not run, in one quiet line, when there are no rows", () => {
    const html = render(React.createElement(ScoredFeedView, { items: [], alerts: [], wantSector: "" }));
    const text = visibleText(html);
    expect(text).toContain("starts with the weekday sweep");
    // no law strip, no sector chips, no day group — one line only
    expect(html).not.toContain("<section");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<h2");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });
});

// ── /tools, the deal-math calculators ──────────────────────────────────────
//
// A client component full of controls is exactly the shape the a11y lint
// exists for: eleven text inputs, a checkbox and three toggle buttons, every
// one of which needs a name a screen reader can read. Rendered here in its
// default state, which is also the state a first-time visitor meets — so
// this doubles as a check that the seeded numbers actually compute rather
// than showing a page of em dashes.
import { DealMathTools } from "@/app/tools/deal-math-tools";
import { TOOL_GROUPS, TOOL_INDEX } from "@/lib/tools/catalog";

describe("the deal math tools", () => {
  const html = render(React.createElement(DealMathTools));
  const text = visibleText(html);

  it("renders the seed on the server, where there is no URL to read", () => {
    // The trap useSyncExternalStore exists for: a hook that read
    // window.location during render would make the server's HTML and the
    // browser's first paint disagree — a hydration error to React, a flash
    // of the wrong numbers to a reader. The server snapshot is the seed,
    // and this render IS the server, so the seeded figures must be here.
    expect(html).toContain('value="$20M"');
    expect(text).toContain("$12,656,86");
  });

  it("offers a link and a table, so the work can leave the page", () => {
    // An analyst who cannot get a sizing out of the page goes back to
    // Excel, which is the thing this page exists to prevent.
    expect(text).toContain("Copy link to this sizing");
    expect(text).toContain("Copy as table");
    expect(a11yIssues(html), "the copy buttons are named").toEqual([]);
  });

  it("names every control and reads clean", () => {
    expect(a11yIssues(html), "a11y tools").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    dumpView("tools", html);
  });

  it("answers on its seeded numbers rather than showing a page of dashes", () => {
    // $20M at a $1.2M NOI, 6.5% over 30 years, 65 / 1.25x / 9% — coverage is
    // the binding test, and saying so is the point of the whole card.
    expect(text).toContain("Debt service coverage");
    expect(text).toContain("governs at");
    expect(text).toContain("1.25x");
    // the loan lands where lib/tools/deal-math says it does
    expect(text).toContain("$12,656,86");
    // 5% of $30M hard cost, on a $42.5M total, at a 7% yield on cost
    expect(text).toContain("$42.50M");
    expect(text).toContain("7.00%");
    expect(text).toContain("150 bps");
    // $36/SF/yr over 100,000 SF and 120 units: $3.60M a year, $2,500 a
    // unit a month. The totals read compact, the per-unit rent exact —
    // which is the right way round, since one is a magnitude and the other
    // is a figure somebody will type into a comp sheet.
    expect(text).toContain("$3.60M");
    expect(text).toContain("$2,500");
  });

  it("shows the shorthand in the price fields it now accepts", () => {
    // Both the fix and the teaching: a field seeded with "$20M" tells the
    // next person the notation works, and the figures below it prove the
    // reader read it. live-verify greps the live page for this exact
    // attribute, because the old build could not produce it — the old
    // parser could not read "$20M", so it could not have been seeded.
    expect(html).toContain('value="$20M"');
    expect(text).toContain("$12,656,86"); // …and $20M sized the loan
  });

  it("shows what a lease is worth after what it cost to sign", () => {
    // $36 face, ten years, twelve months free, $90 TI, 4% commission, 3%
    // steps. The point of the card is that $36 face is nothing like $36
    // effective, so the seeded case has to show that gap.
    expect(text).toContain("What the lease is really worth");
    expect(text).toContain("Net effective");
    expect(text).toContain("Where the face rent goes");
    // The concession is DRAWN before it is said: four segments, one each
    // for what is kept, the free rent, the TI and the commission.
    expect(html).toContain('class="bg-caution"');
    // …and the face rent is named beside the effective one, or the gap
    // has nothing to be a gap from.
    expect(text).toContain("The face rent is");
  });

  it("says one operating expense three ways", () => {
    // $504k on 120 units, 96,000 SF, $1.68M of income: $4,200 a unit,
    // $5.25 a foot, 30% of income. A broker quotes the first; an
    // underwriter argues the third.
    expect(text).toContain("One expense, three ways");
    expect(text).toContain("$4,200");
    expect(text).toContain("$5.25");
    expect(text).toContain("30.0%");
  });

  it("draws the binding test rather than only naming it", () => {
    // three tracks in the debt sizer, one filled in the brand colour and
    // two in the line colour — the picture that makes the short bar the
    // answer. (The cash-flow strip draws its own bars; they are counted in
    // their own test below, which is why this one anchors on `h-full`.)
    const sizerBars = html.match(/data-bar="lender-test"[^>]*/g) ?? [];
    expect(sizerBars.length, "three lender tests").toBe(3);
    expect(sizerBars.filter((b) => b.includes("bg-brand")).length, "one binds").toBe(1);
    expect(sizerBars.filter((b) => b.includes("bg-line")).length).toBe(2);
  });

  it("reads a pasted cash flow and says where the return comes from", () => {
    // The seeded strip: −$10M, four thin years, a $15.2M exit of which
    // $14.4M is the sale. It must answer on arrival, like every other card.
    expect(text).toContain("Paste a cash flow");
    expect(text).toContain("1.81x"); // $18.1M back on $10M in
    expect(text).toContain("$8.10M"); // the profit
    expect(text).toContain("4.5 yr"); // payback, inside the year
    // The split is the figure nothing else on the page computes, and it is
    // DRAWN before it is said: two segments, brand and sidebar.
    expect(text).toContain("from cash flow");
    expect(text).toContain("from the sale");
    expect(html).toContain('class="bg-sidebar"');
    // A deal that is mostly its exit says so in words too.
    expect(text).toContain("the cap you sell at is the argument");
    // Every year is drawn from a centre line: six rows, the first negative.
    // Scoped to THIS card's own bars. Counting `bg-kill` across the whole
    // page counted every other card's red too, so a new card with a failing
    // test in it broke an assertion about a cash flow.
    const years = html.match(/data-bar="year"[^>]*/g) ?? [];
    expect(years.length, "one bar per year").toBe(6);
    expect(years.filter((b) => b.includes("bg-kill")).length, "the year in").toBe(1);
    expect(years.filter((b) => b.includes("bg-brand")).length).toBe(5);
  });

  it("indexes itself, and every jump link lands on a real card", () => {
    // A page of this many cards is more than a reader should scroll past to
    // find one. The nav and the cards read one INDEX, and this holds the
    // two sides together: every href must name an id the page actually
    // emits, and every card must be reachable from the index.
    //
    // UNIQUE hrefs, and both counts read from the catalog rather than a
    // number written here. A card may be linked from more than one place —
    // the after-tax card's fine print points at the exchange — so a raw
    // count of hrefs is a count of links, not of cards, and a literal here
    // is one more thing to remember to bump.
    const hrefs = [...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]);
    const linked = new Set(hrefs);
    const ids = new Set([...html.matchAll(/<section id="([a-z0-9-]+)"/g)].map((m) => m[1]));
    expect(linked.size).toBe(TOOL_INDEX.length);
    expect(ids.size).toBe(TOOL_INDEX.length);
    for (const h of hrefs) expect(ids.has(h), `#${h} has no card`).toBe(true);
    for (const id of ids) expect(hrefs, `${id} is not in the index`).toContain(id);
    expect(text).toContain("Jump to");
  });

  it("makes the equity the plug, and says how far above the price it is", () => {
    // $20M price, $3M capital, 2% closing, 1% loan fee, $500k reserve, $13M
    // loan. The figure people carry is $20M − $13M = $7M; the cheque is
    // $11.03M, and that gap is the card.
    expect(text).toContain("Sources and uses");
    expect(text).toContain("$24.03M");
    expect(text).toContain("$11.03M");
    expect(text).toContain("$7.00M"); // the figure it corrects
    // Leverage both ways, because they are different numbers.
    expect(text).toContain("54.1%");
    expect(text).toContain("65.0%");
    expect(text).toContain("20.2%");
    // Closing is 2% of the PRICE, not of a total that includes itself.
    expect(text).toContain("$400,000");
    expect(text).toContain("$130,000");
  });

  it("draws both sides as bars of the same length", () => {
    // Five use segments (price, capital, closing, fee, reserves) and two
    // source segments (debt, equity) — seven in all. Both bars run the full
    // width, which is what "the sides balance" looks like.
    expect((html.match(/data-bar="stack"/g) ?? []).length).toBe(7);
    expect(text).toContain("Purchase price");
    expect(text).toContain("Loan fee");
    expect(text).toContain("Equity");
  });

  it("reads a pasted unit mix and weights it by units", () => {
    // 144 units: 24 studios, 60 ones, 48 twos, 12 threes. The weighted
    // average rent is $1,858 — the average of the four ROW rents is $1,961,
    // which is the number you get by averaging what you can see.
    expect(text).toContain("Read the unit mix");
    expect(text).toContain("144");
    expect(text).toContain("$1,858");
    expect(text).not.toContain("$1,961");
    // GPR both ways, and the gap between them.
    expect(text).toContain("$3.21M");
    expect(text).toContain("$3.48M");
    expect(text).toContain("$272,160");
    expect(text).toContain("7.8%");
    // Rent per foot needs the SF column, which this table has.
    expect(text).toContain("841");
    expect(text).toContain("$26.50");
  });

  it("draws a row per unit type, as wide as its share of the building", () => {
    expect(text).toContain("Studio");
    expect(text).toContain("1 Bed / 1 Bath");
    expect((html.match(/data-bar="mix-row"/g) ?? []).length).toBe(4);
    // Nothing is missing from this table, so no caveat is printed.
    expect(text).not.toContain("no square footage stated");
  });

  it("turns acres into square feet, so nobody has to remember 43,560", () => {
    expect(text).toContain("The site, and what it carries");
    expect(text).toContain("2.5 acres");
    expect(text).toContain("108,900 SF");
    expect(text).toContain("One acre is 43,560 square feet");
  });

  it("draws the built floor area inside what the zoning allows", () => {
    // 165,000 SF on 108,900 of land is 1.52 FAR against a 1.75 limit —
    // 25,575 SF of the site never built. The bar is the gap.
    expect(text).toContain("Built at 1.52 FAR");
    expect(text).toContain("of an allowed 1.75");
    expect(text).toContain("25,575 SF unbuilt");
    expect((html.match(/data-bar="far"/g) ?? []).length).toBe(1);
  });

  it("counts density, land per unit and parking both ways", () => {
    // 180 units on 2.5 acres is 72/acre; 270 spaces is 1.50 per unit and
    // 1.64 per 1,000 SF — the residential and commercial conventions, which
    // are different numbers for the same car park.
    expect(text).toContain("72.0");
    expect(text).toContain("605");
    expect(text).toContain("917 SF");
    expect(text).toContain("1.50");
    expect(text).toContain("1.64");
  });

  it("takes the land out before it depreciates anything", () => {
    // $20M at 25% land is $15M of basis, and $545,455 a year off a 27.5-year
    // schedule turns $1.2M of NOI into a loss.
    expect(text).toContain("Depreciation, and what the sale takes back");
    expect(text).toContain("Land is never depreciable");
    expect(text).toContain("$15.00M");
    expect(text).toContain("$545,455");
    expect(text).toContain("a $190,455 paper loss");
    // The sign belongs in the words, never in front of the dollar sign.
    expect(text).not.toContain("$-190,455");
  });

  it("splits the gain at the sale into the rates it is actually taxed at", () => {
    expect(text).toContain("$11.45M");
    expect(text).toContain("Unrecaptured 1250");
    expect(text).toContain("$5.45M");
    expect(text).toContain("Capital gain");
    expect(text).toContain("$6.00M");
    // No cost segregation on the seed, so there is no 1245 slice.
    expect((html.match(/data-bar="gain-slice"/g) ?? []).length).toBe(2);
  });

  it("names the error it exists to prevent", () => {
    // $11.45M at 20% says $2.29M. The bill is $2.56M.
    expect(text).toContain("Running the whole gain at the capital gains rate would say $2.29M");
    expect(text).toContain("$2.56M");
  });

  it("says what the shelter was worth and what the sale took back", () => {
    expect(text).toContain("$2.02M");
    expect(text).toContain("$1.36M");
    expect(text).toContain("$654,545");
    expect(text).toContain("shelter and recapture at the same rate and it nets");
  });

  it("says plainly that it is not tax advice", () => {
    expect(text).toContain("federal only");
    expect(text).toContain("Not tax advice");
  });

  it("settles the closing statement, and says which way each line moves", () => {
    // A 15 April close on a calendar-year bill: 105 of 365 days to the
    // seller, so $69,041 of a $240,000 bill; half of April's $150,000 rent;
    // the deposits whole; the escrow off the wire.
    expect(text).toContain("Who owes whom at closing");
    expect(text).toContain("$69,041");
    expect(text).toContain("105 of 365 days the seller owned");
    expect(text).toContain("15 of 30 days the buyer owns the building");
    expect(text).toContain("$736,041"); // the net credit
    expect(text).toContain("$19.26M"); // …so this is the wire
    expect(text).toContain("105 / 260");
  });

  it("draws each credit on the side the money moves to", () => {
    // The point of the picture: reading arrears as advance does not change a
    // number, it flips a bar. Four lines on the seed, every one to the
    // buyer, so every bar is on the brand side of the centre.
    const bars = html.match(/data-bar="proration"[^>]*/g) ?? [];
    expect(bars.length, "one bar per statement line").toBe(4);
    expect(bars.filter((b) => b.includes("bg-brand")).length).toBe(4);
    expect(bars.filter((b) => b.includes("bg-caution")).length).toBe(0);
    // …and the direction is named in words as well as drawn.
    expect(text).toContain("To the seller");
    expect(text).toContain("To the buyer");
    expect(text).toContain("misses by the sum of the two figures, not the difference");
  });

  it("never lets the tenants' deposits read as the seller's money", () => {
    expect(text).toContain("Security deposits");
    expect(text).toContain("the buyer inherits the obligation to return it");
  });

  it("shows an exchange that passes the price test and still owes tax", () => {
    // The seeded deal is the trap, on first load: $26M sold and $30M bought
    // with MORE debt, so the price test passes comfortably — and $1.22M of
    // proceeds stayed in the seller's pocket, which no amount of fresh
    // borrowing cures.
    expect(text).toContain("Roll it into the next deal");
    expect(text).toContain("$30.00M of $25.22M"); // trade up: met
    expect(text).toContain("$12.00M of $13.22M"); // reinvest the equity: not
    expect(text).toContain("$18.00M of $12.00M"); // replace the debt: met
    expect(text).toContain("Short by $1,220,000");
    expect(text).toContain("STILL boot");
    expect(text).toContain("$305,000"); // the bill on the boot
    expect(text).toContain("$2.11M"); // what the exchange deferred
  });

  it("draws the three tests, failing the one that causes the boot", () => {
    const bars = html.match(/data-bar="exchange-test"[^>]*/g) ?? [];
    expect(bars.length, "one bar per test").toBe(3);
    expect(bars.filter((b) => b.includes("bg-pass")).length).toBe(2);
    expect(bars.filter((b) => b.includes("bg-kill")).length).toBe(1);
    // The gain splits into what rolls forward and what is taxed now.
    expect((html.match(/data-bar="gain-split"/g) ?? []).length).toBe(2);
  });

  it("says the deferred gain is still there, in the replacement's basis", () => {
    // $30M of property carrying a $20.5M basis. A card that stopped at "tax
    // deferred" would read as a saving, which is the thing it must not do.
    expect(text).toContain("Deferred is not forgiven");
    expect(text).toContain("$20.50M");
    expect(text).toContain("$9.50M"); // rolled into the replacement
  });

  it("reconciles the expenses, and grosses BOTH years up", () => {
    // The seeded building: 100,000 SF, a 12,000 SF tenant, a base year
    // struck at 72% occupancy. Gross-up adds $287,500 to the base and
    // $12,553 to this year, which is the whole point of the picture.
    expect(text).toContain("What the tenant actually owes");
    expect(text).toContain("$1.83M"); // the grossed-up base
    expect(text).toContain("$1.91M"); // the grossed-up current year
    expect(text).toContain("72% full");
    expect(text).toContain("94% full");
    expect(text).toContain("12.00%"); // the pro rata share
  });

  it("prices the one-sided gross-up rather than warning about it", () => {
    expect(text).toContain("leave the base year alone");
    expect(text).toContain("$10,206"); // both years grossed up
    expect(text).toContain("$38,623"); // only this year
    expect(text).toContain("$28,417"); // the difference, in the sentence
    const bars = html.match(/data-bar="one-sided"[^>]*/g) ?? [];
    expect(bars.length, "the honest share against the one-sided one").toBe(2);
    expect(bars.filter((b) => b.includes("bg-kill")).length).toBe(1);
  });

  it("answers in the direction the money moves, not as a total", () => {
    // $10,206 of share against $30,000 of estimates is a REFUND, and the
    // card says so in those words rather than leaving a reader to subtract.
    expect(text).toContain("the tenant is owed");
    expect(text).toContain("$19,794");
  });

  it("draws each year as fixed, variable and the gross-up on top", () => {
    const years = html.match(/data-bar="recovery-year"/g) ?? [];
    expect(years.length, "fixed and variable, both years").toBe(4);
    const adj = html.match(/data-bar="recovery-grossup"/g) ?? [];
    expect(adj.length, "one gross-up segment per year").toBe(2);
  });

  it("lets the loan schedule leave the page as numbers", () => {
    // The one table here a reader most often wants OUT of the page — into
    // a model, a lender's file, a memo. Two Copy-as-table buttons now: the
    // cash flow's and this one.
    const copies = (text.match(/Copy as table/g) ?? []).length;
    expect(copies, "the cash flow's and the loan schedule's").toBe(2);
  });

  it("shows a percentage-rent year that owes nothing and still collects", () => {
    // $120,000 at 6% is a $2M natural breakpoint, a twelfth of which is
    // $166,667. The seeded year lands at $1.92M — under the breakpoint, so
    // nothing is owed — and November and December each clear the monthly
    // line, which a monthly bill with no true-up keeps.
    expect(text).toContain("Percentage rent, and the breakpoint");
    expect(text).toContain("$2.00M"); // the natural breakpoint
    expect(text).toContain("$166,667"); // a twelfth of it
    expect(text).toContain("$1.92M"); // the year's sales
    expect(text).toContain("$22,300"); // what a monthly regime collects
    expect(text).toContain("2 months over");
    expect(text).toContain("that the year's sales do not support");
  });

  it("shows the cap the buyer actually gets after the assessor catches up", () => {
    // The seeded building: $25M, a $14M assessment the seller has had for
    // years, 1.5% — so the bill goes $210,000 to $375,000 and the 6% on
    // the cover is 5.34% to the buyer.
    expect(text).toContain("What the taxes become when you own it");
    expect(text).toContain("$375,000"); // the bill after closing
    expect(text).toContain("$265,000"); // year one, a third of the way in
    expect(text).toContain("$165,000"); // what it adds to the expense line
    expect(text).toContain("5.34%"); // the cap the buyer gets
    expect(text).toContain("$22.80M"); // where the 6.00% is actually true
    expect(text).toContain("$2.20M"); // what that is worth in negotiation
  });

  it("names the growth rate a price is quietly assuming", () => {
    // $25M for $1.5M is a 6.00% cap. Held five years and sold at 6.25%
    // with 2% of sale cost, a 12% UNLEVERED return needs 7.16% growth —
    // 4.16 points past the 3% the reader called ordinary, so "heroic".
    expect(text).toContain("What you would have to believe");
    expect(text).toContain("7.16%"); // the growth required
    expect(text).toContain("heroic");
    expect(text).toContain("5.01%"); // the exit cap at ordinary growth
    expect(text).toContain("This return is unlevered");
  });

  it("draws the growth pair and the exit-cap pair", () => {
    expect((html.match(/data-bar="growth"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="exit"/g) ?? []).length).toBe(2);
  });

  it("draws the stack bottom to top and names every layer", () => {
    expect(text).toContain("What each layer costs, and whether it earns its place");
    // One segment per layer, common equity included — the plug is part of
    // the picture, not the space left over from it.
    expect((html.match(/data-bar="layer"/g) ?? []).length).toBe(4);
    expect(text).toContain("Senior loan");
    expect(text).toContain("Mezzanine");
    expect(text).toContain("Preferred (accruing)");
    expect(text).toContain("Common equity");
    expect(text).toContain("$22.00M"); // the plug: 100 less 60, 10 and 8
  });

  it("passes the blend and still marks the layers that are over the line", () => {
    // The card's whole argument. A 6.13% blended cost against a 6.5%
    // yield on cost reads fine, and both layers above the senior cost
    // more than the building earns.
    expect(text).toContain("6.13%");
    expect(text).toContain("The line is the 6.50% yield on cost.");
    expect(text).toContain("The blend is hiding it");
    const rates = html.match(/data-bar="rate"[^>]*/g) ?? [];
    expect(rates.length, "three layers plus the blend").toBe(4);
    expect(rates.filter((b) => b.includes("bg-kill")).length, "mezz and pref").toBe(2);
    expect(rates.filter((b) => b.includes("bg-brand")).length, "senior and blend").toBe(2);
  });

  it("shows the ratio rising while the cash falls", () => {
    // Rule 3: the accruing preferred takes no cash, so cash-on-cash goes
    // UP as the equity base shrinks. Both figures are drawn so the rise
    // can be seen for what it is.
    expect(text).toContain("7.89%"); // cash-on-cash with the full stack
    expect(text).toContain("6.59%"); // the senior alone would give
    expect(text).toContain("The ratio is not the test here");
    // And the balloon it is hiding.
    expect(text).toContain("$13.48M"); // owed at the sale
    expect(text).toContain("$5.48M"); // of which accrual
    expect(text).toContain("$1.08M"); // the compounding alone
  });

  it("separates the three coverage ratios", () => {
    expect(text).toContain("1.68×"); // the senior's own
    expect(text).toContain("1.36×"); // once the mezzanine is counted
    expect(text).toContain("decides who can take the property");
  });

  it("files the jump index into named clusters", () => {
    // Twenty-six chips in a row is a wall; six clusters is a directory.
    for (const g of TOOL_GROUPS) expect(text, g).toContain(g);
    // And the links are all still there — grouping must not lose one.
    const linked = new Set(
      [...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    expect(linked.size).toBe(TOOL_INDEX.length);
  });

  it("puts the bridge loan's cap on the wrong side of its covenant", () => {
    // The seeded loan is the case the card exists for: a 4.00% strike that
    // looks like it is right there, 8 bps above the point at which the loan
    // breaks its own covenant.
    expect(text).toContain("The bridge loan, and whether its cap protects anything");
    expect(text).toContain("The cap is on the wrong side of the covenant.");
    expect(text).toContain("Covenant breaks 3.92%");
    expect(text).toContain("Cap strike 4.00%");
    expect(text).toContain("6.64%"); // SOFR + 300 today
    expect(text).toContain("1.25x"); // DSCR today, comfortably over the 1.20
    expect(text).toContain("1.19x"); // and under it at the strike
    expect(text).toContain("75 bps"); // the premium said as a rate
    // Today, the breach and the strike on one track, plus the fill.
    expect((html.match(/data-bar="float"/g) ?? []).length).toBe(4);
  });

  it("runs the construction draw rather than approximating it", () => {
    // The card exists to price the gap between the schedule and the
    // constant lib/construction-debt.ts assumes.
    expect(text).toContain("The interest reserve, run month by month");
    expect(text).toContain("$1.36M"); // the schedule's reserve
    expect(text).toContain("$1.91M"); // the average-balance shortcut
    expect(text).toContain("$3.46M"); // as if drawn at closing
    expect(text).toContain("42% of loan"); // measured, not the assumed 55%
    expect(text).toContain("Month 7"); // equity funds the first seven
    expect(text).toContain("Equity funds the first 7 of 24 months");
    // One bar a month, closing through completion, plus the three reserves.
    expect((html.match(/data-bar="draw"/g) ?? []).length).toBe(25);
    expect((html.match(/data-bar="reserve"/g) ?? []).length).toBe(3);
  });

  it("names the direction the shortcut errs in, which is why it hides", () => {
    expect(text).toContain("reads as prudence rather than as a mistake");
  });

  it("says the premium is a quote and not something it worked out", () => {
    expect(text).toContain("never a number this works out");
    expect(text).toContain("use funded at closing");
  });

  it("keeps the 10-year out of the prepayment card and says why", () => {
    // The strip above carries today's 10-year. The clause here wants the
    // Treasury matched to the remaining term, so the card is seeded with
    // its worked example and the note names the direction of the error.
    expect(html).toContain('value="4.75"');
    expect(text).toContain("matched to the REMAINING term");
    expect(text).toContain("understates what getting out costs");
  });

  it("draws the two ways out, one of them a gain", () => {
    expect(text).toContain("What it costs to get out of the loan early");
    expect(text).toContain("$200,000"); // yield maintenance, all of it the floor
    // The sign goes outside the dollar, which it did not before this
    // card made a negative headline figure impossible to miss.
    expect(text).toContain("-$385,213"); // defeasance, a gain after hard costs
    expect(text).not.toContain("$-");
    expect(text).toContain("Yield maintenance — all of it the floor");
    // Two rows, each a left and a right half of the same centre line.
    expect((html.match(/data-bar="prepay"/g) ?? []).length).toBe(4);
  });

  it("names the cheaper route and what the debt is worth to a buyer", () => {
    expect(text).toContain("defeasance");
    expect(text).toContain("$1.24M"); // below market, to a buyer assuming it
    expect(text).toContain("the lender loses nothing by being repaid");
    expect(text).toContain("Both are worth having; only one can be had");
  });

  it("draws the honest answer against the spread everyone starts from", () => {
    expect(text).toContain("What a below-market lease is worth to end");
    expect(text).toContain("$2.93M"); // the spread over the term
    expect(text).toContain("$1.50M"); // what ending the lease is worth
    expect(text).toContain("$14.00 / SF"); // under market by
    expect(text).toContain("$560,000"); // a year across the space
    // Two rows, each drawn from the centre line as a left and a right
    // half, so a negative answer has somewhere to go.
    expect((html.match(/data-bar="buyout"/g) ?? []).length).toBe(4);
  });

  it("draws the bargain, and marks the tenant's floor when there is no deal", () => {
    expect(text).toContain("$3.18M"); // least the tenant should take
    expect(text).toContain("no deal on these terms");
    const sides = html.match(/data-bar="side"[^>]*/g) ?? [];
    expect(sides.length, "the ceiling and the floor").toBe(2);
    expect(sides.filter((b) => b.includes("bg-kill")).length, "the floor is out of reach").toBe(1);
  });

  it("prices a leasehold over its term rather than as a perpetuity", () => {
    // $8M NOI less $2M ground rent is $6M, which at a 5% fee-simple cap
    // looks like $120M. Over the 40 years the lease actually has, at 8%,
    // it is $97.5M — and 18.7% of the perpetual figure is a reversion
    // the fee owner keeps.
    expect(text).toContain("A building on someone else's land");
    expect(text).toContain("$120.00M"); // capitalised as though forever
    expect(text).toContain("$97.53M"); // worth over the term
    expect(text).toContain("4.00×"); // ground rent coverage today
    expect(text).toContain("2.22×"); // after the reset
  });

  it("draws the leasehold pair and the coverage pair", () => {
    expect((html.match(/data-bar="leasehold"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="coverage"/g) ?? []).length).toBe(2);
  });

  it("draws both caps and both prices, never one without the other", () => {
    // Each pair is the comparison the card exists to make; a single bar
    // is a figure with nothing to read it against.
    expect((html.match(/data-bar="cap"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="price"/g) ?? []).length).toBe(2);
  });

  it("draws the year against the line, and colours the months that clear it", () => {
    const months = html.match(/data-bar="month"[^>]*/g) ?? [];
    expect(months.length, "one bar per month pasted").toBe(12);
    expect(months.filter((b) => b.includes("bg-kill")).length, "Nov and Dec").toBe(2);
    expect(months.filter((b) => b.includes("bg-brand")).length).toBe(10);
    // And the two figures the card exists to contrast.
    expect((html.match(/data-bar="true-up"/g) ?? []).length).toBe(2);
  });

  it("says the occupancy cost, and the sales that would reach the ceiling", () => {
    expect(text).toContain("$178,000"); // base + recoveries, no percentage rent
    expect(text).toContain("9.27%");
    expect(text).toContain("$1.78M"); // sales at which the ratio is 10%
    expect(text).toContain("$40.00 a foot base");
    expect(text).toContain("$59.33 all in");
  });

  it("draws the clock, and shows the days a Q4 closing loses", () => {
    expect(text).toContain("both windows from the day you close");
    expect(text).toContain("2026-12-30"); // 45 days to identify
    expect(text).toContain("2027-04-15"); // the return's due date, not day 180
    expect(text).toContain("151 days");
    expect(text).toContain("29 days");
    expect(text).toContain("An extension restores the full 180 days");
    // Two segments of the window plus the part the due date takes off it.
    expect((html.match(/data-bar="clock"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="clock-lost"/g) ?? []).length).toBe(1);
  });

  it("solves for the land instead of judging a price", () => {
    // $4.2M at a 5.5% cap is a $76.36M building. Build it for $44.55M hard,
    // $9.80M soft and $3.76M of carry, take 15% on cost, and $8.29M is what
    // is left for the dirt.
    expect(text).toContain("What the land can be worth");
    expect(text).toContain("$76.36M");
    expect(text).toContain("$44.55M");
    expect(text).toContain("$9.80M");
    expect(text).toContain("$3.76M");
    expect(text).toContain("$8.29M");
    expect(text).toContain("$50.26");
    expect(text).toContain("$46,075");
  });

  it("draws the land as a segment of the finished value, five parts in all", () => {
    // Hard, soft, carry, profit, land — and they sum to the whole, which is
    // what makes the thin land segment read as the point rather than as a
    // gap in the picture.
    expect((html.match(/data-bar="residual"/g) ?? []).length).toBe(5);
  });

  it("names the binding test, and what the other one would have allowed", () => {
    expect(text).toContain("Binding test");
    expect(text).toContain("Profit on cost");
    expect(text).toContain("At 15% profit on cost the site is worth $8.29M");
    expect(text).toContain("6.25% yield on cost, $9.05M");
    expect(text).toContain("lower of two tests you have agreed to meet");
  });

  it("says what a quarter point and a 5% overrun do to it", () => {
    // $8.29M becomes $5.57M and $5.58M — about a third gone either way.
    expect(text).toContain("A quarter point wider on the exit cap takes it to $5.57M");
    expect(text).toContain("5% overrun on the build, to $5.58M");
    expect(text).toContain("a residual is a range and not a number");
  });

  it("splits the rentable foot into what you occupy and what you pay for", () => {
    expect(text).toContain("Rentable, usable, and the rent you actually pay");
    expect(text).toContain("Every 100 rentable feet is 87 you occupy");
    expect(text).toContain("13 of lobby, corridor and core");
    expect((html.match(/data-bar="load-usable"/g) ?? []).length).toBe(1);
    expect((html.match(/data-bar="load-common"/g) ?? []).length).toBe(1);
  });

  it("converts the quoted rent to the foot a tenant can furnish", () => {
    // A 15% load turns $38.00 per rentable foot into $43.70 per usable one.
    // The card also keeps the two figures people both call "the load
    // factor" side by side: 15.0% and 13.0% are the same building.
    expect(text).toContain("$38.00 per rentable foot");
    expect(text).toContain("$43.70 per foot you can furnish");
    expect(text).toContain("15.0%");
    expect(text).toContain("13.0%");
    expect(text).toContain("92.0%");
    expect(text).toContain("$291,333");
  });

  it("says the property's IRR is not anybody's IRR", () => {
    // One property, three answers: the deal makes 14.1%, the LP keeps 13.3%
    // and the GP takes 20.6%. That row IS the card — everything under it
    // explains where the gap went.
    expect(text).toContain("Who actually gets the return");
    expect(text).toContain("14.1%");
    expect(text).toContain("13.3%");
    expect(text).toContain("20.6%");
    expect(text).toContain("1.61x");
    expect(text).toContain("2.05x");
    // The promote, named as what the GP took above its share of the equity.
    expect(text).toContain("$400,565");
    expect(text).toContain("above its share of the equity");
    expect(text).toContain("0.8 pts");
  });

  it("draws every dollar back, split by tier", () => {
    // Three tiers reached on the seeded deal — the pref, 80/20 to 12%, and
    // 70/30 climbing toward 18% where the cash runs out.
    expect(text).toContain("Preferred return, 8%");
    expect(text).toContain("To 12% — 80/20");
    expect(text).toContain("To 18% — 70/30");
    // Each tier draws two segments, LP then GP.
    expect((html.match(/data-bar="tier-lp"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="tier-gp"/g) ?? []).length).toBe(3);
  });

  it("runs the loan over the hold and draws each year's split", () => {
    // $13M at 6.5% over 30 years, held 10: a $986,026 payment, and $11.02M
    // STILL OWED at the balloon. The point of the card is that a third of
    // the schedule has run and 85% of the loan is still there.
    expect(text).toContain("What the loan does");
    expect(text).toContain("$986,026");
    expect(text).toContain("$11.02M");
    expect(text).toContain("15.2% of the loan is repaid over the term");
    expect(text).toContain("80% of everything paid is interest");
    // …and the sentence that names amortisation as equity rather than cost.
    expect(text).toContain("Principal — equity, returned at sale");
    // One column per year of the term, each split into two segments.
    const cols = html.match(/w-full bg-brand(\/30)?"/g) ?? [];
    expect(cols.length, "ten years, two segments each").toBe(20);
  });

  it("holds the take-out against what is owed", () => {
    // The schedule's balloon feeds the refinance directly — nothing here is
    // retyped. $1.45M of NOI at a 6.5% exit cap is $22.31M of value, and
    // the DSCR test lends $14.17M of it against $11.02M owed.
    expect(text).toContain("Can the balloon be refinanced?");
    expect(text).toContain("Owed at the balloon");
    expect(text).toContain("New loan");
    expect(text).toContain("$22.31M");
    expect(text).toContain("$14.17M");
    expect(text).toContain("cash-out refinance");
    // Two bars, one per side of the comparison.
    expect((html.match(/data-bar="refi"/g) ?? []).length).toBe(2);
    // The binding test is named, as it is in the sizer.
    expect(text).toContain("Debt service coverage");
  });

  it("prices the window the memorandum chose, in dollars of value", () => {
    // #337. Fifteen months of a growing building whose last three months
    // are its peak season: T-3 annualized reads $1,720,000 against a T-12
    // of $1,582,000. That $138,000 at the stated 5.5% cap is $2,509,091 of
    // value riding on which window the cover page quoted — the figure the
    // card exists to print, and the one no memorandum ever does.
    expect(text).toContain("Which trailing window");
    expect(text).toContain("T-3 annualized");
    expect(text).toContain("$1,720,000");
    expect(text).toContain("$1,582,000");
    expect(text).toContain("$2,509,091");
    expect(text).toContain("Worth, at that cap");
  });

  it("separates the growth from the season rather than leaving both in one figure", () => {
    // The whole claim in one sentence: +8.7% against the full year, +3.6%
    // against the same three months a year earlier. The difference is the
    // season, and only a year-over-year read can see it.
    expect(text).toContain("the building is up 3.6%");
    expect(text).toContain("The rest is the season, not the trend.");
  });

  it("draws every window on one track against the full year", () => {
    // Four windows — T-12, T-6, T-3, T-1 — each a bar, so a short window
    // standing clear of the full year is visible before a figure is read.
    expect((html.match(/data-bar="window"/g) ?? []).length).toBe(4);
  });

  it("sets the cover page's occupancy against what the building banks", () => {
    // #338. 200 units at $1,850, 95% leased — and 87.3% of market rent
    // actually reaching the bank once loss to lease, concessions, three
    // non-revenue units and bad debt are off. Both figures are true; only
    // one is ever printed.
    expect(text).toContain("The doors against the dollars");
    expect(text).toContain("95.0%");
    expect(text).toContain("87.3%");
    expect(text).toContain("7.7 pts");
  });

  it("prices the naive underwrite — vacancy off the top and nothing else", () => {
    // 4.96% against an honest 4.30%: 66bp of cap, which at the cap this
    // NOI really supports is $7,950,698 of price.
    expect(text).toContain("4.96%");
    expect(text).toContain("4.30%");
    expect(text).toContain("$7,950,698");
    expect(text).toContain("Cap on doors alone");
  });

  it("draws the two occupancies and every line of the bridge", () => {
    // Two bars on one track for the pair, five deductions below it.
    expect((html.match(/data-bar="occ"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="egi"/g) ?? []).length).toBe(5);
    expect(text).toContain("$4,440,000");
  });

  it("says which bucket the largest part of the gap is in", () => {
    // Rule 3, and the two buckets carry opposite instructions.
    expect(text).toContain("Loss to lease is the largest part");
    expect(text).toContain("closes as leases roll");
  });

  it("answers when to sell with a year rather than a verdict", () => {
    // #339. A $34M building with $18.5M of debt: $14.82M of equity in it,
    // 14.1% on holding one more year, and the decay crosses a 12.5%
    // reinvestment rate in year five.
    expect(text).toContain("Hold it or sell it");
    expect(text).toContain("$14.82M");
    expect(text).toContain("14.1%");
    expect(text).toContain("Year 5");
    expect(text).toContain("clears the hurdle for 4 more years and falls under it in year 5");
  });

  it("draws the decay, which is the thing a lifetime IRR cannot show", () => {
    // Ten years, each a bar against the first, so the slope is the picture.
    expect((html.match(/data-bar="hold"/g) ?? []).length).toBe(10);
    expect(text).toContain("The return on holding, year by year");
  });

  it("prices the error of charging the cost of selling against the hold year", () => {
    // 18.8% against an honest 14.1%, which on a 12.5% hurdle reverses the
    // answer from "sell in five years" to "hold indefinitely".
    expect(text).toContain("18.8%");
    expect(text).toContain("You pay that cost whenever you sell");
  });

  it("separates the broker's NOI from the one you would own", () => {
    // #341. A $48M building at a stated 5.50% cap: the reserve and the
    // leasing capital are $308,800 a year, and the cap a lender would
    // underwrite is 4.86%.
    expect(text).toContain("What sits below the NOI line");
    expect(text).toContain("$2,640,000");
    expect(text).toContain("$2,331,200");
    expect(text).toContain("4.86%");
    expect(text).toContain("is 64bp of cap rate above the one a lender would underwrite");
  });

  it("says the omission as a price, and again as a bid", () => {
    // $5,614,545 of value, which is also $48M less the $42.39M at which the
    // real NOI earns the advertised cap — one number said two ways.
    expect(text).toContain("$5,614,545");
    expect(text).toContain("$42.39M");
  });

  it("draws the largest line as the range the assumption actually spans", () => {
    // Four bars for the two NOIs and the two cost lines, one mark on the
    // renewal range.
    expect((html.match(/data-bar="line"/g) ?? []).length).toBe(4);
    expect((html.match(/data-bar="renew"/g) ?? []).length).toBe(1);
    expect(text).toContain("$144,000");
    expect(text).toContain("$472,000");
    expect(text).toContain("And the largest line is a guess");
  });

  it("solves a price instead of judging one", () => {
    // #342. $1.65M of NOI, a 15% levered target, ordinary agency debt:
    // $25.54M, a 6.46% going-in cap — and the stream rebuilt at that price
    // returns 15.0%, which is the round trip through the Excel export's
    // own IRR.
    expect(text).toContain("What you can pay");
    expect(text).toContain("$25.54M");
    expect(text).toContain("6.46%");
    expect(text).toContain("Rebuilt, it returns");
    expect(text).toContain("15.0%");
    // Every field a card needs is seeded, so no card opens asking for one
    // (lib/tools/blanks: a blank field is named, never read as zero).
    expect(text).not.toContain("a blank is not read as zero");
  });

  it("names which lender test governs, and where it changes hands", () => {
    // Both halves computed: the binding test comes out of sizeLoan at the
    // solved price, and the crossing is solved from the coverage cap.
    expect(text).toContain(
      "Loan to value governs at this price. Above $26.77M the coverage tests take over instead.",
    );
    expect(text).toContain("the shortest one is the loan");
  });

  it("draws the three tests and the equity stream", () => {
    // One bar per lender test plus the price-against-crossing bar, and one
    // per year of the equity stream including year zero.
    expect((html.match(/data-bar="bid"/g) ?? []).length).toBe(4);
    expect((html.match(/data-bar="bidflow"/g) ?? []).length).toBe(6);
  });

  it("says the same building's lease term three different ways", () => {
    // #344, rules 1 and 2 on the seeded roll: 7.0 years by area, 5.1 by
    // rent, 4.3 to the break. Every step down is a figure the memorandum
    // did not print, and the middle one is the flattering one it did.
    expect(text).toContain("When the income rolls");
    expect(text).toContain("7 yrs");
    expect(text).toContain("5.1 yrs");
    expect(text).toContain("4.3 yrs");
    expect(text).toContain(
      "Break options give up 0.8 years of the quoted term, leaving 4.3.",
    );
  });

  it("prices the cliff year as capital rather than as rent", () => {
    // Rule 4. The cheque is larger than the income at risk, which is the
    // sentence the card exists to put on a page.
    expect(text).toContain("$1,530,000");
    expect(text).toContain("$1,292,000");
    expect(text).toContain("a cheque larger than the income at risk");
    expect(text).toContain("$5,040,000"); // over the whole hold
  });

  it("reads the roll against the building rather than against itself", () => {
    // 172,000 leased feet in a 200,000-foot building, and 89.2% of the
    // income rolling before a five-year sale.
    expect(text).toContain("86.0%");
    expect(text).toContain("89.2%");
    expect(text).toContain("Meridian Health pays");
  });

  it("draws the terms and the schedule", () => {
    // Three term bars, one row per year of the hold.
    expect((html.match(/data-bar="walt"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="roll"/g) ?? []).length).toBe(5);
  });

  it("puts the lease-up's worst month deep into a lease-up that is going well", () => {
    // #345, rule 4. Month 22 is the month the building FILLS — the leasing
    // capital is due at signing and the rent it buys is six months behind.
    expect(text).toContain("Filling an empty building");
    expect(text).toContain(
      "The worst month is 22, not month one: $6,200,437 of cash out before the building carries itself.",
    );
  });

  it("shows slippage costing money the reserve cannot see", () => {
    // Rule 1, the finding: the trough FALLS to $5,674,789 on a six-month
    // slip, while the position at a common date is $693,442 worse. The
    // sentence renders only when the trough moves that way, so its presence
    // is the claim.
    expect(text).toContain("$5,674,789");
    expect(text).toContain("The reserve is the wrong place to look for slippage");
    expect(text).toContain("Where the cash stands at month 36");
    expect(text).toContain("$4,158,892"); // six months slower
    expect(text).toContain("$3,828,910"); // 5% less rent, the smaller shock
  });

  it("draws the J-curve and the three positions", () => {
    // One bar a month over the sixty-month horizon, and one per shock.
    expect((html.match(/data-bar="leaseup"/g) ?? []).length).toBe(60);
    expect((html.match(/data-bar="slip"/g) ?? []).length).toBe(3);
  });

  it("says what a sale-leaseback's rent is really buying", () => {
    // #346, rules 1 and 2. The seller writes the lease, so $5.4M of the
    // $27M price is the lease rather than the building — and the rent
    // reverts at year 20 while the building does not, which is $3,973,557
    // a buyer capitalising the contract NOI has not priced at all.
    expect(text).toContain("The sale-leaseback");
    expect(text).toContain("$27,000,000");
    expect(text).toContain("$5,400,000");
    expect(text).toContain(
      "The rent reverts at year 20, and the building does not — which is $3,973,557 of the price, 14.7% of it.",
    );
  });

  it("sets the escalating rent against a coupon that never moves", () => {
    // Rule 4: 6.09 cents in year one against a 6.50% coupon, 8.87 by the
    // end, crossing in year five — and the loan sized through sizeLoan.
    expect(text).toContain("Rent per dollar raised, against the mortgage coupon");
    expect(text).toContain("6.09");
    expect(text).toContain("8.87");
    expect(text).toContain("The rent passes it in year 5 and never comes back under");
    expect(text).toContain("$12,816,579");
  });

  it("draws the three values and a bar a year", () => {
    expect((html.match(/data-bar="slb"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="coupon"/g) ?? []).length).toBe(20);
  });

  it("charges the insurance quote against the memorandum's own price", () => {
    // #347, rules 1 and 2. The memorandum carries the seller's expiring
    // $420,000; the quote is $780,000, which is 65bp of the advertised
    // 5.25% cap and $6,857,143 of price.
    expect(text).toContain("What insurance really costs");
    expect(text).toContain("$780,000");
    expect(text).toContain("65 bps");
    expect(text).toContain("$6,857,143");
  });

  it("says the named-storm deductible as years of income", () => {
    // Rule 3, and the figure the card exists to put on a page: $2,600,000
    // retained per event against $2,900,000 of annual NOI.
    expect(text).toContain(
      "One named-storm event retains 0.9 years of NOI before the policy pays anything.",
    );
    expect(text).toContain("The deductible against a year of income");
    expect(text).toContain("$2,600,000");
  });

  it("prices raising the deductible as a frequency", () => {
    // Rule 4: $160,000 a year against $2,600,000 more per event is a
    // break-even of once every 16.3 years.
    expect(text).toContain("$160,000");
    expect(text).toContain("16.3 years");
    expect((html.match(/data-bar="prem"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="storm"/g) ?? []).length).toBe(2);
  });

  it("separates the property's return from the LP's, before and after fees", () => {
    // #349. Three answers about one property: 20.63% on the deck, 17.39%
    // to the LP once the promote is taken, 15.71% once the fees are too.
    expect(text).toContain("What the LP actually nets");
    expect(text).toContain("The LP, before fees");
    expect(text).toContain("20.63%");
    expect(text).toContain("17.39%");
    expect(text).toContain("15.71%");
  });

  it("says the acquisition fee against the cheque, not against the price", () => {
    // Rule 1. $450,000 is 1.5% of the $30,000,000 price and 4.11% of the
    // equity the LP actually wires — the figure no deck prints.
    expect(text).toContain("$450,000");
    expect(text).toContain("4.11%");
    expect(text).toContain("15.3%");
  });

  it("puts the asset management fee on both of its bases", () => {
    // Rule 2. One missing word in the term sheet is $110,250 a year.
    expect(text).toContain("$164,250");
    expect(text).toContain("$54,000");
    expect(text).toContain("$110,250");
  });

  it("draws the sponsor's take twice, as underwritten and 10% softer", () => {
    // Rule 4. The fee share moves 47.6% → 66.5% because the promote more
    // than halves while the fees fall by $40,000.
    expect(text).toContain("Exit 10% softer");
    expect(text).toContain("48% fee");
    expect(text).toContain("67% fee");
    // …and the note carries the unrounded pair, which is what moves.
    expect(text).toContain("66.5% of it is fees rather than promote");
    expect((html.match(/data-bar="feereturn"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="sponsor"/g) ?? []).length).toBe(4);
  });

  it("draws every zoning cap and names the one that binds", () => {
    // #350, rule 1. Density 160, floor area 198, height 238, parking 140 —
    // the site is held by the cap nobody writes at the top of a pro forma.
    expect(text).toContain("What the site actually holds");
    expect(text).toContain("160 units");
    expect(text).toContain("198 units");
    expect(text).toContain("238 units");
    expect(text).toContain("140 units");
    expect(text).toContain("Parking binds");
    expect((html.match(/data-bar="envelope"/g) ?? []).length).toBe(4);
  });

  it("charges a unit its gross area, not its net", () => {
    // Rule 2: 900 SF at 82% is 1,098 SF of floor area ratio, so the code
    // allows 198 against the 242 a napkin claims.
    expect(text).toContain("1,098 SF");
    expect(text).toContain("44 units that are not there");
  });

  it("prices the density bonus against the bonus it would take to break even", () => {
    // Rule 4: +20% on a 15% set-aside clears the 6.4% crossing.
    expect(text).toContain("The density bonus, against what it costs");
    expect(text).toContain("168 units");
    expect(text).toContain("Break-even bonus");
    expect(text).toContain("6.4%");
    expect((html.match(/data-bar="setaside"/g) ?? []).length).toBe(2);
  });

  it("draws the statement against the cash, a year a side of the line", () => {
    // #351, rule 1. The gap reverses: +$381,688 in year 1 (the concession)
    // to −$133,367 in year 10, crossing in year 5.
    expect(text).toContain("What the statement reports, and what the building collects");
    expect(text).toContain("+$381,688");
    expect(text).toContain("−$133,367");
    expect(text).toContain("Year 5");
    expect((html.match(/data-bar="sline"/g) ?? []).length).toBe(10);
  });

  it("prices this year's gap and names the receivable it built", () => {
    // Rules 3 and 4: $42,488 at 6.5% is $653,662, and the cumulative gap
    // standing on the seller's books in year 2 is $424,177.
    expect(text).toContain("$653,662");
    expect(text).toContain("Deferred rent on the books");
    expect(text).toContain("$424,177");
  });

  it("draws the feasibility rent against the rent the market signs", () => {
    // #352, rules 1 and 2. A new building needs $42.08; the market pays
    // $38.00, so nothing competes for 3.5 years of growth — even though the
    // building being held cost 53.3% of replacement.
    expect(text).toContain("The rent a new building needs");
    expect(text).toContain("$42.08");
    expect(text).toContain("$38.00");
    expect(text).toContain("53.3%");
    expect(text).toContain("Years of growth away");
    expect((html.match(/data-bar="feas"/g) ?? []).length).toBe(2);
  });

  it("solves the cost side too, which is the half nobody models", () => {
    // Rule 4b: today's $38 already pencils at $263.37 of hard cost.
    expect(text).toContain("$263.37");
    expect(text).toContain("the cost side is the one nobody models");
  });

  it("splits the quoted renovation premium from the gap to a better building", () => {
    // #354, rule 2. $250 quoted is $150 of renovation and $100 of the
    // comparable simply being a different building — two segments on one
    // track, because a decomposition is not a figure.
    expect(text).toContain("The renovation program");
    expect(text).toContain("$150 renovation");
    expect(text).toContain("$100 a different building");
    expect((html.match(/data-bar="split"/g) ?? []).length).toBe(2);
  });

  it("corrects the memorandum's own return on cost, and paces the program", () => {
    // Rules 1 and 3: 20% becomes 13.4%, and turnover — not the crew, not
    // ambition — sets 70 doors a year over three years against the two the
    // page claims.
    expect(text).toContain("The page says");
    expect(text).toContain("20.0%");
    expect(text).toContain("13.4%");
    expect(text).toContain("turnover binds");
    expect(text).toContain("2.9 years against the 2 the page claims");
    expect((html.match(/data-bar="reno"/g) ?? []).length).toBe(3);
  });

  it("draws a hotel's penetration index apart into its two halves", () => {
    // #355, rule 2. A RevPAR index of 90 on a rate index of 108.8 — the
    // shortfall is rooms, and a revenue manager reading only the 90 would
    // cut rate, which is the one thing working.
    expect(text).toContain("What a hotel actually earns");
    expect(text).toContain("Against the competitive set, where 100 is fair share");
    expect(text).toContain("108.8");
    expect(text).toContain("82.7");
    expect(text).toContain("the whole shortfall is empty rooms");
    expect((html.match(/data-bar="revpar"/g) ?? []).length).toBe(3);
  });

  it("and sets the two RevPAR levers against each other at the same RevPAR", () => {
    // Rule 1: $126.17 reached either way, $489,657 of value apart — and
    // the crossing is solved rather than subtracted.
    expect(text).toContain("$126.17");
    expect(text).toContain("$489,657 of value at the stated cap");
    expect(text).toContain("$34.41");
    expect((html.match(/data-bar="lever"/g) ?? []).length).toBe(2);
  });

  it("sets both positions of a loan assumption against each other", () => {
    // #356, rule 1. The "cheap" loan is the LARGER cheque — $10.80M against
    // $8.42M — and only the two complete positions answer it.
    expect(text).toContain("Taking over the seller");
    expect(text).toContain("Coverage gained");
    expect(text).toContain("$10.80M");
    expect(text).toContain("$8.42M");
    expect(text).toContain("$2.38M");
    expect((html.match(/data-bar="assume"/g) ?? []).length).toBe(2);
  });

  it("and solves what the loan is worth in price", () => {
    // The headline: $934,223 of price, bisected rather than approximated.
    expect(text).toContain("The premium against the asking price");
    expect(text).toContain("$934,223");
    expect(text).toContain("A seller who does not ask for that hands it over");
    expect((html.match(/data-bar="premium"/g) ?? []).length).toBe(2);
  });

  it("draws a storage increase against the response it can take", () => {
    // #357, rule 1. A 10% increase breaks even at a 25.8% move-out against
    // the 5% assumed — 20.8 points of room, and $837,410 of value.
    expect(text).toContain("The rate increase, and the runway it spends");
    expect(text).toContain("The response the increase can take before it stops paying");
    expect(text).toContain("25.8%");
    expect(text).toContain("20.8 pts");
    expect(text).toContain("$837,410");
    expect((html.match(/data-bar="ecri"/g) ?? []).length).toBe(2);
  });

  it("and the runway each one spends, year by year", () => {
    // Rule 2: 25.8 → 20.7 over five years, because the gap it is traded
    // against widens from 29% to 48%.
    expect(text).toContain("Put through every year, the break-even falls");
    expect(text).toContain("20.7%");
    expect(text).toContain("48% gap");
    expect((html.match(/data-bar="runway"/g) ?? []).length).toBe(5);
  });

  it("charges the hotel's reserve against revenue and prices both caps", () => {
    // Rule 3: $281,065 of reserve turns a 9.25% cap into 8.00%.
    expect(text).toContain("struck on revenue, not on NOI");
    expect(text).toContain("$281,065");
    expect(text).toContain("9.25%");
  });

  it("puts a clock on the return on cost, which has none of its own", () => {
    // Rule 4: 63.7% sold at completion against 31.4% held to the stated
    // exit, because 90% of the value is the resale rather than the rent.
    expect(text).toContain("A return on cost has no clock in it");
    expect(text).toContain("63.7%");
    expect(text).toContain("31.4%");
  });

  it("files forty cards into eight clusters, none of them at the ceiling", () => {
    // #353. Two of the six clusters had reached the eight-card ceiling
    // catalog.test.ts enforces, so the next lease card and the next land
    // card could not be filed at all.
    for (const heading of [
      "Debt",
      "Equity & returns",
      "Leases",
      "Rent & recoveries",
      "The property",
      "Value",
      "Development",
      "Tax & closing",
    ]) {
      expect(text, `the index files ${heading}`).toContain(heading);
    }
  });
});

// ── today's rates, across the top of /tools ────────────────────────────────
//
// The page reads the table and hands the rows in, so this renders the strip
// on a fixture without a database: every series the cron writes, as the
// runner's Sep 21 dry run actually printed them (lib/live-rates.fixture.ts).
import { RatesStrip } from "@/app/rates-strip";
import { SERIES, rateSeeds, readRates, type RateRow } from "@/lib/live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "@/lib/live-rates.fixture";

describe("the rates strip", () => {
  const rates = readRates(REAL_ROWS, FIXTURE_NOW);
  // The two the page actually seeds: SOFR into the floating-rate card, the
  // 2-year into the prepayment card (the tenor nearest its thirty months).
  const html = render(
    React.createElement(RatesStrip, { rates, seeds: ["SOFR", "DGS2"] }),
  );
  const text = visibleText(html);

  it("prints every series in its own unit, with its own observation date", () => {
    expect(rates).toHaveLength(SERIES.length);
    expect(text).toContain("4.94%"); // the 10-year
    expect(text).toContain("3.85%"); // SOFR
    expect(text).toContain("6.95%"); // the survey
    expect(text).toContain("5.58%"); // the Treasury's HQM corporate rate, monthly
    expect(text).not.toContain("ICE BofA"); // licensed to FRED, not to us
    expect(text).toContain("3.4%"); // CPI y/y: a change, to one place
    expect(text).toContain("−5.7%"); // banks EASING on multifamily, signed
    expect(text).toContain("344k"); // starts, 5+ units: a count
    expect(text).toContain("10-yr Treasury as of Sep 17");
    expect(text).toContain("CRE delinquency as of Apr 1");
    expect(text).toContain("CPI y/y as of Aug 1");
  });

  it("dates the SOFR the floating-rate card starts from the way the strip dates it", () => {
    // It printed the table's own "as of 2026-09-18" (the research pass of
    // 2026-10-01), beside a strip that says "Sep 18".
    const page = visibleText(
      render(React.createElement(DealMathTools, { seeds: rateSeeds(rates) })),
    );
    expect(page).toContain("The index starts at SOFR as of Sep 18.");
    expect(page).not.toContain("2026-09-18");
  });

  it("draws the curve as a picture, today against the tenors, with its slope named", () => {
    expect((html.match(/data-curve/g) ?? []).length).toBe(1);
    expect(html).toContain('role="img"');
    expect(html).toContain("The Treasury curve as of Sep 17: 1-mo 3.97%, 3-mo 4.12%");
    expect(text).toContain("10-yr less 2-yr +27 bps");
    expect(text).toContain("a normal curve, long money dearer than short");
    // With one observation per tenor there is no week-ago line, and the
    // caption does not claim one.
    expect(text).toContain("Solid is today, as of Sep 17");
    expect(text).not.toContain("dashed a week earlier");
    // Every tenor's figure is written on the picture.
    for (const v of ["3.97", "4.67", "4.94", "5.32", "5.29"]) expect(html).toContain(`>${v}</text>`);
  });

  it("draws last week's curve once the history reaches back", () => {
    const rows: RateRow[] = [];
    for (const id of ["DGS1", "DGS2", "DGS5", "DGS10", "DGS30"]) {
      for (let i = 0; i <= 7; i++) {
        const d = new Date(Date.UTC(2026, 8, 17) - i * 86_400_000).toISOString().slice(0, 10);
        rows.push({ series_id: id, obs_date: d, value: 4 + i * 0.02 });
      }
    }
    const out = render(React.createElement(RatesStrip, { rates: readRates(rows, FIXTURE_NOW) }));
    expect(visibleText(out)).toContain("Solid is today, dashed a week earlier");
    expect(out).toContain('stroke-dasharray="3 3"');
    // And each tile now carries its recent path — the 2-year and the
    // 10-year have tiles under the picture; the other tenors are the
    // picture alone.
    expect((out.match(/data-spark/g) ?? []).length).toBe(2);
  });

  it("draws no curve under four fresh tenors, and says so", () => {
    const few = readRates(
      REAL_ROWS.filter((r) => ["DGS2", "DGS10", "SOFR"].includes(r.series_id)),
      FIXTURE_NOW,
    );
    const out = render(React.createElement(RatesStrip, { rates: few }));
    expect(out).not.toContain("data-curve");
    expect(visibleText(out)).toContain("Too few of the Treasury tenors");
  });

  it("draws the move since the observation before, signed", () => {
    // Asserted on the markup, because the space between the figure and its
    // unit is the thing worth checking: a number glued to a margin-spaced
    // span is one word to a screen reader.
    expect(html).toContain(">3</span> bps"); // the 10-year, down from 4.97
    expect(html).toContain(">21</span> bps"); // SOFR, up from 3.64
    expect(html).toContain("▲");
    expect(html).toContain("▼");
    // No path with one or two observations behind a figure.
    expect(html).not.toContain("data-spark");
  });

  it("folds the rest into groups whose summary already carries the figures", () => {
    for (const g of ["Corporate credit", "Mortgage &amp; bank lending", "Inflation &amp; cost", "Jobs &amp; output", "Supply &amp; vacancy"]) {
      expect(html).toContain(g);
    }
    expect((html.match(/<details/g) ?? []).length).toBe(5);
    expect(text).toContain("CPI y/y 3.4%");
    expect(text).toContain("Starts, 5+ units 344k");
    // The money market stands beside the curve, not in a fold.
    expect(text).toContain("Money market");
    expect(text).toContain("30-day avg SOFR");
  });

  it("links every figure back to FRED — a transform to the level's page", () => {
    for (const id of ["DGS10", "SOFR", "MORTGAGE30US", "DRCRELEXFACBS", "HOUST5F"]) {
      expect(html).toContain(`https://fred.stlouisfed.org/series/${id}"`);
    }
    expect(html).toContain("https://fred.stlouisfed.org/series/CPIAUCSL\"");
    expect(html).not.toContain("series/CPIAUCSL_YOY");
  });

  it("marks only what actually fills a field", () => {
    // The emphasis tracks the page, not the standing fact: SOFR and the
    // 2-year are seeded and marked; the 10-year and prime are contract
    // rates nothing on the page currently takes, so they are drawn like the
    // benchmarks.
    expect(text).toContain("2-yr and SOFR");
    expect(text).toContain("start fields below at today's figure");
    expect(text).toContain("never fills a box");
    expect(text).toContain("never as a level");
    expect((html.match(/border-brand/g) ?? []).length).toBe(2);
  });

  it("says nothing at all with an empty table", () => {
    // No strip rather than a stale one: the claim is about today. (The
    // render helper wraps in a provider, so the page chrome is what is
    // left — the strip itself is absent.)
    const none = render(React.createElement(RatesStrip, { rates: [] }));
    expect(none).not.toContain("Rates today");
    expect(none).not.toContain("fred.stlouisfed.org");
  });

  it("names a series that has stopped updating", () => {
    const stale = readRates(
      [{ series_id: "DGS10", obs_date: "2026-08-01", value: 4.2 }],
      FIXTURE_NOW,
    );
    const out = visibleText(render(React.createElement(RatesStrip, { rates: stale })));
    expect(out).toContain("not updating");
    // And it stops seeding, so nothing claims it fills a field.
    expect(out).not.toContain("starts a field");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "rates strip").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── a metro's own figures, live from FRED, under the market brief ─────────
//
// The market page reads the metro's rows and hands them in, so this renders
// the panel on a fixture: the Washington MSA's newest figures as the runner's
// probes printed them, with a synthetic path behind the permits so the
// trailing year has twelve months to sum.
import { MetroLive } from "@/app/market/metro-live";
import { readMetroRates } from "@/lib/live-rates";

describe("a metro's own figures, live", () => {
  const permits: RateRow[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(2026, 6 - i, 1)).toISOString().slice(0, 10);
    // July 2026 is the real figure (1,844); the months behind it are a path.
    permits.push({ series_id: "WASH911BPPRIV", obs_date: d, value: i === 0 ? 1844 : 1500 + (i % 5) * 40 });
  }
  // The rent index arrives as the LEVEL (from the BLS, for Washington) and
  // the page derives the change: 420 in August 2026 against 400 a year
  // earlier is +5.0%.
  const rentIndex: RateRow[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
    rentIndex.push({ series_id: "CUURS35ASEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
  }
  const ROWS: RateRow[] = [
    { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
    { series_id: "WASH911URN", obs_date: "2026-06-01", value: 3.8 },
    { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
    { series_id: "MDPRIN5URN", obs_date: "2026-07-01", value: 4.7 },
    // The South's rental vacancy (the runner's probe: 9.5 for 2026 Q2), a
    // quarter behind it for the move — two observations, not yet a path.
    { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 9.5 },
    { series_id: "RRVRSOQ156N", obs_date: "2026-01-01", value: 8.9 },
    // The metro area's own rental vacancy out of the survey's workbook
    // (the runner's probe: Washington 5.9 ±2.2 for 2026 Q1, 6.2 ±2.2 for
    // Q2), the margin a companion series for the same dates.
    { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
    { series_id: "HVS_RVR_47900", obs_date: "2026-01-01", value: 5.9 },
    { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
    { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-01-01", value: 2.2 },
    ...permits,
    ...rentIndex,
  ];
  const dc = render(
    React.createElement(MetroLive, {
      rates: readMetroRates("dc", ROWS, FIXTURE_NOW),
      metroId: "dc",
      metroName: "Washington DC",
    }),
  );
  const dcText = visibleText(dc);

  it("draws the metro's own figures with their dates and links", () => {
    expect(dcText).toContain("Live from FRED");
    expect(dcText).toContain("Washington MSA");
    expect(dcText).toContain("4.0%");
    expect(dcText).toContain("Unemployment as of Jul 1");
    expect(dcText).toContain("1.2%");
    expect(dc).toContain("https://fred.stlouisfed.org/series/WASH911URN\"");
    // The jobs figure links to the LEVEL's page, since the y/y is FRED's transform.
    expect(dc).toContain("https://fred.stlouisfed.org/series/WASH911NA\"");
    // Nothing borrowed, so no note about the metro area.
    expect(dcText).not.toContain("publishes nothing");
    // No house price index for Washington — the tile is absent, not stale.
    expect(dcText).not.toContain("House prices");
  });

  it("says a year of permits, against the year before, as units", () => {
    expect(dcText).toContain("Permits, 12 months");
    // 1,844 + eleven months of the path: the sum, with its thousands.
    const year = 1844 + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reduce((a, i) => a + 1500 + (i % 5) * 40, 0);
    expect(dcText).toContain(`${year.toLocaleString("en-US")} units`);
    expect(dcText).toContain("on the year before");
    // The permits' path draws; unemployment has two observations, which is
    // a move and not yet a path, and the rent index derives two.
    expect((dc.match(/data-spark/g) ?? []).length).toBe(1);
  });

  it("draws the rent index as a change, credited to the BLS where FRED does not carry it", () => {
    expect(dcText).toContain("Rent CPI y/y");
    expect(dcText).toContain("5.0%");
    // Washington's comes from the BLS's own API, and the panel says so
    // three ways: the heading, the tile's link, and the note.
    expect(dcText).toContain("Live from FRED, the BLS and the Census Bureau");
    expect(dcText).toContain("Rent CPI y/y as of Aug 1 · BLS");
    expect(dc).toContain("https://data.bls.gov/timeseries/CUURS35ASEHA\"");
    expect(dcText).toContain("comes from the BLS directly");
    // And what the figure IS, against the asking rent above it.
    expect(dcText).toContain("what sitting tenants pay");
  });

  it("carries the region's rental vacancy, named as the region's, with the survey's grain said", () => {
    expect(dcText).toContain("Rental vacancy · South Census region");
    expect(dcText).toContain("9.5%");
    expect(dcText).toContain("as of Apr 1");
    expect(dc).toContain("https://fred.stlouisfed.org/series/RRVRSOQ156N\"");
    expect(dcText).toContain("named as the region's");
    // The heading lists the region beside the MSA.
    expect(dcText).toContain("South Census region");
  });

  it("carries the metro area's own rental vacancy with the survey's margin, linked to the survey", () => {
    expect(dcText).toContain("6.2%");
    // The figure of the move is its own styled span, so the visible text
    // splits there; the phrase after it is one string.
    expect(dcText).toContain("0.3");
    expect(dcText).toContain("pt on the quarter before · ±2.2 pts margin of error");
    expect(dcText).toContain("Rental vacancy as of Apr 1 · Census");
    expect(dc).toContain("https://www.census.gov/housing/hvs/data/rates.html\"");
    expect(dcText).toContain("survey's margin of error beside it");
    // The region's tile still stands beside it, as the steadier figure.
    expect(dcText).toContain("Rental vacancy · South Census region");
    expect(dcText).not.toContain("publishes no metro figure");
  });

  it("names the MSA on a suburb's borrowed tiles, and says so", () => {
    const pg = render(
      React.createElement(MetroLive, {
        rates: readMetroRates("pg_county", ROWS, FIXTURE_NOW),
        metroId: "pg_county",
        metroName: "Prince George's County MD",
      }),
    );
    const text = visibleText(pg);
    expect(text).toContain("4.7%"); // the county's own unemployment
    expect(text).toContain("Prince George's County · Washington MSA");
    expect(text).toContain("Permits, 12 months · Washington MSA");
    expect(text).toContain("Jobs y/y · Washington MSA");
    expect(text).toContain("Rent CPI y/y · Washington MSA");
    // The survey's metro figure is the MSA's too, worn as such.
    expect(text).toContain("Rental vacancy · Washington MSA");
    expect(text).toContain("±2.2 pts margin of error");
    expect(text).toContain("Where FRED publishes nothing for Prince George's County MD itself");
  });

  it("renders nothing for a metro with no rows", () => {
    const none = render(
      React.createElement(MetroLive, { rates: [], metroId: "tulsa", metroName: "Tulsa" }),
    );
    expect(none).not.toContain("Live from FRED");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(dc), "metro panel").toEqual([]);
    expect(gluedWords(dcText)).toEqual([]);
  });
});

// ── the asking rent against the fair market rent ──────────────────────────
import { ZoriLine } from "@/app/market/zori-line";

describe("a metro's asking rent, against the FMR", () => {
  const z = {
    rent: 2412,
    yoyPct: 2.3,
    asOf: "2026-08-31",
    note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research.",
    shared: false,
    mfrRent: null,
    mfrYoyPct: null,
    homeValue: null,
    homeValueYoyPct: null,
    priceToRentYears: null,
  };
  // HUD's two-bedroom figure with the fiscal year its research block names.
  const hud = { rent: 2100, fy: 2027 };
  const html = render(React.createElement(ZoriLine, { z, fmr2br: hud }));
  const text = visibleText(html);
  // With the two further files: the apartment rent and the home value.
  const full = { ...z, mfrRent: 2150, mfrYoyPct: 1.1, homeValue: 612_300, homeValueYoyPct: -0.4, priceToRentYears: 21.2 };
  const fullHtml = render(React.createElement(ZoriLine, { z: full, fmr2br: hud }));
  const fullText = visibleText(fullHtml);

  it("prints the asking rent, its change, its month and Zillow's credit", () => {
    expect(text).toContain("Asking rent, all homes");
    expect(text).toContain("$2,412");
    expect(text).toContain("2.3%");
    expect(text).toContain("on a year ago");
    expect(text).toContain("Aug 2026");
    expect(text).toContain("Data: Zillow Research");
    expect(html).toContain("https://www.zillow.com/research/data/");
  });

  it("draws the asking rent beside the 2BR fair market rent on one scale, and says they are two measures", () => {
    expect((html.match(/data-bar="zori"/g) ?? []).length).toBe(2);
    // The HUD bar and the sentence name the fiscal year the block states.
    expect(text).toContain("HUD FY2027 2BR");
    expect(text).toContain("HUD's FY2027 fair market rent is a yearly figure for a two-bedroom, utilities included.");
    // …and follow the data, never a year typed on the page.
    const next = visibleText(render(React.createElement(ZoriLine, { z, fmr2br: { rent: 2100, fy: 2028 } })));
    expect(next).toContain("HUD FY2028 2BR");
    expect(next).not.toContain("FY2027");
    // Zillow's asking rent (every size of home, before concessions) and HUD's
    // two-bedroom FMR (a yearly figure, utilities included) are different
    // measures: the gap is said as one, never as a premium over what HUD pays.
    expect(text).toContain("Two different measures on one scale");
    // live-verify's #364 marker greps this phrase on /market.
    expect(renderToString(React.createElement(ZoriLine, { z, fmr2br: hud }))).toContain("neither is the other");
    expect(text).toContain("before concessions");
    expect(text).toContain("utilities included");
    // (2412 − 2100) / 2100 = 14.857…%
    expect(text).toContain("The asking rent reads 14.9% above it, a gap between the two measures and not a premium over what HUD pays.");
    expect(text).not.toContain("the fair market rent HUD pays");
    expect(text).not.toMatch(/HUD pays for a two-bedroom/);
  });

  it("draws the apartment rent as a third bar and says the home value in years of rent", () => {
    expect(fullText).toContain("Asking rent, apartments");
    expect(fullText).toContain("$2,150");
    expect(fullText).toContain("1.1%");
    // The all-homes figure keeps its own line and label.
    expect(fullText).toContain("Asking rent, all homes");
    expect(fullText).toContain("$2,412");
    expect(fullText).toContain("Home value, typical");
    expect(fullText).toContain("$612,300");
    expect(fullText).toContain("0.4%");
    expect(fullText).toContain("21.2 years of rent");
    expect((fullHtml.match(/data-bar="zori"/g) ?? []).length).toBe(3);
    expect(fullText).toContain("Apartments");
    // (2150 − 2412) / 2412 = −10.86…% — the apartment figure runs under.
    expect(fullText).toContain("10.9% under the all-homes one");
    expect(fullText).toContain("A typical home costs 21.2 years of the all-homes asking rent");
    // Without them, none of it: no third bar, no home value, no sentence.
    expect(text).not.toContain("Asking rent, apartments");
    expect(text).not.toContain("Home value");
    expect(text).not.toContain("years of rent");
    expect(a11yIssues(fullHtml), "full zori line").toEqual([]);
    expect(gluedWords(fullText)).toEqual([]);
  });

  it("says when the figure is the metro area's, shared with a suburb", () => {
    const out = visibleText(render(React.createElement(ZoriLine, { z: { ...z, shared: true }, fmr2br: null })));
    expect(out).toContain("shared across the MSA");
    // No FMR to draw against: no bars, no gap sentence, and no word about a
    // fair market rent the line does not show.
    expect(out).not.toContain("HUD FY");
    expect(out).not.toContain("above it");
    expect(out).not.toContain("fair market rent");
    expect(out).toContain("The asking rent is this month's listings of every type and size of home, before concessions.");
  });

  it("renders nothing with no figure", () => {
    expect(render(React.createElement(ZoriLine, { z: null, fmr2br: hud }))).not.toContain("Asking rent");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "zori line").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── the for-sale market this month ─────────────────────────────────────────
import { RealtorLine } from "@/app/market/realtor-line";
import { realtorFor } from "@/lib/realtor";

describe("a metro's for-sale market, from Realtor.com", () => {
  // Washington's August 2026 row, as the runner printed it: list price
  // $565,000 (−5.8%), 15,290 listings (+13.8%), 43 days (+10.3%).
  const rows = [
    { metric: "rdc_median_list_price", metro: "Washington DC", low: 565000, as_of: "2026-08-01", note: "Realtor.com inventory, Washington-Arlington-Alexandria, DC-VA-MD-WV metro area, August 2026. Data: Realtor.com." },
    { metric: "rdc_median_list_price_yoy", metro: "Washington DC", low: -5.8, as_of: "2026-08-01", note: null },
    { metric: "rdc_active_listings", metro: "Washington DC", low: 15290, as_of: "2026-08-01", note: null },
    { metric: "rdc_active_listings_yoy", metro: "Washington DC", low: 13.8, as_of: "2026-08-01", note: null },
    { metric: "rdc_days_on_market", metro: "Washington DC", low: 43, as_of: "2026-08-01", note: null },
    { metric: "rdc_days_on_market_yoy", metro: "Washington DC", low: 10.3, as_of: "2026-08-01", note: null },
    // The hotness rows: rank 154 of 300 against 142 a year earlier, 0.649
    // views per property against the U.S., 17 fewer days on market.
    { metric: "rdc_hotness_rank", metro: "Washington DC", low: 154, as_of: "2026-08-01", note: "Realtor.com hotness rank of the 300 largest metros, Washington-Arlington-Alexandria, DC-VA-MD-WV metro area, August 2026. Data: Realtor.com." },
    { metric: "rdc_hotness_rank_prior", metro: "Washington DC", low: 142, as_of: "2025-08-01", note: null },
    { metric: "rdc_views_per_listing_vs_us", metro: "Washington DC", low: 0.649, as_of: "2026-08-01", note: null },
    { metric: "rdc_days_on_market_vs_us", metro: "Washington DC", low: -17, as_of: "2026-08-01", note: null },
  ];
  // Read on a day August's figures are current (the pull of Sep 8 wrote them).
  const read = new Date("2026-09-23T12:00:00Z");
  const html = render(React.createElement(RealtorLine, { r: realtorFor(rows, "Washington DC", read) }));
  const text = visibleText(html);

  it("prints the hotness rank, its move the right way round, and its two parts against the U.S.", () => {
    expect(text).toContain("Hotness #154 of 300 metros");
    expect(text).toContain("12 places cooler than a year ago");
    expect(text).toContain("listing views per property 35% under the U.S.");
    expect(text).toContain("sells 17 days faster than the U.S.");
    expect(text).toContain("ranks the 300 largest metros");
    // A rank that climbed, a market that sells slower, the same month said once.
    const hotter = visibleText(render(React.createElement(RealtorLine, {
      r: realtorFor(rows.map((x) => (x.metric === "rdc_hotness_rank" ? { ...x, low: 120 } : x.metric === "rdc_days_on_market_vs_us" ? { ...x, low: 9 } : x)), "Washington DC", read),
    })));
    expect(hotter).toContain("Hotness #120 of 300 metros");
    expect(hotter).toContain("22 places hotter than a year ago");
    expect(hotter).toContain("sells 9 days slower than the U.S.");
    expect(hotter).not.toContain("Aug 2026 · Aug 2026");
  });

  it("prints the list price, the listings, the days on market and the credit", () => {
    expect(text).toContain("For sale, median list");
    expect(text).toContain("$565,000");
    expect(text).toContain("5.8%");
    // The figure is its own styled span, so the visible text splits there.
    expect(text).toContain("15,290");
    expect(text).toContain("active listings");
    expect(text).toContain("13.8%");
    expect(text).toContain("43");
    expect(text).toContain("days on market");
    expect(text).toContain("Aug 2026");
    expect(text).toContain("Data: Realtor.com");
    expect(html).toContain("https://www.realtor.com/research/data/");
  });

  it("calls the direction from the flow, and says what the list price is not", () => {
    expect(text).toContain("the for-sale market is loosening");
    expect(text).toContain("what sellers are asking, not what buyers paid");
    // Fewer listings, faster to sell: tightening. And one of each: no call.
    const tight = visibleText(render(React.createElement(RealtorLine, {
      r: realtorFor(rows.map((x) => (x.metric.endsWith("_yoy") && x.metric !== "rdc_median_list_price_yoy" ? { ...x, low: -3 } : x)), "Washington DC", read),
    })));
    expect(tight).toContain("the for-sale market is tightening");
    const mixed = visibleText(render(React.createElement(RealtorLine, {
      r: realtorFor(rows.map((x) => (x.metric === "rdc_days_on_market_yoy" ? { ...x, low: -3 } : x)), "Washington DC", read),
    })));
    expect(mixed).toContain("not clearly loosening or tightening");
    expect(mixed).not.toContain("is loosening");
  });

  it("renders nothing with no figure, and only what the pull had", () => {
    expect(render(React.createElement(RealtorLine, { r: null }))).not.toContain("For sale");
    const priceOnly = visibleText(render(React.createElement(RealtorLine, { r: realtorFor(rows.slice(0, 2), "Washington DC", read) })));
    expect(priceOnly).toContain("$565,000");
    expect(priceOnly).not.toContain("active listings");
    expect(priceOnly).not.toContain("loosening");
    expect(priceOnly).not.toContain("Hotness");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "realtor line").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── The deal page's picture ─────────────────────────────────────────────────
import { PropertyVisual } from "@/app/(app)/deals/[id]/property-visual";
import { PhotoViewerBody } from "@/app/(app)/deals/[id]/photo-viewer";
import type { SiteFlagsResult as SiteFlagsResultForTest } from "@/lib/site-flags/core";
import { photographerParts } from "@/lib/credit-parts";

/** Links and buttons drawn inside another link or button: invalid HTML, and
 *  a control a reader meets only by accident. */
function controlsInsideControls(html: string): string[] {
  const out: string[] = [];
  const open: string[] = [];
  for (const m of html.matchAll(/<(\/?)(a|button)\b[^>]*>/gi)) {
    if (m[1]) {
      open.pop();
      continue;
    }
    if (open.length) out.push(`<${m[2]}> inside <${open[open.length - 1]}>: ${m[0].slice(0, 80)}`);
    open.push(m[2].toLowerCase());
  }
  return out;
}

describe("PropertyVisual — the building's own photograph leads, then the overhead", () => {
  const base = {
    dealId: "d1",
    label: "1200 N 31st St, Philadelphia, PA",
    hasStreetAddress: true,
    googleEnabled: false,
  };

  it("leads with the Photo tab and credits the memorandum when the deal has its own picture", () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertyVisual, {
        ...base,
        picture: { credit: "From the offering memorandum", source: "om" as const },
      }),
    );
    dumpView("property-visual-photo", html);
    expect(a11yIssues(html), "a11y property-visual").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('src="/api/deals/d1/picture?size=hero"');
    expect(html).toContain("Photograph of 1200 N 31st St, Philadelphia, PA");
    expect(text).toContain("From the offering memorandum");
    expect(text).toContain("Replace photo");
    // The Photo tab is the pressed one; the aerial and the map are still offered.
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="photo"/);
    expect(text).toContain("Aerial");
    expect(text).toContain("Map");
    // The picture opens full screen (#445): from its top left corner, the
    // Replace photo keeping the top right, and from a click on any picture.
    expect(html).toContain('aria-label="See the pictures of 1200 N 31st St, Philadelphia, PA full screen"');
    expect((html.match(/data-picture="expand"/g) ?? []).length).toBe(1);
    expect((html.match(/cursor-zoom-in/g) ?? []).length).toBe(2);
    // Nothing is open until it is asked for.
    expect(html).not.toContain("data-photo-viewer");
  });

  it("shows the building full screen, one view at a time with its own credit (#445)", () => {
    const frames = [
      { id: "photo", label: "Photo", src: "/api/deals/d1/picture?size=hero", alt: "Photograph of 1200 N 31st St", credit: "From the offering memorandum", thumb: "/api/deals/d1/picture?size=hero" },
      { id: "aerial", label: "Aerial", src: "/api/deals/d1/aerial?src=usgs&w=1280&h=960", alt: "Aerial photograph of 1200 N 31st St", credit: "Imagery: USGS The National Map", thumb: "/api/deals/d1/aerial?src=usgs&w=1280&h=576", ring: true },
      { id: "flood", label: "Flood", src: "/api/deals/d1/aerial?src=usgs&w=1280&h=960&z=17", over: "/api/deals/d1/flood?w=1280&h=960&z=17", alt: "Aerial photograph of the blocks around 1200 N 31st St, with FEMA's flood hazard zones", credit: "FEMA flood zones · USGS imagery", thumb: "/api/deals/d1/aerial?src=usgs&w=1280&h=576&z=17", thumbOver: "/api/deals/d1/flood?w=1280&h=576&z=17", ring: true },
    ];
    const html = renderToStaticMarkup(
      React.createElement(PhotoViewerBody, { frames, start: 1, title: "1200 N 31st St, Philadelphia, PA", onClose: () => {} }),
    );
    dumpView("photo-viewer", html);
    expect(a11yIssues(html), "a11y photo viewer").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    // It opens on the view asked for, credited as that view is, the
    // building ringed on the overhead.
    expect(html).toContain('data-viewer-frame="aerial"');
    expect(text).toContain("Aerial · 2 of 3");
    expect(text).toContain("Imagery: USGS The National Map");
    expect(html).toContain('data-picture="viewer-ring"');
    expect(html).toContain('src="/api/deals/d1/aerial?src=usgs&amp;w=1280&amp;h=960"');
    // The arrows, the close and every view along the foot, the one on screen pressed.
    for (const name of ["Previous picture", "Next picture", "Close"]) expect(html).toContain(`aria-label="${name}"`);
    expect(html).toMatch(/aria-pressed="true" aria-label="Aerial"/);
    expect(html).toContain('src="/api/deals/d1/flood?w=1280&amp;h=576&amp;z=17"');
    // One picture: no arrows, no strip.
    const one = renderToStaticMarkup(
      React.createElement(PhotoViewerBody, { frames: frames.slice(0, 1), title: "1200 N 31st St", onClose: () => {} }),
    );
    expect(one).not.toContain("Next picture");
    expect(one).not.toContain('aria-label="Pictures"');
    expect(visibleText(one)).toContain("Photo · 1 of 1");
  });

  it("without a picture, the aerial leads and the button offers to add one", () => {
    const html = renderToStaticMarkup(React.createElement(PropertyVisual, { ...base, picture: null }));
    expect(a11yIssues(html), "a11y property-visual-none").toEqual([]);
    const text = visibleText(html);
    expect(html).not.toContain("/picture?size=hero");
    expect(text).toContain("Add photo");
    expect(text).not.toContain("Replace photo");
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="aerial"/);
  });

  it("with no picture of the building's own, leads with its market's photograph, named as the market's, the aerial one step along (#439)", () => {
    const market = marketPictureFor({ city: "Philadelphia", state: "PA" })!;
    const html = renderToStaticMarkup(React.createElement(PropertyVisual, { ...base, picture: null, market }));
    dumpView("property-visual-market", html);
    expect(a11yIssues(html), "a11y property-visual-market").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // The market's photograph is the view on screen, its thumbnail pressed.
    expect(html).toContain(`src="${market.src.replace(/&/g, "&amp;")}"`);
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="market"/);
    // Said on its face as the market's, credited, never passed for the building.
    expect(text.replace(/\s+/g, " ")).toContain(`Market photo ${market.name}`);
    // The credit carries what the licence asks (visibleText breaks a line
    // after each link): the photographer linked to the file's page, the
    // licence to its text, and "cropped to fit", since the frame crops it.
    expect(text.replace(/\n/g, "")).toContain(market.credit);
    expect(market.credit).toMatch(/cropped to fit$/);
    const shot = SKYLINES[market.id];
    expect(html).toContain(`href="${commonsPage(shot.file)}"`);
    if (shot.licenseUrl) expect(html).toContain(`href="${shot.licenseUrl}"`);
    // The caption lets a click through to the picture; its links take theirs back.
    const caption = /<span data-picture="market"[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(caption).toContain("pointer-events-none");
    for (const a of caption.match(/<a\b[^>]*>/g) ?? []) expect(a).toContain("pointer-events-auto");
    expect((caption.match(/<a\b/g) ?? []).length).toBe(shot.licenseUrl ? 2 : 1);
    // No link sits inside another link or a button: the picture's own click
    // opens the viewer from the <img>, never from a wrapper.
    expect(controlsInsideControls(html)).toEqual([]);
    expect(html).toContain("No photograph of the building yet.");
    // The site itself is one step along the filmstrip, and a photograph can be added.
    expect(html).toContain('data-view-thumb="aerial"');
    expect(text).toContain("Add photo");
  });

  it("credits a market's photograph full screen with its links, whole, so never as cropped, and lets a long credit wrap", () => {
    const market = marketPictureFor({ city: "Philadelphia", state: "PA" })!;
    const frames = [
      {
        id: "market",
        label: "Market",
        src: market.src,
        alt: `${market.place}: the market this deal is in, ${market.name}. No photograph of the building yet.`,
        // As PropertyVisual builds it: the viewer shows the photograph whole.
        credit: [`Market photo: ${market.name} · `, ...photographerParts(market.author, market.license, false)],
        thumb: market.src,
      },
      { id: "aerial", label: "Aerial", src: "/api/deals/d1/aerial?src=usgs&w=1280&h=960", alt: "Aerial photograph of 1200 N 31st St", credit: "Imagery: USGS The National Map", thumb: "/api/deals/d1/aerial?src=usgs&w=1280&h=576" },
    ];
    const html = renderToStaticMarkup(React.createElement(PhotoViewerBody, { frames, start: 0, title: "1200 N 31st St", onClose: () => {} }));
    dumpView("photo-viewer-market", html);
    expect(a11yIssues(html)).toEqual([]);
    expect(controlsInsideControls(html)).toEqual([]);
    const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/.exec(html);
    expect(caption, "the viewer's caption").not.toBeNull();
    const words = visibleText(caption![1]).replace(/\n/g, "");
    expect(words).toBe(`Market photo: ${market.name} · ${market.author.name} · ${market.license.name}`);
    expect(words).not.toContain("cropped");
    const shot = SKYLINES[market.id];
    expect(caption![1]).toContain(`href="${commonsPage(shot.file)}"`);
    if (shot.licenseUrl) expect(caption![1]).toContain(`href="${shot.licenseUrl}"`);
    // Wrapped, never cut to one line, so a phone keeps the licence.
    expect(caption![0]).not.toContain("truncate");
    expect(caption![0]).toContain("break-words");
    // A plain credit reads as before.
    const aerial = renderToStaticMarkup(React.createElement(PhotoViewerBody, { frames, start: 1, title: "1200 N 31st St", onClose: () => {} }));
    expect(visibleText(aerial)).toContain("Imagery: USGS The National Map");
  });

  it("never shows the market's photograph where the building has its own picture", () => {
    const market = marketPictureFor({ city: "Philadelphia", state: "PA" })!;
    const html = renderToStaticMarkup(
      React.createElement(PropertyVisual, {
        ...base,
        picture: { credit: "From the offering memorandum", source: "om" as const },
        market,
      }),
    );
    expect(html).not.toContain(market.src.replace(/&/g, "&amp;"));
    expect(html).not.toContain('data-view-thumb="market"');
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="photo"/);
  });

  it("never offers to replace the sample deal's picture", () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertyVisual, { ...base, picture: null, canReplace: false }),
    );
    const text = visibleText(html);
    expect(text).not.toContain("Add photo");
    expect(text).not.toContain("Replace photo");
  });

  it("draws the deal's flood frame — one picture, drawn on the server — with the zones it shows keyed and the zone at the building (#425, #472)", () => {
    const flood = {
      src: "/api/deals/d1/flood?v=1.39.975000,-75.180000",
      classes: { page: ["floodway", "sfha", "moderate"] as const, full: ["floodway", "sfha", "moderate", "levee-reduced"] as const },
      here: "sfha" as const,
      zone: "Zone AE",
      line: "The building sits in Zone AE (1% annual chance flood hazard), a Special Flood Hazard Area: a federally backed loan requires flood insurance, and the premium belongs in the expense line.",
    };
    const props = { ...base, picture: null, flood: { ...flood, classes: { page: [...flood.classes.page], full: [...flood.classes.full] } } };
    const html = renderToStaticMarkup(React.createElement(PropertyVisual, props));
    dumpView("property-visual-flood", html);
    expect(a11yIssues(html), "a11y property-visual-flood").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Flood");
    // One picture: the frame cut to the view's own 16:9, at 1x and 2x.
    expect(html).toContain('src="/api/deals/d1/flood?v=1.39.975000,-75.180000&amp;w=1280&amp;h=720"');
    expect(html).toContain("/api/deals/d1/flood?v=1.39.975000,-75.180000&amp;w=2560&amp;h=1440 2560w");
    expect(html).not.toContain("&amp;z=17");
    // Until it has come, a plate says it is being drawn — never an empty
    // frame, never the aerial alone under the word "Flood".
    expect(html).toContain('data-picture="flood-drawing"');
    expect(text).toContain("Drawing FEMA\u2019s flood map\u2026");
    // The key: the zones the view's crop shows, the building's own first and
    // marked, in the palette the frame is drawn in.
    expect(text).toContain("1% annual chance flood hazard — at the building");
    expect(text).toContain("Floodway");
    expect(text).toContain("0.2% annual chance flood hazard");
    // The viewer's whole frame shows a levee area the view's crop does not:
    // the view's key does not list it.
    expect(text).not.toContain("reduced risk due to levee");
    expect(html).toContain('data-flood-swatch="sfha"');
    expect(html.indexOf('data-flood-swatch="sfha"')).toBeLessThan(html.indexOf('data-flood-swatch="floodway"'));
    expect(text).toContain("FEMA flood zones · USGS imagery");
    expect(text).toContain("a federally backed loan requires flood insurance");
    // The aerial still leads; the Flood tab waits to be opened.
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="aerial"/);
    // The filmstrip's thumbnail is the frame's own small crop.
    expect(html).toContain('data-view-thumb="flood"');
    expect(html).toContain('src="/api/deals/d1/flood?v=1.39.975000,-75.180000&amp;w=192&amp;h=108"');

    // A frame drawn with no zone in it says so, rather than keying colours
    // the picture does not have.
    const clear = renderToStaticMarkup(
      React.createElement(PropertyVisual, { ...props, flood: { ...props.flood, classes: { page: [], full: [] }, here: null } }),
    );
    expect(visibleText(clear)).toContain("FEMA draws no flood hazard zone inside this frame.");
    // A frame not drawn yet: no key until the picture has come.
    const pending = renderToStaticMarkup(
      React.createElement(PropertyVisual, { ...props, flood: { ...props.flood, classes: null } }),
    );
    expect(pending).not.toContain("data-flood-swatch");
    expect(visibleText(pending)).toContain("a federally backed loan requires flood insurance");

    // No street address, no Flood tab: a neighbourhood's centre is not the building.
    const area = renderToStaticMarkup(
      React.createElement(PropertyVisual, { ...base, hasStreetAddress: false, picture: null, flood: props.flood }),
    );
    expect(area).not.toContain("/flood?");
    expect(html).toContain('data-view-thumb="aerial"');
    expect(html).toContain('data-view-thumb="map"');
    expect(html).toContain('aria-label="Views of the property"');
    // The Aerial tab rings the building too (#429) — a street address's,
    // never a neighbourhood placement's centre.
    expect(html).toContain('data-picture="aerial-pin"');
    expect(area).not.toContain('data-picture="aerial-pin"');
    expect(area).toContain("Neighborhood placement");
    // No flood prop, no Flood tab.
    expect(renderToStaticMarkup(React.createElement(PropertyVisual, { ...base, picture: null }))).not.toContain("/flood?");
  });

  const gallery = [
    { page: 3, credit: "From the offering memorandum, page 3" },
    { page: 7, credit: "From the offering memorandum, page 7" },
  ];

  it("follows the cover with the memorandum's other photographs, each a view of its own (#448)", () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertyVisual, {
        ...base,
        picture: { credit: "From the offering memorandum", source: "om" as const },
        gallery,
      }),
    );
    dumpView("property-visual-gallery", html);
    expect(a11yIssues(html), "a11y property-visual gallery").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // The cover leads; the others follow it in the filmstrip, numbered.
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="photo"/);
    expect(html).toContain('data-view-thumb="g1"');
    expect(html).toContain('data-view-thumb="g2"');
    expect(html.indexOf('data-view-thumb="g2"')).toBeLessThan(html.indexOf('data-view-thumb="aerial"'));
    for (const label of ["Photo 1", "Photo 2", "Photo 3"]) expect(text).toContain(label);
    // The filmstrip draws each one's stored crop; its full-size picture
    // waits for its view to be opened — except the two the mosaic shows.
    expect(html).toContain('src="/api/deals/d1/picture?size=thumb&amp;g=1"');
    expect(html).toContain('src="/api/deals/d1/picture?size=thumb&amp;g=2"');
    expect(html).not.toContain("data-gallery-photo");
    // The mosaic (#458): the cover and the next two photographs, each at the
    // cover's size and lazy (a phone never shows them), each credited with
    // its page and opening the viewer at itself.
    expect(html).toContain('data-picture="mosaic"');
    expect(html.match(/data-mosaic-tile=/g)).toHaveLength(2);
    expect(html).toMatch(/<img src="\/api\/deals\/d1\/picture\?size=hero&amp;g=1"[^>]*loading="lazy"/);
    expect(html).toMatch(/<img src="\/api\/deals\/d1\/picture\?size=hero&amp;g=2"[^>]*loading="lazy"/);
    expect(text).toContain("Memorandum, p. 3");
    expect(text).toContain("Memorandum, p. 7");
    expect(html).toContain('aria-label="Photograph 2 of 3: see it full screen"');
    expect(text).not.toContain("more");
    // The count on the picture: which photograph this is, of how many.
    expect(html).toContain('data-picture="photo-count"');
    expect(text).toContain("1 / 3");
    expect(html).toContain('aria-label="Photograph 1 of 3: see them full screen"');
  });

  it("says how many more photographs the mosaic does not show, and draws no mosaic with fewer than three (#458)", () => {
    const four = renderToStaticMarkup(
      React.createElement(PropertyVisual, {
        ...base,
        picture: { credit: "From the offering memorandum", source: "om" as const },
        gallery: [...gallery, { page: 9, credit: "From the offering memorandum, page 9" }],
      }),
    );
    expect(four.match(/data-mosaic-tile=/g)).toHaveLength(2);
    expect(visibleText(four)).toContain("+1 more");
    expect(four).toContain('aria-label="Photograph 3 of 4, and 1 more: see them full screen"');
    expect(a11yIssues(four)).toEqual([]);
    // A cover and one more is no mosaic, and the one more waits for its view.
    const two = renderToStaticMarkup(
      React.createElement(PropertyVisual, {
        ...base,
        picture: { credit: "From the offering memorandum", source: "om" as const },
        gallery: gallery.slice(0, 1),
      }),
    );
    expect(two).not.toContain('data-picture="mosaic"');
    expect(two).not.toContain("size=hero&amp;g=");
    // No cover of the deal's own: the memorandum's other photographs never
    // lead, so there is no mosaic either.
    const none = renderToStaticMarkup(React.createElement(PropertyVisual, { ...base, picture: null, gallery }));
    expect(none).not.toContain('data-picture="mosaic"');
  });

  it("offers the photographs from a view that is not one, and never leads with them", () => {
    const html = renderToStaticMarkup(React.createElement(PropertyVisual, { ...base, picture: null, gallery }));
    // Past the cover a memorandum's photograph may be the neighbourhood: the
    // aerial leads, and the count offers the way to the photographs.
    expect(html).toMatch(/aria-pressed="true" data-view-thumb="aerial"/);
    expect(visibleText(html)).toContain("2 photos");
    expect(html).toContain('aria-label="See the 2 photographs of 1200 N 31st St, Philadelphia, PA"');
    // One photograph alone is "Photo", with no count.
    const one = renderToStaticMarkup(
      React.createElement(PropertyVisual, { ...base, picture: { credit: "From the offering memorandum", source: "om" as const } }),
    );
    expect(one).not.toContain('data-picture="photo-count"');
    expect(visibleText(one)).not.toContain("Photo 1");
  });

  it("shows a gallery photograph full screen with its page's credit", () => {
    const frames = [
      { id: "g1", label: "Photo 2", src: "/api/deals/d1/picture?size=hero&g=1", alt: "Photograph from page 3 of the memorandum for 1200 N 31st St", credit: "From the offering memorandum, page 3", thumb: "/api/deals/d1/picture?size=thumb&g=1" },
      { id: "photo", label: "Photo 1", src: "/api/deals/d1/picture?size=hero", alt: "Photograph of 1200 N 31st St", credit: "From the offering memorandum", thumb: "/api/deals/d1/picture?size=hero" },
    ];
    const html = renderToStaticMarkup(
      React.createElement(PhotoViewerBody, { frames, start: 0, title: "1200 N 31st St", onClose: () => {} }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(visibleText(html)).toContain("From the offering memorandum, page 3");
    expect(html).toContain('src="/api/deals/d1/picture?size=hero&amp;g=1"');
  });

  it("offers a dense screen each stored photograph's full-size copy, at the width it is drawn", () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertyVisual, {
        ...base,
        picture: { credit: "From the offering memorandum", source: "om" as const, width: 1600, height: 1067, fullWidth: 2560 },
        gallery: [
          { ...gallery[0], width: 1600, height: 1000, fullWidth: 2400 },
          // A photograph no larger than its hero has only the hero.
          { ...gallery[1], width: 1200, height: 800 },
        ],
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    // The cover: the hero and the full copy, drawn at the header's frame.
    expect(html).toContain('srcSet="/api/deals/d1/picture?size=hero 1600w, /api/deals/d1/picture?size=full 2560w"');
    expect(html).toMatch(/src="\/api\/deals\/d1\/picture\?size=hero" srcSet="[^"]+" sizes="\(min-width: 1264px\) 557px,/);
    // A mosaic tile at a third of the frame; one with no copy keeps its src alone.
    expect(html).toContain('srcSet="/api/deals/d1/picture?size=hero&amp;g=1 1600w, /api/deals/d1/picture?size=full&amp;g=1 2400w"');
    expect(html).toMatch(/src="\/api\/deals\/d1\/picture\?size=hero&amp;g=1" srcSet="[^"]+" sizes="\(min-width: 1264px\) calc\(557px \* 0\.4/);
    expect(html).toMatch(/<img src="\/api\/deals\/d1\/picture\?size=hero&amp;g=2" alt=""/);
    // In the viewer, the picture's box, by the window's shape.
    const frames = [
      {
        id: "photo",
        label: "Photo 1",
        src: "/api/deals/d1/picture?size=hero",
        srcSet: "/api/deals/d1/picture?size=hero 1600w, /api/deals/d1/picture?size=full 2560w",
        sizes: "(min-aspect-ratio: 1600/1067) calc((100vh - 11rem) * 1.5), (min-width: 640px) calc(100vw - 8rem), calc(100vw - 1rem)",
        alt: "Photograph of 1200 N 31st St",
        credit: "From the offering memorandum",
        thumb: "/api/deals/d1/picture?size=hero",
      },
      { id: "aerial", label: "Aerial", src: "/api/deals/d1/aerial?src=usgs&w=1280&h=960", alt: "Aerial photograph of 1200 N 31st St", credit: "Imagery: USGS The National Map", thumb: "/api/deals/d1/aerial?src=usgs&w=1280&h=576" },
    ];
    const viewer = renderToStaticMarkup(React.createElement(PhotoViewerBody, { frames, start: 0, title: "1200 N 31st St", onClose: () => {} }));
    expect(viewer).toMatch(/data-viewer-frame="photo"/);
    expect(viewer).toContain('sizes="(min-aspect-ratio: 1600/1067) calc((100vh - 11rem) * 1.5)');
    const aerial = renderToStaticMarkup(React.createElement(PhotoViewerBody, { frames, start: 1, title: "1200 N 31st St", onClose: () => {} }));
    expect(aerial).not.toContain("sizes=");
  });
});

// ── The deal header, laid out the way a listing opens (#433) ───────────────
import { DealHero, priceFigureOf } from "@/app/(app)/deals/[id]/deal-hero";

describe("DealHero — the building's picture beside its name and its figures (#433)", () => {
  const figures = [
    { label: "Price", value: "$48,500,000", figure: true },
    { label: "Size", value: "248 units", figure: true },
    { label: "Going-in cap", value: "5.45%", figure: true },
    { label: "Deal type", value: "Stabilized", title: "A stabilized asset bought on its in-place income." },
  ];
  const hero = (picture: React.ReactNode, panels?: React.ReactNode) =>
    renderToStaticMarkup(
      React.createElement(
        DealHero,
        {
          title: "The Maddox",
          chips: React.createElement("span", { className: "rounded-full bg-pass/10 px-2.5 py-0.5 text-xs font-semibold text-pass" }, "Go"),
          subtitle: "1200 N 31st St, Philadelphia, PA · Multifamily",
          figures,
          picture,
          actions: React.createElement(
            React.Fragment,
            null,
            React.createElement("a", { href: "/api/deals/d1/memo", className: "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium" }, "IC memo"),
            React.createElement("a", { href: "/api/deals/d1/report", className: "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium" }, "Full report"),
          ),
          controls: React.createElement(
            "label",
            { className: "flex items-center gap-1.5 text-xs" },
            "Stage",
            React.createElement("select", { defaultValue: "screening", className: "rounded-lg border border-line bg-surface px-2 py-1 text-xs" },
              React.createElement("option", { value: "screening" }, "Screening"),
            ),
          ),
        },
        panels,
      ),
    );
  const visual = React.createElement(PropertyVisual, {
    dealId: "d1",
    label: "1200 N 31st St, Philadelphia, PA",
    hasStreetAddress: true,
    googleEnabled: false,
    picture: { credit: "From the offering memorandum", source: "om" as const },
    flood: {
      src: "/api/deals/d1/flood?v=1.39.975000,-75.180000",
      classes: { page: ["moderate"], full: ["moderate"] },
      here: "moderate",
      zone: "Zone X",
      line: "The building sits in Zone X (0.2% annual chance flood hazard), outside the Special Flood Hazard Area.",
    },
  });
  const panel = React.createElement(
    "section",
    { "aria-label": "What is being sold", className: "mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3 text-sm" },
    "A leasehold: the ground lease ends Dec 2071, 45.3 years from today.",
  );
  const html = hero(visual, panel);
  const bare = hero(null);

  it("opens a deal with photographs of its own on the mosaic, inside the header (#458)", () => {
    const withGallery = hero(
      React.createElement(PropertyVisual, {
        dealId: "d1",
        label: "1200 N 31st St, Philadelphia, PA",
        hasStreetAddress: true,
        googleEnabled: false,
        picture: { credit: "From the offering memorandum", source: "om" as const },
        gallery: [
          { page: 3, credit: "From the offering memorandum, page 3" },
          { page: 7, credit: "From the offering memorandum, page 7" },
          { page: 9, credit: "From the offering memorandum, page 9" },
        ],
      }),
    );
    dumpView("deal-hero-mosaic", withGallery);
    expect(withGallery).toContain("data-hero-picture");
    expect(withGallery).toContain('data-picture="mosaic"');
    expect(a11yIssues(withGallery), "a11y hero mosaic").toEqual([]);
    expect(gluedWords(visibleText(withGallery))).toEqual([]);
  });

  it("lays the picture beside the name and the figures, and reads clean", () => {
    dumpView("deal-hero", html);
    dumpView("deal-hero-bare", bare);
    expect(a11yIssues(html), "a11y deal hero").toEqual([]);
    expect(a11yIssues(bare), "a11y bare deal hero").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain("data-deal-hero");
    expect(html).toMatch(/<h1[^>]*>The Maddox<\/h1>/);
    for (const f of figures) {
      expect(text).toContain(f.label);
      expect(text).toContain(f.value);
    }
    expect(html).toContain('title="A stabilized asset bought on its in-place income."');
    // The picture is the header's own, marked so the header splits only
    // while it is there; its Replace photo sits on the picture itself.
    expect(html).toContain('data-hero-picture="true"');
    expect(html).toContain("[grid-area:pic]");
    expect(text).toContain("Replace photo");
    expect(html).toContain("bg-black/55 text-white");
    // The name comes first to a screen reader; the grid puts the picture
    // first on the page.
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('data-hero-picture="true"'));
    // The toolbar and the panels follow.
    expect(text).toContain("IC memo");
    expect(text).toContain("the ground lease ends Dec 2071");
    // The card never clips: the share panel and the deal's menu open out of
    // the toolbar as popovers. The picture rounds its own top corners.
    const card = html.match(/<header data-deal-hero="true" class="([^"]*)"/)?.[1] ?? "";
    expect(card).toContain("rounded-2xl");
    expect(card).not.toContain("overflow-hidden");
    expect(html).toMatch(/<figure data-hero-picture="true" class="[^"]*rounded-t-\[15px\][^"]*@3xl:rounded-tr-none/);
  });

  it("draws a price stated as a range the way the pipeline does, the range as stated in its title", () => {
    // The research pass of 2026-09-30: "$9,000,000 – $9,500,000" ran 192px
    // in a phone's 121px tile and read "$9,000,000 – $9".
    const range = priceFigureOf("Price", "$9,000,000 – $9,500,000");
    expect(range).toEqual({ label: "Price", value: "$9–9.5M", title: "As stated: $9,000,000 – $9,500,000", figure: true });
    // A single figure, words and a blank stay as stated.
    expect(priceFigureOf("Price · 49% share", "$41,250,000")).toEqual({ label: "Price · 49% share", value: "$41,250,000", figure: true });
    expect(priceFigureOf("Price", "Call for offers")).toEqual({ label: "Price", value: "Call for offers", figure: true });
    expect(priceFigureOf("Price", null)).toEqual({ label: "Price", value: null, figure: true });
    const ranged = renderToStaticMarkup(
      React.createElement(DealHero, {
        title: "Arlington Flex Park",
        subtitle: "2201 E Lamar Blvd, Arlington, TX · Industrial",
        figures: [range, ...figures.slice(1)],
      }),
    );
    dumpView("deal-hero-range", ranged);
    expect(a11yIssues(ranged)).toEqual([]);
    expect(gluedWords(visibleText(ranged))).toEqual([]);
    // The figure is the short range, whole, on one line; the range as the
    // memorandum states it is the figure's own title.
    expect(ranged).toMatch(/<dd class="[^"]*whitespace-nowrap[^"]*" title="As stated: \$9,000,000 – \$9,500,000">\$9–9\.5M<\/dd>/);
    expect(visibleText(ranged)).not.toContain("$9,000,000");
  });

  it("gives a label two lines rather than truncating it, and keeps a row's figures at the foot of their tiles", () => {
    // The research pass of 2026-09-30: one truncated line cut "Price ·
    // Leasehold, 45 yrs left" to "PRICE · LEASEHOLD, 45 Y…" even at 1280px.
    const tagged = renderToStaticMarkup(
      React.createElement(DealHero, {
        title: "The Maddox",
        subtitle: "Philadelphia, PA · Multifamily",
        figures: [{ label: "Price · Leasehold, 45 yrs left", value: "$68,000,000", figure: true }, ...figures.slice(1)],
      }),
    );
    const tiles = [...tagged.matchAll(/<div class="([^"]*)"><dt class="([^"]*)">([^<]*)<\/dt>/g)];
    expect(tiles).toHaveLength(4);
    for (const [, tile, dt] of tiles) {
      expect(dt.split(" ")).toContain("line-clamp-2");
      expect(dt.split(" ")).not.toContain("truncate");
      expect(tile).toContain("flex-col justify-between");
    }
    expect(tiles[0][3]).toBe("Price · Leasehold, 45 yrs left");
  });

  it("with no picture, the header is one column and marks nothing to split around", () => {
    expect(bare).not.toContain('data-hero-picture="true"');
    expect(bare).not.toContain("[grid-area:pic]");
    expect(visibleText(bare)).toContain("$48,500,000");
    // The panels' slot is empty and hides itself rather than leaving a gap.
    expect(bare).toMatch(/<div class="[^"]*empty:hidden[^"]*"><\/div>/);
  });

  it("a figure the live screen has not read yet shimmers; a finished screen's missing figure keeps its dash", () => {
    const unread = figures.map((f) => (f.label === "Price" ? f : { ...f, value: null }));
    const heroOf = (reading: boolean) =>
      renderToStaticMarkup(
        React.createElement(DealHero, {
          title: "The Maddox",
          subtitle: "Philadelphia, PA · Multifamily",
          figures: unread,
          reading,
        }),
      );
    const live = heroOf(true);
    dumpView("deal-hero-reading", live);
    expect(a11yIssues(live)).toEqual([]);
    // Three figures not read yet, each a named shimmer, never a dash.
    expect((live.match(/data-qa="figure-reading"/g) ?? []).length).toBe(3);
    // A named picture, never a live region: three figures announcing
    // themselves at once is noise to a screen reader (the audit of 2026-10-01).
    expect((live.match(/role="img" aria-label="Reading the memorandum"/g) ?? []).length).toBe(3);
    expect(live).not.toContain('role="status"');
    expect(live).toMatch(/data-qa="figure-reading" class="skeleton /);
    expect(visibleText(live)).not.toContain("—");
    expect(visibleText(live)).toContain("$48,500,000");
    // Finished: the memorandum stated no such figure, and the dash says so.
    const done = heroOf(false);
    expect(done).not.toContain("figure-reading");
    expect((visibleText(done).match(/—/g) ?? []).length).toBe(3);
  });
});

// ── The deal, kept in view once its header scrolls away (#437) ─────────────
import { DealStickyBar } from "@/app/(app)/deals/[id]/deal-sticky-bar";

describe("DealStickyBar — the deal kept in view past its header", () => {
  const html = renderToStaticMarkup(
    React.createElement(DealStickyBar, {
      dealId: "d1",
      name: "The Maddox",
      chip: { label: "Go", cls: "bg-pass/15 text-pass" },
      // The header's own labels, word for word: the price with what it buys.
      figures: [
        { label: "Price · 49% share", value: "$23,765,000" },
        { label: "Going-in cap", value: "5.45%" },
      ],
    }),
  );

  it("starts hidden, inert and out of the accessibility tree, below the fold on a phone and above it on a wide screen", () => {
    dumpView("deal-sticky-bar", html);
    expect(html).toContain("data-deal-sticky");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/ inert=""/);
    expect(html).toContain("translate-y-full md:-translate-y-full");
    expect(html).toContain("fixed inset-x-0 bottom-0");
    expect(html).toContain("md:top-0");
    // Never on paper.
    expect(html).toContain("print:hidden");
  });

  it("carries the building, the name as the way back up, the call and the two figures", () => {
    expect(a11yIssues(html), "a11y sticky bar").toEqual([]);
    expect(html).toContain('src="/api/deals/d1/image?w=64&amp;h=64&amp;fallback=cover"');
    const text = visibleText(html);
    expect(text.replace(/\s+/g, " ")).toContain("Back to the top: The Maddox");
    expect(text).toContain("Go");
    // The price never stands without what it buys (#415's rule).
    expect(text).toContain("Price · 49% share");
    expect(text).toContain("$23,765,000");
    expect(text).toContain("Going-in cap");
    expect(text).toContain("5.45%");
    expect(gluedWords(text)).toEqual([]);
  });

  it("says a price range as the header does, word for word, with the range as stated in its title", () => {
    // The page hands both the one figure `priceFigureOf` returns.
    const price = priceFigureOf("Price", "$9,000,000 – $9,500,000");
    const header = renderToStaticMarkup(React.createElement(DealHero, { title: "Arlington Flex Park", subtitle: "Industrial", figures: [price] }));
    const bar = renderToStaticMarkup(
      React.createElement(DealStickyBar, {
        dealId: "d1",
        name: "Arlington Flex Park",
        figures: [{ label: price.label, value: price.value!, title: price.title }],
      }),
    );
    const said = (html: string) => html.match(/title="As stated: \$9,000,000 – \$9,500,000">([^<]+)</)?.[1];
    expect(said(bar)).toBe("$9–9.5M");
    expect(said(bar)).toBe(said(header));
    expect(a11yIssues(bar)).toEqual([]);
  });
});

// ── A deal's building at avatar size: the ⌘K list, the comps (#435) ────────
import { DealAvatar } from "@/app/(app)/deal-avatar";

describe("DealAvatar — each deal in a list pictured, the call on the corner where the list has no call column", () => {
  it("draws the pipeline row's own picture route at twice the slot, lazily, with the call's dot", () => {
    const html = renderToStaticMarkup(React.createElement(DealAvatar, { dealId: "d1", dot: "bg-pass" }));
    expect(a11yIssues(html), "a11y deal avatar").toEqual([]);
    expect(html).toContain('src="/api/deals/d1/image?w=64&amp;h=64&amp;fallback=cover"');
    expect(html).toContain('data-deal-avatar="picture"');
    expect(html).toContain('loading="lazy"');
    // Decorative beside the deal's name, which the row already reads out.
    expect(html).toMatch(/^<span aria-hidden="true"/);
    expect(html).toContain('alt=""');
    expect(html).toMatch(/rounded-full ring-2 ring-surface bg-pass/);
    // No call, no dot.
    expect(renderToStaticMarkup(React.createElement(DealAvatar, { dealId: "d1" }))).not.toContain("ring-surface");
  });
});

// ── The site flags' flood chip (#425) ──────────────────────────────────────
import { SiteFlagsCard } from "@/app/(app)/deals/[id]/site-flags-card";

describe("SiteFlagsCard — the flood chip says what FEMA's map says, and no more", () => {
  const result = (flood: SiteFlagsResultForTest["flood"]): SiteFlagsResultForTest => ({
    status: "ok",
    tractGeoid: "42101014200",
    opportunityZone: null,
    flood,
    retrievedAt: "2026-09-25T00:00:00Z",
    note: "Screening flags from federal datasets at the geocoded point.",
  });
  const chip = (flood: SiteFlagsResultForTest["flood"]) =>
    visibleText(renderToStaticMarkup(React.createElement(SiteFlagsCard, { result: result(flood), hasAddress: true })));

  it("keeps a point off FEMA's digital map apart from minimal hazard, and minimal hazard out of the caution colour", () => {
    expect(chip(null)).toContain("Flood: no FEMA digital map at this point");
    expect(chip(null)).not.toMatch(/no mapped hazard/);
    const minimal = renderToStaticMarkup(
      React.createElement(SiteFlagsCard, { result: result({ zone: "X", subtype: "AREA OF MINIMAL FLOOD HAZARD", isHighRisk: false }), hasAddress: true }),
    );
    expect(visibleText(minimal)).toContain("Flood zone X · minimal flood hazard");
    expect(minimal).not.toContain("bg-caution/10");
    expect(chip({ zone: "X", subtype: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", isHighRisk: false })).toContain("Flood zone X · 0.2 pct annual chance flood hazard");
    expect(chip({ zone: "AE", subtype: null, isHighRisk: true })).toContain("Flood zone AE — SFHA");
  });

  it("says a tract off the Opportunity Zone list was checked by its current number, and a check that did not run says why", () => {
    const card = (oz: Partial<SiteFlagsResultForTest>) =>
      renderToStaticMarkup(React.createElement(SiteFlagsCard, { result: { ...result(null), ...oz }, hasAddress: true }));
    const off = card({ opportunityZone: null, v: 3 });
    const offText = visibleText(off);
    expect(offText).toContain("Tract's current number not on the 2018 Opportunity Zone list");
    expect(offText).toContain("Opportunity Zones were checked by the tract's current number.");
    expect(offText).not.toMatch(/not in an opportunity zone/i);
    expect(a11yIssues(off), "site flags card, off the list").toEqual([]);
    expect(gluedWords(offText)).toEqual([]);
    // A Texas deal against a registry of Maryland's zones.
    const unloaded = visibleText(card({ opportunityZone: "unchecked", opportunityZoneUnchecked: "state_not_loaded", v: 3 }));
    expect(unloaded).toContain("Opportunity Zone: not checked (no zones on file for this state)");
    expect(unloaded).not.toContain("current number");
    // A miss stored under the old rule is no answer until it is looked up again.
    expect(visibleText(card({ opportunityZone: null, v: 2 }))).toContain("Opportunity Zone: not checked");
    expect(visibleText(card({ opportunityZone: null, v: 2 }))).not.toContain("Opportunity Zone list");
    expect(visibleText(card({ opportunityZone: { sourceDataset: "Maryland Opportunity Zones" }, v: 3 }))).toContain("Opportunity Zone tract");
  });
});

// ── A deal of another kind on the shared screen ─────────────────────────────
describe("ShareView — a hotel development is spoken in keys", () => {
  it("names the class as the label map does and costs the plan per key", () => {
    const hotel: ExtractionResult = {
      dealName: "Harbor Point Hotel — Ground-up Select Service",
      assetClass: "hospitality_str",
      market: "Norfolk, VA",
      address: "300 Waterside Dr, Norfolk, VA",
      strategy: {
        kind: "development",
        summary: "Build a 160-key select-service hotel on the waterfront site.",
        capitalBudget: "$42M hard and soft costs",
        timeline: "20 months of construction, 18 months of ramp",
      },
      metrics: [
        { label: "Land cost", value: "$6,000,000", flagged: false, page: "p. 3" },
        { label: "NOI (stabilized, pro forma)", value: "$4,200,000", flagged: true, page: "p. 12" },
        { label: "Total project cost", value: "$48,000,000", flagged: false, page: "p. 14" },
        { label: "Keys (proposed)", value: "160", flagged: false, page: "p. 4" },
      ],
    };
    const verdict: VerdictResult = {
      verdict: "caution",
      reason: "An 8.75% yield on cost against a 7.5% exit cap, before the ramp.",
      topRisks: ["The brand's PIP terms are not in the deck."],
      nextSteps: [],
      screen: { ranges: [], dealKillers: [], sensitivity: [] },
    };
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: hotel.dealName ?? "",
        assetClass: "hospitality_str",
        expiresAt: "2026-10-05T12:00:00Z",
        verdictStale: false,
        picture: null,
        extraction: hotel,
        comps: null,
        market: null,
        verdict,
      }),
    );
    dumpView("share-hotel", html);
    expect(a11yIssues(html), "a11y share-hotel").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Hospitality / STR");
    expect(text).not.toContain("hospitality_str");
    // The plan's all-in basis is per key, and the price row is the land.
    expect(text).toContain("Basis per key (all-in)");
    expect(text).toContain("$300k");
    expect(text).toContain("Land cost");
    expect(text).not.toContain("Basis per unit");
  });
});

// ── The sample screen's leverage check ──────────────────────────────────────
import { renderToString } from "react-dom/server";
import { SampleLeverageCard } from "@/app/demo/leverage-card";

describe("SampleLeverageCard — the sample's cap against the week's survey and today's 10-year", () => {
  // The runner's own table (lib/live-rates.fixture): the survey at 6.95%
  // on Sep 17, the 10-year at 4.94% the same day; the sample's cap is 5.45%.
  const bench30 = { value: 6.95, asOf: "2026-09-17", source: "FRED · MORTGAGE30US", live: true };
  const tenYear = { id: "DGS10", short: "10-yr Treasury", pct: 4.94, asOf: "2026-09-17", kind: "treasury" as const };
  const html = render(React.createElement(SampleLeverageCard, { capPct: 5.45, bench30, tenYear }));
  const text = visibleText(html);

  it("reads the cap against the survey one-sided, dated and named as the series", () => {
    expect(text).toContain("Negative leverage: going-in cap sits 150 bps below the 30-yr fixed");
    expect(text).toContain("going-in cap 5.45% vs");
    // The figure is its own styled span, so the visible text splits there.
    expect(text).toContain("6.95%");
    expect(text).toContain("30-yr fixed (FRED · MORTGAGE30US, as of 2026-09-17)");
    expect(text).toContain("negative leverage");
    expect(text).toContain("Leverage check — computed, not opined");
  });

  it("says the cap's spread over the 10-year as a fact with its date, and no verdict", () => {
    expect(text).toContain("curve: the cap is 51 bps over the 10-year Treasury (4.94% on Sep 17, 2026, FRED).");
  });

  it("the phrase the live-verify marker greps is in the markup a curl receives", () => {
    // The marker greps p_demo.html for "the 10-year Treasury (" — inside one
    // template literal, so React's <!-- --> separator never lands in it.
    const served = renderToString(React.createElement(SampleLeverageCard, { capPct: 5.45, bench30, tenYear }));
    expect(served).toContain("the 10-year Treasury (");
  });

  it("the snapshot is named as the snapshot, and no 10-year means no second line", () => {
    const fallback = visibleText(render(React.createElement(SampleLeverageCard, {
      capPct: 5.45,
      bench30: { value: 6.65, asOf: "2026-08-20", source: "FRED PMMS, the checked-in snapshot", live: false },
      tenYear: null,
    })));
    expect(fallback).toContain("Negative leverage: going-in cap sits 120 bps below the 30-yr fixed");
    expect(fallback).toContain("30-yr fixed (FRED PMMS, the checked-in snapshot, as of 2026-08-20)");
    expect(fallback).not.toContain("10-year");
  });

  it("a stale survey says so beside its date, and the tone follows the spread", () => {
    const stale = visibleText(render(React.createElement(SampleLeverageCard, {
      capPct: 7.9,
      bench30: { ...bench30, source: "FRED · MORTGAGE30US, stale" },
      tenYear,
    })));
    expect(stale).toContain("Positive leverage at the benchmark: 95 bps above the 30-yr fixed");
    expect(stale).toContain("(FRED · MORTGAGE30US, stale, as of 2026-09-17)");
    expect(stale).toContain("positive at benchmark");
    expect(stale).toContain("296 bps over the 10-year Treasury");
  });

  it("renders nothing with no cap or no benchmark", () => {
    expect(render(React.createElement(SampleLeverageCard, { capPct: null, bench30, tenYear }))).not.toContain("Leverage check");
    expect(render(React.createElement(SampleLeverageCard, { capPct: 5.45, bench30: null, tenYear }))).not.toContain("Leverage check");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "sample leverage card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── The sample screen's demand side ─────────────────────────────────────────
import { SampleDemandCard } from "@/app/demo/demand-card";

describe("SampleDemandCard — the sample market's payrolls by sector, read today", () => {
  // Philadelphia's rows as lib/metro-demand hands them over: all payrolls
  // first, three sectors, the leisure figure a year old. The sample is an
  // apartment building, so no sector is marked.
  const demand = {
    area: "Philadelphia MSA",
    grain: "metro" as const,
    newestMonth: "Aug 2026",
    mine: null,
    intro: "Rental housing runs on all payrolls, drawn first; the sectors beneath say where the metro area's jobs are growing.",
    supply: null,
    stale: ["Leisure & hospitality as of Aug 1"],
    rows: [
      { key: "PHIL942NA_YOY", label: "All payrolls", valuePct: 0.30686, text: "0.3%", href: "https://fred.stlouisfed.org/series/PHIL942NA", obsDate: "2026-08-01", fresh: true, all: true, mine: false },
      { key: "PHIL942PBSV_YOY", label: "Professional & business services", valuePct: 1.7451, text: "1.7%", href: "https://fred.stlouisfed.org/series/PHIL942PBSV", obsDate: "2026-08-01", fresh: true, all: false, mine: false },
      { key: "SMU42379804200000001SA_YOY", label: "Retail trade", valuePct: -1.85854, text: "−1.9%", href: "https://fred.stlouisfed.org/series/SMU42379804200000001SA", obsDate: "2026-08-01", fresh: true, all: false, mine: false },
      { key: "PHIL942LEIH_YOY", label: "Leisure & hospitality", valuePct: 2.65475, text: "2.7%", href: "https://fred.stlouisfed.org/series/PHIL942LEIH", obsDate: "2025-08-01", fresh: false, all: false, mine: false },
    ],
  };
  const html = render(React.createElement(SampleDemandCard, { demand }));
  const text = visibleText(html);

  it("draws all payrolls first and the sectors beneath, dated, each figure linked, nothing singled out", () => {
    expect(text).toContain("Demand check — read today, not opined");
    expect(text).toContain("The demand side today — payrolls by sector, Philadelphia MSA");
    expect(text).toContain("Rental housing runs on all payrolls, drawn first");
    expect(text).not.toContain("this building's sector");
    expect(text).toContain("Aug 2026 · BLS payrolls via FRED, against the same month a year earlier");
    expect(text).toContain("one sector's figure is stale: Leisure & hospitality as of Aug 1");
    expect(text).toContain("Every screened deal in a covered market gets this picture");
    // Four bars: all payrolls in the neutral tone, every sector full (nothing is faded
    // when nothing is marked), and the retail fall drawn leftward from the centre line.
    expect((html.match(/data-bar="demand"/g) ?? []).length).toBe(4);
    expect((html.match(/bg-ink\/40/g) ?? []).length).toBe(1);
    expect(html).not.toContain("bg-brand/35");
    expect(html).toContain('data-bar="demand" class="absolute inset-y-0 right-1/2 bg-brand"');
    expect(html).toContain("https://fred.stlouisfed.org/series/PHIL942PBSV\"");
    expect(html).toContain("https://fred.stlouisfed.org/series/SMU42379804200000001SA\"");
  });

  it("the phrase the live-verify marker greps is in the markup a curl receives", () => {
    // The marker greps p_demo.html for "payrolls by sector, Philadelphia MSA" —
    // inside one template literal, so React's <!-- --> separator never lands in it.
    const served = renderToString(React.createElement(SampleDemandCard, { demand }));
    expect(served).toContain("payrolls by sector, Philadelphia MSA");
  });

  it("renders nothing without a read, so the demo never shows a stale picture", () => {
    expect(render(React.createElement(SampleDemandCard, { demand: null }))).not.toContain("demand side");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "sample demand card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("carries the supply side as one line under the bars, the split named as the total less the single-family series", () => {
    const supply = {
      metro: "philadelphia",
      area: "Philadelphia MSA",
      to: "2026-07-01",
      toMonth: "Jul 2026",
      total: 14_400,
      totalPrior: 12_000,
      totalChangePct: 20,
      single: 6_000,
      singlePrior: 6_000,
      multi: 8_400,
      multiPrior: 6_000,
      multiChangePct: 40,
      multiSharePct: 58.3,
      hrefTotal: "https://fred.stlouisfed.org/series/PHIL942BPPRIV",
      hrefSingle: "https://fred.stlouisfed.org/series/PHIL942BP1FH",
      fresh: true,
      months: [],
    };
    const withSupply = render(React.createElement(SampleDemandCard, { demand: { ...demand, supply } }));
    const t = visibleText(withSupply);
    // The label is its own styled span, so the visible text splits after it.
    expect(t).toContain("The supply side ·");
    expect(t).toContain("8,400 units in buildings of two or more, twelve months to Jul 2026 (+40.0% on the twelve months before), 58.3% of the 14,400 permitted");
    // The two counts are links, so the visible text splits around them.
    expect(t).toContain("Census Bureau building permits via FRED,");
    expect(t).toContain("all units");
    expect(t).toContain("single-family");
    expect(t).toContain(" — FRED carries no multi-unit series for a metro or a state");
    expect(t).not.toContain("the only split published");
    expect(withSupply).toContain("https://fred.stlouisfed.org/series/PHIL942BP1FH\"");
    expect(a11yIssues(withSupply), "sample demand card with supply").toEqual([]);
    expect(gluedWords(t)).toEqual([]);
    // The marker's phrase is one JS string in the served markup.
    expect(renderToString(React.createElement(SampleDemandCard, { demand: { ...demand, supply } }))).toContain("units in buildings of two or more, twelve months to");
    // A stale read says so rather than passing as current.
    expect(visibleText(render(React.createElement(SampleDemandCard, { demand: { ...demand, supply: { ...supply, fresh: false } } })))).toContain("a stale figure");
  });
});

// ── The market page's supply picture ────────────────────────────────────────
describe("MetroLive — the supply side, twelve months against the twelve before", () => {
  const monthsBack = (n: number): string => new Date(Date.UTC(2026, 6 - n, 1)).toISOString().slice(0, 10);
  const ROWS: RateRow[] = [
    { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
    ...Array.from({ length: 24 }, (_, i) => ({ series_id: "WASH911BPPRIV", obs_date: monthsBack(i), value: i < 12 ? 1200 : 1000 })),
    ...Array.from({ length: 24 }, (_, i) => ({ series_id: "WASH911BP1FH", obs_date: monthsBack(i), value: 500 })),
  ];
  const html = render(
    React.createElement(MetroLive, { rates: readMetroRates("dc", ROWS, FIXTURE_NOW), metroId: "dc", metroName: "Washington DC" }),
  );
  const text = visibleText(html);

  it("draws each year as one stacked bar, single-family and the multi-unit remainder, with the counts linked", () => {
    expect(text).toContain("Housing supply — units permitted, single-family and in buildings of two or more");
    expect(text).toContain("Twelve months to Jul 2026");
    expect(text).toContain("The twelve before");
    expect(text).toContain("8,400 of 14,400");
    expect(text).toContain("6,000 of 12,000");
    // Two years, two segments each.
    expect((html.match(/data-bar="supply"/g) ?? []).length).toBe(4);
    expect(text).toContain("8,400 units in buildings of two or more, twelve months to Jul 2026 (");
    expect(text).toContain("40.0%");
    expect(text).toContain("on the twelve months before)");
    expect(text).toContain("58.3% of the units permitted");
    expect(text).toContain(" — FRED carries no multi-unit series for a metro or a state");
    expect(text).toContain("the total less the single-family series, since FRED carries no multi-unit series for a metro or a state, and they are the pipeline");
    expect(text).not.toContain("the only split");
    expect(html).toContain("https://fred.stlouisfed.org/series/WASH911BPPRIV\"");
    expect(html).toContain("https://fred.stlouisfed.org/series/WASH911BP1FH\"");
    // The single-family series is not a tile of its own; the total's tile stays.
    expect(text).toContain("Permits, 12 months");
    expect(text).not.toContain("Single-family permits");
    expect(text).toContain("the pipeline an apartment underwrite competes with");
    expect(a11yIssues(html), "supply picture").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("wears the MSA's name on a suburb's heading, and draws nothing without the single-family series", () => {
    const pg = visibleText(
      render(
        React.createElement(MetroLive, {
          rates: readMetroRates("pg_county", ROWS.concat({ series_id: "MDPRIN5URN", obs_date: "2026-07-01", value: 4.7 }), FIXTURE_NOW),
          metroId: "pg_county",
          metroName: "Prince George's County",
        }),
      ),
    );
    expect(pg).toContain("in buildings of two or more · Washington MSA");
    const none = render(
      React.createElement(MetroLive, {
        rates: readMetroRates("dc", ROWS.filter((r) => r.series_id !== "WASH911BP1FH"), FIXTURE_NOW),
        metroId: "dc",
        metroName: "Washington DC",
      }),
    );
    expect(none).not.toContain("Housing supply");
    expect(none).not.toContain('data-bar="supply"');
  });
});

// ── A sector's national lessor rent index on the market brief ───────────────
import { LessorRentLine } from "@/app/market/lessor-rent-line";
import { readRates as readNationalRates } from "@/lib/live-rates";
import { FIXTURE_NOW as NATIONAL_NOW, REAL_ROWS as NATIONAL_ROWS } from "@/lib/live-rates.fixture";

describe("LessorRentLine — the rents a sector's lessors charge, nationally, under its fundamentals", () => {
  const national = readNationalRates(NATIONAL_ROWS, NATIONAL_NOW);

  it("says the office index against a year ago, dated, as the nation's, with a link to FRED", () => {
    const html = render(React.createElement(LessorRentLine, { national, sector: "office" }));
    const text = visibleText(html);
    expect(text).toContain("Rents lessors charge, national (BLS producer price index, lessors of professional and office buildings):");
    expect(text).toContain("+7.2%");
    expect(text).toContain("on a year ago, Aug 2026");
    expect(text).toContain("the nation's lessors, not the metro's");
    expect(html).toContain("https://fred.stlouisfed.org/series/PCU5311205311202");
    expect(a11yIssues(html), "lessor rent line").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("retail reads its own index, and industrial its own", () => {
    expect(visibleText(render(React.createElement(LessorRentLine, { national, sector: "retail" })))).toContain("shopping centers and retail stores): -0.3%");
    expect(visibleText(render(React.createElement(LessorRentLine, { national, sector: "industrial" })))).toContain("manufacturing and industrial buildings): +3.2%");
  });

  it("renders nothing for apartments, which have the metro's own rents, and nothing on a stale table", () => {
    expect(render(React.createElement(LessorRentLine, { national, sector: "multifamily" }))).not.toContain("Rents lessors charge");
    const stale = readNationalRates(NATIONAL_ROWS, new Date("2027-06-01T00:00:00Z"));
    expect(render(React.createElement(LessorRentLine, { national: stale, sector: "office" }))).not.toContain("Rents lessors charge");
  });
});

// ── The metro's payrolls by sector: one picture under the tiles, and the
// sector panel's own line ─────────────────────────────────────────────────
import { SectorJobsLine } from "@/app/market/sector-jobs-line";

describe("MetroLive — jobs by sector, one picture beside all payrolls", () => {
  // Washington's five sector series as the table files them, with all
  // payrolls to read them against; one row each — a figure, not yet a path.
  const ROWS: RateRow[] = [
    { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
    { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
    { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.31234 },
    { series_id: "WASH911EDUH_YOY", obs_date: "2026-08-01", value: 3.4 },
    { series_id: "SMU11479004300000001SA_YOY", obs_date: "2026-08-01", value: 0.6 },
    { series_id: "SMU11479004200000001SA_YOY", obs_date: "2026-08-01", value: -0.4 },
    { series_id: "WASH911LEIH_YOY", obs_date: "2026-08-01", value: 2.9 },
  ];
  const html = render(
    React.createElement(MetroLive, { rates: readMetroRates("dc", ROWS, FIXTURE_NOW), metroId: "dc", metroName: "Washington DC" }),
  );
  const text = visibleText(html);

  it("draws the five sectors and all payrolls as signed bars from a centre line, each figure linked to its series", () => {
    expect(text).toContain("Jobs by sector, on a year ago");
    for (const label of ["All payrolls", "Professional & business services", "Education & health services", "Transportation, warehousing & utilities", "Retail trade", "Leisure & hospitality"]) {
      expect(text, label).toContain(label);
    }
    // The strip's own convention for a change in points: unsigned when
    // positive (the bar carries the direction), a typographic minus when not.
    expect(text).toContain("1.3%");
    expect(text).toContain("\u22120.4%");
    // Six bars: the five sectors and the figure they are read against.
    expect((html.match(/data-bar="sectorjobs"/g) ?? []).length).toBe(6);
    // A negative change draws leftward from the centre line.
    expect(html).toContain('data-bar="sectorjobs" class="absolute inset-y-0 right-1/2 bg-brand"');
    expect(html).toContain("https://fred.stlouisfed.org/series/WASH911PBSV\"");
    expect(html).toContain("https://fred.stlouisfed.org/series/SMU11479004200000001SA\"");
    expect(text).toContain("Aug 2026 · BLS payrolls via FRED");
    // The sectors are not tiles: no sector's strip label is a heading here.
    expect(text).toContain("Jobs y/y");
    expect(text).not.toContain("Prof. & business services jobs y/y");
    expect(text).not.toContain("Retail trade jobs y/y");
    expect(text).toContain("the sector that fills a building's kind is the demand an underwrite of it is assuming");
    expect(a11yIssues(html), "sector jobs picture").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("wears the MSA's name on a suburb's panel, and draws nothing for a metro with no sector rows", () => {
    const pg = visibleText(
      render(
        React.createElement(MetroLive, {
          rates: readMetroRates("pg_county", ROWS.concat({ series_id: "MDPRIN5URN", obs_date: "2026-07-01", value: 4.7 }), FIXTURE_NOW),
          metroId: "pg_county",
          metroName: "Prince George's County",
        }),
      ),
    );
    expect(pg).toContain("Jobs by sector, on a year ago · Washington MSA");
    const none = render(
      React.createElement(MetroLive, { rates: readMetroRates("dc", ROWS.slice(0, 2), FIXTURE_NOW), metroId: "dc", metroName: "Washington DC" }),
    );
    expect(none).not.toContain("Jobs by sector");
    expect(none).not.toContain("sectorjobs");
  });

  it("says which sector's figure is stale rather than dropping it", () => {
    // Read at the year's end: October's figures are ninety days old and
    // current on the metro lag; a series stuck at May is not.
    const later = new Date("2026-12-30T00:00:00Z");
    const rows = ROWS.map((r) => ({ ...r, obs_date: r.series_id === "WASH911LEIH_YOY" ? "2026-05-01" : "2026-10-01" }));
    const stale = visibleText(render(React.createElement(MetroLive, { rates: readMetroRates("dc", rows, later), metroId: "dc", metroName: "Washington DC" })));
    expect(stale).toContain("Oct 2026 · BLS payrolls via FRED");
    expect(stale).toContain("one sector's figure is stale: Leisure & hospitality as of May 1");
  });
});

describe("SectorJobsLine — the metro's payrolls in the sector that fills this kind of building", () => {
  const rates = readMetroRates(
    "dc",
    [
      { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.31234 },
      { series_id: "SMU11479004200000001SA_YOY", obs_date: "2026-08-01", value: -0.4 },
    ],
    FIXTURE_NOW,
  );

  it("the office panel reads professional and business services, dated, named as the metro area's, linked", () => {
    const html = render(React.createElement(SectorJobsLine, { rates, sector: "office" }));
    const text = visibleText(html);
    expect(text).toContain("Payrolls in professional and business services, Washington MSA (the sector that fills offices):");
    expect(text).toContain("1.3%");
    expect(text).toContain("on a year ago, Aug 2026");
    expect(html).toContain("https://fred.stlouisfed.org/series/WASH911PBSV\"");
    expect(a11yIssues(html), "sector jobs line").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("retail reads retail trade; apartments, a sector with no row, and a stale row read nothing", () => {
    expect(visibleText(render(React.createElement(SectorJobsLine, { rates, sector: "retail" })))).toContain("Payrolls in retail trade, Washington MSA (the sector that fills stores): \u22120.4%");
    expect(render(React.createElement(SectorJobsLine, { rates, sector: "multifamily" }))).not.toContain("Payrolls in");
    expect(render(React.createElement(SectorJobsLine, { rates, sector: "industrial" }))).not.toContain("Payrolls in");
    const stale = readMetroRates("dc", [{ series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.3 }], new Date("2027-06-01T00:00:00Z"));
    expect(render(React.createElement(SectorJobsLine, { rates: stale, sector: "office" }))).not.toContain("Payrolls in");
  });
});

// ── Where a sector's jobs are growing: the sector page's ranking ──────────
import { SectorJobsRank } from "@/app/market/sector-jobs-rank";
import { readMetricRates } from "@/lib/live-rates";

describe("SectorJobsRank — the covered markets ranked by a sector's payrolls, under the vacancy leaderboard", () => {
  // Professional and business services across four metro areas, as the
  // pull would write them; Richmond's row is stale, Boston has no row.
  const ROWS: RateRow[] = [
    { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.31234 },
    { series_id: "DALL148PBSV_YOY", obs_date: "2026-08-01", value: 2.4 },
    { series_id: "PHIL942PBSV_YOY", obs_date: "2026-08-01", value: -0.8 },
    { series_id: "RICH051PBSV_YOY", obs_date: "2025-08-01", value: 0.9 },
  ];
  const rates = readMetricRates("jobs_pbs_yoy", ROWS, FIXTURE_NOW);
  const markets = [
    { id: "dc", name: "Washington DC" },
    { id: "philadelphia", name: "Philadelphia" },
    { id: "dallas", name: "Dallas–Fort Worth" },
    { id: "richmond", name: "Richmond" },
    { id: "boston", name: "Boston" },
    { id: "nova", name: "Northern Virginia" },
  ];
  const html = render(React.createElement(SectorJobsRank, { metric: "jobs_pbs_yoy", markets, rates }));
  const text = visibleText(html);

  it("ranks fastest first, draws a signed bar a market, links each figure, and names a suburb's borrowed figure", () => {
    expect(text).toContain("Where professional & business services jobs are growing");
    expect(text).toContain("Professional & business services, on a year ago · ranked fastest first · Aug 2026 · BLS payrolls via FRED");
    // Dallas, then Washington and its suburb on the same figure, then Philadelphia.
    const order = ["Dallas–Fort Worth", "Washington DC", "Northern Virginia", "Philadelphia"].map((n) => text.indexOf(n));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
    // The suburb's name is a link and the MSA's name a muted span after it, so
    // the visible text splits there; the served markup carries the pair.
    expect(text).toContain("· Washington MSA");
    expect(html).toContain("Northern Virginia</a><span class=\"text-muted\"");
    expect((html.match(/data-bar="sectorrank"/g) ?? []).length).toBe(4);
    expect(html).toContain('data-bar="sectorrank" class="absolute inset-y-0 right-1/2 bg-brand"');
    expect(html).toContain("https://fred.stlouisfed.org/series/DALL148PBSV\"");
    expect(html).toContain('href="/market?metro=dallas"');
    expect(text).toContain("2.4%");
    expect(text).toContain("−0.8%");
    // Richmond's figure is a year old and Boston has no row: listed, unranked, with the reason.
    expect(text).toContain("Not ranked — Richmond (stale figure), Boston (no row yet).");
    expect(text).toContain("the two need not agree");
    expect(a11yIssues(html), "sector jobs rank").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("ranks the apartment page by all payrolls, and renders nothing with no fresh figure", () => {
    const all = readMetricRates("jobs_yoy", [{ series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 }], FIXTURE_NOW);
    const apartments = visibleText(render(React.createElement(SectorJobsRank, { metric: "jobs_yoy", markets: markets.slice(0, 1), rates: all })));
    expect(apartments).toContain("Where payrolls are growing");
    expect(apartments).toContain("All payrolls, on a year ago");
    expect(apartments).toContain("the demand side a rental market runs on");
    const stale = readMetricRates("jobs_pbs_yoy", ROWS, new Date("2027-06-01T00:00:00Z"));
    expect(render(React.createElement(SectorJobsRank, { metric: "jobs_pbs_yoy", markets, rates: stale }))).not.toContain("sector-jobs-rank");
    expect(render(React.createElement(SectorJobsRank, { metric: "jobs_pbs_yoy", markets, rates: [] }))).not.toContain("Where ");
  });
});

// ── The whole board over the demand side: every metro area × every sector ──
import { SectorJobsBoard, BOARD_METRICS } from "@/app/market/sector-jobs-board";
import { heatShade } from "@/app/market/heat-shade";
import metrosSeedForBoard from "@/data/research/metros.json";
import { DATA_METROS } from "@/lib/market-match";

describe("SectorJobsBoard — payroll growth by market and sector, shaded within each column", () => {
  const markets = [
    ...(metrosSeedForBoard.metros ?? []).map((m) => ({ id: m.id, name: m.name, region: (m as { region?: string }).region })),
    // The metro areas read without a brief, as the page hands them in (#403).
    ...DATA_METROS.map((m) => ({ id: m.id, name: m.name, region: "Read without a brief", briefed: false })),
  ];
  // All payrolls for three metro areas and the office-using sector for two;
  // Richmond's office figure is a year old and no retail row exists anywhere.
  // Phoenix — read without a brief — leads the office-using column.
  const rows: RateRow[] = [
    { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
    { series_id: "DALL148NA_YOY", obs_date: "2026-08-01", value: 1.08887 },
    { series_id: "RICH051NA_YOY", obs_date: "2026-08-01", value: -1.02319 },
    { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.31234 },
    { series_id: "DALL148PBSV_YOY", obs_date: "2026-08-01", value: 3.13231 },
    { series_id: "RICH051PBSV_YOY", obs_date: "2025-08-01", value: 0.9 },
    { series_id: "PHOE004PBSV_YOY", obs_date: "2026-08-01", value: 3.9 },
  ];
  const rates = Object.fromEntries(BOARD_METRICS.map((metric) => [metric, readMetricRates(metric, rows, FIXTURE_NOW)]));
  const html = render(React.createElement(SectorJobsBoard, { markets, rates }));
  const text = visibleText(html);

  it("draws every metro area with a series of its own, one column a sector, the fastest cell shaded emerald", () => {
    expect(text).toContain("The whole board — payroll growth by market and sector");
    // Fourteen briefed metro areas and twenty-six read without a brief, six columns each.
    expect(text).toContain("6 of 240 cells carry a fresh figure");
    for (const label of ["All payrolls", "Professional & business services", "Education & health services", "Transportation, warehousing & utilities", "Retail trade", "Leisure & hospitality"]) {
      expect(text, label).toContain(label);
    }
    // Fourteen metro areas, grouped by region; a suburb is not a row of its own.
    expect(text).toContain("Washington DC");
    expect(text).not.toContain("Prince George");
    expect(text).toContain("Mid-Atlantic");
    // Phoenix leads the office-using column, Washington the all-payrolls one —
    // a metro read without a brief ranks in the same column as the briefed ones.
    expect(html).toContain(`style="background-color:${heatShade(0)}"`);
    expect(html).toContain(`style="background-color:${heatShade(1)}"`);
    expect(text).toContain("3.1%");
    expect(text).toContain("3.9%");
    // The read-without-a-brief block: its heading, its rows unlinked, the note saying what it is.
    expect(text).toContain("Read without a brief");
    expect(text).toContain("Phoenix AZ");
    expect(text).toContain("Cleveland OH");
    expect(html).not.toContain('href="/market?metro=phoenix"');
    expect(html).toContain('href="/market?metro=dc"');
    expect(text).toContain("The last block is the metro areas the site reads without a brief: the same series, ranked in the same columns");
    expect(text).toContain("−1.0%");
    // Richmond's stale office figure is shown with its date, not ranked; a missing series is a dash.
    expect(text).toContain("0.9% · Aug 1");
    expect(html).toContain("not updating: the newest figure is for Aug 1");
    expect(html).toContain("No series on FRED for this market and sector");
    expect(text).toContain("newest Aug 2026");
    expect(html).toContain('href="/market?sector=office"');
    expect(a11yIssues(html), "payroll board").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("renders nothing until a fresh row exists", () => {
    const stale = Object.fromEntries(BOARD_METRICS.map((metric) => [metric, readMetricRates(metric, rows, new Date("2027-06-01T00:00:00Z"))]));
    expect(render(React.createElement(SectorJobsBoard, { markets, rates: stale }))).not.toContain("payroll growth by market");
    expect(render(React.createElement(SectorJobsBoard, { markets, rates: {} }))).not.toContain("payroll growth by market");
  });
});

// ── A metro area read without a brief: its own market page body (#404) ──────
import { ReadOnlyMetroView } from "@/app/market/read-only-metro";
import { DATA_METROS as READ_ONLY_METROS } from "@/lib/market-match";

describe("ReadOnlyMetroView — the market page for a metro read without a brief", () => {
  const pittsburgh = READ_ONLY_METROS.find((m) => m.id === "pittsburgh")!;
  // Pittsburgh's own rows, the ids the runner printed (probe runs
  // 35937200224 and 35937859807), plus the region's vacancy it borrows.
  const rows: RateRow[] = [
    { series_id: "PITT342URN", obs_date: "2026-07-01", value: 4.1 },
    { series_id: "PITT342URN", obs_date: "2026-06-01", value: 4.3 },
    { series_id: "PITT342NA_YOY", obs_date: "2026-08-01", value: 0.6 },
    { series_id: "PITT342PBSV_YOY", obs_date: "2026-08-01", value: 1.4 },
    { series_id: "PITT342BPPRIV", obs_date: "2026-07-01", value: 594 },
    { series_id: "HVS_RVR_38300", obs_date: "2026-04-01", value: 5.9 },
    { series_id: "HVS_RVR_38300_MOE", obs_date: "2026-04-01", value: 3.5 },
    { series_id: "RRVRNEQ156N", obs_date: "2026-04-01", value: 5.9 },
  ];
  const rates = readMetroRates("pittsburgh", rows, FIXTURE_NOW);
  const html = render(React.createElement(ReadOnlyMetroView, { metro: pittsburgh, rates, zori: null, realtor: null }));
  const text = visibleText(html);

  it("opens on the place, says what the page is and is not, and draws the metro's own figures with nothing the site has not read", () => {
    expect(text).toContain("Read without a brief");
    expect(text).toContain("Pittsburgh PA");
    expect(text).toContain("A market the site reads but does not brief: the published figures below");
    expect(text).toContain("No research note, no sector tracker, no fair market rent, no comps pull and no metro rules on file");
    // The tiles: the metro's own unemployment and jobs, the survey's vacancy with its margin.
    expect(text).toContain("4.1%");
    expect(text).toContain("Pittsburgh MSA");
    expect(text).toContain("margin of error");
    // Nothing a briefed market's page carries beyond the figures.
    expect(text).not.toContain("fair market rent $");
    expect(text).not.toContain("Rules in force here");
    expect(text).not.toContain("Recorded-sales comps");
    expect(html).toContain('href="/market"');
    expect(a11yIssues(html), "read-only metro page").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("opens on a photograph band, not a texture: the taller band under the caption scrim", () => {
    // The gradient is anchored in px to the words, so the band above them
    // is the photograph's (app/place-band's CAPTION_SCRIM).
    expect(html).toContain("min-h-[15rem]");
    expect(html).toContain("sm:min-h-[21rem]");
    expect(html).toContain("background-image:linear-gradient(to top, ");
    expect(html).toContain("color-mix(in srgb, var(--color-sidebar) 80%, transparent) 120px");
    expect(html).not.toContain("via-sidebar/85 via-55%");
  });

  it("every metro read without a brief has a frame to open on", () => {
    for (const m of READ_ONLY_METROS) {
      const page = render(React.createElement(ReadOnlyMetroView, { metro: m, rates: [], zori: null, realtor: null }));
      expect(page, m.id).toContain("Read without a brief");
      expect(page, m.id).toContain(m.name);
    }
  });
});

// ── The survey vacancy board: forty metro areas, each with its margin (#405) ─
import { SurveyVacancyBoard } from "@/app/market/survey-vacancy-board";

describe("SurveyVacancyBoard — where rental vacancy is lowest, by the survey, with its margin", () => {
  const markets = [
    ...(metrosSeedForBoard.metros ?? []).map((m) => ({ id: m.id, name: m.name })),
    ...READ_ONLY_METROS.map((m) => ({ id: m.id, name: m.name, briefed: false })),
  ];
  // The survey's figures as the branch's dry run printed them (hvs run
  // 35939284206): San Diego the tightest, Austin the loosest, Richmond's
  // margin wider than its rate; Cleveland's row a year stale.
  const rows: RateRow[] = [
    { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
    { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
    { series_id: "HVS_RVR_40060", obs_date: "2026-04-01", value: 6.2 },
    { series_id: "HVS_RVR_40060_MOE", obs_date: "2026-04-01", value: 5.1 },
    { series_id: "HVS_RVR_41740", obs_date: "2026-04-01", value: 2.9 },
    { series_id: "HVS_RVR_41740_MOE", obs_date: "2026-04-01", value: 2.0 },
    { series_id: "HVS_RVR_12420", obs_date: "2026-04-01", value: 16.9 },
    { series_id: "HVS_RVR_12420_MOE", obs_date: "2026-04-01", value: 4.9 },
    { series_id: "HVS_RVR_17410", obs_date: "2025-04-01", value: 8.4 },
    { series_id: "HVS_RVR_17410_MOE", obs_date: "2025-04-01", value: 4.3 },
  ];
  const rates = readMetricRates("rental_vacancy_msa", rows, FIXTURE_NOW);
  const us = readRates([{ series_id: "RRVRUSQ156N", obs_date: "2026-04-01", value: 7.3 }], FIXTURE_NOW)[0] ?? null;
  const html = render(React.createElement(SurveyVacancyBoard, { markets, rates, us }));
  const text = visibleText(html);

  it("ranks the fresh figures tightest first, briefed and read-without-a-brief alike, each with its whisker, the national line drawn and the stale row named", () => {
    expect(text).toContain("Where rental vacancy is lowest");
    expect(text).toContain("4 metro areas ranked, tightest first · Q2 2026");
    // San Diego (read without a brief, unlinked) leads; Austin trails; Washington links.
    expect(text.indexOf("San Diego CA")).toBeLessThan(text.indexOf("Washington DC"));
    expect(text.indexOf("Washington DC")).toBeLessThan(text.indexOf("Austin TX"));
    expect(html).not.toContain('href="/market?metro=san_diego"');
    expect(html).toContain('href="/market?metro=dc"');
    expect(text).toContain("2.9%");
    expect(text).toContain("±2");
    expect(text).toContain("16.9%");
    expect((html.match(/data-bar="surveyvac"/g) ?? []).length).toBe(4);
    // React writes the apostrophe as an entity inside an attribute.
    expect(html).toContain("the whisker is the survey&#x27;s ±5.1 pt margin of error");
    expect(text).toContain("The thin vertical line is the national rate, 7.3% in Q2 2026.");
    expect(text).toContain("Not updating, shown rather than ranked: Cleveland OH 8.4% (Apr 1");
    expect(text).toContain("two metro areas whose whiskers overlap are not ordered by it, whatever the ranking says.");
    expect(a11yIssues(html), "survey vacancy board").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("renders nothing until a fresh row exists", () => {
    const stale = readMetricRates("rental_vacancy_msa", rows, new Date("2027-06-01T00:00:00Z"));
    expect(render(React.createElement(SurveyVacancyBoard, { markets, rates: stale, us: null }))).not.toContain("Where rental vacancy");
    expect(render(React.createElement(SurveyVacancyBoard, { markets, rates: [], us }))).not.toContain("Where rental vacancy");
  });
});

// ── The rent board: every metro area the site reads, Zillow's apartment rent (#408) ─
import { RentBoard } from "@/app/market/rent-board";
import { zoriFor, type BenchRow } from "@/lib/zori";

describe("RentBoard — where apartment asking rents are moving, every metro area the site reads", () => {
  const markets = [
    ...(metrosSeedForBoard.metros ?? []).map((m) => ({ id: m.id, name: m.name })),
    ...READ_ONLY_METROS.map((m) => ({ id: m.id, name: m.name, briefed: false })),
  ];
  // Rows as the Zillow pull writes them (run 35942103564): San Francisco
  // fastest, Washington falling and shared with its three suburbs, Pittsburgh
  // read without a brief, Detroit with no apartment row this month.
  const at = "2026-08-31";
  const row = (metro: string, metric: string, low: number, note = "the metro area's figure"): BenchRow => ({ metric, metro, low, as_of: at, note, source: null });
  const rows: BenchRow[] = [
    row("Washington DC", "zori_rent", 2433), row("Washington DC", "zori_rent_yoy", 0.8), row("Washington DC", "zori_mfr_rent", 2281), row("Washington DC", "zori_mfr_rent_yoy", -0.4), row("Washington DC", "zhvi", 573336),
    row("Prince George's County MD", "zori_rent", 2433, "the Washington, DC metro area's figure, shared with the MSA"), row("Prince George's County MD", "zori_mfr_rent", 2281), row("Prince George's County MD", "zori_mfr_rent_yoy", -0.4),
    row("San Francisco", "zori_rent", 3409), row("San Francisco", "zori_rent_yoy", 10.8), row("San Francisco", "zori_mfr_rent", 3137), row("San Francisco", "zori_mfr_rent_yoy", 11.6), row("San Francisco", "zhvi", 1123193),
    row("Pittsburgh PA", "zori_rent", 1469), row("Pittsburgh PA", "zori_rent_yoy", 3.4), row("Pittsburgh PA", "zori_mfr_rent", 1384), row("Pittsburgh PA", "zori_mfr_rent_yoy", 3.4), row("Pittsburgh PA", "zhvi", 232122),
    row("Detroit MI", "zori_rent", 1524), row("Detroit MI", "zori_rent_yoy", 3.8),
  ];
  // Read on a day August's figures are current (the pull of Sep 20 wrote them).
  const read = new Date("2026-09-23T12:00:00Z");
  const reads = new Map(markets.map((m) => [m.name, zoriFor(rows, m.name, read)]));
  const html = render(React.createElement(RentBoard, { markets, reads }));
  const text = visibleText(html);

  it("ranks the apartment figure fastest first across briefed and read-only metros, lists a suburb's shared row once and an all-homes-only metro unranked, and carries Zillow's credit", () => {
    expect(text).toContain("Where apartment asking rents are moving");
    expect(text).toContain("3 metro areas ranked, fastest first · Aug 2026");
    expect(text.indexOf("San Francisco")).toBeLessThan(text.indexOf("Pittsburgh PA"));
    expect(text.indexOf("Pittsburgh PA")).toBeLessThan(text.indexOf("Washington DC"));
    expect(text).not.toContain("Prince George");
    expect(text).toContain("+11.6%");
    expect(text).toContain("−0.4%");
    // Price-to-rent: $1,123,193 over twelve months of $3,409 is 27.5 years; Pittsburgh 13.2.
    expect(text).toContain("27.5 yrs");
    expect(text).toContain("13.2 yrs");
    expect(html).toContain('href="/market?metro=san_francisco"');
    expect(html).not.toContain('href="/market?metro=pittsburgh"');
    expect((html.match(/data-bar="rentboard"/g) ?? []).length).toBe(3);
    expect(text).toContain("No apartment figure this month, all homes shown rather than ranked: Detroit MI +3.8%");
    expect(text).toContain("a suburb shares its metro area's row and is not listed twice.");
    expect(text).toContain("Data: Zillow Research.");
    expect(html).toContain('href="https://www.zillow.com/research/data/"');
    expect(a11yIssues(html), "rent board").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("ranks one month's figures: a metro the pull missed this time is left off, never ranked under a month it is not of", () => {
    // The August file carried no row for Pittsburgh, so July's stand — still
    // current on the 23rd, and not August's.
    const july = rows.map((r) => (r.metro === "Pittsburgh PA" ? { ...r, as_of: "2026-07-31" } : r));
    const board = visibleText(render(React.createElement(RentBoard, { markets, reads: new Map(markets.map((m) => [m.name, zoriFor(july, m.name, read)])) })));
    expect(board).toContain("2 metro areas ranked, fastest first · Aug 2026");
    expect(board).toContain("San Francisco");
    expect(board).not.toContain("Pittsburgh PA");
    // And a board read past the figures' cadence is no board at all.
    const late = new Map(markets.map((m) => [m.name, zoriFor(rows, m.name, new Date("2026-10-30T12:00:00Z"))]));
    expect(render(React.createElement(RentBoard, { markets, reads: late }))).not.toContain("Where apartment asking rents");
  });

  it("renders nothing until a row exists", () => {
    expect(render(React.createElement(RentBoard, { markets, reads: new Map() }))).not.toContain("Where apartment asking rents");
  });
});

// ── A portfolio OM's properties on the deal page (#411) ────────────────────
import { PortfolioCard } from "@/app/portfolio-card";
import { readPortfolio } from "@/lib/portfolio";

describe("PortfolioCard — a portfolio OM's properties, one row each", () => {
  const prop = (name: string, address: string, count: string, noi: string, occupancy: string, allocatedPrice: string, page: string) => ({
    name, address, count, area: "", noi, occupancy, yearBuilt: "", allocatedPrice, page,
  });
  const extraction = {
    dealName: "Rust Belt Residential Portfolio",
    assetClass: "multifamily",
    properties: [
      prop("Liberty Lofts", "1200 Liberty Ave, Pittsburgh, PA 15222", "128", "$1,420,000", "95%", "$28,000,000", "p. 14"),
      prop("Ohio City Commons", "1850 W 25th St, Cleveland, OH 44113", "210", "$2,050,000", "94%", "$38,000,000", "p. 22"),
      prop("Marion Gardens", "400 Barks Rd, Marion, OH 43302", "60", "$310,000", "82%", "$4,000,000", "p. 30"),
    ],
    metrics: [{ label: "Asking price", value: "$75,000,000", flagged: false, page: "p. 3" }],
    totalPages: 28,
  };

  it("draws each property's share of the units and of the NOI, links the markets the site reads, and says what does not add up", () => {
    const html = render(React.createElement(PortfolioCard, { portfolio: readPortfolio(extraction), assetClass: "multifamily" }));
    const text = visibleText(html);
    expect(text).toContain("The portfolio — 3 properties");
    expect(html.match(/data-qa="portfolio-property"/g)).toHaveLength(3);
    expect(html.match(/data-bar="portfolio"/g)).toHaveLength(3);
    expect(html.match(/data-bar="portfolio-noi"/g)).toHaveLength(3);
    // A share of the whole fills that share of its track — Ohio City
    // Commons' 52.8% of the units at 52.8% — never its length against the
    // largest share in either set (the research pass of 2026-09-30: drawn at
    // 97%, beside its own "53%").
    const read = readPortfolio(extraction)!;
    const widths = (bar: string) => [...html.matchAll(new RegExp(`data-bar="${bar}" style="width:([\\d.]+)%"`, "g"))].map((m) => Number(m[1]));
    expect(widths("portfolio")).toHaveLength(3);
    widths("portfolio").forEach((w, i) => expect(w).toBeCloseTo(read.shares![i], 6));
    widths("portfolio-noi").forEach((w, i) => expect(w).toBeCloseTo(read.noiShares![i], 6));
    expect(text).toContain("53% of the units");
    // The markets: two the site reads, linked; the state, not.
    expect(html).toContain('href="/market?metro=pittsburgh"');
    expect(html).toContain('href="/market?metro=cleveland"');
    expect(html).not.toContain("metro=state");
    expect(text).toContain("Ohio · 1");
    // The allocation sums to $70M against the $75M ask.
    expect(text).toContain("The allocated prices sum to $70.0M against the $75.0M ask (-6.7%) — the memorandum does not add up.");
    // Ohio City Commons carries 54% of the stated NOI.
    expect(text).toContain("Ohio City Commons carries 54% of the stated NOI");
    expect(text).toContain("210 units · 94% occupied · NOI $2.1M · allocated $38.0M ($181k per unit), a 5.4% cap on the allocation");
    // A page prints only where it falls inside the memorandum: p. 30 is past
    // its 28 pages, so Marion Gardens cites none (lib/facts' absolute rule).
    expect(text).toContain("p. 14");
    expect(text).toContain("p. 22");
    expect(text).not.toContain("p. 30");
    expect(a11yIssues(html), "portfolio card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("is the shared screen's too: a partner opening the link sees the same card under the key terms", () => {
    const verdict: VerdictResult = {
      verdict: "caution",
      reason: "The allocation does not add up to the ask.",
      topRisks: [],
      nextSteps: [],
      screen: { ranges: [], dealKillers: [], sensitivity: [] },
    };
    const share = (ex: typeof extraction) =>
      renderToStaticMarkup(
        React.createElement(ShareView, {
          dealName: ex.dealName,
          assetClass: "multifamily",
          expiresAt: "2026-10-05T12:00:00Z",
          verdictStale: false,
          picture: null,
          extraction: ex as unknown as ExtractionResult,
          comps: null,
          market: null,
          verdict,
        }),
      );
    const html = share(extraction);
    dumpView("share-portfolio", html);
    const text = visibleText(html);
    expect(text).toContain("The portfolio — 3 properties");
    expect(html.match(/data-bar="portfolio"/g)).toHaveLength(3);
    expect(text).toContain("The allocated prices sum to $70.0M against the $75.0M ask (-6.7%) — the memorandum does not add up.");
    expect(html).toContain('href="/market?metro=pittsburgh"');
    expect(a11yIssues(html), "share-portfolio").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    // A single property has no portfolio block.
    expect(visibleText(share({ ...extraction, properties: [extraction.properties[0]] }))).not.toContain("The portfolio");
  });

  it("the shared screen's market read counts each market's figures, the address's first, the nation's apart (#413)", () => {
    const verdict: VerdictResult = {
      verdict: "caution",
      reason: "Two markets.",
      topRisks: [],
      nextSteps: [],
      screen: { ranges: [], dealKillers: [], sensitivity: [] },
    };
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: extraction.dealName,
        assetClass: "multifamily",
        expiresAt: "2026-10-05T12:00:00Z",
        verdictStale: false,
        picture: null,
        extraction: extraction as unknown as ExtractionResult,
        comps: null,
        market: {
          checks: [],
          summary: "Rents are ahead of the metro's asking rents.",
          liveBrief: { metro: "Pittsburgh PA", grain: "metro", readOn: "2026-09-23", lines: ["Unemployment 4.1% (Jul 2026, Pittsburgh MSA; FRED)", "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED)"], national: 1, portfolio: { here: 1, of: 3 } },
          otherBriefs: [
            { metro: "Cleveland OH", grain: "metro", readOn: "2026-09-23", lines: ["a", "b"], portfolio: { here: 1, of: 3 } },
            { metro: "Ohio", grain: "state", readOn: "2026-09-23", lines: ["c"], portfolio: { here: 1, of: 3 } },
          ],
        },
        verdict,
      }),
    );
    const text = visibleText(html);
    expect(text).toContain("Checked beside 2 published figures for the Pittsburgh PA market, read on 2026-09-23 — 1 the metro's and 1 the nation's, none the building's.");
    expect(text).toContain("And beside 2 for the Cleveland OH market, where 1 of the 3 properties sits, read on 2026-09-23 — the metro's, never the portfolio's.");
    expect(text).toContain("And beside 1 for the state of Ohio, where 1 of the 3 properties sits, read on 2026-09-23 — the state's, never the portfolio's.");
    expect(gluedWords(text)).toEqual([]);
  });

  it("the shared screen's market read says how a county-placed deal reached its market (#447)", () => {
    const verdict: VerdictResult = {
      verdict: "caution",
      reason: "One market.",
      topRisks: [],
      nextSteps: [],
      screen: { ranges: [], dealKillers: [], sensitivity: [] },
    };
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: extraction.dealName,
        assetClass: "multifamily",
        expiresAt: "2026-10-05T12:00:00Z",
        verdictStale: false,
        picture: null,
        extraction: { ...extraction, properties: [] } as unknown as ExtractionResult,
        comps: null,
        market: {
          checks: [],
          summary: "Rents are ahead of the metro's asking rents.",
          liveBrief: {
            metro: "Dallas-Fort Worth",
            grain: "metro",
            readOn: "2026-09-23",
            lines: ["Unemployment 4.1% (Jul 2026, Dallas–Fort Worth MSA; FRED)"],
            placedBy: { county: "Collin County, TX", area: "Dallas-Fort Worth-Arlington, TX" },
          },
        },
        verdict,
      }),
    );
    const text = visibleText(html);
    expect(text).toContain(
      "Checked beside 1 published figure for the Dallas-Fort Worth market — placed there by its county: Collin County, TX, which the Census Bureau files in the Dallas-Fort Worth-Arlington, TX metro area, read on 2026-09-23",
    );
    expect(gluedWords(text)).toEqual([]);
  });

  it("draws no income bar from a partial set, and nothing at all for a single property", () => {
    const partial = { ...extraction, properties: extraction.properties.map((x, i) => (i === 1 ? { ...x, noi: "" } : x)) };
    const html = render(React.createElement(PortfolioCard, { portfolio: readPortfolio(partial), assetClass: "multifamily" }));
    expect(html).not.toContain('data-bar="portfolio-noi"');
    expect(visibleText(html)).toContain("2 of the 3 properties state an NOI of their own, so the income's split is not drawn.");
    expect(render(React.createElement(PortfolioCard, { portfolio: readPortfolio({ ...extraction, properties: [extraction.properties[0]] }) }))).not.toContain("The portfolio");
  });
});

// ── What is being sold (#414) ───────────────────────────────────────────────
import { InterestPanel } from "@/app/interest-panel";
import { readInterest as readInterestFor } from "@/lib/interest";

describe("InterestPanel — what the price buys, said before any figure is believed", () => {
  const base = (interest: NonNullable<ExtractionResult["interest"]>, metrics: ExtractionResult["metrics"] = []) =>
    ({
      dealName: "Harbor View Apartments",
      assetClass: "multifamily",
      interest,
      totalPages: 40,
      metrics: [{ label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 2" }, ...metrics],
    }) as ExtractionResult;
  const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };

  it("a note: the balance as the track, the price filled, and the model named as the collateral's", () => {
    const ex = base(
      { ...blank, kind: "note", loan: "$24.4M UPB, 5.25% coupon, 90 days delinquent", page: "p. 5" },
      [{ label: "Unpaid principal balance", value: "$24,400,000", flagged: false, page: "p. 5" }],
    );
    const html = render(React.createElement(InterestPanel, { interest: readInterestFor(ex, 20_000_000) }));
    const text = visibleText(html);
    expect(text).toContain("What is being sold");
    expect(text).toContain("A loan secured by the property");
    expect(text).toContain("The $20.0M price is an 18.0% discount to the $24.4M unpaid balance.");
    expectLeadThenFold(html, readInterestFor(ex, 20_000_000)!.leadSentences);
    expect(text).toContain("Price $20.0M");
    expect(text).toContain("Unpaid balance $24.4M");
    expect(text).toContain("The loan as stated: $24.4M UPB, 5.25% coupon, 90 days delinquent");
    expect(text).toContain("not the note's return");
    expect(html.match(/data-bar="interest"/g)).toHaveLength(1);
    expect(text).toContain("p. 5");
    expect(a11yIssues(html), "interest panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("a share: the whole as the track, the share filled; a leasehold links the ground lease calculator; a fee simple draws nothing", () => {
    const share = visibleText(
      render(React.createElement(InterestPanel, { interest: readInterestFor(base({ ...blank, kind: "partial_interest", share: "49% LP interest" }), 20_000_000) })),
    );
    expect(share).toContain("The share $20.0M");
    expect(share).toContain("The whole, grossed up $40.8M");
    const leaseHtml = render(
      React.createElement(InterestPanel, { interest: readInterestFor(base({ ...blank, kind: "leasehold", groundLease: "62 years remaining; $310,000 a year" }), 20_000_000) }),
    );
    expect(leaseHtml).toContain('href="/tools#ground-lease"');
    expect(leaseHtml).not.toContain('data-bar="interest"');
    expectLeadThenFold(
      leaseHtml,
      readInterestFor(base({ ...blank, kind: "leasehold", groundLease: "62 years remaining; $310,000 a year" }), 20_000_000)!.leadSentences,
    );
    expect(visibleText(leaseHtml)).toContain("The ground lease as stated: 62 years remaining; $310,000 a year");
    expect(render(React.createElement(InterestPanel, { interest: readInterestFor(base({ ...blank, kind: "fee_simple" }), 20_000_000) }))).not.toContain("What is being sold");
  });

  it("a note underwritten as a note (#416): its yield as tiles, the balance and the price against the collateral's value", () => {
    const AS_OF = new Date(Date.UTC(2025, 8, 30));
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 5" });
    const terms = [
      row("Unpaid principal balance", "$24,400,000"),
      row("Note rate", "5.25%"),
      row("Maturity date", "March 31, 2028"),
      row("Amortization", "Interest-only"),
      row("Whole-asset value", "$34,000,000"),
    ];
    const noteEx = (status: string, rows = terms) => base({ ...blank, kind: "note", page: "p. 5" }, [...rows, row("Payment status", status)]);

    const html = render(React.createElement(InterestPanel, { interest: readInterestFor(noteEx("Performing"), 20_000_000, AS_OF) }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="note-figures"');
    for (const tile of ["To maturity", "13.8%", "yield on the price", "Current yield", "6.4%", "On the dollar", "82.0¢", "the price over the balance"]) {
      expect(text, tile).toContain(tile);
    }
    expect(text).toContain("30 months to its Mar 2028 maturity, interest-only as stated.");
    // The tiles and the bar say the figures; the lead says the rest.
    expect(text).toContain("The $20.0M price is an 18.0% discount to the $24.4M unpaid balance.");
    expect(text).not.toContain("Held to its");
    expect(text).not.toContain("The collateral's stated");
    expect(text).toContain("Price $20.0M · 59% of the collateral's value");
    expect(text).toContain("Unpaid balance $24.4M · 72%");
    expect(text).toContain("The collateral, as stated $34.0M");
    expect(html.match(/data-bar="interest"/g)).toHaveLength(1);
    expect(html.match(/data-bar="note-balance"/g)).toHaveLength(1);
    expect(html).toContain('data-bar="interest" style="width:58.8');
    expect(html).toContain('data-bar="note-balance" style="width:71.7');
    // A key, as every other bar has (the research pass of 2026-09-30): each
    // figure under the bar beside a swatch of its own fill — the price dark,
    // the balance light, the collateral's value the whole track.
    const keyOf = (h: string) => {
      const at = h.indexOf('data-qa="note-collateral-key"');
      expect(at).toBeGreaterThan(-1);
      const ul = h.slice(at, h.indexOf("</ul>", at));
      return [...ul.matchAll(/<li[^>]*><span aria-hidden="true" class="([^"]*)"><\/span>([^<]*)<\/li>/g)].map((m) => ({ swatch: m[1], says: m[2] }));
    };
    const key = keyOf(html);
    expect(key.map((k) => k.says)).toEqual(["Price $20.0M · 59% of the collateral&#x27;s value", "Unpaid balance $24.4M · 72%", "The collateral, as stated $34.0M"]);
    expect(key[0].swatch).toContain("bg-brand/70");
    expect(key[1].swatch).toContain("bg-brand/25");
    expect(key[2].swatch).toContain("bg-line");
    expect(html).toMatch(/<div class="relative h-2\.5 rounded-full bg-line" aria-hidden="true">/);
    expect(a11yIssues(html), "note panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);

    // Not paying: no tiles — the sentence says what the contract yield is.
    const npl = render(
      React.createElement(InterestPanel, { interest: readInterestFor(noteEx("Non-performing; foreclosure filed"), 20_000_000, AS_OF) }),
    );
    expect(npl).not.toContain('data-qa="note-figures"');
    expect(visibleText(npl)).toContain("If it paid to its Mar 2028 maturity it would yield 13.8% (interest-only as stated) — it is not paying");
    expect(gluedWords(visibleText(npl))).toEqual([]);

    // A loan under water: the track runs to the balance, a tick marks the
    // collateral's value.
    const under = render(
      React.createElement(InterestPanel, {
        interest: readInterestFor(noteEx("Performing", [...terms.slice(0, 4), row("Whole-asset value", "$20,000,000")]), 14_000_000, AS_OF),
      }),
    );
    expect(visibleText(under)).toContain("Unpaid balance $24.4M · 122%");
    expect(under).toMatch(/left:81\.9\d*%/);
    // Under water the value is the tick, and its key says so with a tick.
    const underKey = keyOf(under);
    expect(underKey[2].says).toBe("The collateral, as stated $20.0M");
    expect(underKey[2].swatch).toContain("w-0.5");
    expect(underKey[2].swatch).toContain("bg-ink");
  });

  it("a note behind a senior loan draws no loan-to-value: its price against its balance, and why", () => {
    const AS_OF = new Date(Date.UTC(2025, 8, 30));
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 5" });
    const mezz = base({ ...blank, kind: "note", summary: "Sale of a $15M mezzanine loan", loan: "$15M mezzanine loan behind a $60M senior loan", page: "p. 5" }, [
      row("Unpaid principal balance", "$16,000,000"),
      row("Note rate", "11.0%"),
      row("Maturity date", "March 31, 2028"),
      row("Whole-asset value", "$70,000,000"),
      row("Payment status", "Performing"),
    ]);
    const html = render(React.createElement(InterestPanel, { interest: readInterestFor(mezz, 15_000_000, AS_OF) }));
    const text = visibleText(html);
    // The note's own figures stand.
    expect(html).toContain('data-qa="note-figures"');
    // No collateral track, no percentage of the collateral's value.
    expect(html).not.toContain('data-bar="note-balance"');
    expect(text).not.toContain("of the collateral's value");
    expect(text).not.toMatch(/Unpaid balance \$16\.0M · \d+%/);
    // The price against the balance, and the reason the loan-to-value is not given.
    expect(html.match(/data-bar="interest"/g)).toHaveLength(1);
    expect(text).toContain("Price $15.0M");
    expect(text).toContain("Unpaid balance $16.0M");
    expect(html).toContain('data-qa="note-ltv-withheld"');
    expect(text).toContain("its loan-to-value at its last dollar needs that loan's balance, which the memorandum does not state.");
    expect(a11yIssues(html), "mezzanine note panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("a leased fee: the building's income as the track, the ground rent filled, and the calculator's leased-fee side", () => {
    const ex = base({ ...blank, kind: "leased_fee", groundLease: "71 years remaining; unsubordinated" }, [
      { label: "Ground rent", value: "$1,200,000", flagged: false, page: "p. 4" },
      { label: "Income before ground rent", value: "$6,000,000", flagged: false, page: "p. 6" },
    ]);
    const html = render(React.createElement(InterestPanel, { interest: readInterestFor(ex, 20_000_000) }));
    const text = visibleText(html);
    expect(text).toContain("The leased fee — the land under a ground lease");
    expect(text).toContain("the income here, not an expense and never the building's NOI");
    expect(text).toContain("Ground rent $1.2M");
    expect(text).toContain("The building's income before it $6.0M · covered 5.0×");
    expect(text).toContain("Value the leased fee on its term");
    expect(html).toContain('href="/tools#ground-lease"');
    expect(html.match(/data-bar="interest"/g)).toHaveLength(1);
    expect(a11yIssues(html), "leased fee panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── The loan in place, offered for assumption (#417) ────────────────────────
import { AssumableLoanCard } from "@/app/(app)/deals/[id]/assumable-card";
import { assumableView, readAssumable } from "@/lib/assumable-debt";
import { deriveUnderwriteInputs as deriveForAssumable } from "@/lib/underwrite/inputs";

describe("AssumableLoanCard — the rate, the coverage and what the loan is worth", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 25));
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 12", basis: "na" as const });
  const inputs = deriveForAssumable(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).inputs;
  const withLoan = (rows: ReturnType<typeof row>[]) =>
    ({ ...SAMPLE_DEAL.extraction, totalPages: 40, metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows] }) as ExtractionResult;
  const RATE_NOTE = "5-yr Treasury 3.75% (FRED, Sep 24, 2026) + 225 bps multifamily spread, a screening default — enter your quote";

  it("draws the rate and the coverage as pairs, the figures, the sentence and the tools link", () => {
    const a = readAssumable(
      withLoan([
        row("Assumable loan balance", "$40,000,000"),
        row("Assumable loan rate", "3.45%"),
        row("Assumable loan maturity", "June 30, 2033"),
        row("Assumable loan amortization", "Interest-only"),
        row("Assumption fee", "1%"),
      ]),
      inputs,
      AS_OF,
    )!;
    const html = render(React.createElement(AssumableLoanCard, { view: assumableView(a, RATE_NOTE, true) }));
    dumpView("assumable-loan", html);
    const text = visibleText(html);
    expect(text).toContain("The loan in place, offered for assumption");
    expect(text).toContain("$40.0M at 3.45% to Jun 2033, interest-only as stated");
    expect(text).toContain("p. 12");
    expect(text).toMatch(/The loan in place\s+3\.45%/);
    expect(text).toMatch(/A new loan today\s+6\.00%/);
    expect(text).toContain("255 bps under a new loan's rate");
    expect(text).toContain(`A new loan today, as the model runs it: ${RATE_NOTE}.`);
    expect(text).toContain("Worth in price");
    expect(text).toContain("Against a new loan");
    expect(text).toMatch(/Assuming it is worth \$[\d.]+[Mk] of price/);
    expect(text).toContain("Only the 5 years of it the 5-year hold uses count");
    expect(text).toContain("The 1% assumption fee ($400k) is funded at closing, in the cheque.");
    expect(html).toContain('href="/tools#loan-assumption"');
    expect(html.match(/data-bar="assume-rate"/g)).toHaveLength(2);
    expect(html.match(/data-bar="assume-dscr"/g)).toHaveLength(2);
    expect(a11yIssues(html), "assumable card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("renders nothing without a loan to assume; a loan with a missing term says which and draws no coverage", () => {
    expect(render(React.createElement(AssumableLoanCard, { view: null }))).not.toContain("The loan in place");
    const bare = readAssumable(withLoan([row("Assumable loan balance", "$30,000,000"), row("Assumable loan rate", "3.45%")]), inputs, AS_OF)!;
    const html = render(React.createElement(AssumableLoanCard, { view: assumableView(bare, null, false) }));
    const text = visibleText(html);
    expect(text).toContain("It cannot be priced against a new loan: the memorandum does not state its maturity or its payment schedule.");
    expect(text).toContain("A new loan at the model's 6.00% placeholder");
    expect(html).not.toContain('data-bar="assume-dscr"');
    expect(html).not.toContain('data-qa="assumable-figures"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── A note the seller offers to carry (#462) ─────────────────────────────────
import { readSellerFinancing, sellerFinancingView } from "@/lib/seller-financing";

describe("AssumableLoanCard — a note the seller offers to carry, in the seller's loan's place", () => {
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 12", basis: "na" as const });
  const inputs = deriveForAssumable(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).inputs;
  const withNote = (rows: ReturnType<typeof row>[]) =>
    ({ ...SAMPLE_DEAL.extraction, totalPages: 40, metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows] }) as ExtractionResult;

  it("says it is the seller's note, draws the note against a new loan and the coverage, and links to the tools card", () => {
    const s = readSellerFinancing(
      withNote([
        row("Seller financing amount", "70% of the purchase price"),
        row("Seller financing rate", "5.00%"),
        row("Seller financing term", "5 years"),
        row("Seller financing amortization", "25 years"),
      ]),
      inputs,
    )!;
    const html = render(React.createElement(AssumableLoanCard, { view: sellerFinancingView(s, null, false) }));
    dumpView("seller-note", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="seller-note"');
    expect(text).toContain("The seller's note, offered to carry the price");
    expect(text).toContain("$47.6M (70% of the price) at 5.00% for 5 years, amortizing over 25 years");
    expect(text).toMatch(/The seller's note\s+5\.00%/);
    expect(text).toMatch(/A new loan today\s+6\.00%/);
    expect(text).toMatch(/Taking the seller's note\s+[\d.]+×/);
    expect(text).toContain("Less equity");
    expect(text).toContain("a larger loan, a smaller cheque");
    expect(text).toContain("The note's 70% of the price is struck on the model's $68.0M price.");
    expect(text).toContain("Run the seller's note with other terms");
    expect(text).not.toContain("offered for assumption");
    expect(a11yIssues(html), "seller note card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("ShareView — a note the seller offers to carry, as stated (#462)", () => {
  it("says the note under the title, and nothing on the sample", () => {
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "", basis: "na" as const });
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [...SAMPLE_DEAL.extraction.metrics, row("Seller financing amount", "$40,000,000"), row("Seller financing rate", "5.00%"), row("Seller financing term", "5 years")],
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction }));
    expect(html).toContain('data-qa="share-seller-note"');
    expect(visibleText(html)).toContain("The seller offers to carry financing: $40.0M at 5.00% for 5 years");
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain("share-seller-note");
  });
});

// ── A leasehold's exit, on its term (#421) ──────────────────────────────────
import { LeaseholdExitCard } from "@/app/(app)/deals/[id]/leasehold-exit-card";
import { leaseholdExitView, readLeaseholdExit } from "@/lib/leasehold-exit";

describe("LeaseholdExitCard — the term, the two exits, and the model's returns on the term", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 25));
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 12", basis: "na" as const });
  const leasehold = (rows: ReturnType<typeof row>[], groundLease = "Ground lease through December 31, 2071; unsubordinated.") =>
    ({
      ...SAMPLE_DEAL.extraction,
      totalPages: 40,
      interest: { kind: "leasehold", summary: "The leasehold interest in the building", share: "", groundLease, loan: "", page: "p. 12" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows],
    }) as ExtractionResult;
  const viewOf = (rows: ReturnType<typeof row>[]) => {
    const ex = leasehold(rows);
    const r = readLeaseholdExit(ex, deriveForAssumable(ex, SAMPLE_DEAL.name).inputs, AS_OF);
    return r ? leaseholdExitView(r) : null;
  };

  it("draws the term with the hold marked and the options dashed, the two exits on one track, the figures and the sentence", () => {
    const html = render(
      React.createElement(LeaseholdExitCard, {
        view: viewOf([row("Ground lease expiration", "December 31, 2071"), row("Ground lease extension options", "Four 10-year options")]),
      }),
    );
    dumpView("leasehold-exit", html);
    const text = visibleText(html);
    expect(text).toContain("The exit, on the ground lease’s term");
    expect(text).toContain("p. 12");
    expect(text).toContain(
      "The ground lease ends Dec 2071, 45.3 years from today, with extension options after it as stated: four of 10 years, 40 years in all.",
    );
    expect(text).toContain("The model's hold, 5 years");
    expect(text).toContain("Left at the sale, 40.3 years (to Dec 2071)");
    expect(text).toContain("Extension options, 40 years if exercised");
    expect(text).toMatch(/Capitalised, as the model runs it\s+\$82\.5M/);
    expect(text).toMatch(/On the 40\.3 years left at the sale\s+\$72\.2M/);
    expect(text).toMatch(/Left at the sale\s+40\.3 yrs\s+of 45\.3 today/);
    expect(text).toMatch(/The term's share\s+87%/);
    expect(text).toMatch(/Exit cap, on the term\s+6\.23%\s+the model runs 5\.45%/);
    expect(text).toMatch(/Levered IRR, on the term\s+6\.2%\s+11\.7% as it runs/);
    expect(text).toContain("the term bears 87% of the capitalised exit — $72.2M against $82.5M");
    expect(text).toContain("Were every extension option exercised (four of 10 years, as stated)");
    expect(text).toContain("It will have 40.3 years.");
    expect(html).toContain('href="/tools#ground-lease"');
    for (const [bar, n] of [["lease-hold", 1], ["lease-term", 1], ["lease-options", 1], ["lease-past", 0], ["lh-capitalised", 1], ["lh-term", 1]] as const) {
      expect((html.match(new RegExp(`data-bar="${bar}"`, "g")) ?? []).length, bar).toBe(n);
    }
    expect(a11yIssues(html), "leasehold card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("a lease that ends inside the hold draws the hold's years past its end in the warning tone and prices no sale", () => {
    const html = render(React.createElement(LeaseholdExitCard, { view: viewOf([row("Ground lease expiration", "March 2029")]) }));
    const text = visibleText(html);
    expect(text).toContain("The model's hold, 5 years, 2.5 years of it after the lease ends");
    expect(text).toContain("Past the lease's end");
    expect(text).toContain("in year 3 of the model's 5-year hold: the building reverts to the landowner before the model sells it");
    expect(html).toContain('data-bar="lease-past"');
    expect(html).not.toContain('data-bar="lh-term"');
    expect(html).not.toContain('data-qa="leasehold-figures"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("renders nothing for a leasehold whose memorandum does not say when its lease ends", () => {
    expect(viewOf([])).toBeNull();
    expect(render(React.createElement(LeaseholdExitCard, { view: null }))).not.toContain("The exit, on the ground lease");
  });

  it("the interest panel draws the term under its lead, with the options dashed, and says in words only what the bar cannot", () => {
    const ex = leasehold([row("Ground lease expiration", "December 31, 2071"), row("Ground lease extension options", "Four 10-year options")]);
    const html = render(React.createElement(InterestPanel, { interest: readInterestFor(ex, 68_000_000, AS_OF) }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="lease-term"');
    expect((html.match(/data-bar="lease-term"/g) ?? []).length).toBe(1);
    expect((html.match(/data-bar="lease-options"/g) ?? []).length).toBe(1);
    expect(text).toContain("Left today, 45.3 years (to Dec 2071)");
    expect(text).toContain("Extension options, 40 years if exercised");
    // A stated date and options that parse: the legend says it all.
    expect(text).not.toContain("The ground lease ends Dec 2071");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    // A year alone is read as its first day, which the legend cannot say.
    const year = visibleText(
      render(React.createElement(InterestPanel, { interest: readInterestFor(leasehold([row("Ground lease expiration", "2071")]), 68_000_000, AS_OF) })),
    );
    expect(year).toContain("Left today, 44.3 years (to 2071)");
    expect(year).toContain("The ground lease ends in 2071, 44.3 years from today — the memorandum states the year alone, read as its first day.");
  });
});

/**
 * The deal-type panels' read (the research pass of 2026-09-30): the older
 * panels printed their whole read open — the affordable one ran about
 * twenty lines on a phone — where the newer ones say the first sentence
 * and fold the rest. Every one now leads with the reader's first sentence
 * and folds the rest, whole in the HTML, under "Read the rest (N more)".
 */
function expectLeadThenFold(html: string, sentences: string[]) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  expect(sentences.length).toBeGreaterThan(1);
  const lead = `<p class="mt-1 text-sm leading-relaxed">${esc(sentences[0])}</p>`;
  const at = html.indexOf(lead);
  expect(at, "the first sentence leads, alone").toBeGreaterThan(-1);
  const fold = html.slice(at + lead.length);
  expect(fold.startsWith('<details class="group mt-1 text-sm leading-relaxed">'), "the rest folds under it").toBe(true);
  expect(fold).toContain(`Read the rest (${sentences.length - 1} more)`);
  expect(fold.slice(0, fold.indexOf("</details>"))).toContain(`<p class="mt-1">${esc(sentences.slice(1).join(" "))}</p>`);
}

// ── Affordable housing (#453) ──────────────────────────────────────────────
import { AffordablePanel } from "@/app/affordable-panel";
import { readAffordable } from "@/lib/affordable";

/**
 * The affordable and hotel clocks' layout (the research pass of 2026-09-30):
 * on a phone the label's 11rem column and an unshrinking date left each bar
 * 0px wide and ran the dates 31–38px past the panel. A clock now stacks —
 * its label, its bar the panel's full width, its date — and sits side by
 * side only where its own container is 28rem wide, the date in a column of
 * one width so every bar is drawn on one track.
 */
function expectClocksStack(html: string, qa: string, rows: number) {
  const at = html.indexOf(`data-qa="${qa}"`);
  expect(at).toBeGreaterThan(-1);
  // The container the rows read their width from opens just before them.
  expect(html.lastIndexOf("@container/clocks", at)).toBeGreaterThan(html.lastIndexOf("<section", at));
  const block = html.slice(at, html.indexOf("</dl>", at));
  const classes = [...block.matchAll(/<div class="([^"]*)"><dt class="font-medium text-ink">/g)].map((m) => m[1]);
  expect(classes).toHaveLength(rows);
  for (const c of classes) {
    expect(c.split(" ")).toContain("grid-cols-1");
    expect(c).toContain("@md/clocks:grid-cols-[minmax(7rem,11rem)_1fr]");
  }
  // Each drawn date: a full line under its bar on a phone, a fixed column
  // side by side — never a bare shrink-0 that squeezes the bar to nothing.
  const dates = [...block.matchAll(/<span class="(font-mono tabular-nums text-muted[^"]*)">/g)].map((m) => m[1]);
  expect(dates.length).toBeGreaterThan(0);
  for (const d of dates) {
    expect(d.split(" ")).not.toContain("shrink-0");
    expect(d).toContain("@md/clocks:w-36");
  }
}

describe("AffordablePanel — a covenant or a contract that sets the rents, drawn", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const row = (label: string, value: string, page = "p. 14") => ({ label, value, flagged: false, page, basis: "na" as const });
  const maple = (over: Partial<NonNullable<ExtractionResult["affordable"]>> = {}, metrics: ExtractionResult["metrics"] = []) =>
    ({
      dealName: "Maple Court",
      assetClass: "multifamily",
      totalPages: 60,
      affordable: {
        programs: ["lihtc", "section8"],
        summary: "A 2011 LIHTC property with a project-based Section 8 contract on 82 units.",
        agreement: "Extended Use Agreement with the state housing finance agency",
        assistance: "Project-based HAP contract on 82 units",
        tiers: [
          { label: "50% AMI", units: "60", rent: "$1,020", maxRent: "$1,090" },
          { label: "60% AMI", units: "120", rent: "$1,310", maxRent: "$1,310" },
          { label: "Market", units: "60", rent: "$1,657", maxRent: "" },
        ],
        page: "p. 14",
        ...over,
      },
      metrics: [
        row("Asking price", "$38,000,000", "p. 2"),
        row("Units", "240", "p. 2"),
        row("Restricted units", "180"),
        row("Units under HAP contract", "82", "p. 15"),
        row("Affordability expiration", "December 31, 2054"),
        row("Compliance period end", "2025"),
        row("HAP contract expiration", "June 30, 2029", "p. 15"),
        ...metrics,
      ],
    }) as ExtractionResult;

  it("draws the units by tier, the contract's units, the three clocks and each tier against its limit", () => {
    const html = render(React.createElement(AffordablePanel, { affordable: readAffordable(maple(), AS_OF) }));
    const text = visibleText(html);
    expect(text).toContain("Affordable housing");
    expect(text).toContain("Housing tax credits (LIHTC) · Section 8 HAP contract");
    expect(text).toContain("p. 14");
    // The units: a segment a tier, deepest limit first, the market last.
    expect(html.match(/data-bar="affordable-units"/g)).toHaveLength(3);
    expect(text).toContain("50% AMI · 60 units");
    expect(text).toContain("60% AMI · 120 units");
    expect(text).toContain("Market · 60 units");
    expect(html.match(/data-bar="affordable-hap"/g)).toHaveLength(1);
    expect(text).toContain("Under the HAP contract · 82 of 240");
    // The clocks: the restriction and the contract drawn, the compliance
    // period's passed end said.
    expect(html.match(/data-bar="affordable-clock"/g)).toHaveLength(2);
    expect(text).toContain("Rent restriction");
    expect(text).toContain("to Dec 2054 · 28.3 years");
    expect(text).toContain("to Jun 2029 · 2.8 years");
    expect(text).toContain("Stated end 2025 — passed");
    expectClocksStack(html, "affordable-clocks", 3);
    expectLeadThenFold(html, readAffordable(maple(), AS_OF)!.sentences);
    // The rents: each restricted tier against the limit it states.
    expect(html.match(/data-bar="affordable-rent"/g)).toHaveLength(2);
    expect(text).toContain("$1,020 of a $1,090 limit");
    expect(text).toContain("$1,310 — at the limit");
    expect(text).toContain("$444 a month apart");
    expect(text).toContain("read its rent growth as the 60 market-rate units");
    expect(a11yIssues(html), "affordable panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says a rent over its limit in the warning tone, with a tick at the limit", () => {
    const over = maple({ tiers: [{ label: "50% AMI", units: "60", rent: "$1,150", maxRent: "$1,090" }] });
    const html = render(React.createElement(AffordablePanel, { affordable: readAffordable(over, AS_OF) }));
    expect(visibleText(html)).toContain("$1,150 — over the $1,090 limit");
    expect(html).toContain("text-kill");
    expect(html).toContain("bg-kill/60");
  });

  it("draws restricted and market-rate as two segments where no tiers are stated, and nothing on a market-rate deal", () => {
    const html = render(React.createElement(AffordablePanel, { affordable: readAffordable(maple({ tiers: [] }), AS_OF) }));
    expect(html.match(/data-bar="affordable-units"/g)).toHaveLength(2);
    expect(visibleText(html)).toContain("Rent-restricted · 180");
    expect(visibleText(html)).toContain("Market-rate · 60");
    expect(html).not.toContain('data-bar="affordable-rent"');
    expect(render(React.createElement(AffordablePanel, { affordable: readAffordable(maple({ programs: [] }, []), AS_OF) }))).toContain(
      "affordable-panel",
    );
    const marketRate = { dealName: "Maple Court", assetClass: "multifamily", metrics: [row("Units", "240")] } as ExtractionResult;
    expect(render(React.createElement(AffordablePanel, { affordable: readAffordable(marketRate, AS_OF) }))).toBe(
      render(React.createElement(React.Fragment)),
    );
  });
});

// ── One tenant leases the whole property (#454) ───────────────────────────
import { SingleTenantPanel } from "@/app/single-tenant-panel";
import { readSingleTenant } from "@/lib/single-tenant";

describe("SingleTenantPanel — the one lease a single-tenant property is, drawn", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const row = (label: string, value: string, page = "p. 4") => ({ label, value, flagged: false, page, basis: "na" as const });
  const walgreens = (over: Partial<NonNullable<ExtractionResult["singleTenant"]>> = {}, metrics: ExtractionResult["metrics"] = []) =>
    ({
      dealName: "Walgreens | Tulsa, OK",
      assetClass: "net_lease",
      totalPages: 30,
      singleTenant: {
        tenant: "Walgreens Co.",
        guarantor: "Walgreens Boots Alliance, Inc.",
        leaseType: "Absolute NNN",
        landlordObligations: "",
        tenantRights: "Tenant holds a right of first refusal on any sale",
        page: "p. 4",
        ...over,
      },
      metrics: [
        row("Asking price", "$6,500,000", "p. 2"),
        row("Going-in cap rate", "6.00%", "p. 2"),
        row("Lease expiration", "March 31, 2036"),
        row("Renewal options", "Eight 5-year options"),
        row("Rent increases", "10% every 5 years"),
        row("Annual base rent", "$390,000"),
        row("Tenant credit rating", "BBB- (S&P)", "p. 5"),
        ...metrics,
      ],
    }) as ExtractionResult;
  const MODEL = { holdMonths: 60, rentGrowthPct: 0.03, vacancyPct: 0.02, exitCapPct: 0.06 };

  it("draws the term with the model's hold and the tenant's options, the increases against the model's growth, and the facts", () => {
    const html = render(React.createElement(SingleTenantPanel, { lease: readSingleTenant(walgreens(), AS_OF), model: MODEL }));
    const text = visibleText(html);
    expect(text).toContain("Single tenant");
    expect(text).toContain("Walgreens Co.");
    expect(text).toContain("p. 4");
    expect(text).toContain("The lease ends Mar 2036, 9.5 years from today, then renewal options as stated, eight of 5 years");
    // The term: the hold, the years left after the sale, the options dashed.
    expect(html.match(/data-bar="lease-hold"/g)).toHaveLength(1);
    expect(html.match(/data-bar="lease-term"/g)).toHaveLength(1);
    expect(html.match(/data-bar="lease-options"/g)).toHaveLength(1);
    expect(text).toContain("The model's hold, 5 years");
    expect(text).toContain("Left at the sale, 4.5 years (to Mar 2036)");
    expect(text).toContain("Renewal options, 40 years if exercised");
    // The increases against the model's growth, on one scale.
    expect(html.match(/data-bar="lease-increase"/g)).toHaveLength(1);
    expect(html.match(/data-bar="model-growth"/g)).toHaveLength(1);
    expect(text).toContain("1.92% a year — 10% every 5 years");
    expect(text).toContain("3.0% a year");
    // The facts as stated, the rating graded by its own letters.
    expect(text).toContain("Walgreens Boots Alliance, Inc.");
    expect(text).toContain("BBB- (S&P) — investment grade");
    expect(text).toContain("Tenant holds a right of first refusal on any sale");
    expect(text).toContain("$390,000");
    expect(text).toContain("enter 1.92% as the rent growth to run the model on the lease");
    expectLeadThenFold(html, readSingleTenant(walgreens(), AS_OF)!.sentences);
    // The facts stack, label over value, until the panel is 28rem wide (the
    // research pass of 2026-09-30: beside an 11rem label column a phone left
    // each value 75px, "Walgreens Boots Alliance, Inc." a word a line).
    const facts = html.slice(html.indexOf('data-qa="single-tenant-facts"') - 400, html.indexOf("</dl>", html.indexOf('data-qa="single-tenant-facts"')));
    expect(facts).toContain('<div class="@container/tenant mt-3">');
    expect(facts).toMatch(/<dl class="grid grid-cols-1 [^"]*@md\/tenant:grid-cols-\[minmax\(7rem,11rem\)_1fr\][^"]*" data-qa="single-tenant-facts">/);
    expect((facts.match(/<div class="@md\/tenant:contents"><dt class="font-medium text-ink">/g) ?? []).length).toBe(5);
    expect(a11yIssues(html), "single-tenant panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says an annual bump once: the lease's own words only where they differ from the rate a year", () => {
    // The research pass of 2026-09-30: "3% annually" read "3% a year — 3% a
    // year" beside the bar.
    const annual = (stated: string) => {
      const ex = walgreens();
      ex.metrics = ex.metrics.map((m) => (m.label === "Rent increases" ? { ...m, value: stated } : m));
      return visibleText(render(React.createElement(SingleTenantPanel, { lease: readSingleTenant(ex, AS_OF), model: MODEL })));
    };
    const yearly = annual("3% annually");
    expect(yearly).toContain("3% a year");
    expect(yearly).not.toContain("3% a year — 3% a year");
    expect(gluedWords(yearly)).toEqual([]);
    // The stated words stay where they say it another way.
    expect(annual("Flat")).toContain("0% a year — flat");
    expect(annual("10% every 5 years")).toContain("1.92% a year — 10% every 5 years");
  });

  it("marks the hold's years past a lease that ends inside it, and draws no growth there", () => {
    const short = walgreens({}, []);
    short.metrics = short.metrics.map((m) => (m.label === "Lease expiration" ? { ...m, value: "2029" } : m));
    const html = render(React.createElement(SingleTenantPanel, { lease: readSingleTenant(short, AS_OF), model: MODEL }));
    const text = visibleText(html);
    expect(html.match(/data-bar="lease-past"/g)).toHaveLength(1);
    expect(text).toContain("Past the lease's end");
    expect(html).not.toContain('data-bar="lease-increase"');
    expect(text).toContain("The lease ends in 2029, inside the model's 5-year hold");
  });

  it("without a model: the term alone, no hold and no growth; nothing at all on a multi-tenant deal", () => {
    const html = render(React.createElement(SingleTenantPanel, { lease: readSingleTenant(walgreens({ guarantor: "" }), AS_OF) }));
    const text = visibleText(html);
    expect(html).not.toContain('data-bar="lease-hold"');
    expect(html.match(/data-bar="lease-term"/g)).toHaveLength(1);
    expect(html).not.toContain('data-bar="model-growth"');
    expect(text).toContain("Left today, 9.5 years (to Mar 2036)");
    expect(text).toContain("None named in the memorandum");
    expect(text).not.toContain("the model");
    const multi = walgreens({ tenant: "" });
    expect(render(React.createElement(SingleTenantPanel, { lease: readSingleTenant(multi, AS_OF) }))).toBe(render(React.createElement(React.Fragment)));
  });
});

describe("ShareView — a single tenant's lease under the title (#454)", () => {
  it("draws the lease, and nothing on a multi-tenant deal", () => {
    const leased = {
      ...SAMPLE_DEAL.extraction,
      singleTenant: { tenant: "Walgreens Co.", guarantor: "Walgreens Boots Alliance, Inc.", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Lease expiration", value: "March 31, 2036", flagged: false, page: "", basis: "na" as const },
        { label: "Rent increases", value: "Flat", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: leased }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="single-tenant-panel"');
    expect(text).toContain("Walgreens Co. leases the whole property, the rent guaranteed by Walgreens Boots Alliance, Inc. as stated.");
    expect(text).toContain("The rent is flat until Mar 2036, as stated");
    // The key terms lead with the lease's own rows.
    expect(text).toContain("Lease expiration");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain(
      "single-tenant-panel",
    );
  });
});

// ── What a hotel is sold with (#455) ──────────────────────────────────────
import { HotelPanel } from "@/app/hotel-panel";
import { readHotelDeal } from "@/lib/hotel-deal";

describe("HotelPanel — what a hotel is sold with, drawn", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const row = (label: string, value: string, page = "p. 6") => ({ label, value, flagged: false, page, basis: "na" as const });
  const courtyard = (over: Partial<NonNullable<ExtractionResult["hotel"]>> = {}, metrics?: ExtractionResult["metrics"]) =>
    ({
      dealName: "Courtyard Nashville Downtown",
      assetClass: "hospitality_str",
      totalPages: 40,
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "A regional operator; the agreement survives the sale", encumbrance: "management", pip: "", page: "p. 6", ...over },
      metrics: metrics ?? [
        row("Asking price", "$26,000,000", "p. 2"),
        row("Keys", "120", "p. 2"),
        row("PIP cost", "$4,200,000"),
        row("Franchise expiration", "June 30, 2034"),
        row("Management agreement expiration", "2031"),
        row("ADR", "$189.50"),
        row("Occupancy", "74.0%"),
        row("RevPAR", "$140.23"),
        row("RevPAR index", "92.4"),
      ],
    }) as ExtractionResult;

  it("draws the basis a key with the PIP on top, the two clocks against the model's sale, and the rooms", () => {
    const html = render(
      React.createElement(HotelPanel, {
        hotel: readHotelDeal(courtyard(), AS_OF),
        holdYears: 5,
        modelLine: "The model carries the $4.2M PIP as its first year's capital, so its returns pay for it.",
      }),
    );
    const text = visibleText(html);
    expect(text).toContain("Hotel");
    expect(text).toContain("Courtyard by Marriott");
    expect(text).toContain("Encumbered by management");
    // The basis: $216.7k a key of price and $35k of PIP on one bar.
    expect(html.match(/data-bar="hotel-price"/g)).toHaveLength(1);
    expect(html.match(/data-bar="hotel-pip"/g)).toHaveLength(1);
    expect(text).toContain("$251.7k all-in");
    expect(text).toContain("The price, $216.7k a key");
    expect(text).toContain("The PIP, $35k a key");
    // The clocks, each with the model's sale marked.
    expect(html.match(/data-bar="hotel-clock"/g)).toHaveLength(2);
    expect(html.match(/data-bar="hotel-hold"/g)).toHaveLength(2);
    expect(text).toContain("to Jun 2034 · 7.8 years");
    expect(text).toContain("2031 · 5.3 years");
    expect(text).toContain("The line is the model's sale, 5 years out");
    expectClocksStack(html, "hotel-clocks", 2);
    expectLeadThenFold(html, readHotelDeal(courtyard(), AS_OF)!.sentences);
    // The rooms: the equation, and the index against 100.
    // The equation is six inline runs; read as one line of text.
    expect(text.replace(/\s+/g, " ")).toContain("ADR $189.50 × occupancy 74.0% = RevPAR $140.23");
    expect(html.match(/data-bar="hotel-index"/g)).toHaveLength(1);
    expect(text).toContain("92 against 100");
    expect(text).toContain("The management as stated: A regional operator; the agreement survives the sale");
    expect(text).toContain("The model carries the $4.2M PIP as its first year's capital");
    expect(a11yIssues(html), "hotel panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("marks a RevPAR that does not tie in the warning tone; nothing at all on anything but a hotel", () => {
    const off = courtyard({}, [row("Keys", "120"), row("ADR", "$189.50"), row("Occupancy", "74%"), row("RevPAR", "$155.00")]);
    const html = render(React.createElement(HotelPanel, { hotel: readHotelDeal(off, AS_OF) }));
    expect(visibleText(html).replace(/\s+/g, " ")).toContain("= RevPAR $140.23 — the memorandum says $155.00");
    expect(html).toContain("text-kill");
    const blank = courtyard({ brand: "", management: "", encumbrance: "unknown" }, [row("Units", "240")]);
    expect(render(React.createElement(HotelPanel, { hotel: readHotelDeal(blank, AS_OF) }))).toBe(render(React.createElement(React.Fragment)));
  });
});

describe("ShareView — what a hotel is sold with, under the title (#455)", () => {
  it("draws the hotel, and nothing on the sample", () => {
    const hotelEx = {
      ...SAMPLE_DEAL.extraction,
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "unencumbered" as const, pip: "", page: "" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, { label: "PIP cost", value: "$4,200,000", flagged: false, page: "", basis: "na" as const }],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: hotelEx }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="hotel-panel"');
    expect(text).toContain("It is sold unencumbered — free of its brand and its management — so the buyer chooses both.");
    expect(text).toContain("PIP cost");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain("hotel-panel");
  });
});

// ── How the property is sold (#456) ───────────────────────────────────────
import { SalePanel } from "@/app/sale-panel";
import { ceilingBidLine, readSale } from "@/lib/sale-terms";

describe("SalePanel — how the property is sold, drawn", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const row = (label: string, value: string, page = "p. 3") => ({ label, value, flagged: false, page, basis: "na" as const });
  const auction = (over: Partial<NonNullable<ExtractionResult["sale"]>> = {}, metrics?: ExtractionResult["metrics"]) =>
    ({
      dealName: "Midtown Office Tower",
      assetClass: "office",
      totalPages: 30,
      sale: { method: "auction", terms: "Online auction; 10% non-refundable deposit; 30-day close", condition: "As-is, where-is", page: "p. 3", ...over },
      metrics: metrics ?? [
        row("NOI (in-place)", "$480,000"),
        row("Starting bid", "$2,500,000"),
        row("Buyer's premium", "5% of the winning bid"),
        row("Reserve price", "Undisclosed"),
        row("Bid deadline", "October 15, 2026"),
      ],
    }) as ExtractionResult;

  it("draws the opening bid, the premium on top and the model's ceiling on one track, with the deadline", () => {
    const sale = readSale(auction(), AS_OF)!;
    const ceiling = { line: ceilingBidLine(sale, 3_150_000, 15), maxAllIn: 3_150_000, hammer: 3_000_000, unbounded: false, hurdlePct: 15 };
    const html = render(React.createElement(SalePanel, { sale, ceiling }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="sale-panel"');
    expect(text).toContain("How it is sold");
    expect(text).toContain("Auction");
    expect(text).toContain("Bids due in 15 days");
    expect(text).toContain("bidding opens at $2.5M, which is where the price starts, not what it is");
    expectLeadThenFold(html, sale.sentences);
    // One bar: the bid, the premium on it, and a tick at the ceiling.
    expect(html.match(/data-bar="sale-bid"/g)).toHaveLength(1);
    expect(html.match(/data-bar="sale-premium"/g)).toHaveLength(1);
    expect(html.match(/data-bar="sale-ceiling"/g)).toHaveLength(1);
    expect(text).toContain("Starting bid, $2.5M");
    expect(text).toContain("Buyer's premium, $125,000 — $2.63M all-in");
    expect(text).toContain("The model's ceiling at 15%, $3.15M all-in");
    expect(text).toContain("At a 15% levered IRR the model pays at most $3.15M all-in — a hammer price of $3M with the 5% premium on top");
    expect(text).toContain("The sale's terms as stated: Online auction; 10% non-refundable deposit; 30-day close");
    expect(a11yIssues(html), "sale panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("a receiver's sale draws who is selling and no bar; nothing at all on a negotiated sale", () => {
    const receiver = auction({ method: "receivership", terms: "", condition: "As-is; no representations" }, [row("Asking price", "$4,000,000")]);
    const html = render(React.createElement(SalePanel, { sale: readSale(receiver, AS_OF) }));
    const text = visibleText(html);
    expect(text).toContain("Receiver's sale");
    expect(text).toContain("A court-appointed receiver is selling it");
    expect(html).not.toContain('data-bar="sale-bid"');
    expect(a11yIssues(html)).toEqual([]);
    const negotiated = auction({ method: "negotiated" }, [row("Asking price", "$4,000,000")]);
    expect(render(React.createElement(SalePanel, { sale: readSale(negotiated, AS_OF) }))).toBe(render(React.createElement(React.Fragment)));
  });
});

describe("ShareView — how the property is sold, under the title (#456)", () => {
  it("draws the sale and leads the key terms with the bid, and nothing on the sample", () => {
    const sold = {
      ...SAMPLE_DEAL.extraction,
      sale: { method: "auction" as const, terms: "", condition: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Starting bid", value: "$40,000,000", flagged: false, page: "", basis: "na" as const },
        { label: "Buyer's premium", value: "5%", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: sold }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="sale-panel"');
    expect(text).toContain("The property is sold at auction: bidding opens at $40M");
    expect(text).toContain("Starting bid");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain("sale-panel");
  });
});

// ── A multi-tenant property's listed tenants (#457) ───────────────────────
import { RosterPanel } from "@/app/roster-panel";
import { readRoster } from "@/lib/tenant-roster";

describe("RosterPanel — the listed tenants against the model's sale, drawn", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const t = (name: string, over: Record<string, string> = {}) => ({
    name, role: "inline" as "anchor" | "inline", inSale: "yes" as "yes" | "no", sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "p. 12", ...over,
  });
  const center = (tenants?: ReturnType<typeof t>[]) =>
    ({
      dealName: "Maple Grove Crossing",
      assetClass: "retail",
      totalPages: 40,
      metrics: [{ label: "Total SF", value: "112,000 SF", flagged: false, page: "p. 2", basis: "na" as const }],
      tenants: tenants ?? [
        { ...t("Kroger", { sf: "58,000 SF", rent: "$725,000", leaseExpiration: "January 31, 2034", rights: "Right to go dark" }), role: "anchor" as const },
        { ...t("Target", { sf: "125,000 SF" }), role: "anchor" as const, inSale: "no" as const },
        t("Staples", { sf: "20,000 SF", rent: "$18.00/SF", leaseExpiration: "June 30, 2029" }),
        t("PetSmart", { sf: "18,000 SF", rent: "$310,000", leaseExpiration: "2029" }),
        t("Chipotle", { sf: "2,400 SF", rent: "$96,000", leaseExpiration: "March 31, 2031", rights: "Co-tenancy" }),
        t("Great Clips", { sf: "1,200 SF", rent: "$28.50/SF", leaseExpiration: "Month-to-month", rights: "Co-tenancy tied to Kroger" }),
        t("Mattress Firm", { sf: "4,000 SF", rent: "$26/SF", leaseExpiration: "December 31, 2032", earlyTermination: "December 31, 2027", rights: "Sales kick-out" }),
      ],
    }) as unknown as ExtractionResult;

  it("draws the roll a year at a time to the sale, the building by tenant with the shadow anchor apart, and each tenant's end and rights", () => {
    const html = render(
      React.createElement(RosterPanel, {
        roster: readRoster(center(), AS_OF),
        modelLine: "The model carries no leasing capital — its tenant improvements and commissions are placeholders of zero.",
      }),
    );
    dumpView("roster-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="roster-panel"');
    expect(text).toContain("Tenants");
    expect(text).toContain("6 listed");
    expect(text).toContain("93% of the building");
    expect(text).toContain("Shadow-anchored");
    // The roll: a column a year to the sale, the sale marked after them.
    expect(html.match(/data-bar="roster-roll"/g)).toHaveLength(5);
    expect(text).toContain("Year 3");
    expect(text).toContain("41%");
    expect(text).toContain("Sale");
    // The building: a segment a listed tenant, the shadow anchor apart.
    expect(html.match(/data-bar="roster-tenant"/g)).toHaveLength(6);
    expect(html.match(/data-bar="roster-shadow"/g)).toHaveLength(1);
    expect(text).toContain("Target, 125,000 SF — an anchor not in the sale");
    // The list: each tenant's end, its first date to leave and its rights.
    expect(text).toContain("Month to month");
    expect(text).toContain("May leave Dec 2027");
    expect(text).toContain("Co-tenancy");
    expect(text).toContain("May go dark");
    expect(text).toContain("Kick-out");
    expect(text).toContain("The model carries no leasing capital");
    expect(a11yIssues(html), "roster panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("nothing at all on one tenant or on housing", () => {
    expect(render(React.createElement(RosterPanel, { roster: readRoster(center([t("Kroger", { sf: "58,000 SF" })]), AS_OF) }))).toBe(
      render(React.createElement(React.Fragment)),
    );
    expect(render(React.createElement(RosterPanel, { roster: readRoster({ ...center(), assetClass: "multifamily" } as ExtractionResult, AS_OF) }))).toBe(
      render(React.createElement(React.Fragment)),
    );
  });
});

describe("ShareView — a multi-tenant property's listed tenants, under the title (#457)", () => {
  it("draws the roster and leads the key terms with the quoted WALT, and nothing on the sample", () => {
    const tenant = (name: string, over: Record<string, string>) => ({
      name, role: "inline" as const, inSale: "yes" as const, sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    const office = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "office",
      tenants: [
        tenant("Acme Law", { sf: "12,000 SF", rent: "$420,000", leaseExpiration: "2124" }),
        tenant("Birch Health", { sf: "8,000 SF", rent: "$280,000", leaseExpiration: "2125" }),
      ],
      metrics: [...SAMPLE_DEAL.extraction.metrics, { label: "WALT", value: "6.8 years", flagged: false, page: "", basis: "na" as const }],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: "office",
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: office }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="roster-panel"');
    expect(text).toContain("The memorandum lists two tenants");
    expect(text).toContain("WALT");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, assetClass: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction }))).not.toContain(
      "roster-panel",
    );
  });
});

// ── A value-add renovation program (#460) ─────────────────────────────────
import { ValueAddPanel } from "@/app/value-add-panel";
import { readValueAdd, valueAddModelLine } from "@/lib/value-add";

describe("ValueAddPanel — the doors, the premium against its break-even, and the pace, drawn", () => {
  const row = (label: string, value: string, page = "p. 14") => ({ label, value, flagged: false, page, basis: "na" as const });
  const program = (metrics?: ReturnType<typeof row>[]) =>
    ({
      dealName: "The Parkline",
      assetClass: "multifamily",
      totalPages: 40,
      strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" },
      metrics: metrics ?? [
        row("Units", "248", "p. 2"),
        row("Units to renovate", "192"),
        row("Units renovated", "56"),
        row("Renovation cost per unit", "$15,000"),
        row("Renovation premium", "$250/month"),
        row("Achieved renovation premium", "$235"),
        row("Annual turnover", "45%"),
        row("Renovation period", "24 months"),
      ],
    }) as unknown as ExtractionResult;

  it("draws the doors done and to go, the premium priced on and achieved with the break-even at the exit cap, and the pace against the building's turnover", () => {
    const r = readValueAdd(program())!;
    const modelLine = valueAddModelLine(r, { holdMonths: 60, exitCapPct: 0.055, capitalYr1: 2_880_000, rentGrowthPct: 0.03 });
    const html = render(React.createElement(ValueAddPanel, { program: r, exitCapPct: 0.055, modelLine }));
    dumpView("value-add-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="value-add-panel"');
    expect(text).toContain("Value-add program");
    expect(text).toContain("20% on cost");
    expect(text).toContain("Premium proven on renovated units");
    // The doors: one bar, the done filled and the rest light.
    expect(text).toContain("248 in the program");
    expect(text).toContain("56 renovated");
    expect(text).toContain("192 to renovate");
    expect(html.match(/data-bar="va-done"/g)).toHaveLength(1);
    expect(html.match(/data-bar="va-left"/g)).toHaveLength(1);
    // The premium: priced on and achieved on one scale, the break-even a
    // tick on each.
    expect(html.match(/data-bar="va-premium"/g)).toHaveLength(1);
    expect(html.match(/data-bar="va-achieved"/g)).toHaveLength(1);
    expect(html.match(/data-bar="va-breakeven"/g)).toHaveLength(2);
    expect(text).toContain("$250");
    expect(text).toContain("$235");
    expect(text).toContain("The line is the premium that breaks even at the model's 5.50% exit cap, $68.75");
    // The pace: the share the period needs against the building's own.
    expect(html.match(/data-bar="va-needed"/g)).toHaveLength(1);
    expect(html.match(/data-bar="va-turnover"/g)).toHaveLength(1);
    expect(text).toContain("For 24 months");
    expect(text).toContain("50%");
    expect(text).toContain("45%");
    expect(text).toContain("at that pace the program takes 2.2 years");
    expect(text).toContain("the premium is in none of its returns");
    expect(a11yIssues(html), "value-add panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("an unproven premium is named, no model means no tick, and nothing without a program", () => {
    const r = readValueAdd(program([row("Units to renovate", "120"), row("Renovation cost per unit", "$12,000"), row("Renovation premium", "$200")]))!;
    const html = render(React.createElement(ValueAddPanel, { program: r }));
    const text = visibleText(html);
    expect(text).toContain("Premium not yet proven");
    expect(text).toContain("No premium achieved on renovated units is stated");
    expect(html).not.toContain('data-bar="va-breakeven"');
    expect(html).not.toContain('data-bar="va-done"');
    expect(html).not.toContain('data-bar="va-needed"');
    expect(render(React.createElement(ValueAddPanel, { program: readValueAdd(program([row("Units", "248")])) }))).toBe(
      render(React.createElement(React.Fragment)),
    );
  });
});

describe("ShareView — a value-add renovation program, under the title (#460)", () => {
  it("draws the program and leads the key terms with the doors and the premium, and nothing on the sample", () => {
    const withProgram = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Units to renovate", value: "192", flagged: false, page: "", basis: "na" as const },
        { label: "Renovation cost per unit", value: "$15,000", flagged: false, page: "", basis: "na" as const },
        { label: "Renovation premium", value: "$250", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withProgram }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="value-add-panel"');
    expect(text).toContain("The program renovates 192 doors at $15,000 each for $250 a month more rent");
    expect(text).toContain("Units to renovate");
    // A plan deal now: its budget is the doors times a door's cost.
    expect(text).toContain("Budget (doors × cost a door)");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain("value-add-panel");
  });
});

// ── A property-tax abatement (#461) ───────────────────────────────────────
import { TaxAbatementPanel } from "@/app/tax-abatement-panel";
import { readTaxAbatement, taxAbatementModelLine } from "@/lib/tax-abatement";

describe("TaxAbatementPanel — the clock against the sale, the bill, and the NOI's share that goes to taxes", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const row = (label: string, value: string, page = "p. 9") => ({ label, value, flagged: false, page, basis: "na" as const });
  const abated = (metrics?: ReturnType<typeof row>[], assetClass = "multifamily") =>
    ({
      dealName: "The Fairmount",
      assetClass,
      totalPages: 40,
      metrics: metrics ?? [
        row("NOI (in-place)", "$3,000,000", "p. 12"),
        row("Going-in cap rate", "5.50%", "p. 3"),
        row("Tax abatement", "10-year Philadelphia tax abatement"),
        row("Tax abatement expiration", "2029"),
        row("Abated real estate taxes", "$70,000"),
        row("Unabated real estate taxes", "$520,000"),
      ],
    }) as unknown as ExtractionResult;

  it("draws the years abated against the model's sale, the bill today against the full one, and the step-up's share of the NOI", () => {
    const r = readTaxAbatement(abated(), AS_OF)!;
    const modelLine = taxAbatementModelLine(r, { holdMonths: 60, exitCapPct: 0.055, expenseGrowthPct: 0.03 });
    const html = render(React.createElement(TaxAbatementPanel, { abatement: r, holdYears: 5, modelLine }));
    dumpView("tax-abatement-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="tax-abatement-panel"');
    expect(text).toContain("Tax abatement");
    expect(text).toContain("2.3 years left");
    expect(text).toContain("Ends inside the model's hold");
    // The clock: the abated years, the full bill after, the sale a line.
    expect(html.match(/data-bar="abate-left"/g)).toHaveLength(1);
    expect(html.match(/data-bar="abate-after"/g)).toHaveLength(1);
    expect(html.match(/data-bar="abate-sale"/g)).toHaveLength(1);
    expect(text).toContain("Ends 2029");
    expect(text).toContain("The model's sale, year 5");
    // The bill: today's against the full one, on one scale.
    expect(html.match(/data-bar="abate-now"/g)).toHaveLength(1);
    expect(html.match(/data-bar="abate-full"/g)).toHaveLength(1);
    expect(text).toContain("$70,000");
    expect(text).toContain("$520,000");
    // The NOI: the step-up's share marked.
    expect(html.match(/data-bar="abate-noi"/g)).toHaveLength(1);
    expect(html.match(/data-bar="abate-step"/g)).toHaveLength(1);
    expect(text).toContain("15% goes to taxes when it ends: $450,000 a year");
    expect(text).toContain("its exit is struck on a NOI the building no longer earns");
    expect(a11yIssues(html), "tax abatement panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("no end is named as none, no model means no sale line, and nothing without an abatement", () => {
    const r = readTaxAbatement(abated([row("Tax abatement", "PILOT"), row("Annual tax abatement savings", "$450,000")]), AS_OF)!;
    const html = render(React.createElement(TaxAbatementPanel, { abatement: r }));
    const text = visibleText(html);
    expect(text).toContain("No end stated");
    expect(html).not.toContain('data-bar="abate-left"');
    expect(html).not.toContain('data-bar="abate-sale"');
    expect(html).not.toContain('data-bar="abate-now"');
    expect(render(React.createElement(TaxAbatementPanel, { abatement: readTaxAbatement(abated([row("NOI (in-place)", "$3,000,000")]), AS_OF) }))).toBe(
      render(React.createElement(React.Fragment)),
    );
  });
});

describe("ShareView — a property-tax abatement, under the title (#461)", () => {
  it("draws the abatement and leads the key terms with it, and nothing on the sample", () => {
    const withAbatement = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Tax abatement", value: "10-year Philadelphia tax abatement", flagged: false, page: "", basis: "na" as const },
        { label: "Tax abatement expiration", value: "2099", flagged: false, page: "", basis: "na" as const },
        { label: "Unabated real estate taxes", value: "$520,000", flagged: false, page: "", basis: "na" as const },
        { label: "Abated real estate taxes", value: "$70,000", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withAbatement }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="tax-abatement-panel"');
    expect(text).toContain("The property's taxes are abated under its 10-year Philadelphia tax abatement until 2099");
    expect(text).toContain("Tax abatement expiration");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain("tax-abatement-panel");
  });
});

// ── Photographs that arrive softly (#463) ───────────────────────────────────
import { DealBanner } from "@/app/(app)/deals/deal-banner";
import { DealThumb } from "@/app/(app)/deals/deal-thumb";
import { PropertyVisual as PropertyVisualForPreview } from "@/app/(app)/deals/[id]/property-visual";

describe("the blur-up preview under a deal's photograph while it loads (#463)", () => {
  const PREVIEW = "data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAAAwAgCdASoYABAAPm0wkkWkIqGYBABABsSgCdMoRwBAbAhvCgAA/vy3qgA=";
  const photo = { kind: "photo" as const, src: "/api/deals/d1/picture?size=hero", credit: "From the offering memorandum", preview: PREVIEW };
  const cover = coverFor({ seed: "d1", assetClass: "multifamily", place: "Philadelphia, PA" });

  it("paints the preview blurred in the card's frame instead of the cover, and the cover where there is none", () => {
    const html = render(React.createElement(DealBanner, { sources: [photo], label: "The Fairmount", aspect: "16/10", cover }));
    expect(html).toContain('data-preview="banner"');
    expect(html).toMatch(/data-preview="banner"[^>]*style="background-image:url\(&quot;data:image\/svg\+xml/);
    expect(html).toContain("feGaussianBlur");
    const plain = render(React.createElement(DealBanner, { sources: [{ ...photo, preview: undefined }], label: "The Fairmount", aspect: "16/10", cover }));
    expect(plain).not.toContain("data-preview");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("paints it in the list row's thumbnail too", () => {
    const html = render(React.createElement(DealThumb, { sources: [{ ...photo, src: "/api/deals/d1/picture?size=thumb" }], label: "The Fairmount", cover }));
    expect(html).toContain('data-preview="thumb"');
  });

  it("paints it under the deal page's photograph", () => {
    const html = render(
      React.createElement(PropertyVisualForPreview, {
        dealId: "d1",
        label: "1 Fairmount Ave, Philadelphia, PA",
        hasStreetAddress: true,
        googleEnabled: false,
        hasAddress: true,
        picture: { credit: "From the offering memorandum", source: "om", preview: PREVIEW },
      }),
    );
    expect(html).toContain('data-preview="hero"');
    expect(html).toMatch(/data-preview="hero"/);
    expect(html).toContain("feGaussianBlur");
  });
});

// ── The building on the deal's own pages (#464) ──────────────────────────────
import { DealCrumb } from "@/app/(app)/deals/[id]/deal-crumb";

describe("the deal's own pages head with the building (#464)", () => {
  it("links back to the deal with its picture at a heading's size, the name its words", () => {
    const html = render(React.createElement(DealCrumb, { dealId: "d1", name: "Smith & Sons Lofts" }));
    expect(html).toContain('href="/deals/d1"');
    expect(html).toContain("data-deal-crumb");
    expect(html).toContain('src="/api/deals/d1/image?w=80&amp;h=80&amp;fallback=cover"');
    expect(html).toContain('width="40"');
    expect(visibleText(html).trim()).toBe("← Smith & Sons Lofts");
    expect(a11yIssues(html)).toEqual([]);
  });
});

// ── What the third-party reports found (#465) ───────────────────────────────
import { SiteReportsPanel } from "@/app/site-reports-panel";
import { readSiteReports, siteReportsModelLine } from "@/lib/site-reports";

describe("SiteReportsPanel — a tile a report, the Phase I's age and the PML against the lenders' lines", () => {
  const AS_OF = new Date(Date.UTC(2026, 8, 30));
  const row = (label: string, value: string, page = "p. 48") => ({ label, value, flagged: false, page, basis: "na" as const });
  const reported = (metrics: ReturnType<typeof row>[]) =>
    ({ dealName: "Harbor Point", assetClass: "multifamily", totalPages: 80, metrics: [row("Asking price", "$42,000,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

  it("draws each report in the tone of what it found, the Phase I's age against 180 days and a year, and the PML against 20%", () => {
    const r = readSiteReports(
      reported([
        row("Phase I ESA date", "November 2024"),
        row("Phase I ESA findings", "One REC: former dry cleaner on the adjacent parcel"),
        row("Phase II ESA", "Recommended; not completed"),
        row("PCA immediate repairs", "$630,000"),
        row("Seismic PML", "24%"),
        row("Zoning conformance", "Legal non-conforming (density)"),
      ]),
      AS_OF,
    )!;
    const modelLine = siteReportsModelLine(r, { capitalYr1: 630_000, capitalIsRepairs: true });
    const html = render(React.createElement(SiteReportsPanel, { reports: r, modelLine }));
    dumpView("site-reports-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="site-reports-panel"');
    expect(text).toContain("Third-party reports");
    expect(text).toContain("Findings to price");
    // A tile a report, each saying what it found.
    for (const key of ["phase-i", "phase-ii", "pca", "pml", "zoning"]) expect(html).toContain(`data-report="${key}"`);
    expect(text).toContain("REC");
    expect(text).toContain("Dated Nov 2024");
    expect(text).toContain("$630,000");
    expect(text).toContain("1.5% of the price");
    expect(text).toContain("24%");
    expect(text).toContain("Legal non-conforming");
    // The Phase I's age against the two lines the purchase is held to.
    expect(html.match(/data-bar="esa-age"/g)).toHaveLength(1);
    expect(html.match(/data-bar="esa-180"/g)).toHaveLength(1);
    expect(html.match(/data-bar="esa-year"/g)).toHaveLength(1);
    expect(text).toContain("22 months");
    // The PML against the lenders' 20%.
    expect(html.match(/data-bar="pml"/g)).toHaveLength(1);
    expect(html.match(/data-bar="pml-line"/g)).toHaveLength(1);
    expect(text).toContain("20%: most lenders ask for earthquake insurance or a retrofit at or above it");
    expect(text).toContain("The model carries the PCA's $630,000 of immediate repairs");
    expect(a11yIssues(html), "site reports panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("a clean set says nothing is flagged, draws no line it has no figure for, and nothing without a report", () => {
    const r = readSiteReports(reported([row("Phase I ESA findings", "No RECs"), row("Zoning conformance", "Legal conforming")]), AS_OF)!;
    const html = render(React.createElement(SiteReportsPanel, { reports: r }));
    const text = visibleText(html);
    expect(text).toContain("Nothing flagged");
    expect(html).not.toContain('data-bar="esa-age"');
    expect(html).not.toContain('data-bar="pml"');
    expect(render(React.createElement(SiteReportsPanel, { reports: readSiteReports(reported([]), AS_OF) }))).toBe(render(React.createElement(React.Fragment)));
  });
});

describe("ShareView — the third-party reports (#465)", () => {
  it("draws what the reports found and leads the key terms with it, and nothing on the sample", () => {
    const withReports = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Phase I ESA findings", value: "One REC: former dry cleaner", flagged: false, page: "", basis: "na" as const },
        { label: "Seismic PML", value: "24%", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: SAMPLE_DEAL.asset_class,
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withReports }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="site-reports-panel"');
    expect(text).toContain("The seller's Phase I found a recognized environmental condition");
    expect(text).toContain("Phase I ESA findings");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: SAMPLE_DEAL.extraction }))).not.toContain("site-reports-panel");
  });
});

import { ListingTeam } from "@/app/(app)/deals/[id]/listing-team";
import { OffersDueControl } from "@/app/(app)/deals/offers-due";
import { listingTeamOf, offersDueOf } from "@/lib/offering";

describe("The offering (#467) — the brokers to call and when offers are due", () => {
  const ex = {
    dealName: "The Maddox",
    assetClass: "multifamily",
    totalPages: 60,
    metrics: [{ label: "Offers due", value: "Thursday, October 15, 2026 at 5:00 PM ET", page: "p. 2" }],
    listingTeam: [
      { name: "Jane Q. Doe", title: "Executive Vice President", firm: "CBRE", phone: "(215) 555-0100", email: "jane.doe@cbre.com", page: "p. 2" },
      { name: "John Roe", title: "Senior Associate", firm: "CBRE", phone: "+44 20 7946 0958", email: "", page: "p. 2" },
    ],
  } as never;

  it("draws each broker as printed with a link to call and one to write, and the call for offers as written", () => {
    const html = render(React.createElement(ListingTeam, { team: listingTeamOf(ex), offersDue: offersDueOf(ex) }));
    const text = visibleText(html);
    expect(a11yIssues(html), "a11y listing team").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-qa="listing-team"');
    expect(text).toContain("Offered by CBRE");
    expect(text).toContain("Offers due:");
    expect(text).toContain("Thursday, October 15, 2026 at 5:00 PM ET");
    // Spelled apart for a screen reader, not only by the gap between them.
    expect(html).toMatch(/Offers due:<\/span> <span/);
    expect(text).toContain("Executive Vice President, CBRE");
    expect(html).toContain('href="tel:+12155550100"');
    expect(html).toContain('href="mailto:jane.doe@cbre.com"');
    // A number the page cannot dial from here is printed, never linked.
    expect(text).toContain("+44 20 7946 0958");
    expect(html).not.toContain("tel:+44");
    // Nothing stated, nothing drawn.
    expect(renderToStaticMarkup(React.createElement(ListingTeam, { team: [], offersDue: null }))).toBe("");
  });

  it("marks the memorandum's own date in the header and offers it to a calendar", () => {
    const html = render(
      React.createElement(OffersDueControl, { dealId: "d1", value: "2026-10-15", fromMemorandum: "p. 2", calendarHref: "/api/deals/d1/offers-due.ics" }),
    );
    expect(a11yIssues(html), "a11y deadline control").toEqual([]);
    expect(html).toContain('data-qa="offers-due-om"');
    expect(html).toContain("the memorandum&#x27;s date, p. 2");
    expect(html).toContain('href="/api/deals/d1/offers-due.ics"');
    expect(html).toContain('aria-label="Add the offers-due date to your calendar"');
    // A date the reader typed is theirs: no mark; no date, no calendar file.
    const typed = render(React.createElement(OffersDueControl, { dealId: "d1", value: "2026-10-20", calendarHref: "/api/deals/d1/offers-due.ics" }));
    expect(typed).not.toContain('data-qa="offers-due-om"');
    const none = render(React.createElement(OffersDueControl, { dealId: "d1", value: null, calendarHref: null }));
    expect(none).not.toContain("offers-due.ics");
  });
});

import { StudentHousingPanel } from "@/app/student-housing-panel";
import { readStudentHousing, studentModelLine } from "@/lib/student-housing";

describe("StudentHousingPanel (#468) — the pre-leasing against last year's and the model, the beds, the walk", () => {
  const row = (label: string, value: string, page = "p. 6") => ({ label, value, flagged: false, page, basis: "na" as const });
  const student = (metrics: ReturnType<typeof row>[]) =>
    ({ dealName: "The Standard", assetClass: "student_housing", totalPages: 60, metrics: [row("Asking price", "$61,200,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

  it("draws the pre-leasing on a track with last year's tick and the model's line, then a tile a figure", () => {
    const r = readStudentHousing(
      student([
        row("Beds", "612"),
        row("Units", "204"),
        row("Pre-leased", "87% for Fall 2026"),
        row("Pre-leased last year", "82%"),
        row("Distance to campus", "0.3 miles"),
        row("Rent per bed", "$1,085"),
        row("Parental guarantees", "78%"),
      ]),
    )!;
    const html = render(React.createElement(StudentHousingPanel, { student: r, modelLine: studentModelLine(r, { vacancyPct: 5 }), modelOccupancyPct: 95 }));
    dumpView("student-housing-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="student-housing-panel"');
    expect(text).toContain("Pre-leased 87% for Fall 2026");
    expect(html.match(/data-bar="prelease"/g)).toHaveLength(1);
    expect(html.match(/data-bar="prelease-prior"/g)).toHaveLength(1);
    expect(html.match(/data-bar="prelease-model"/g)).toHaveLength(1);
    expect(text).toContain("Last year at this point: 82% (+5 pts)");
    expect(text).toContain("The model runs at 95%");
    for (const key of ["beds", "price-bed", "rent-bed", "walk", "guarantees"]) expect(html).toContain(`data-student="${key}"`);
    expect(text).toContain("Pedestrian");
    expect(text).toContain("$100,000");
    expect(text).toContain("8 points of the fall's leasing is still to sign");
    expect(a11yIssues(html), "student housing panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("draws no line it has no figure for, and nothing on anything else", () => {
    const r = readStudentHousing(student([row("Beds", "300"), row("Distance to campus", "2.1 miles")]))!;
    const html = render(React.createElement(StudentHousingPanel, { student: r }));
    const text = visibleText(html);
    expect(text).toContain("Leased by the bed");
    expect(text).toContain("Drive-to");
    expect(html).not.toContain('data-bar="prelease"');
    expect(renderToStaticMarkup(React.createElement(StudentHousingPanel, { student: null }))).toBe("");
  });
});

describe("ShareView — a student building (#468)", () => {
  it("draws the pre-leasing and leads the key terms with it, and nothing on the sample", () => {
    const withStudent = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "student_housing",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Beds", value: "612", flagged: false, page: "", basis: "na" as const },
        { label: "Pre-leased", value: "87% for Fall 2026", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: "student_housing",
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withStudent }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="student-housing-panel"');
    expect(text).toContain("Pre-leased 87% for Fall 2026");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, assetClass: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction }))).not.toContain("student-housing-panel");
  });
});

import { ManufacturedHousingPanel } from "@/app/manufactured-housing-panel";
import { mhModelLine, readManufacturedHousing } from "@/lib/manufactured-housing";

describe("ManufacturedHousingPanel (#470) — whose homes stand on the pads, the lot rent against the market's, the water and sewer", () => {
  const row = (label: string, value: string, page = "p. 4") => ({ label, value, flagged: false, page, basis: "na" as const });
  const park = (metrics: ReturnType<typeof row>[]) =>
    ({ dealName: "Shady Pines", assetClass: "manufactured_housing", totalPages: 40, metrics: [row("Asking price", "$9,300,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

  it("draws the pads, the rents on one scale and a tile a fact, then the model's read", () => {
    const r = readManufacturedHousing(
      park([
        row("Pads", "150"),
        row("Occupied pads", "132"),
        row("Tenant-owned homes", "114"),
        row("Park-owned homes", "18"),
        row("Lot rent", "$430"),
        row("Market lot rent", "$500 - $550 per month"),
        row("Park-owned home rent", "$895"),
        row("Water and sewer", "Private well and septic"),
        row("Utility billing", "Included in lot rent"),
        row("Age restriction", "55+"),
        row("RV sites", "24"),
        row("Rent control", "None"),
      ]),
    )!;
    const html = render(React.createElement(ManufacturedHousingPanel, { park: r, modelLine: mhModelLine(r, { rentGrowthPct: 0.03, exitCapPct: 0.06 }) }));
    dumpView("manufactured-housing-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="mh-panel"');
    expect(text).toContain("150 pads, 88% occupied");
    for (const bar of ["mh-resident", "mh-park", "mh-occupied", "mh-lot-rent", "mh-market", "mh-market-range", "mh-home-rent"]) {
      expect(html.match(new RegExp(`data-bar="${bar}"`, "g")), bar).toHaveLength(1);
    }
    expect(text).toContain("114 homes their residents own (76%)");
    expect(text).toContain("18 homes the park owns (12%)");
    expect(text).toContain("18 vacant pads");
    // The gap's share names its base (the research pass of 2026-09-30:
    // "($70 under, 16.3%)" named none — $70 is 16.3% of the $430 lot rent in
    // place, 14% of the market's $500).
    expect(text).toContain("The memorandum's market $500 ($70 above today's lot rent, 16.3% of it)");
    expect(text).toContain("$70 a month under, 16.3% of the rent in place");
    expect(text).toContain("A park-owned home $895 a month: $465 of it the home's, above the lot's");
    for (const key of ["price-pad", "utilities", "billing", "age", "rv", "rent-control"]) expect(html).toContain(`data-mh="${key}"`);
    expect(text).toContain("Private water & sewer");
    expect(text).toContain("The park pays");
    expect(text).toContain("Not regulated");
    expect(text).toContain("so closing the gap is in none of its returns");
    expect(a11yIssues(html), "park panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("draws no picture it has no figure for, and nothing on anything else", () => {
    const r = readManufacturedHousing(park([row("Pads", "80"), row("Water and sewer", "City water and sewer")]))!;
    const html = render(React.createElement(ManufacturedHousingPanel, { park: r }));
    const text = visibleText(html);
    expect(text).toContain("Public water & sewer");
    expect(html).not.toContain('data-qa="mh-pads"');
    expect(html).not.toContain('data-qa="mh-rent"');
    expect(renderToStaticMarkup(React.createElement(ManufacturedHousingPanel, { park: null }))).toBe("");
  });
});

describe("ShareView — a manufactured-housing park (#470)", () => {
  it("draws the park and leads the key terms with its lot rent, and nothing on the sample", () => {
    const withPark = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "manufactured_housing",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Pads", value: "150", flagged: false, page: "", basis: "na" as const },
        { label: "Lot rent", value: "$430", flagged: false, page: "", basis: "in_place" as const },
        { label: "Water and sewer", value: "City water; septic", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: "manufactured_housing",
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withPark }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="mh-panel"');
    expect(text).toContain("Public water, private sewer");
    expect(text).toContain("Lot rent $430 a month");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, assetClass: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction }))).not.toContain("mh-panel");
  });
});

describe("Pipeline — a manufactured-housing park's tag (#470)", () => {
  const park = card({
    id: "m",
    name: "Shady Pines Community",
    assetClass: "manufactured_housing",
    verdict: "caution",
    slots: { cap: "7.2%", price: "$9,300,000", yoc: null, mh: "Lot rent $430 vs $525 mkt, Private water & sewer", basis: "$62k/pad" },
    market: "Lancaster, PA",
    coveredMarket: null,
  });
  const props = { errorMessage: null, notice: null, onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true }, billing: BILLING };

  it("says the lot rent against the market's on the row and the card, a private system in the warning tone", () => {
    for (const initialView of ["list", "cards"] as const) {
      const html = render(React.createElement(Pipeline, { ...props, deals: withThumbs([park]), initialView }));
      const text = visibleText(html);
      expect(text, initialView).toContain("Lot rent $430 vs $525 mkt, Private water & sewer");
      const tag = html.match(/<span[^>]*title="Lot rent \$430 vs \$525 mkt, Private water &amp; sewer:[^"]*"[^>]*>/)?.[0] ?? "";
      expect(tag, initialView).toContain("text-caution");
      expect(gluedWords(text), initialView).toEqual([]);
      expect(a11yIssues(html), initialView).toEqual([]);
    }
  });
});

import { SelfStoragePanel } from "@/app/self-storage-panel";
import { readSelfStorage, storageModelLine } from "@/lib/self-storage";

describe("SelfStoragePanel (#471) — the occupancies against the 85% line, the in-place rent against the street rate", () => {
  const row = (label: string, value: string, page = "p. 5") => ({ label, value, flagged: false, page, basis: "na" as const });
  const facility = (metrics: ReturnType<typeof row>[]) =>
    ({ dealName: "Lakewood Self Storage", assetClass: "self_storage", totalPages: 50, metrics: [row("Asking price", "$9,800,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

  it("draws a bar an occupancy, the rates on one scale and a tile a fact, then the model's read", () => {
    const r = readSelfStorage(
      facility([
        row("Physical occupancy", "91%"),
        row("SF occupancy", "86%"),
        row("Economic occupancy", "84%"),
        row("In-place rent", "$1.38/SF/month"),
        row("Street rate", "$1.14/SF/month"),
        row("Climate-controlled", "38% of NRSF"),
        row("Tenant insurance", "62% penetration"),
        row("Management", "Third-party managed by Extra Space at 6% of revenue"),
        row("Expansion", "1.8 acres entitled for 25,000 SF"),
        row("Storage SF per capita", "7.2 SF within 3 miles"),
      ]),
    )!;
    const html = render(React.createElement(SelfStoragePanel, { storage: r, modelLine: storageModelLine(r, { rentAnnual: 1_000_000, exitCapPct: 0.06, vacancyPct: 9 }) }));
    dumpView("self-storage-panel", html);
    const text = visibleText(html);
    expect(html).toContain('data-qa="storage-panel"');
    expect(text).toContain("84% economic occupancy");
    for (const bar of ["storage-units", "storage-area", "storage-economic", "storage-inplace", "storage-street"]) {
      expect(html.match(new RegExp(`data-bar="${bar}"`, "g")), bar).toHaveLength(1);
    }
    expect(html.match(/data-bar="storage-stabilized"/g)).toHaveLength(3);
    expect(text).toContain("85%, past which a facility is read as stabilized");
    expect(text).toContain("Street $1.14/SF/month (in-place 21.1% over it)");
    for (const key of ["climate", "insurance", "management", "expansion", "per-capita"]) expect(html).toContain(`data-storage="${key}"`);
    expect(text).toContain("Third party, 6%");
    expect(text).toContain("a downside it does not run");
    expect(a11yIssues(html), "storage panel").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says a lease-up first, draws no rates it cannot compare, and nothing on anything else", () => {
    const r = readSelfStorage(facility([row("Occupancy", "72%"), row("In-place rent", "$118 per unit per month"), row("Street rate", "$1.05/SF/month")]))!;
    const html = render(React.createElement(SelfStoragePanel, { storage: r }));
    const text = visibleText(html);
    expect(text).toContain("In lease-up, 72% of units let");
    expect(html).not.toContain('data-qa="storage-rates"');
    expect(text).toContain("are not stated on one basis");
    expect(renderToStaticMarkup(React.createElement(SelfStoragePanel, { storage: null }))).toBe("");
  });
});

// ── A tile's headline: its figure, or the memorandum's own words ───────────
describe('a deal-type tile is headlined by its figure or the memorandum\'s words, never "As stated"', () => {
  // The research pass of 2026-09-30: the storage panel's expansion and
  // supply tiles were headlined "As stated", their words in the small
  // caption under it — and so were a self-managed facility's management, a
  // walk to campus the reader cannot place, park rent rules it cannot read
  // as either, and a Phase I finding or zoning it cannot name (the Phase
  // I's words were only in its hover title). "As stated" is the caption at
  // most.
  const row = (label: string, value: string, page = "p. 5") => ({ label, value, flagged: false, page, basis: "na" as const });
  const ex = (assetClass: string, metrics: ReturnType<typeof row>[]) =>
    ({ dealName: "Deal", assetClass, totalPages: 80, metrics: [row("Asking price", "$9,800,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;
  /** A tile's headline and its caption, by the tile's own data attribute. */
  const tileOf = (html: string, attr: string) => {
    const at = html.indexOf(attr);
    expect(at, attr).toBeGreaterThan(-1);
    const spans = [...html.slice(at, html.indexOf("</li>", at)).matchAll(/<span class="block [^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);
    return { value: spans[1], sub: spans[2] ?? "" };
  };
  const noStatedHeadline = (html: string) => expect(html).not.toMatch(/font-semibold leading-tight">As stated</);

  it("storage: the expansion, the supply and a self-managed facility's management", () => {
    const html = render(
      React.createElement(SelfStoragePanel, {
        storage: readSelfStorage(
          ex("self_storage", [
            row("Physical occupancy", "91%"),
            row("Management", "Owner-operated"),
            row("Expansion", "1.8 acres entitled for 25,000 SF"),
            row("Storage SF per capita", "7.2 SF within 3 miles"),
          ]),
        ),
      }),
    );
    expect(tileOf(html, 'data-storage="management"')).toEqual({ value: "Owner-operated", sub: "As stated" });
    expect(tileOf(html, 'data-storage="expansion"')).toEqual({ value: "1.8 acres entitled for 25,000 SF", sub: "As stated" });
    expect(tileOf(html, 'data-storage="per-capita"')).toEqual({ value: "7.2 SF within 3 miles", sub: "As stated" });
    noStatedHeadline(html);
    // A third party's fee is still the figure, its words the caption.
    const managed = render(
      React.createElement(SelfStoragePanel, {
        storage: readSelfStorage(ex("self_storage", [row("Physical occupancy", "91%"), row("Management", "Third-party managed by Extra Space at 6% of revenue")])),
      }),
    );
    expect(tileOf(managed, 'data-storage="management"')).toEqual({ value: "Third party, 6%", sub: "Third-party managed by Extra Space at 6% of revenue" });
  });

  it("student housing: a walk the reader cannot place", () => {
    const html = render(React.createElement(StudentHousingPanel, { student: readStudentHousing(ex("student_housing", [row("Beds", "300"), row("Distance to campus", "Close to campus")])) }));
    expect(tileOf(html, 'data-student="walk"')).toEqual({ value: "Close to campus", sub: "As stated" });
    noStatedHeadline(html);
  });

  it("a park: rent rules the reader cannot read as either", () => {
    const html = render(
      React.createElement(ManufacturedHousingPanel, {
        park: readManufacturedHousing(ex("manufactured_housing", [row("Pads", "150"), row("Lot rent", "$430"), row("Rent control", "Increases require 90 days' notice")])),
      }),
    );
    expect(tileOf(html, 'data-mh="rent-control"')).toEqual({ value: "Increases require 90 days&#x27; notice", sub: "As stated" });
    noStatedHeadline(html);
  });

  it("site reports: a Phase I finding and a zoning statement the reader cannot name", () => {
    const html = render(
      React.createElement(SiteReportsPanel, {
        reports: readSiteReports(
          ex("multifamily", [row("Phase I ESA date", "November 2024"), row("Phase I ESA findings", "Closed with an NFA letter"), row("Zoning conformance", "See zoning report")]),
        ),
      }),
    );
    expect(tileOf(html, 'data-report="phase-i"')).toEqual({ value: "Closed with an NFA letter", sub: "Dated Nov 2024" });
    expect(tileOf(html, 'data-report="zoning"')).toEqual({ value: "See zoning report", sub: "As stated" });
    noStatedHeadline(html);
  });
});

describe("ShareView — a self-storage facility (#471)", () => {
  it("draws the facility, and nothing on the sample", () => {
    const withStorage = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "self_storage",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics.filter((m) => !/in-place rent/i.test(m.label)),
        { label: "Economic occupancy", value: "84%", flagged: false, page: "", basis: "in_place" as const },
        { label: "In-place rent", value: "$1.38/SF/month", flagged: false, page: "", basis: "in_place" as const },
        { label: "Street rate", value: "$1.14/SF/month", flagged: false, page: "", basis: "in_place" as const },
      ],
    };
    const props = {
      dealName: SAMPLE_DEAL.name,
      assetClass: "self_storage",
      expiresAt: "2026-09-30T12:00:00Z",
      verdictStale: false,
      picture: null,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    };
    const html = renderToStaticMarkup(React.createElement(ShareView, { ...props, extraction: withStorage }));
    const text = visibleText(html);
    expect(html).toContain('data-qa="storage-panel"');
    expect(text).toContain("Street $1.14/SF/month (in-place 21.1% over it)");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    expect(renderToStaticMarkup(React.createElement(ShareView, { ...props, assetClass: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction }))).not.toContain("storage-panel");
  });
});

describe("Pipeline — a self-storage facility's tag (#471)", () => {
  const facility = card({
    id: "s",
    name: "Lakewood Self Storage",
    assetClass: "self_storage",
    verdict: "pass",
    slots: { cap: "6.4%", price: "$9,800,000", yoc: null, storage: "Lease-up, 72% occupied, In-place 20% over street" },
    market: "Lakewood, CO",
    coveredMarket: null,
  });
  const props = { errorMessage: null, notice: null, onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true }, billing: BILLING };

  it("says a lease-up in the warning tone on the row and the card", () => {
    for (const initialView of ["list", "cards"] as const) {
      const html = render(React.createElement(Pipeline, { ...props, deals: withThumbs([facility]), initialView }));
      const text = visibleText(html);
      expect(text, initialView).toContain("Lease-up, 72% occupied, In-place 20% over street");
      const tag = html.match(/<span[^>]*title="Lease-up, 72% occupied, In-place 20% over street:[^"]*"[^>]*>/)?.[0] ?? "";
      expect(tag, initialView).toContain("text-caution");
      expect(gluedWords(text), initialView).toEqual([]);
      expect(a11yIssues(html), initialView).toEqual([]);
    }
  });
});
