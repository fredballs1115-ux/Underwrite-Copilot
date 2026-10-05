import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { COVER_TONES, coverFor, coverKindFor, coverPlace, coverToneFor, coverVariantFor } from "./deal-cover";
import { COVER_KINDS, coverImage, coverSvg, type CoverScene } from "./deal-cover-art";
import { CARD, THUMB, bannerSources } from "./deal-banner";
import { COVER_FRAME, DealCover } from "@/app/(app)/deals/deal-cover";
import { DealBanner } from "@/app/(app)/deals/deal-banner";
import { DealThumb } from "@/app/(app)/deals/deal-thumb";
import { a11yIssues, positionConflicts, visibleText } from "./render-lint";

/** sRGB to linear light, a channel value at a time. */
const LINEAR = Array.from({ length: 256 }, (_, v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
const luminance = (c: readonly number[]) => 0.2126 * LINEAR[Math.round(c[0])] + 0.7152 * LINEAR[Math.round(c[1])] + 0.0722 * LINEAR[Math.round(c[2])];
const contrast = (fg: readonly number[], bg: readonly number[]) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

/** Where a card's words sit, measured from its foot in CSS pixels: the
 *  caption's `pb-2` under the place's 13px line at `leading-tight`, under
 *  the eyebrow's 13.5px line — its 9px type's at the page's 1.5, which its
 *  11px type keeps (research pass 29; the markup is held to it below). */
const WORDS = { place: [8, 8 + 16.25], eyebrow: [8 + 16.25, 8 + 16.25 + 13.5] } as const;
/** The heights a card's picture is drawn at: 224 × 140, the smallest the
 *  pipeline drew until research pass 29 (two columns beside the sidebar at
 *  768px; a card is 17.5rem at least now, lib/pipeline-view) and kept as the
 *  floor, a desktop card, a phone's and the widest. */
const CARD_HEIGHTS = [140, 187, 224, 262];

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

  it("gives the same deal the same sky and the same draw, and the pipeline many of each", () => {
    expect(coverToneFor("deal-1")).toBe(coverToneFor("deal-1"));
    expect(coverVariantFor("deal-1")).toBe(coverVariantFor("deal-1"));
    const ids = Array.from({ length: 60 }, (_, i) => `d${i}`);
    const tones = new Set(ids.map(coverToneFor));
    for (const tone of tones) expect(Number.isInteger(tone) && tone >= 0 && tone < COVER_TONES.length).toBe(true);
    expect(tones.size).toBeGreaterThanOrEqual(6);
    // Twelve skies, each worn about as often (research pass 29): eight had
    // let three of every seventeen deals share one.
    const many = Array.from({ length: 1200 }, (_, i) => coverToneFor(`deal-${i}`));
    for (let tone = 0; tone < COVER_TONES.length; tone++) {
      const share = many.filter((t) => t === tone).length / many.length;
      expect(share, `sky ${tone}`).toBeGreaterThan(1 / 12 / 2);
      expect(share, `sky ${tone}`).toBeLessThan((1 / 12) * 2);
    }
    // The draw varies apart from the sky: deals under one sky still differ.
    expect(new Set(ids.map(coverVariantFor)).size).toBe(ids.length);
    const underOne = ids.filter((id) => coverToneFor(id) === coverToneFor(ids[0]));
    expect(new Set(underOne.map(coverVariantFor)).size).toBe(underOne.length);
    expect(coverFor({ seed: "deal-1", assetClass: "office" })).toEqual({
      kind: "office",
      tone: coverToneFor("deal-1"),
      variant: coverVariantFor("deal-1"),
      place: null,
    });
  });

  it("reads white where a card's words sit, on the smallest card and up, before the shade under them", async () => {
    // Every kind under every sky, at every hour on either side (research
    // pass 29: the variant's three low bits, lib/deal-cover-art `coverDraw`)
    // with the rest of each draw its own — its building's place, its street,
    // its trees — drawn for real at the card's frame; the worst pixel under
    // each line across the card's whole width. The place is white at 13px:
    // AAA. The eyebrow is white at 90% and 11px: AA, as it was at 9px.
    const [w, h] = COVER_FRAME.card;
    // The rows the words reach on the smallest card, and so on every card.
    const top = Math.floor((1 - WORDS.eyebrow[1] / Math.min(...CARD_HEIGHTS)) * h);
    const scenes = COVER_KINDS.flatMap((kind, k) =>
      COVER_TONES.flatMap((_, tone) =>
        Array.from({ length: 8 }, (_, hour) => ({ kind, tone, variant: ((((k + 1) * 7919 + (tone + 1) * 104729) << 3) | hour) >>> 0 })),
      ),
    );
    expect(new Set(scenes.map((s) => s.variant & 7)).size).toBe(8);
    const check = async (scene: CoverScene) => {
      const { kind, tone, variant } = scene;
      const { data } = await sharp(Buffer.from(coverSvg(scene, w, h)))
        .removeAlpha()
        .extract({ left: 0, top, width: w, height: h - top })
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Each row's brightest pixel: the one the words read worst on.
      const brightest = Array.from({ length: h - top }, (_, y) => {
        let best = [0, 0, 0];
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3;
          const px = [data[i], data[i + 1], data[i + 2]];
          if (luminance(px) > luminance(best)) best = px;
        }
        return best;
      });
      const worst = (card: number, [from, to]: readonly [number, number], alpha: number) => {
        let least = Infinity;
        for (let y = Math.floor((1 - to / card) * h); y < Math.ceil((1 - from / card) * h); y++) {
          const bg = brightest[y - top];
          least = Math.min(least, contrast(bg.map((v) => 255 * alpha + v * (1 - alpha)), bg));
        }
        return least;
      };
      for (const card of CARD_HEIGHTS) {
        expect(worst(card, WORDS.place, 1), `${kind} ${tone} ${variant} place at ${card}px`).toBeGreaterThanOrEqual(7);
        expect(worst(card, WORDS.eyebrow, 0.9), `${kind} ${tone} ${variant} eyebrow at ${card}px`).toBeGreaterThanOrEqual(4.5);
      }
    };
    // Several at once, so sharp's threads draw them together.
    for (let i = 0; i < scenes.length; i += 12) await Promise.all(scenes.slice(i, i + 12).map(check));
    // Every kind under twelve skies at every hour on both sides — 864
    // drawings through sharp, each read only where the words can reach:
    // several seconds alone, longer on a machine running other work.
  }, 180_000);

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
    // The words' type and lines, as the contrast test's geometry reads them
    // (`WORDS`): the eyebrow 11px on its 13.5px line (research pass 29: it
    // was 9px, under any comfortable size on a phone), the place 13px at
    // leading-tight, and nothing on the cover under 10px.
    const classesOf = (words: string) => new RegExp(`<span class="([^"]*)">${words}</span>`).exec(card)?.[1].split(/\s+/) ?? [];
    expect(classesOf("No photo yet")).toEqual(expect.arrayContaining(["text-[11px]", "leading-[13.5px]", "text-white/90"]));
    expect(classesOf("Waco, TX")).toEqual(expect.arrayContaining(["text-[13px]", "leading-tight", "text-white"]));
    expect(card).toContain("pb-2 pt-9");
    const sizes = [...card.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
    const thumb = renderToStaticMarkup(React.createElement(DealCover, { cover, label: "Brazos Flats", size: "thumb" }));
    expect(thumb).toContain('aria-hidden="true"');
    expect(visibleText(thumb).trim()).toBe("");
    // One drawing wherever the deal is shown: the card and the row paint the
    // very documents the image route and the emails serve, laid out for
    // their frames, anchored at the foot where the words sit.
    const painted = (html: string) => {
      const style = html.match(/style="([^"]*)"/)?.[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&") ?? "";
      expect(style).toContain("background-size:cover");
      expect(style).toContain("background-position:50% 100%");
      return style.match(/background-image:(url\("[^"]*"\))/)?.[1];
    };
    expect(painted(card)).toBe(coverImage(cover, ...COVER_FRAME.card));
    expect(painted(thumb)).toBe(coverImage(cover, ...COVER_FRAME.thumb));
    const payload = coverImage(cover, ...COVER_FRAME.card).match(/^url\("data:image\/svg\+xml;charset=utf-8,([^"]*)"\)$/)?.[1] ?? "";
    expect(decodeURIComponent(payload)).toBe(coverSvg(cover, ...COVER_FRAME.card));
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
