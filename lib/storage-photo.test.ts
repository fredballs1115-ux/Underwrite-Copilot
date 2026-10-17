import { describe, expect, it } from "vitest";
import { classifyDealPath, dealPhotoPath, isScopedPath, scopedPath, StoragePathError } from "./storage-paths";

const DEAL = "0f6a3c2e-1b7d-4e5f-9a8b-7c6d5e4f3a2b";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("the building's photograph, in the bucket", () => {
  it("lives under photos/<dealId>/ as a stamped hero, thumb, full or card, and is that deal's", () => {
    const hero = dealPhotoPath(DEAL, "m1x9z", "hero");
    const thumb = dealPhotoPath(DEAL, "m1x9z", "thumb");
    const full = dealPhotoPath(DEAL, "m1x9z", "full");
    // The copy a pipeline card's srcset offers (research pass 29).
    const card = dealPhotoPath(DEAL, "m1x9z", "card");
    expect(hero).toBe(`photos/${DEAL}/m1x9z-hero.jpg`);
    expect(thumb).toBe(`photos/${DEAL}/m1x9z-thumb.jpg`);
    expect(full).toBe(`photos/${DEAL}/m1x9z-full.jpg`);
    expect(card).toBe(`photos/${DEAL}/m1x9z-card.jpg`);
    for (const path of [hero, thumb, full, card]) expect(classifyDealPath(path, DEAL)).toBe("photo");
    expect(isScopedPath(hero, { kind: "deal", dealId: DEAL, only: ["photo"] })).toBe(true);
    expect(isScopedPath(full, { kind: "deal", dealId: DEAL, only: ["photo"] })).toBe(true);
    expect(isScopedPath(card, { kind: "deal", dealId: DEAL, only: ["photo"] })).toBe(true);
    expect(isScopedPath(card, { kind: "deal", dealId: OTHER, only: ["photo"] })).toBe(false);
    // Only the four sizes the store writes.
    expect(classifyDealPath(`photos/${DEAL}/m1x9z-large.jpg`, DEAL)).toBeNull();
  });

  it("is refused under another deal, outside the photo shapes, or from a scope that does not take photos", () => {
    const hero = dealPhotoPath(DEAL, "m1x9z", "hero");
    expect(classifyDealPath(hero, OTHER)).toBeNull();
    expect(classifyDealPath(`photos/${DEAL}/cover.jpg`, DEAL)).toBeNull();
    expect(classifyDealPath(`photos/${DEAL}/m1x9z-hero.png`, DEAL)).toBeNull();
    expect(classifyDealPath(`photos/${DEAL}/M1X9Z-hero.jpg`, DEAL)).toBeNull();
    expect(isScopedPath(hero, { kind: "deal", dealId: DEAL, only: ["om"] })).toBe(false);
    expect(() => scopedPath(hero, { kind: "deal", dealId: OTHER })).toThrow(StoragePathError);
  });
});
