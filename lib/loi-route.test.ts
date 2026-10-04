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
import { LOI_REFUSAL, LOI_REFUSAL_BANNERS, LOI_REFUSAL_CODE, type LoiRefusalKind } from "./loi-refusal";
import { buildLoiDocx } from "./loi";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

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

async function letterXml(body: Buffer | ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(body as ArrayBuffer));
  return zip.file("word/document.xml")!.async("string");
}
const textOfXml = (xml: string) => xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
async function letterText(res: Response): Promise<string> {
  return textOfXml(await letterXml(await res.arrayBuffer()));
}

const panelHtml = (ex: ExtractionResult, sig: FirstSignal | null) =>
  renderToStaticMarkup(
    React.createElement(LoiPanel, {
      dealId: DEAL,
      askingPrice: "$20,000,000",
      isPro: true,
      // What the deal page hands the panel: the same reader on the same row.
      terms: loiTermsFor(ex, sig),
    }),
  );
const panelText = (ex: ExtractionResult, sig: FirstSignal | null) => visibleText(panelHtml(ex, sig));

const interest = (kind: NonNullable<ExtractionResult["interest"]>["kind"], over: Partial<NonNullable<ExtractionResult["interest"]>> = {}) => ({
  kind,
  summary: "",
  share: "",
  groundLease: "",
  loan: "",
  page: "",
  ...over,
});
const sale = (method: NonNullable<ExtractionResult["sale"]>["method"], over: Partial<NonNullable<ExtractionResult["sale"]>> = {}) => ({
  method,
  terms: "",
  condition: "",
  page: "",
  ...over,
});
const property = (name: string, address: string) => ({
  name,
  address,
  count: "",
  area: "",
  noi: "",
  occupancy: "",
  yearBuilt: "",
  allocatedPrice: "",
  page: "",
});
const row = (label: string, value: string) => ({ label, value, flagged: false, page: "" });

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

