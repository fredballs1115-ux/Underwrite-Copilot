/**
 * A market page's link preview (#436): the photograph's credit printed on
 * the card or the photograph kept off it, and the card itself — the words
 * drawn by next/og over the photograph, a 1200 × 630 JPEG.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import {
  OG_CARD,
  OG_PHOTO_WIDTH,
  OVERHEAD_CARD_CREDIT,
  cachedMarketCard,
  cardCanDraw,
  cardPhotoCredit,
  forgetCards,
  marketCard,
} from "./og-card";
import { SKYLINE_WIDTHS, skylineFor } from "./skyline";
import { marketPages } from "./public-pages";

describe("the card's credit line", () => {
  it("prints the author, the licence by name and address, and what the card changed", () => {
    expect(
      cardPhotoCredit({ credit: "EEJCC", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" }),
    ).toBe("Photo: EEJCC via Wikimedia Commons · CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0 · cropped, words added");
    expect(
      cardPhotoCredit({ credit: "Clément Bardot", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" }),
    ).toContain("Clément Bardot");
    expect(
      cardPhotoCredit({ credit: "unknown", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en" }),
    ).toBe("Photo: Wikimedia Commons · CC0, http://creativecommons.org/publicdomain/zero/1.0/deed.en · cropped, words added");
    // Public domain has no licence address, and the line names none.
    expect(cardPhotoCredit({ credit: "Daderot", license: "Public domain", licenseUrl: "" })).toBe(
      "Photo: Daderot via Wikimedia Commons · Public domain · cropped, words added",
    );
  });

  it("names each served photograph's licence address as the table holds it, a 2.x or 3.0 licence's too (research pass 31)", () => {
    let older = 0;
    for (const p of marketPages()) {
      const shot = skylineFor(p.id);
      const credit = shot ? cardPhotoCredit(shot) : null;
      if (!shot || !credit) continue;
      expect(credit, p.id).toContain("cropped, words added");
      if (shot.licenseUrl) expect(credit, p.id).toContain(`${shot.license}, ${shot.licenseUrl} ·`);
      if (/CC BY(-SA)? [23]\.\d/.test(shot.license)) {
        older++;
        expect(credit, p.id).toMatch(/creativecommons\.org\/licenses\/by(-sa)?\/[23]\.\d/);
      }
    }
    // The markets' cards include photographs under the older licences.
    expect(older).toBeGreaterThan(0);
  });

  it("keeps a photograph off the card where the card cannot draw its author's name", () => {
    expect(cardCanDraw("颐园居")).toBe(false);
    expect(
      cardPhotoCredit({ credit: "颐园居", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" }),
    ).toBeNull();
    expect(cardCanDraw("Photo: Benoît Prieur — CC0 · cropped")).toBe(true);
    expect(cardCanDraw(OVERHEAD_CARD_CREDIT)).toBe(true);
  });

  it("covers every market with a photograph: printable credits card their skyline, the rest fall back to the overhead", () => {
    const fallback: string[] = [];
    for (const p of marketPages()) {
      const shot = skylineFor(p.id);
      if (shot && !cardPhotoCredit(shot)) fallback.push(p.id);
    }
    // Philadelphia's photographer is credited as 颐园居; every other served
    // skyline's credit is printable.
    expect(fallback).toEqual(["philadelphia"]);
  });
});

describe("marketCard", () => {
  it("lays the words over the photograph and writes a 1200 × 630 JPEG", async () => {
    const photo = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 170, g: 190, b: 210 } },
    })
      .jpeg()
      .toBuffer();
    const card = await marketCard(
      photo,
      "Pittsburgh PA",
      "Photo: EEJCC via Wikimedia Commons · CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0 · cropped, words added",
    );
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([OG_CARD.width, OG_CARD.height]);
    // The scrim darkens the foot of the frame, where the words sit, and
    // leaves the top the photograph's.
    const { data, info } = await sharp(card).raw().toBuffer({ resolveWithObject: true });
    const lum = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return (data[i] + data[i + 1] + data[i + 2]) / 3;
    };
    expect(lum(1100, 20)).toBeGreaterThan(150);
    expect(lum(1150, 620)).toBeLessThan(60);
  }, 30_000);
});

describe("a market's card, drawn once a process (the security review, 2026-09-30)", () => {
  beforeEach(() => forgetCards());

  it("draws once for the asks that arrive together, then answers from the card it keeps", async () => {
    let draws = 0;
    const draw = async () => {
      draws++;
      await new Promise((r) => setTimeout(r, 15));
      return Buffer.from("a card");
    };
    const [a, b, c] = await Promise.all([
      cachedMarketCard("pittsburgh", draw),
      cachedMarketCard("pittsburgh", draw),
      cachedMarketCard("pittsburgh", draw),
    ]);
    expect(a?.toString()).toBe("a card");
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(await cachedMarketCard("pittsburgh", draw)).toBe(a);
    expect(draws).toBe(1);
    // Another market is its own card.
    await cachedMarketCard("dc", draw);
    expect(draws).toBe(2);
  });

  it("keeps nothing from a draw that had nothing, or failed, so the next ask draws again", async () => {
    let draws = 0;
    expect(await cachedMarketCard("dc", async () => (draws++, null))).toBeNull();
    expect(
      await cachedMarketCard("dc", async () => {
        draws++;
        throw new Error("next/og fell over");
      }),
    ).toBeNull();
    expect((await cachedMarketCard("dc", async () => (draws++, Buffer.from("drawn"))))?.toString()).toBe("drawn");
    expect(draws).toBe(3);
  });

  it("asks for the skyline at a width the route serves, one that covers the card's height", () => {
    expect(SKYLINE_WIDTHS).toContain(OG_PHOTO_WIDTH);
    // A 2.5:1 panorama at this width is at least as tall as the card.
    expect(OG_PHOTO_WIDTH / 2.5).toBeGreaterThanOrEqual(OG_CARD.height);
  });
});
