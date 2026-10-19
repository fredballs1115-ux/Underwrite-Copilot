// The site flags card's flood frame, small, beside the chip: the Flood
// view's own stored frame through the URL stem the Flood view asks with
// (lib/flood-frame-core `floodFrameStem`), at the filmstrip's crop, with the
// Flood view's alt text and credit — and nothing where the page hands none.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFlagsCard, type SiteFloodFrame } from "@/app/(app)/deals/[id]/site-flags-card";
import { FLOOD_FRAME_VERSION, floodFrameStem } from "@/lib/flood-frame-core";
import type { SiteFlagsResult } from "@/lib/site-flags/core";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const result = {
  status: "ok",
  tractGeoid: "42101014200",
  opportunityZone: null,
  flood: { zone: "AE", subtype: null, isHighRisk: true },
  retrievedAt: "2026-09-25T00:00:00Z",
  note: "Screening flags from federal datasets at the geocoded point.",
} as unknown as SiteFlagsResult;

const frame = (over: Partial<SiteFloodFrame> = {}): SiteFloodFrame => ({
  stem: floodFrameStem("d1", { lat: 39.975, lng: -75.18 }),
  label: "1200 N 31st St, Philadelphia, PA",
  ring: true,
  osmPlaced: false,
  ...over,
});

const render = (floodFrame: SiteFloodFrame | null) =>
  renderToStaticMarkup(React.createElement(SiteFlagsCard, { result, hasAddress: true, today: "2026-10-04", floodFrame }));

describe("SiteFlagsCard — the flood frame beside the chip", () => {
  it("builds the Flood view's stem", () => {
    expect(floodFrameStem("d1", { lat: 39.975, lng: -75.18 })).toBe(`/api/deals/d1/flood?v=${FLOOD_FRAME_VERSION}.39.975000,-75.180000`);
    expect(floodFrameStem("d1", null)).toBe(`/api/deals/d1/flood?v=${FLOOD_FRAME_VERSION}.0`);
  });

  it("draws the stored frame at the filmstrip's crop, with the Flood view's alt and credit", () => {
    const html = render(frame());
    expect(html).toContain('data-qa="site-flags-flood-frame"');
    expect(html).toContain(`src="/api/deals/d1/flood?v=${FLOOD_FRAME_VERSION}.39.975000,-75.180000&amp;w=192&amp;h=108"`);
    expect(html).toContain(
      "alt=\"Aerial photograph of the blocks around 1200 N 31st St, Philadelphia, PA, with FEMA&#x27;s flood hazard zones drawn over it\"",
    );
    expect(html).toContain('data-picture="site-flood-pin"');
    const text = visibleText(html);
    expect(text).toContain("FEMA flood zones · USGS imagery");
    expect(text).toContain("Flood zone AE — SFHA");
    expect(text).not.toContain("OpenStreetMap");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("rings only a point placed at the building, and credits OpenStreetMap where its geocoder placed it", () => {
    const html = render(frame({ ring: false, osmPlaced: true }));
    expect(html).not.toContain('data-picture="site-flood-pin"');
    expect(visibleText(html)).toContain("OpenStreetMap");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("draws nothing where the page hands no frame", () => {
    const html = render(null);
    expect(html).not.toContain("site-flags-flood-frame");
    expect(html).not.toContain("/flood?");
  });
});
