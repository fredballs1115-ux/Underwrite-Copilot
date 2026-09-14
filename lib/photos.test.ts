import { describe, expect, it } from "vitest";
import {
  HERO_AERIAL,
  PHOTO_SLOTS,
  photoSrc,
  presentPhotos,
  stripPhotos,
} from "./photos";
import { METRO_VIEWS } from "./metro-imagery";

describe("the homepage's photograph slots", () => {
  it("names four slots with distinct files under public/photos", () => {
    expect(PHOTO_SLOTS.map((s) => s.id)).toEqual(["hero", "team", "site-walk", "building"]);
    expect(new Set(PHOTO_SLOTS.map((s) => s.file)).size).toBe(PHOTO_SLOTS.length);
    for (const s of PHOTO_SLOTS) {
      expect(s.file).toMatch(/^[a-z-]+\.jpg$/);
      expect(photoSrc(s)).toBe(`/photos/${s.file}`);
      expect(s.width).toBeGreaterThan(s.height);
      expect(s.brief.length).toBeGreaterThan(20);
    }
  });

  it("the hero is decorative (empty alt); every strip photograph says what it shows", () => {
    for (const s of PHOTO_SLOTS) {
      if (s.id === "hero") expect(s.alt).toBe("");
      else expect(s.alt.length).toBeGreaterThan(10);
    }
  });

  it("present slots are the ones whose file exists, nothing else", () => {
    const none = presentPhotos(() => false);
    expect(Object.keys(none)).toEqual([]);
    const two = presentPhotos((f) => f === "team.jpg" || f === "hero.jpg");
    expect(Object.keys(two).sort()).toEqual(["hero", "team"]);
    expect(two.team?.file).toBe("team.jpg");
    expect(two["site-walk"]).toBeUndefined();
  });

  it("the strip takes every present slot but the hero, in the page's order", () => {
    const all = presentPhotos(() => true);
    expect(stripPhotos(all).map((s) => s.id)).toEqual(["team", "site-walk", "building"]);
    expect(stripPhotos(presentPhotos((f) => f === "hero.jpg"))).toEqual([]);
    expect(stripPhotos(presentPhotos((f) => f === "building.jpg")).map((s) => s.id)).toEqual([
      "building",
    ]);
  });

  it("the hero's fallback aerial is a covered market the imagery route knows", () => {
    expect(METRO_VIEWS[HERO_AERIAL.metro]).toBeDefined();
    expect(HERO_AERIAL.width).toBeLessThanOrEqual(1600);
    expect(HERO_AERIAL.height).toBeLessThanOrEqual(1600);
  });
});
