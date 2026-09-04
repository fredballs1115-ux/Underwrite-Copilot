import { describe, it, expect } from "vitest";
import metrosSeed from "@/data/research/metros.json";
import {
  METRO_FRAME_METRES,
  METRO_VIEWS,
  US_BOUNDS,
  metroView,
} from "./metro-imagery";

const metroIds = (metrosSeed.metros ?? []).map((m) => (m as { id: string }).id);

describe("metro coverage", () => {
  it("has a view for every metro in the research seed", () => {
    // The failure this catches: someone adds a metro to metros.json and the
    // homepage silently renders a card with no picture in it.
    const missing = metroIds.filter((id) => !(id in METRO_VIEWS));
    expect(missing, `metros.json ids with no METRO_VIEWS entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no view for a metro that no longer exists", () => {
    const orphans = Object.keys(METRO_VIEWS).filter((id) => !metroIds.includes(id));
    expect(orphans, `METRO_VIEWS ids absent from metros.json: ${orphans.join(", ")}`).toEqual([]);
  });

  it("covers a non-trivial number of markets", () => {
    expect(metroIds.length).toBeGreaterThan(10);
  });
});

describe("coordinates", () => {
  it("all land inside US bounds", () => {
    for (const [id, v] of Object.entries(METRO_VIEWS)) {
      expect(v.lat, `${id} lat`).toBeGreaterThan(US_BOUNDS.minLat);
      expect(v.lat, `${id} lat`).toBeLessThan(US_BOUNDS.maxLat);
      expect(v.lng, `${id} lng`).toBeGreaterThan(US_BOUNDS.minLng);
      expect(v.lng, `${id} lng`).toBeLessThan(US_BOUNDS.maxLng);
    }
  });

  it("are all distinct — two markets must not share one photo", () => {
    const keys = Object.values(METRO_VIEWS).map((v) => `${v.lat},${v.lng}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names the place each frame is actually centred on", () => {
    for (const [id, v] of Object.entries(METRO_VIEWS)) {
      expect(v.place.trim().length, `${id} place`).toBeGreaterThan(3);
    }
  });

  it("puts each DMV-core market at a different point", () => {
    // These four are one metro to a human but four separate markets here, so
    // the temptation to reuse DC's coordinates is real — and would make four
    // cards show the same photo.
    const dmv = ["dc", "pg_county", "montgomery_county", "nova"];
    const pts = dmv.map((id) => `${METRO_VIEWS[id].lat},${METRO_VIEWS[id].lng}`);
    expect(new Set(pts).size).toBe(dmv.length);
  });
});

describe("framing", () => {
  it("shows a downtown, not a region or a rooftop", () => {
    expect(METRO_FRAME_METRES).toBeGreaterThan(500);
    expect(METRO_FRAME_METRES).toBeLessThan(4000);
  });

  it("asks for less detail than USGS natively has, so cards are sharp", () => {
    // The homepage needs no API key precisely because of this: at ~1.2km
    // across a 400px card the required resolution is well coarser than
    // NAIP's 0.6-1.0 m/px, so the image is downsampled rather than upscaled.
    const cardWidthPx = 400;
    const requiredMPerPx = METRO_FRAME_METRES / cardWidthPx;
    expect(requiredMPerPx).toBeGreaterThan(1.0);
  });
});

describe("metroView", () => {
  it("returns the entry for a known id", () => {
    expect(metroView("philadelphia")?.place).toContain("Philadelphia");
  });
  it("returns null for an unknown id rather than guessing a location", () => {
    expect(metroView("atlantis")).toBeNull();
    expect(metroView("")).toBeNull();
  });
});
