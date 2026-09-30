import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COVER_TONES, coverFor, coverKindFor, coverPlace, coverToneFor } from "./deal-cover";
import { CARD, THUMB, bannerSources } from "./deal-banner";
import { DealCover } from "@/app/(app)/deals/deal-cover";
import { DealBanner } from "@/app/(app)/deals/deal-banner";
import { DealThumb } from "@/app/(app)/deals/deal-thumb";
import { a11yIssues, positionConflicts, visibleText } from "./render-lint";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((x) => x / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (fg: number[], bg: number[]) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

describe("a deal's cover (#442)", () => {
  it("draws each building type a pipeline holds, and a plain building for the rest", () => {
    expect(coverKindFor("multifamily")).toBe("housing");
    expect(coverKindFor("student_housing")).toBe("housing");
    // A park and a build-to-rent portfolio are homes, not an apartment block (#470).
    expect(coverKindFor("manufactured_housing")).toBe("homes");
    expect(coverKindFor("mobile home park")).toBe("homes");
    expect(coverKindFor("sfr_btr")).toBe("homes");
    expect(coverKindFor("office")).toBe("office");
    expect(coverKindFor("medical_office")).toBe("office");
    expect(coverKindFor("industrial")).toBe("industrial");
    expect(coverKindFor("retail")).toBe("retail");
    expect(coverKindFor("net_lease")).toBe("retail");
    expect(coverKindFor("hospitality_str")).toBe("hotel");
    expect(coverKindFor("boutique hotel")).toBe("hotel");
    expect(coverKindFor("self_storage")).toBe("storage");
    expect(coverKindFor("land_infill")).toBe("land");
    expect(coverKindFor("auto")).toBe("building");
    expect(coverKindFor("")).toBe("building");
    expect(coverKindFor(null)).toBe("building");
  });

  it("gives the same deal the same gradient, and the pipeline many", () => {
    expect(coverToneFor("deal-1")).toBe(coverToneFor("deal-1"));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => coverToneFor(`d${i}`)));
    for (const tone of seen) expect(COVER_TONES).toContain(tone);
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("reads white at AAA where its words sit, before the shade under them", () => {
    // The words sit at the foot's left, about 40% of the way down the
    // 140-degree gradient; a third of the way is the stricter place to hold
    // them to. The radial highlight fades out well above them.
    for (const [light, dark] of COVER_TONES) {
      const a = rgb(light);
      const b = rgb(dark);
      const behind = a.map((x, i) => x + (b[i] - x) * 0.3);
      expect(contrast([255, 255, 255], behind), `${light} → ${dark}`).toBeGreaterThanOrEqual(7);
      // The eyebrow is white at 90%: AA at its size.
      const eyebrow = behind.map((x) => 255 * 0.9 + x * 0.1);
      expect(contrast(eyebrow, behind), `${light} → ${dark} eyebrow`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("names the place from the address, then the market, then the memorandum's words", () => {
    expect(coverPlace({ city: "Waco", state: "TX" }, "Dallas-Fort Worth TX", "Central Texas")).toBe("Waco, TX");
    expect(coverPlace({ city: "", state: "" }, "Pittsburgh PA", "Strip District")).toBe("Pittsburgh PA");
    expect(coverPlace(null, null, "  North Dallas,   TX ")).toBe("North Dallas, TX");
    expect(coverPlace(null, null, "A".repeat(60))).toHaveLength(40);
    expect(coverPlace(null, null, null)).toBeNull();
  });

  it("draws a card's cover with its words and a row's with none, never a map", () => {
    const cover = coverFor({ seed: "d1", assetClass: "multifamily", place: "Waco, TX" });
    const card = renderToStaticMarkup(React.createElement(DealCover, { cover, label: "Brazos Flats" }));
    expect(card).toContain('role="img"');
    expect(card).toContain('aria-label="No photograph of Brazos Flats yet, in Waco, TX"');
    expect(card).toContain('data-deal-cover="housing"');
    expect(visibleText(card)).toContain("No photo yet");
    expect(visibleText(card)).toContain("Waco, TX");
    expect(a11yIssues(card)).toEqual([]);
    const thumb = renderToStaticMarkup(React.createElement(DealCover, { cover, label: "Brazos Flats", size: "thumb" }));
    expect(thumb).toContain('aria-hidden="true"');
    expect(visibleText(thumb).trim()).toBe("");
    // Holding a card's frame while a photograph loads (#446): the gradient
    // and the drawing, and nothing said, since the photo is on its way.
    const holding = renderToStaticMarkup(React.createElement(DealCover, { cover, label: "Brazos Flats", words: false }));
    expect(holding).toContain('aria-hidden="true"');
    expect(holding).not.toContain('role="img"');
    expect(visibleText(holding).trim()).toBe("");
  });
});

describe("the pipeline's pictures, without the overhead (#442)", () => {
  const facts = {
    dealId: "d1",
    pictureCredit: null,
    googleEnabled: false,
    hasStreetAddress: true,
    hasAddress: true,
  };

  it("leaves the overhead out where the surface says so, and asks a row's frame for the small crop", () => {
    expect(bannerSources(facts, CARD).map((s) => s.kind)).toEqual(["aerial"]);
    expect(bannerSources({ ...facts, aerial: false }, CARD)).toEqual([]);
    const own = bannerSources({ ...facts, pictureCredit: "Photograph added to the deal", aerial: false }, THUMB);
    expect(own.map((s) => s.src)).toEqual(["/api/deals/d1/picture?size=thumb"]);
    expect(bannerSources({ ...facts, pictureCredit: "Photograph added to the deal" }, CARD)[0].src).toBe(
      "/api/deals/d1/picture?size=hero",
    );
  });

  it("shows the deal's cover where no photograph answers, on the card and on the row", () => {
    const cover = coverFor({ seed: "d1", assetClass: "industrial", place: "Laredo, TX" });
    const card = renderToStaticMarkup(
      React.createElement(DealBanner, { sources: bannerSources({ ...facts, aerial: false }, CARD), cover, label: "Laredo DC", aspect: "16/10", flush: true }),
    );
    expect(card).toContain('data-deal-banner="cover"');
    expect(card).toContain('data-deal-cover="industrial"');
    expect(card).not.toContain("/aerial");
    const row = renderToStaticMarkup(
      React.createElement(DealThumb, { sources: bannerSources({ ...facts, aerial: false }, THUMB), cover, label: "Laredo DC" }),
    );
    expect(row).toContain('data-deal-thumb="cover"');
    expect(row).not.toContain("/aerial");
    // With no cover handed over, the plate holds the slot, as before.
    const plate = renderToStaticMarkup(React.createElement(DealThumb, { sources: [], label: "Laredo DC" }));
    expect(plate).toContain('data-deal-thumb="blank"');
  });

  it("lays the cover over the frame while a photograph loads, never in its place (#448)", () => {
    const cover = coverFor({ seed: "d1", assetClass: "multifamily", place: "Waco, TX" });
    const own = { ...facts, pictureCredit: "From the offering memorandum", aerial: false };
    const card = renderToStaticMarkup(
      React.createElement(DealBanner, { sources: bannerSources(own, CARD), cover, label: "Brazos Flats", aspect: "16/10", flush: true }),
    );
    const row = renderToStaticMarkup(
      React.createElement(DealThumb, { sources: bannerSources(own, THUMB), cover, label: "Brazos Flats" }),
    );
    for (const html of [card, row]) {
      expect(positionConflicts(html)).toEqual([]);
      // The cover is absolute, over the frame, so the photograph keeps its
      // place in the flow; the photograph after it is the frame's.
      expect(html).toMatch(/data-deal-cover="housing"[^>]*class="[^"]*\babsolute inset-0\b/);
    }
    // The cover on its own still sets its own frame for its art and words.
    const alone = renderToStaticMarkup(React.createElement(DealCover, { cover, label: "Brazos Flats", className: "w-full" }));
    expect(alone).toMatch(/class="overflow-hidden relative w-full"/);
    expect(positionConflicts(alone)).toEqual([]);
  });
});
