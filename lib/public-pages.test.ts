import { describe, expect, it } from "vitest";
import metrosSeed from "@/data/research/metros.json";
import { DATA_METROS } from "@/lib/market-match";
import { SECTORS } from "@/lib/research-sectors";
import { marketMeta, marketPageFor, marketPages, marketPath, sectorPageFor, sectorPages } from "./public-pages";

describe("public pages — every market and sector page, named for itself (#430)", () => {
  it("lists every briefed market and every metro area read without a brief, each once", () => {
    const pages = marketPages();
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of metrosSeed.metros ?? []) expect(ids).toContain(m.id);
    for (const m of DATA_METROS) expect(ids).toContain(m.id);
    expect(pages.find((p) => p.id === "dc")?.briefed).toBe(true);
    expect(pages.find((p) => p.id === "pittsburgh")?.briefed).toBe(false);
    expect(sectorPages().map((s) => s.id)).toEqual(SECTORS.map((s) => s.id));
  });

  it("gives a metro page its own title, description and canonical — a brief only where there is one", () => {
    const dc = marketMeta(marketPageFor("dc"), null);
    expect(dc.title).toBe("Washington DC market data: rents, vacancy, jobs and supply");
    expect(dc.canonical).toBe("/market?metro=dc");
    expect(dc.description).toContain("research brief");
    const pitt = marketMeta(marketPageFor("pittsburgh"), null);
    expect(pitt.title).toContain("Pittsburgh PA");
    expect(pitt.description).not.toContain("brief");
    // The metro wins when a link carries both.
    expect(marketMeta(marketPageFor("dc"), sectorPageFor("office")).canonical).toBe("/market?metro=dc");
  });

  it("names a sector page and the base page, and refuses an id it does not know", () => {
    const office = marketMeta(null, sectorPageFor("office"));
    expect(office.canonical).toBe("/market?sector=office");
    expect(office.title).toContain("Office");
    expect(marketPageFor("atlantis")).toBeNull();
    expect(sectorPageFor("moon_base")).toBeNull();
    const base = marketMeta(null, null);
    expect(base.canonical).toBe("/market");
    expect(base.description).toContain(`${marketPages().length} US metro areas`);
    expect(marketPath("a b")).toBe("/market?metro=a%20b");
  });

  it("gives a metro page its own link preview, and every other page the site's card (#436)", () => {
    const pitt = marketMeta(marketPageFor("pittsburgh"), null);
    expect(pitt.image).toEqual({
      url: "/api/og/market/pittsburgh",
      width: 1200,
      height: 630,
      alt: "Pittsburgh PA market data, over the market's own photograph",
    });
    expect(marketMeta(null, sectorPageFor("office")).image.url).toBe("/opengraph-image");
    expect(marketMeta(null, null).image.url).toBe("/opengraph-image");
    // Every metro page's card is its own address.
    const urls = marketPages().map((p) => marketMeta(p, null).image.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
