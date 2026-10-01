import { describe, expect, it } from "vitest";
import { MARKET_PHOTO_WIDTH, marketPhotoWidth, marketPictureFor } from "./market-picture";
import { commonsPage, photographerLine, skylineFor, skylineTag } from "./skyline";
import { creditText, photographerParts } from "./credit-parts";
import { marketPageFor, marketPages } from "./public-pages";
import { metroAliasOf } from "./live-rates";

describe("marketPictureFor — the photograph a card shows where the building has none (#438)", () => {
  it("reads a deal's market from its address and serves that market's verified photograph", () => {
    const p = marketPictureFor({ city: "Pittsburgh", state: "PA" })!;
    const shot = skylineFor("pittsburgh")!;
    expect(p).toEqual({
      id: "pittsburgh",
      name: marketPageFor("pittsburgh")!.name,
      place: shot.place,
      src: `/api/imagery/skyline/pittsburgh?w=${MARKET_PHOTO_WIDTH}&v=${skylineTag("pittsburgh")}`,
      credit: photographerLine(shot),
      // The same credit's links, for a caption that can hold them.
      author: { name: shot.credit, url: commonsPage(shot.file) },
      license: { name: shot.license, url: shot.licenseUrl },
    });
    // The links say the plain line's words, which crop the picture.
    expect(creditText(photographerParts(p.author, p.license, true))).toBe(p.credit);
    // A briefed market reads the same way.
    expect(marketPictureFor({ city: "Philadelphia", state: "PA" })?.id).toBe("philadelphia");
  });

  it("a suburb with no photograph of its own shows the metro its figures borrow from, under that metro's name", () => {
    expect(skylineFor("montgomery_county")).toBeNull();
    expect(metroAliasOf("montgomery_county")).toBe("dc");
    const p = marketPictureFor({ city: "Rockville", state: "MD" })!;
    expect(p.id).toBe("dc");
    expect(p.name).toBe(marketPageFor("dc")!.name);
  });

  it("with no address to read, takes the market the memorandum names — never a bare city", () => {
    expect(marketPictureFor(null, "Pittsburgh, PA")?.id).toBe("pittsburgh");
    expect(marketPictureFor({}, "Portland")).toBeNull();
  });

  it("reads a typed line the way it reads a picked suggestion (#441)", () => {
    // An address saved without picking a suggestion is a line and nothing
    // else; its card fell to the overhead although the line names Dallas.
    expect(marketPictureFor({ label: "4200 Maple Ave, Dallas, TX 75219" })?.id).toBe("dallas");
    expect(marketPictureFor({ label: "1200 Liberty Ave, Pittsburgh, PA 15222", street: "", city: "", state: "" })?.id).toBe("pittsburgh");
  });

  it("takes where a server page placed the deal over the address's own words (#447)", () => {
    // A Frisco deal its county placed in Dallas-Fort Worth wears that photograph.
    expect(marketPictureFor({ city: "Frisco", state: "TX" })).toBeNull();
    expect(marketPictureFor({ city: "Frisco", state: "TX" }, null, { id: "dallas", name: "Dallas-Fort Worth" })?.id).toBe("dallas");
    // Kingston, WA matches Seattle's "king"; placed nowhere by its county,
    // it wears no Seattle photograph, and the memorandum's market still counts.
    expect(marketPictureFor({ city: "Kingston", state: "WA", county: "Kitsap County" })?.id).toBe("seattle");
    expect(marketPictureFor({ city: "Kingston", state: "WA", county: "Kitsap County" }, null, null)).toBeNull();
    expect(marketPictureFor({ city: "Kingston", state: "WA" }, "Seattle, WA", null)?.id).toBe("seattle");
  });

  it("outside every photographed market there is nothing to borrow", () => {
    expect(marketPictureFor({ city: "Boise", state: "ID" })).toBeNull();
    expect(marketPictureFor({ state: "PA" })).toBeNull();
    expect(marketPictureFor(null)).toBeNull();
  });

  it("every market the site covers has a photograph for its cards, its own or its metro's", () => {
    for (const m of marketPages()) {
      const alias = metroAliasOf(m.id);
      expect(skylineFor(m.id) ?? (alias ? skylineFor(alias) : null), m.id).not.toBeNull();
    }
  });
});

describe("a metro area the site reads no figures for (#472)", () => {
  it("wears its own photograph only where one has been chosen, and nothing where none has", () => {
    // Reached through the county, never through the address's words: a
    // metro area with no entry gives nothing, and the card keeps its cover.
    expect(marketPictureFor({ label: "1 Main St, Nowhere, ZZ" }, null, null, { cbsa: "99999", area: "Nowhere, ZZ" })).toBeNull();
    expect(marketPictureFor({ label: "1 Main St, Nowhere, ZZ" }, null, null, null)).toBeNull();
    // A market the site reads keeps its own photograph whatever the county says.
    const pitt = marketPictureFor(null, null, { id: "pittsburgh", name: "Pittsburgh PA" }, { cbsa: "38300", area: "Pittsburgh, PA" });
    expect(pitt?.id).toBe("pittsburgh");
  });
});

describe("the width a card asks for (#475)", () => {
  it("asks for the widest step where a panorama cut to the card would fall short of a phone card's height", () => {
    // Louisville's river panorama, 9640x2304: 383px tall at 1600 wide.
    expect(marketPhotoWidth({ size: [9640, 2304] })).toBe(2400);
    // Grand Rapids at dusk, 4000x1475: 590px tall at 1600.
    expect(marketPhotoWidth({ size: [4000, 1475] })).toBe(2400);
    // A 3:2 frame reaches the card's height at 1600.
    expect(marketPhotoWidth({ size: [6000, 4000] })).toBe(1600);
    // A size not recorded, and an original under 1600 wide, ask as before.
    expect(marketPhotoWidth({})).toBe(MARKET_PHOTO_WIDTH);
    expect(marketPhotoWidth({ size: [1500, 400] })).toBe(MARKET_PHOTO_WIDTH);
  });

  it("puts that width in the card's source", () => {
    const pic = marketPictureFor(null, null, null, { cbsa: "31140", area: "Louisville/Jefferson County, KY-IN" });
    expect(pic?.src).toContain("?w=2400&");
    expect(pic?.src).toContain(encodeURIComponent("cbsa:31140"));
  });
});
