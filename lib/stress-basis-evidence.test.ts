// The basis row's two inputs no extraction carries — the recorded sales and
// the reader's past screens — built ONE way for every surface that builds
// the stress test (the deal page, the memo, the report, the shared screen and
// the verdict's brief), and the shared screen and the brief never handed the
// reader's own past screens.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult } from "./anthropic/types";
import type { RecordCompsResult } from "./public-comps/core";
import type { MarketGroup } from "./market-memory";
import { PAST_SCREENS_IN_BRIEF, PAST_SCREENS_ON_SHARE, compsCallSubjectOf, memoryClassOf, stressBasisEvidence } from "./stress-basis-evidence";
import { readStressBasisEvidence } from "./stress-basis-read";
import { buildStressTest } from "./stress-test";
import { SHARED_DEAL_COLUMNS } from "./share-resolve";

const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 4" });
const APARTMENT = {
  dealName: "The Maddox",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 N Capitol St NW, Washington, DC 20002",
  totalPages: 48,
  strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
  metrics: [row("Asking price", "$42,000,000"), row("Units", "153"), row("Rentable SF", "140,000"), row("NOI (in-place)", "$2,400,000")],
} as unknown as ExtractionResult;

/** Twelve recorded sales of apartments, five stating an area, their $/SF
 *  median $250: the comps tab sets the deal's $300/SF 20% above it. */
const pull = (over: Partial<RecordCompsResult["stats"]> = {}, classKey = "multifamily"): RecordCompsResult => ({
  status: "ok",
  providerName: "DC OTR",
  datasetUrl: "https://example.test/records",
  params: { radiusKm: 1.6, monthsBack: 24, classFilter: "Multifamily", classKey },
  comps: [],
  stats: { count: 12, medianPrice: 40_000_000, medianPerSqft: 250, perSqftCount: 5, low: 1, high: 2, ...over },
  retrievedAt: "2026-10-01T12:00:00Z",
  note: "",
});
const subject = compsCallSubjectOf(APARTMENT, null, "multifamily");

