/**
 * A market page's link preview (#436): the photograph's credit printed on
 * the card or the photograph kept off it, and the card itself — the words
 * drawn by next/og over the photograph, a 1200 × 630 JPEG.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { OG_CARD, OVERHEAD_CARD_CREDIT, cardCanDraw, cardPhotoCredit, marketCard } from "./og-card";
import { skylineFor } from "./skyline";
import { marketPages } from "./public-pages";

describe("the card's credit line", () => {
  it("prints the author, the licence and the crop, which a CC licence asks to be said", () => {
    expect(cardPhotoCredit({ credit: "EEJCC", license: "CC BY-SA 4.0" })).toBe(
      "Photo: EEJCC, CC BY-SA 4.0, cropped (Wikimedia Commons)",
    );
    expect(cardPhotoCredit({ credit: "Clément Bardot", license: "CC BY-SA 4.0" })).toContain("Clément Bardot");
    expect(cardPhotoCredit({ credit: "unknown", license: "CC0" })).toBe(
      "Photo: Wikimedia Commons, CC0, cropped (Wikimedia Commons)",
    );
  });

  it("keeps a photograph off the card where the card cannot draw its author's name", () => {
    expect(cardCanDraw("颐园居")).toBe(false);
    expect(cardPhotoCredit({ credit: "颐园居", license: "CC BY-SA 4.0" })).toBeNull();
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
    const card = await marketCard(photo, "Pittsburgh PA", "Photo: EEJCC, CC BY-SA 4.0, cropped (Wikimedia Commons)");
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
