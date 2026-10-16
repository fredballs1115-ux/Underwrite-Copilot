// The sample's public memo and full report (app/api/demo/memo, …/report)
// are the documents a signed-in reader downloads for the seeded sample
// (app/api/deals/[id]/memo, …/report), less only what a visitor cannot
// have. Audit C8, H1: the public report had no "The actuals" page while the
// signed-in sample's did, and the parity test compared only the arguments
// to `buildReportData`, so it could not see the wrapper. Here both routes
// are driven for real — the signed-in one against a fake database holding
// the sample's row as the seed action stores it, its rent roll and its
// T-12, with the demo mandate as the reader's buy box — and the two PDFs
// are read back as text (lib/memo/pdf-text-of) and held equal.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

// No pictures on either: the demo's cover is a USGS fetch, the signed-in
// one the deal's cover resolver; both answer nothing here.
vi.mock("@/lib/imagery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imagery")>()),
  fetchAerialImage: async () => null,
}));
vi.mock("@/lib/memo/cover-aerial", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memo/cover-aerial")>()),
  coverPictureFor: async () => null,
  galleryPhotosFor: async () => [],
}));
vi.mock("@/lib/flood-map", () => ({ floodMapFor: async () => null }));

// Today's published figures and rates: no network in a test, on either.
vi.mock("@/lib/model-vs-market-read", () => ({
  todayReads: async () => {
    throw new Error("no database in a test");
  },
}));
vi.mock("@/lib/debt-index-read", async () => {
  const { NO_DEBT_SEEDS } = await import("@/lib/debt-index");
  return { liveDebtSeeds: async () => NO_DEBT_SEEDS };
});

// The signed-in reader: a Pro account whose buy box is the demo mandate, no
// branding and no dismissed submarket checks — what a visitor's copy holds.
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  isPro: async () => true,
}));
vi.mock("@/lib/criteria-server", () => ({ getBuyBoxForDeal: async () => SAMPLE_DEMO_BOX }));
vi.mock("@/lib/branding-server", () => ({
  getBrandingForDeal: async () => null,
  brandingLogoDataUri: async () => null,
}));
vi.mock("@/lib/market/deal-checks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/market/deal-checks")>()),
  dealOverrideLines: async () => [],
}));

/** The sample's tables as the seed action writes them. */
async function tables(): Promise<Record<string, unknown>> {
  const { sampleDocumentRow } = await import("@/lib/sample-cover");
  return {
    deals: { ...sampleDocumentRow(), id: "sample-1", user_id: "u1", team_id: null },
    analysis_jobs: null,
    deal_rent_rolls: { as_of_date: SAMPLE_DEAL.rentRoll.as_of_date, summary: SAMPLE_DEAL.rentRoll.summary },
    deal_t12_statements: { period_end_date: SAMPLE_DEAL.t12.period_end_date, summary: SAMPLE_DEAL.t12.summary },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const rows = await tables();
    return {
      auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@b.c" } } }) },
      from(table: string) {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        };
        return q;
      },
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
});

const ctx = { params: Promise.resolve({ id: "sample-1" }) };
const req = new Request("https://example.test/api/deals/sample-1/x");

async function textOf(res: Response): Promise<string> {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  return pdfTextOf(Buffer.from(await res.arrayBuffer()));
}

describe("the sample's public documents render as the signed-in sample's", () => {
  it("the full report: the same pages and words, The actuals page included", async () => {
    const signedIn = await import("@/app/api/deals/[id]/report/route");
    const demo = await import("@/app/api/demo/report/route");
    const a = await textOf(await signedIn.GET(req, ctx));
    const b = await textOf(await demo.GET());
    expect(a).toContain("The actuals");
    expect(b).toBe(a);
  }, 120_000);

  it("the memo: the same words, through the same renderMemoPdf and actuals line", async () => {
    const signedIn = await import("@/app/api/deals/[id]/memo/route");
    const demo = await import("@/app/api/demo/memo/route");
    const a = await textOf(await signedIn.GET(req, ctx));
    const b = await textOf(await demo.GET());
    expect(b).toBe(a);
    // The line exists for the sample (its rent roll and T-12 are stored),
    // and both memos make the same call about room for it.
    const { sampleActualsLine } = await import("@/lib/sample-cover");
    expect(sampleActualsLine()).toMatch(/T-12 NOI/);
  }, 60_000);
});
