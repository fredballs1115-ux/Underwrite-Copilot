import { describe, expect, it } from "vitest";
import { MARKET_PHOTO_WIDTH, marketPictureFor } from "./market-picture";
import { photographerLine, skylineFor, skylineTag } from "./skyline";
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
    });
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