describe("the LOI is refused where the memorandum sells something else, or sells it some other way", () => {
  // Each: what the memorandum states, and the refusal it reads as.
  const cases: [string, ExtractionResult, LoiRefusalKind][] = [
    [
      "a note",
      {
        ...extraction,
        interest: interest("note", { loan: "Unpaid principal balance $60,000,000; 4.25% coupon" }),
        metrics: [...extraction.metrics, row("Unpaid principal balance", "$60,000,000")],
      },
      "note",
    ],
    ["a share", { ...extraction, interest: interest("partial_interest", { share: "49% limited partnership interest" }) }, "share"],
    ["a share of no stated percentage", { ...extraction, interest: interest("partial_interest") }, "share"],
    ["the leased fee", { ...extraction, interest: interest("leased_fee", { groundLease: "Ground lease to 2071" }) }, "leased_fee"],
    ["an auction", { ...extraction, sale: sale("auction"), metrics: [...extraction.metrics, row("Starting bid", "$2,500,000")] }, "auction"],
    // An auction's figures make an auction whatever the method says (lib/sale-terms).
    ["a receiver's auction", { ...extraction, sale: sale("receivership"), metrics: [...extraction.metrics, row("Buyer's premium", "5%")] }, "auction"],
    ["a bankruptcy sale", { ...extraction, sale: sale("bankruptcy") }, "bankruptcy"],
    ["a sale with a stalking-horse bid", { ...extraction, sale: sale("unknown"), metrics: [...extraction.metrics, row("Stalking horse bid", "$18,000,000")] }, "bids"],
    // A stalking horse the memorandum does not price is a stalking horse
    // (audit c66): both drafted a purchase from the owner, or the receiver.
    [
      "a stalking-horse bid the memorandum does not price",
      { ...extraction, sale: sale("unknown"), metrics: [...extraction.metrics, row("Stalking horse bid", "In place — terms in the data room")] },
      "bids",
    ],
    [
      "a receiver's sale with a stalking horse in words",
      {
        ...extraction,
        sale: sale("receivership"),
        metrics: [...extraction.metrics, row("Stalking horse bid", "Under contract with a stalking horse; overbids due Nov 3")],
      },
      "bids",
    ],
    // Whatever method the extraction named.
    ["a sale called negotiated with a stalking-horse bid", { ...extraction, sale: sale("negotiated"), metrics: [...extraction.metrics, row("Stalking horse bid", "$18,000,000")] }, "bids"],
  ];

  for (const [what, ex, kind] of cases) {
    it(`${what}: the route refuses in the panel's own sentence, and the panel offers no form`, async () => {
      const terms = loiTermsFor(ex, null);
      expect(terms.refusal).toEqual({ kind, sentence: LOI_REFUSAL[kind] });

      db.row = { ...db.row, extraction: ex, first_signal: null };
      const res = await download();
      expect(res.status).toBe(302);
      const to = new URL(res.headers.get("location") ?? "");
      expect(to.pathname).toBe(`/deals/${DEAL}`);
      expect(to.searchParams.get("tab")).toBe("documents");
      const code = to.searchParams.get("error") ?? "";
      expect(code).toBe(LOI_REFUSAL_CODE[kind]);
      // The deal page's banner reads the code back to the panel's sentence.
      expect(LOI_REFUSAL_BANNERS[code]).toBe(LOI_REFUSAL[kind]);

      const html = panelHtml(ex, null);
      expect(a11yIssues(html)).toEqual([]);
      const text = visibleText(html);
      expect(gluedWords(text)).toEqual([]);
      expect(text).toContain(LOI_REFUSAL[kind]);
      expect(html).not.toMatch(/Download LOI draft/);
      expect(html).not.toMatch(/\/loi\?/);
    });
  }

  it("says why in each sentence: a note is bought under a loan sale agreement, an auction under its own terms", () => {
    expect(LOI_REFUSAL.note).toMatch(/loan sale agreement, not a property letter of intent/);
    expect(LOI_REFUSAL.auction).toMatch(/bid for under the auction's own terms/);
    // True of a stalking horse whether or not the memorandum prices it.
    expect(LOI_REFUSAL.bids).toMatch(/states a stalking-horse bid — the property is sold through bidding that higher bids can reopen/);
  });

  it("drafts as usual where the stalking-horse row says there is none", () => {
    for (const none of ["None", "N/A", "Not applicable", "No stalking horse", "—"]) {
      const ex = { ...extraction, sale: sale("unknown"), metrics: [...extraction.metrics, row("Stalking horse bid", none)] };
      expect(loiTermsFor(ex, null).refusal, none).toBeNull();
    }
  });
});

describe("the LOI drafts what the memorandum states, each such line marked for review", () => {
  const leasehold: ExtractionResult = {
    ...extraction,
    totalPages: 40,
    interest: interest("leasehold", {
      summary: "The offering is the leasehold interest under a ground lease expiring December 2071.",
      groundLease: "Ground lease expiring December 2071; $250,000 annual rent",
      page: "p. 4",
    }),
  };

  it("a leasehold: the letter names the leasehold interest under the ground lease as what is bought", async () => {
    db.row = { ...db.row, extraction: leasehold, first_signal: null };
    const res = await download();
    expect(res.status).toBe(200);
    const xml = await letterXml(await res.arrayBuffer());
    const letter = textOfXml(xml);
    expect(letter).toContain(
      "to acquire the leasehold interest in the above-referenced property under the ground lease (the “Property”) from its owner (“Seller”) on the principal terms set out below.",
    );
    // Marked, with the memorandum's own sentence and its page beside it.
    expect(letter).toContain(
      "[Review before sending: the memorandum sells a leasehold under a ground lease — “The offering is the leasehold interest under a ground lease expiring December 2071”, p. 4.]",
    );
    expect(xml).toMatch(/<w:highlight w:val="yellow"\/>/);
    // No clause is invented for it.
    expect(letter).not.toMatch(/Ground Lease\b|estoppel/);
    expect(panelText(leasehold, null)).toMatch(
      /The memorandum sells a leasehold, so the draft names the leasehold interest under its ground lease as what is bought\.\s*Each is highlighted in the draft for review\./,
    );
  });

  it("a portfolio: the letter lists its properties by name, as the memorandum does", async () => {
    const portfolio: ExtractionResult = {
      ...extraction,
      properties: [
        property("Riverside Apartments", "100 River Rd, Pittsburgh, PA 15212"),
        property("Hilltop Commons", "200 Hill St, Columbus, OH 43215"),
        property("Lakeview Court", ""),
      ],
    };
    db.row = { ...db.row, extraction: portfolio, first_signal: null };
    const letter = await letterText(await download());
    expect(letter).toContain("to acquire the properties listed below (together, the “Property”) from its owner (“Seller”)");
    expect(letter).toContain("(1) Riverside Apartments — 100 River Rd, Pittsburgh, PA 15212");
    expect(letter).toContain("(2) Hilltop Commons — 200 Hill St, Columbus, OH 43215");
    expect(letter).toContain("(3) Lakeview Court");
    expect(letter).toContain("[Review before sending: the properties as the memorandum lists them.]");
    expect(panelText(portfolio, null)).toMatch(/The draft lists the 3 properties by name, as the memorandum does\./);
  });

  it("a receiver's sale names the court-appointed receiver as the seller, a lender's sale the lender", async () => {
    const receivership: ExtractionResult = {
      ...extraction,
      totalPages: 40,
      sale: sale("receivership", { terms: "Offered by the court-appointed receiver; the sale is subject to court approval.", page: "p. 2" }),
    };
    db.row = { ...db.row, extraction: receivership, first_signal: null };
    let letter = await letterText(await download());
    expect(letter).toContain("from the court-appointed receiver selling it (“Seller”) on the principal terms set out below.");
    expect(letter).toContain(
      "[Review before sending: the memorandum says a court-appointed receiver is selling the property — “Offered by the court-appointed receiver; the sale is subject to court approval”, p. 2.]",
    );
    expect(panelText(receivership, null)).toMatch(/A court-appointed receiver is selling it, so the draft names the receiver as the seller\./);

    const reo: ExtractionResult = { ...extraction, sale: sale("reo") };
    db.row = { ...db.row, extraction: reo };
    letter = await letterText(await download());
    expect(letter).toContain("from the lender that took it back (“Seller”) on the principal terms set out below.");
    expect(letter).toContain("[Review before sending: the memorandum says the lender that took the property back is selling it.]");
  });

  it("a plain fee simple sold the usual way: the letter is the letter it always was", async () => {
    const plain = loiTermsFor(extraction, null);
    expect(plain).toMatchObject({ refusal: null, leasehold: null, seller: null, properties: [], notes: [] });
    db.row = { ...db.row, first_signal: null };
    const res = await download();
    expect(res.status).toBe(200);
    const xml = await letterXml(await res.arrayBuffer());
    expect(textOfXml(xml)).toContain(
      "Cascade (“Buyer”) is pleased to submit this non-binding letter of intent to acquire the above-referenced property (the “Property”) from its owner (“Seller”) on the principal terms set out below.",
    );
    expect(xml).not.toMatch(/w:highlight/);
    expect(textOfXml(xml)).not.toContain("[Review");
    // Word for word what the letter builder drafts with none of the new terms.
    const params = {
      buyerName: "Cascade",
      propertyName: "1400 Market",
      propertyAddress: "",
      price: "$20,000,000",
      deposit: "$200,000",
      ddDays: 45,
      closeDays: 30,
      ltvPct: 60,
      openDays: 7,
      dateStr: "October 1, 2026",
      firmName: null,
    };
    const before = await letterXml(await buildLoiDocx(params));
    const after = await letterXml(await buildLoiDocx({ ...params, plan: null, leasehold: null, seller: null, properties: [] }));
    expect(after).toBe(before);
    expect(panelHtml(extraction, null)).not.toMatch(/data-qa="loi-notes"/);
  });
});
