import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BANNER, CARD, THUMB, bannerSources, leadMarketId, pictureVersion, shownMarketIds, type BannerSource } from "./deal-banner";
import { IMAGE_CREDIT, imagePlan } from "./imagery-plan";
import { marketPictureFor } from "./market-picture";
import { coverFor } from "./deal-cover";
import { a11yIssues, visibleText } from "./render-lint";
import { BannerFace, DealBanner } from "@/app/(app)/deals/deal-banner";

const base = { dealId: "d1", pictureCredit: null, googleEnabled: false, hasStreetAddress: true, hasAddress: true };

describe("bannerSources — the pictures a card tries, best first, each with its own credit (#418)", () => {
  it("the deal's own photograph first, then Street View where a key and a street address allow, then the USGS aerial", () => {
    const all = bannerSources({ ...base, pictureCredit: "From the offering memorandum", googleEnabled: true });
    expect(all.map((s) => s.kind)).toEqual(["photo", "streetview", "aerial"]);
    expect(all.map((s) => s.credit)).toEqual(["From the offering memorandum", IMAGE_CREDIT.streetview, IMAGE_CREDIT.aerial]);
    expect(all[0].src).toBe("/api/deals/d1/picture?size=hero");
    expect(all[1].src).toBe("/api/deals/d1/photo");
    // The overhead is pinned to USGS, so its credit can never be Google's.
    expect(all[2].src).toBe(`/api/deals/d1/aerial?src=usgs&w=${BANNER.w}&h=${BANNER.h}`);
  });

  it("follows imagePlan's order for the sources it draws", () => {
    const plan = imagePlan({ hasPicture: true, hasStreetAddress: true, googleConfigured: true }).filter((s) => s !== "satellite");
    const drawn = bannerSources({ ...base, pictureCredit: "Photograph added to the deal", googleEnabled: true }).map((s) => s.kind);
    expect(drawn).toEqual(plan);
  });

  it("no key or no street address: no Street View; no address: no overhead; nothing at all: an empty list", () => {
    expect(bannerSources(base).map((s) => s.kind)).toEqual(["aerial"]);
    expect(bannerSources({ ...base, googleEnabled: true, hasStreetAddress: false }).map((s) => s.kind)).toEqual(["aerial"]);
    expect(bannerSources({ ...base, hasAddress: false, hasStreetAddress: false })).toEqual([]);
    expect(bannerSources({ ...base, hasAddress: false, pictureCredit: "From the offering memorandum" }).map((s) => s.kind)).toEqual(["photo"]);
  });

  it("an id is carried safely into the route", () => {
    expect(bannerSources({ ...base, dealId: "a/b" })[0].src).toBe(`/api/deals/a%2Fb/aerial?src=usgs&w=${BANNER.w}&h=${BANNER.h}`);
  });

  it("tries the memorandum's cover on its first ask where no picture is cached, credited as the memorandum's (#428)", () => {
    const first = bannerSources({ ...base, memorandumUnread: true });
    expect(first.map((x) => x.kind)).toEqual(["photo", "aerial"]);
    expect(first[0]).toMatchObject({ src: "/api/deals/d1/picture?size=hero", credit: IMAGE_CREDIT.photo });
    // Asked for over the next picture, which shows meanwhile (#440).
    expect(first[0].pending).toBe(true);
    expect(first[1].pending).toBeUndefined();
    // A cached picture wins, under its own credit; nothing is tried twice,
    // and a picture already found is simply shown.
    const cached = bannerSources({ ...base, memorandumUnread: true, pictureCredit: "Photograph added to the deal" });
    expect(cached.filter((x) => x.kind === "photo")).toHaveLength(1);
    expect(cached[0].credit).toBe("Photograph added to the deal");
    expect(cached[0].pending).toBeUndefined();
  });

  it("frames the card's overhead at the card's size and rings the building only for a street address (#428)", () => {
    const card = bannerSources(base, CARD);
    expect(card[0]).toEqual({
      kind: "aerial",
      src: `/api/deals/d1/aerial?src=usgs&w=${CARD.w}&h=${CARD.h}`,
      credit: IMAGE_CREDIT.aerial,
      marker: true,
    });
    // A neighbourhood placement's centre is a district's, not a building's.
    expect(bannerSources({ ...base, hasStreetAddress: false }, CARD)[0].marker).toBeUndefined();
    // A frame may pin its zoom.
    expect(bannerSources(base, { ...CARD, z: 16 })[0].src).toBe(`/api/deals/d1/aerial?src=usgs&w=${CARD.w}&h=${CARD.h}&z=16`);
  });

  it("tries the market's photograph before the aerial on a pipeline card, named as the market's (#438)", () => {
    const market = marketPictureFor({ city: "Pittsburgh", state: "PA" });
    expect(market).not.toBeNull();
    // No photograph of the building and no Google key: the market's
    // photograph, then the aerial behind it should the photograph fail.
    const card = bannerSources({ ...base, market }, CARD);
    expect(card.map((x) => x.kind)).toEqual(["market", "aerial"]);
    expect(card[0]).toMatchObject({ src: market!.src, credit: market!.credit, market: market!.name });
    // Its alt says what it shows and that it is not the building.
    expect(card[0].alt).toContain(market!.place);
    expect(card[0].alt).toContain("No photograph of the building yet");
    // The building's own pictures still come first.
    const all = bannerSources({ ...base, market, pictureCredit: "From the offering memorandum", googleEnabled: true }, CARD);
    expect(all.map((x) => x.kind)).toEqual(["photo", "streetview", "market", "aerial"]);
    // With no address a card may still show its market, named in the memorandum.
    expect(bannerSources({ ...base, hasAddress: false, hasStreetAddress: false, market }, CARD).map((x) => x.kind)).toEqual(["market"]);
    // No market handed in (the compare page): exactly as before.
    expect(bannerSources(base, CARD).map((x) => x.kind)).toEqual(["aerial"]);
  });
});

