// The sample's public memo and full report (app/api/demo/memo, …/report)
// are the documents a signed-in reader downloads for the seeded sample
// (app/api/deals/[id]/memo, …/report), less only what a visitor cannot
// have. Audit C8, H1: the public report had no "The actuals" page while the
// signed-in sample's did, and the parity test compared only the arguments
// to `buildReportData`, so it could not see the wrapper. Here both routes
// are driven for real — the signed-in one against a fake database holding
// the sample's row as the seed action stores it, its rent roll and its
// T-12, with a buy box of the reader's own that is NOT the demo mandate, so
// the two can agree only where the sample is judged against the demo
// mandate whoever reads it (lib/deal-buy-box) — and the two PDFs
// are read back as text (lib/memo/pdf-text-of) and held equal.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdfPageTextsOf } from "@/lib/memo/pdf-text-of";
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
// The public routes read today's figures for the sample through
// lib/sample-stress-read: none here either, as the signed-in read above, so
// the two stress tests are built on the same (absent) figures.
vi.mock("@/lib/sample-stress-read", () => ({ sampleTodayReads: async () => null }));
vi.mock("@/lib/debt-index-read", async () => {
  const { NO_DEBT_SEEDS } = await import("@/lib/debt-index");
  return { liveDebtSeeds: async () => NO_DEBT_SEEDS };
});

// The signed-in reader: a Pro account with a buy box of its own — offices
// only, a 7% cap floor, a 20% return — no branding and no dismissed submarket
// checks. The sample ignores the reader's box (lib/deal-buy-box).
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  isPro: async () => true,
}));
const READER_BOX = vi.hoisted(() => ({ assetClasses: ["office"], minCapPct: 7, minIrrPct: 20, unitsMin: 500 }));
vi.mock("@/lib/criteria-server", () => ({ getBuyBoxForDeal: async () => READER_BOX }));
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
  // Page by page, in the page tree's order: a whole-document read follows the
  // order the objects were written in, which can differ between two renders
  // of the same pages (an image or a font settling first), and read two equal
  // reports as unequal.
  return pdfPageTextsOf(Buffer.from(await res.arrayBuffer())).join("\n\f\n");
}

describe("the sample's public documents render as the signed-in sample's", () => {
  it("judges the sample against the demo mandate, never the reader's own box", async () => {
    const { buyBoxForDealRow } = await import("@/lib/deal-buy-box");
    const { evaluateBuyBox } = await import("@/lib/criteria");
    const { sampleDocumentChecks, sampleDocumentRow } = await import("@/lib/sample-cover");
    const { dealCheckSource } = await import("@/lib/buy-box-chip");
    expect(await buyBoxForDealRow({ is_sample: true, user_id: "u1", team_id: null })).toEqual(SAMPLE_DEMO_BOX);
    // A deal of the reader's own is judged against the reader's box…
    expect(await buyBoxForDealRow({ is_sample: false, user_id: "u1", team_id: null })).toEqual(READER_BOX);
    // …which judges the sample otherwise, so the documents below could not
    // agree had the signed-in route read it.
    const row = sampleDocumentRow();
    const readers = evaluateBuyBox(row.asset_class, dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address as never), READER_BOX);
    expect(readers).not.toEqual(sampleDocumentChecks());
  });

  it("the full report: the same pages and words, The actuals page included", async () => {
    const signedIn = await import("@/app/api/deals/[id]/report/route");
    const demo = await import("@/app/api/demo/report/route");
    const a = await textOf(await signedIn.GET(req, ctx));
    const b = await textOf(await demo.GET());
    expect(a).toContain("The actuals");
    // On a mismatch, name the first passage that differs: the test has
    // failed now and then under a loaded full suite and passed alone, and a
    // 40-page diff says nothing.
    if (b !== a) {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      expect(b.slice(Math.max(0, i - 120), i + 200), "the public report from here").toBe(
        a.slice(Math.max(0, i - 120), i + 200),
      );
    }
    expect(b).toBe(a);
    // The box is the sample's example box, whoever reads it: never "your"
    // box, which a visitor never set.
    expect(b).toMatch(/the sample's buy box|the floors of the sample's buy box/);
    expect(b).not.toMatch(/your buy box|your \d+(\.\d+)?% (IRR|cash-on-cash|going-in cap) (floor|target)/i);
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

// Audit C10, L4: the sample's memorandum comps are fictional, like its
// building, and the deal page's Comps section is the one surface that
// guarded them from the geocoder (deal-sections-view's `mapContext.sample`).
// No other surface geocodes a memorandum's comps today; these hold the
// report and the /comps page to it, so it stays true.
describe("the sample's memorandum comps are never geocoded", () => {
  const GEOCODERS = /photon\.komoot\.io|nominatim|geocoding\.geo\.census\.gov|maps\.googleapis\.com\/maps\/api\/geocode/i;
  const COMP_NAMES = [...SAMPLE_DEAL.comps.saleComps, ...(SAMPLE_DEAL.comps.leaseComps ?? [])].map((c) => c.name);

  it("the full report, signed-in and public, asks no geocoder and names no comp in any request", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      asked.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      throw new Error("no network in a test");
    });
    try {
      const signedIn = await import("@/app/api/deals/[id]/report/route");
      const demo = await import("@/app/api/demo/report/route");
      const a = await textOf(await signedIn.GET(req, ctx));
      const b = await textOf(await demo.GET());
      // The comps are printed — as the memorandum states them, never placed.
      for (const name of SAMPLE_DEAL.comps.saleComps.map((c) => c.name)) {
        expect(a.replace(/\s+/g, " ")).toContain(name);
        expect(b.replace(/\s+/g, " ")).toContain(name);
      }
    } finally {
      vi.unstubAllGlobals();
    }
    expect(asked.filter((u) => GEOCODERS.test(u))).toEqual([]);
    for (const name of COMP_NAMES) {
      expect(asked.filter((u) => decodeURIComponent(u.replace(/\+/g, " ")).includes(name)), name).toEqual([]);
    }
  }, 120_000);

  it("only the deal page's Comps section turns a memorandum comp into a geocode query, and the report reaches no geocoder for them", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) return f === "node_modules" ? [] : sources(p);
        return /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
      });
    const callers = [...sources("app"), ...sources("lib")].filter((p) => /\bgeocodeCandidates\(/.test(readFileSync(p, "utf8")));
    expect(callers.filter((p) => !p.endsWith("lib/geo.ts"))).toEqual(["app/(app)/deals/[id]/deal-sections-view.tsx"]);
    // And there the memorandum's sale comps are left off on the sample.
    expect(readFileSync("app/(app)/deals/[id]/deal-sections-view.tsx", "utf8")).toContain("...(mapContext.sample ? [] : saleComps).map(");
    // The report's document and both report routes import no geocoder and
    // no comps map: their comps page is the memorandum's words.
    for (const p of ["lib/memo/report-document.tsx", "app/api/deals/[id]/report/route.ts", "app/api/demo/report/route.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/from "@\/lib\/(geo|geocode)"|comps-map|geocodeCandidates/);
    }
  });

  it("/comps reads no deal and no memorandum comps: it pulls recorded sales around an address the reader types", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const files = readdirSync("app/(app)/comps").filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`app/(app)/comps/${f}`, "utf8");
      expect(src, f).not.toMatch(/\bsaleComps\b|\bleaseComps\b|BrokerCompsResult|from\("deals"\)|is_sample|geocodeCandidates/);
    }
  });
});
