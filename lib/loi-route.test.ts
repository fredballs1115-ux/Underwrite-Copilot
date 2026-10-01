/**
 * The LOI download (`/api/deals/[id]/loi`) against the panel that links to
 * it, driven with a fake database that answers as row-level security does.
 *
 * The panel and the route read the letter's terms through one reader
 * (lib/loi-terms), the page handing the panel what the route computes from
 * the same row. They had disagreed: the panel inferred the deal's plan with
 * its first signal and the route without it, so a deal the signal called a
 * conversion had the panel promising an entitlements contingency the .docx
 * did not carry.
 */
import React from "react";
import JSZip from "jszip";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";

const DEAL = "22222222-2222-4222-8222-222222222222";
const OWNER = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: db.row, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/billing", () => ({ isPro: async () => true }));
vi.mock("@/lib/branding-server", () => ({ getBrandingForDeal: async () => null }));

import { GET } from "@/app/api/deals/[id]/loi/route";
import { LoiPanel } from "@/app/(app)/deals/[id]/loi-panel";
import { loiTermsFor } from "./loi-terms";
import { visibleText } from "./render-lint";

// An extraction whose own words name no plan — read alone, a stabilized
// asset — and a first signal that calls the deal a conversion.
const extraction: ExtractionResult = {
  dealName: "1400 Market",
  assetClass: "office",
  market: "Center City, Philadelphia, PA",
  metrics: [
    { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 3" },
    { label: "In-place NOI", value: "$1,100,000", flagged: false, page: "p. 9" },
  ],
};
const signal: FirstSignal = {
  dealName: "1400 Market",
  assetClass: "office",
  market: "Center City, Philadelphia, PA",
  askPrice: "$20,000,000",
  size: "182,400 SF",
  goingInCap: "",
  perUnit: "",
  take: "An office-to-residential conversion — check the construction budget before the price.",
};

const download = () =>
  GET(
    new Request(
      `https://underwrite.example/api/deals/${DEAL}/loi?buyer=Cascade&price=20000000&deposit=200000&dd=45&close=30&ltv=60`,
    ),
    { params: Promise.resolve({ id: DEAL }) },
  );

async function letterText(res: Response): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const panelText = (ex: ExtractionResult, sig: FirstSignal | null) =>
  visibleText(
    renderToStaticMarkup(
      React.createElement(LoiPanel, {
        dealId: DEAL,
        askingPrice: "$20,000,000",
        isPro: true,
        // What the deal page hands the panel: the same reader on the same row.
        terms: loiTermsFor(ex, sig),
      }),
    ),
  );

beforeEach(() => {
  db.user = { id: OWNER };
  db.row = {
    id: DEAL,
    user_id: OWNER,
    team_id: null,
    name: "1400 Market",
    is_sample: false,
    address: null,
    extraction,
    first_signal: signal,
  };
});

describe("the LOI route and the panel read the deal's plan the same way", () => {
  it("reads the plan with the first signal, as the page does", () => {
    // Read alone, the extraction is a stabilized asset; the signal names the plan.
    expect(loiTermsFor(extraction, null).plan).toBeNull();
    expect(loiTermsFor(extraction, signal).plan).toEqual({ kind: "conversion", label: "Conversion" });
  });

  it("a conversion the first signal names: the panel promises an entitlements contingency and the download carries it", async () => {
    expect(panelText(extraction, signal)).toMatch(/carries an entitlements contingency/);
    const res = await download();
    expect(res.status).toBe(200);
    const letter = await letterText(res);
    expect(letter).toContain("Entitlements and Approvals");
    expect(letter).toContain("intended conversion of the Property");
  });

  it("a deal with no plan: the panel names none and the download carries none", async () => {
    db.row = { ...db.row, first_signal: null };
    expect(panelText(extraction, null)).not.toMatch(/entitlements/);
    const letter = await letterText(await download());
    expect(letter).not.toContain("Entitlements and Approvals");
    expect(letter).not.toContain("construction-cost");
  });
});