describe("bannerSources — the deal's own photograph carries its blur-up preview (#463)", () => {
  const PREVIEW = "data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAAAwAgCdASoYABAAPm0wkkWkIqGYBABABsSgCdMoRwBAbAhvCgAA/vy3qgA=";
  it("on the stored photograph only, and only a preview this site made", () => {
    const got = bannerSources({ ...base, pictureCredit: "From the offering memorandum", picturePreview: PREVIEW }, CARD);
    expect(got[0]).toMatchObject({ kind: "photo", preview: PREVIEW });
    expect(got.slice(1).every((x) => x.preview === undefined)).toBe(true);
    // A photograph not yet looked for has no preview to paint.
    expect(bannerSources({ ...base, memorandumUnread: true, picturePreview: PREVIEW })[0].preview).toBeUndefined();
    // Anything that is not a small image data URI is dropped, never styled.
    expect(bannerSources({ ...base, pictureCredit: "x", picturePreview: 'data:image/webp;base64,a");}' })[0].preview).toBeUndefined();
  });
});

describe("a stored photograph's URL names its version, so the browser keeps it (research pass 25)", () => {
  it("reads the stamp a stored picture's files carry, and nothing else", () => {
    expect(pictureVersion("photos/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b/lk2x9a-hero.jpg")).toBe("lk2x9a");
    expect(pictureVersion("photos/x/lk2x9ag3-thumb.jpg")).toBe("lk2x9ag3");
    expect(pictureVersion("photos/x/lk2x9a-full.jpg")).toBe("lk2x9a");
    for (const bad of [null, undefined, "", "u1/x.pdf", "photos/x/lk2x9a-hero.png", "photos/x/a b-hero.jpg", "photos/x/a\r\n-hero.jpg"]) {
      expect(pictureVersion(bad), String(bad)).toBeNull();
    }
  });

  it("carries it on the stored photograph only", () => {
    const got = bannerSources({ ...base, pictureCredit: "From the offering memorandum", pictureVersion: "lk2x9a" }, CARD);
    expect(got[0].src).toBe("/api/deals/d1/picture?size=hero&v=lk2x9a");
    expect(bannerSources({ ...base, pictureCredit: "x", pictureVersion: "lk2x9a" }, THUMB)[0].src).toBe("/api/deals/d1/picture?size=thumb&v=lk2x9a");
    // None stored, or a memorandum not yet looked in: no version, revalidated as before.
    expect(bannerSources({ ...base, pictureCredit: "x" }, CARD)[0].src).toBe("/api/deals/d1/picture?size=hero");
    expect(bannerSources({ ...base, memorandumUnread: true, pictureVersion: "lk2x9a" }, CARD)[0].src).toBe("/api/deals/d1/picture?size=hero");
  });
});

