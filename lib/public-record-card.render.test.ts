import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// The view draws a row already read; no database is reached.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    throw new Error("the view reads nothing");
  },
}));

const ROW = {
  market: "philadelphia",
  parcel_id: "881234500",
  address: "1200 N BROAD ST",
  land_use_raw: "O50",
  asset_class: "multifamily",
  building_sf: 48210.4,
  year_built: 1925,
  assessed_value: 6_412_300,
  owner_name: "BROAD STREET HOLDINGS LLC",
  owner_absentee: false as boolean | null,
  source_dataset: "Philadelphia OPA properties (opa_properties_public)",
  source_url: "https://opendataphilly.org/",
  ingested_at: "2026-09-14T03:12:00Z",
};

async function draw(row = ROW, lastSale: { sale_date: string; price: number; source_url: string } | null = null) {
  const { PublicRecordView } = await import("@/app/(app)/deals/[id]/public-record-card");
  return renderToStaticMarkup(React.createElement(PublicRecordView, { row, lastSale }));
}

describe("the public-record card says only what the record states", () => {
  it("says where the owner's mail goes, never who occupies the building", async () => {
    const { ownerMailingWords } = await import("@/app/(app)/deals/[id]/public-record-card");
    expect(ownerMailingWords(false)).toBe("mails to the property");
    expect(ownerMailingWords(true)).toBe("mails elsewhere");
    expect(ownerMailingWords(null)).toBeNull();
    const text = visibleText(await draw());
    expect(text).toContain("BROAD STREET HOLDINGS LLC · mails to the property");
    expect(text).not.toMatch(/occupied/i);
  });

  it("says an assessed value is not a market value, and names the roll's year where the source does", async () => {
    const { assessedLabel, ASSESSED_CAVEAT } = await import("@/app/(app)/deals/[id]/public-record-card");
    const text = visibleText(await draw());
    expect(text).toMatch(/Assessed value\s+\$6,412,300/);
    expect(text).toContain(ASSESSED_CAVEAT);
    // Only Boston's resource names state a fiscal year.
    expect(assessedLabel("Boston Property Assessment (Analyze Boston, CKAN) — Property Assessment FY2027")).toBe(
      "Assessed value (FY2027 roll)",
    );
    expect(assessedLabel(ROW.source_dataset)).toBe("Assessed value");
    // No figure, no caveat.
    expect(visibleText(await draw({ ...ROW, assessed_value: null }))).not.toContain(ASSESSED_CAVEAT);
  });

  it("dates the sale and the ingest in words, with the year", async () => {
    const html = await draw(ROW, { sale_date: "2019-06-03", price: 5_100_000, source_url: "x" });
    const text = visibleText(html);
    expect(text).toContain("$5,100,000 on Jun 3, 2019");
    expect(text).toContain("ingested Sep 14, 2026 UTC");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