describe("the basis row's evidence, built once", () => {
  it("admits recorded sales only where the comps tab makes a per-SF call, with that call's own count", () => {
    const { recordedSales } = stressBasisEvidence({ publicComps: pull(), subject, memoryGroup: null, isSample: false });
    expect(recordedSales).toEqual({
      count: 12,
      perSqftCount: 5,
      medianPerSqft: 250,
      medianPerUnit: null,
      providerName: "DC OTR",
      retrievedAt: "2026-10-01T12:00:00Z",
      href: "https://example.test/records",
    });
    // Under three stating an area the tab calls the whole price, not the
    // foot: no $/SF evidence stands.
    expect(stressBasisEvidence({ publicComps: pull({ perSqftCount: 2 }), subject, memoryGroup: null, isSample: false }).recordedSales).toBeNull();
    // Another class's sales are no evidence of this basis.
    expect(stressBasisEvidence({ publicComps: pull({}, "office"), subject, memoryGroup: null, isSample: false }).recordedSales).toBeNull();
    // The sample's building is invented.
    expect(stressBasisEvidence({ publicComps: pull(), subject, memoryGroup: null, isSample: true }).recordedSales).toBeNull();
    // On the row: the median over the sales behind it, judged per SF on an
    // apartment deal, never "no comp with a figure".
    const b =buildStressTest({ extraction: APARTMENT, challenger: null, market: null, modelVsMarket: null, actuals: null, derived: null, recordedSales, readOn: "2026-10-20" }).rows.find(
      (r) => r.key === "basis",
    )!;
    expect(b.evidence[0].text).toBe("median $250/SF over 5 of 12 recorded sales, those that state an area, judged per SF");
    expect(b.verdict).toBe("unsupported");
  });

  it("hands the past screens' median with the screens behind it", () => {
    const group = (n: number): MarketGroup => ({
      assetClass: "multifamily",
      market: "Washington, DC",
      marketKey: "washington dc",
      count: 7,
      cap: null,
      perUnit: { min: 250_000, median: 300_000, max: 320_000, n, basis: "unit", noun: "unit" },
      calls: { pass: 0, caution: 0, pass_on: 0 },
      dealIds: [],
    });
    expect(stressBasisEvidence({ publicComps: null, subject, memoryGroup: group(3), isSample: false }).pastScreens).toEqual({
      count: 7,
      medianCount: 3,
      perUnitMedian: 300_000,
      perSfMedian: null,
      market: "Washington, DC",
    });
    const { pastScreens } = stressBasisEvidence({ publicComps: null, subject, memoryGroup: group(2), isSample: false });
    const b = buildStressTest({ extraction: APARTMENT, challenger: null, market: null, modelVsMarket: null, actuals: null, derived: null, pastScreens, readOn: "2026-10-20" }).rows.find(
      (r) => r.key === "basis",
    )!;
    expect(b.evidence[0]).toMatchObject({ value: null, text: "7 screens, 2 with a basis /unit, too few for a median" });
  });

  it("brings no price for a master lease of the building, and the class the memory groups by", () => {
    const master = {
      ...APARTMENT,
      interest: { kind: "leasehold", summary: "The master lease of the building, sublet to its tenants", share: "", groundLease: "", loan: "", page: "" },
    } as unknown as ExtractionResult;
    expect(compsCallSubjectOf(master, null, "multifamily")).toMatchObject({ price: null, perSf: null });
    expect(subject).toMatchObject({ price: 42_000_000, perSf: 300, classKey: "multifamily", portfolio: false, planOrLand: false });
    expect(memoryClassOf("auto", APARTMENT)).toBe("multifamily");
    expect(memoryClassOf("office", APARTMENT)).toBe("office");
  });

  it("reads the reader's own screens of the deal's market and class, and none where a surface withholds them", async () => {
    const other = (id: string, price: string) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: "2026-09-01T00:00:00Z",
      is_sample: false,
      verdict: null,
      first_signal: null,
      extraction: { assetClass: "multifamily", market: "Washington, DC", metrics: [row("Asking price", price), row("Units", "100")] },
    });
    const full = [other("a", "$28,000,000"), other("b", "$30,000,000"), other("c", "$32,000,000")];
    const asked: string[] = [];
    const fake = {
      from(table: string) {
        asked.push(table);
        const q = {
          select: () => q,
          eq: () => q,
          not: () => q,
          order: () => q,
          range: (from: number, to: number) =>
            Promise.resolve({
              data: full.map((r) => ({ id: r.id, asset_class: r.asset_class, is_sample: false, market: "Washington, DC", ext_class: "multifamily" })).slice(from, to + 1),
              error: null,
            }),
          in: (_col: string, ids: string[]) => Promise.resolve({ data: full.filter((r) => ids.includes(r.id)), error: null }),
        };
        return q;
      },
    } as unknown as SupabaseClient;
    const deal = { id: "d", asset_class: "multifamily", is_sample: false, public_comps: pull(), extraction: APARTMENT, first_signal: null };
    const read = await readStressBasisEvidence(fake, deal, { readerId: "u", pastScreens: true });
    expect(read.pastScreens).toEqual({ count: 3, medianCount: 3, perUnitMedian: 300_000, perSfMedian: null, market: "Washington, DC" });
    expect(read.recordedSales).toMatchObject({ perSqftCount: 5, medianPerSqft: 250 });
    asked.length = 0;
    const shared = await readStressBasisEvidence(fake, deal, { readerId: null, pastScreens: false });
    expect(shared.pastScreens).toBeNull();
    expect(shared.recordedSales).toMatchObject({ perSqftCount: 5 });
    expect(asked).toEqual([]);
  });

  it("is what all five builders call: the page, the memo, the report, the shared screen and the verdict's brief", () => {
    const src = (p: string) => readFileSync(p, "utf8");
    expect(src("app/(app)/deals/[id]/page.tsx")).toMatch(/stressBasisEvidence\(\{\s*publicComps,\s*subject: compsCallSubject,\s*memoryGroup: marketMemory/);
    for (const route of ["app/api/deals/[id]/memo/route.ts", "app/api/deals/[id]/report/route.ts"]) {
      expect(src(route), route).toContain("readStressBasisEvidence(supabase, deal, { readerId: user.id, pastScreens: true })");
      expect(src(route), route).toMatch(/recordedSales,\s*pastScreens,/);
    }
    // The shared screen: the recorded sales are public records; the sender's
    // past screens are never read, and the row says so by name.
    const share = src("app/share/[token]/page.tsx");
    expect(share).toContain("{ readerId: null, pastScreens: false }");
    expect(share).toMatch(/pastScreens: null,\s*pastScreensWithheld: PAST_SCREENS_ON_SHARE/);
    expect(SHARED_DEAL_COLUMNS).toContain("public_comps");
    // The verdict's brief: its words reach the shared screen.
    const pipeline = src("lib/anthropic/pipeline.ts");
    expect(pipeline).toMatch(/stressBasisEvidence\(\{/);
    expect(pipeline).toMatch(/pastScreens: null,\s*pastScreensWithheld: PAST_SCREENS_IN_BRIEF/);
    expect(pipeline).toMatch(/\.select\("[^"]*\bpublic_comps\b[^"]*"\)/);
    // The reasons name whose deals they are.
    expect(PAST_SCREENS_ON_SHARE).toContain("the sender's own past screens");
    expect(PAST_SCREENS_IN_BRIEF).toContain("its words reach the shared screen");
  });
});