describe("the pipeline's one credit line names the market photographs on screen, and only those", () => {
  const pitt = marketPictureFor({ city: "Pittsburgh", state: "PA" })!;
  const phx = marketPictureFor({ city: "Phoenix", state: "AZ" })!;
  const at = (market: typeof pitt, over: Partial<Parameters<typeof bannerSources>[0]> = {}) =>
    bannerSources({ ...base, aerial: false, market, ...over }, CARD);

  it("a card leads with its market's photograph only where nothing of the building's own comes first", () => {
    expect(leadMarketId(at(pitt))).toBe(pitt.id);
    // Its own photograph leads, and the market's is only a fallback behind it.
    expect(leadMarketId(at(pitt, { pictureCredit: "From the offering memorandum" }))).toBeNull();
    // Street View reaches the street: it leads, the market's photograph behind it.
    expect(leadMarketId(at(pitt, { googleEnabled: true }))).toBeNull();
    // A memorandum not yet searched is asked for OVER the market's photograph,
    // which shows until it loads.
    expect(leadMarketId(at(pitt, { memorandumUnread: true }))).toBe(pitt.id);
    expect(leadMarketId([])).toBeNull();
  });

  it("each card's own report wins over its lead, in the cards' order, each photograph once", () => {
    const cards = [
      { id: "a", pictures: at(pitt) },
      { id: "b", pictures: at(phx) },
      { id: "c", pictures: at(pitt) },
      { id: "d", pictures: at(phx, { pictureCredit: "From the offering memorandum" }) },
    ];
    // Before any card has reported, the leads — what the server drew.
    expect(shownMarketIds(cards, new Map())).toEqual([pitt.id, phx.id]);
    // Phoenix's card found its memorandum photograph: no Phoenix credit.
    expect(shownMarketIds(cards, new Map([["b", null]]))).toEqual([pitt.id]);
    // A card whose own photograph failed and fell to its market is credited.
    expect(shownMarketIds(cards, new Map([["b", null], ["d", phx.id]]))).toEqual([pitt.id, phx.id]);
    // Both Pittsburgh cards fell past it: nobody is credited for it.
    expect(shownMarketIds(cards, new Map<string, string | null>([["a", null], ["b", null], ["c", null]]))).toEqual([]);
    // A card not on screen is not passed in at all.
    expect(shownMarketIds([], new Map())).toEqual([]);
  });
});

