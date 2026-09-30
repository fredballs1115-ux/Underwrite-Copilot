import { describe, it, expect } from "vitest";
import metrosSeed from "@/data/research/metros.json";
import { DATA_METROS } from "@/lib/market-match";
import {
  METRO_FRAMES,
  METRO_FRAME_DEFAULT,
  METRO_FRAME_METRES,
  METRO_VIEWS,
  US_BOUNDS,
  metroFrame,
  metroView,
} from "./metro-imagery";

const metroIds = (metrosSeed.metros ?? []).map((m) => (m as { id: string }).id);
// The metro areas read without a brief have a frame too (#404): their
// market page opens on it the way a briefed market's does.
const readOnlyIds = DATA_METROS.map((m) => m.id);

describe("metro coverage", () => {
  it("has a view for every metro in the research seed", () => {
    // The failure this catches: someone adds a metro to metros.json and the
    // homepage silently renders a card with no picture in it.
    const missing = [...metroIds, ...readOnlyIds].filter((id) => !(id in METRO_VIEWS));
    expect(missing, `metro ids with no METRO_VIEWS entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no view for a metro that no longer exists", () => {
    const orphans = Object.keys(METRO_VIEWS).filter((id) => !metroIds.includes(id) && !readOnlyIds.includes(id));
    expect(orphans, `METRO_VIEWS ids absent from metros.json and data-metros.json: ${orphans.join(", ")}`).toEqual([]);
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
  it("reads an id off a URL that names what every object inherits as unknown", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(metroView(id), id).toBeNull();
    }
  });
});

describe("metroFrame — the frames the overhead route draws (the security review, 2026-09-30)", () => {
  it("draws a listed frame as asked, none past 1600px a side, the default among them", () => {
    for (const [w, h] of METRO_FRAMES) {
      expect(metroFrame(w, h)).toEqual([w, h]);
      expect(metroFrame(String(w), String(h))).toEqual([w, h]);
      expect(Math.max(w, h)).toBeLessThanOrEqual(1600);
    }
    expect(METRO_FRAMES).toContainEqual(METRO_FRAME_DEFAULT);
    expect(new Set(METRO_FRAMES.map((f) => f.join("x"))).size).toBe(METRO_FRAMES.length);
  });

  it("snaps any other size to the frame nearest in proportion and size", () => {
    expect(metroFrame(481, 359)).toEqual([480, 360]);
    expect(metroFrame(1400, 500)).toEqual([1400, 480]);
    expect(metroFrame(1300, 880)).toEqual([1400, 900]);
    expect(metroFrame(9_999, 9_999)).toEqual([1600, 900]);
    expect(metroFrame(0, -3)).toEqual([480, 192]);
  });

  it("draws a missing or unreadable side at the default frame's", () => {
    expect(metroFrame(null, null)).toEqual(METRO_FRAME_DEFAULT);
    expect(metroFrame(undefined, "")).toEqual(METRO_FRAME_DEFAULT);
    expect(metroFrame("abc", "  ")).toEqual(METRO_FRAME_DEFAULT);
    expect(metroFrame(Number.NaN, 360)).toEqual(METRO_FRAME_DEFAULT);
  });

  it("keeps however many sizes a caller types to the listed frames", () => {
    const drawn = new Set<string>();
    for (let w = 1; w <= 3_000; w += 37) {
      for (let h = 1; h <= 3_000; h += 41) drawn.add(metroFrame(w, h).join("x"));
    }
    const listed = new Set(METRO_FRAMES.map((f) => f.join("x")));
    for (const f of drawn) expect(listed.has(f), f).toBe(true);
  });
});
