import { describe, expect, it } from "vitest";
import { BANNER, CARD, bannerSources } from "./deal-banner";
import { IMAGE_CREDIT, imagePlan } from "./imagery-plan";
import { marketPictureFor } from "./market-picture";

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