describe("a card says nothing about a picture until the picture has loaded (research pass 29)", () => {
  // Research pass 29 caught, on a phone with the photographs slow to come,
  // a drawn office tower captioned "MARKET PHOTO Philadelphia PA" and
  // credited to its photographer, a drawn storefront credited "From the
  // offering memorandum", and a drawn apartment block counting "5"
  // photographs under both flip arrows: the frame held the deal's cover
  // while each card already wore its picture's words.
  const cover = coverFor({ seed: "d1", assetClass: "multifamily", place: "Philadelphia, PA" });
  const pitt = marketPictureFor({ city: "Pittsburgh", state: "PA" })!;
  const own = bannerSources({ ...base, pictureCredit: "From the offering memorandum", aerial: false }, CARD);
  const slides: BannerSource[] = [3, 5].map((page, k) => ({
    kind: "photo",
    src: `/api/deals/d1/picture?size=hero&g=${k + 1}`,
    credit: `From the offering memorandum, page ${page}`,
  }));
  const draw = (sources: BannerSource[], extra: Partial<React.ComponentProps<typeof DealBanner>> = {}) =>
    renderToStaticMarkup(
      React.createElement(DealBanner, { sources, label: "The Fairmount", aspect: "16/10", flush: true, shade: true, cover, ...extra }),
    );
  const face = (props: React.ComponentProps<typeof BannerFace>) => renderToStaticMarkup(React.createElement(BannerFace, props));

  it("draws no credit, no count, no caption and no ring before the picture loads, and keeps the cover's own words off", () => {
    // The deal's own photograph, five of them on its page.
    const photo = draw(own, { photos: 5, slides });
    expect(photo).toContain('data-deal-banner="photo"');
    expect(photo).toMatch(/<img[^>]*src="\/api\/deals\/d1\/picture\?size=hero"[^>]*class="[^"]*\bopacity-0\b/);
    expect(photo).not.toContain('data-picture="face"');
    expect(photo).not.toContain('data-picture="photo-count"');
    expect(photo).not.toContain('data-slide=');
    // The cover holds the frame without its words, as it always has: it is
    // no photograph, and no photograph's caption either.
    expect(photo).toMatch(/<span aria-hidden="true" data-deal-cover="housing"/);
    expect(photo).not.toContain('role="img"');
    expect(visibleText(photo).trim()).toBe("");
    // A market's photograph: no caption, no photographer, no licence.
    const market = draw(bannerSources({ ...base, market: pitt, aerial: false }, CARD));
    expect(market).toContain('data-deal-banner="market"');
    expect(market).not.toContain('data-picture="market"');
    expect(visibleText(market).trim()).toBe("");
    // A memorandum's photograph asked for over the market's: neither speaks.
    const lifting = draw(bannerSources({ ...base, memorandumUnread: true, market: pitt, aerial: false }, CARD));
    expect(lifting).toContain('data-lift="photo"');
    expect(visibleText(lifting).trim()).toBe("");
    // A street address's overhead, the compare page's: no ring, no credit.
    const overhead = draw(bannerSources(base, BANNER), { cover: null, shade: false });
    expect(overhead).toContain('data-deal-banner="aerial"');
    expect(overhead).not.toContain('data-picture="banner-pin"');
    expect(visibleText(overhead)).not.toContain(IMAGE_CREDIT.aerial);
    for (const html of [photo, market, lifting, overhead]) expect(a11yIssues(html)).toEqual([]);
  });

  it("draws them once the picture is whole, fading in with it: the count and credit, the flipped-to page, the market's caption, the ring", () => {
    const [photo] = own;
    expect(face({ source: photo, loaded: false, photos: 5, credit: photo.credit })).toBe("");
    const whole = face({ source: photo, loaded: true, photos: 5, credit: photo.credit });
    expect(whole).toMatch(/^<span data-picture="face" class="[^"]*\btransition-opacity\b[^"]*\bstarting:opacity-0\b/);
    expect(whole).toMatch(/data-picture="photo-count"[^>]*>[\s\S]*?<span>5<\/span><span class="sr-only"> photographs<\/span>/);
    expect(visibleText(whole)).toContain("From the offering memorandum");
    // Flipped to another photograph, once that one is whole: its place in
    // the count and its own page's credit.
    const flipped = face({ source: photo, loaded: true, photos: 5, position: 2, credit: slides[0].credit });
    expect(visibleText(flipped)).toContain("2 / 5");
    expect(visibleText(flipped)).toContain("From the offering memorandum, page 3");
    // One photograph is not counted.
    expect(face({ source: photo, loaded: true, photos: 1, credit: photo.credit })).not.toContain("photo-count");
    // A market's photograph: named on its face as the market's, credited to
    // its photographer, and counted as nothing.
    const [mkt] = bannerSources({ ...base, market: pitt, aerial: false }, CARD);
    const caption = face({ source: mkt, loaded: true, photos: 5, credit: mkt.credit });
    expect(caption).toContain('data-picture="market"');
    expect(visibleText(caption).replace(/\s+/g, " ")).toContain(`Market photo ${pitt.name}`);
    expect(visibleText(caption).replace(/\s+/g, " ")).toContain(pitt.credit);
    expect(caption).not.toContain("photo-count");
    // A street address's overhead: the ring at its centre, and USGS credited.
    const [overhead] = bannerSources(base, BANNER);
    const ringed = face({ source: overhead, loaded: true, credit: overhead.credit });
    expect(ringed).toContain('data-picture="banner-pin"');
    expect(visibleText(ringed)).toContain(IMAGE_CREDIT.aerial);
    for (const html of [whole, flipped, caption, ringed]) expect(a11yIssues(html)).toEqual([]);
  });
});
