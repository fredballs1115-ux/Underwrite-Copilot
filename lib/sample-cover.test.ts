// The sample's public memo and full report print one cover (home-demo-gap
// M7): the report had printed none while the memo beside it printed the
// aerial. Both routes are driven here with the USGS fetch faked and the
// renders captured, so what each hands its document is compared directly.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TINY_PNG, TINY_PNG_DATA_URI, CORRUPT_PNG } from "@/lib/memo/test-png";
import { COVER_SIZE } from "@/lib/memo/cover-aerial";
import type { MemoData } from "@/lib/memo/memo-document";
import type { ReportInput } from "@/lib/memo/report-document";

const fetchAerialImage = vi.fn();
vi.mock("@/lib/imagery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imagery")>()),
  fetchAerialImage: (...args: unknown[]) => fetchAerialImage(...args),
}));

const captured: { memo: MemoData | null; report: ReportInput | null } = { memo: null, report: null };
vi.mock("@react-pdf/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-pdf/renderer")>()),
  renderToBuffer: async (element: { props: { data: MemoData } }) => {
    captured.memo = element.props.data;
    return Buffer.from("%PDF-memo");
  },
}));
vi.mock("@/lib/memo/report-document", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memo/report-document")>()),
  renderReportPdf: async (input: ReportInput) => {
    captured.report = input;
    return Buffer.from("%PDF-report");
  },
}));

// Today's published figures: no network in a test. Each case says what the
// read answers; by default it fails, as a read with no database does.
const todayReads = vi.fn();
vi.mock("@/lib/model-vs-market-read", () => ({
  todayReads: (...args: unknown[]) => todayReads(...args),
}));
const modelVsMarketFor = vi.fn();
vi.mock("@/lib/model-vs-market", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/model-vs-market")>();
  return {
    ...real,
    modelVsMarketFor: (...args: Parameters<typeof real.modelVsMarketFor>) =>
      modelVsMarketFor(...args) ?? real.modelVsMarketFor(...args),
  };
});

// The workbook's builder, captured: what the public route hands it is
// compared with what the signed-in route hands it.
const workbookArgs: { value: unknown[] | null } = { value: null };
vi.mock("@/lib/underwrite/workbook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/underwrite/workbook")>()),
  buildUnderwriteWorkbook: async (...args: unknown[]) => {
    workbookArgs.value = args;
    return Buffer.from("xlsx");
  },
}));

const png = (bytes: Buffer) => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png" } });

beforeEach(() => {
  vi.resetModules();
  fetchAerialImage.mockReset();
  todayReads.mockReset();
  todayReads.mockImplementation(async () => {
    throw new Error("no database in a test");
  });
  modelVsMarketFor.mockReset();
  captured.memo = null;
  captured.report = null;
  workbookArgs.value = null;
});

async function downloadBoth() {
  const memoRoute = await import("@/app/api/demo/memo/route");
  const reportRoute = await import("@/app/api/demo/report/route");
  const [memo, report] = await Promise.all([memoRoute.GET(), reportRoute.GET()]);
  return { memo, report };
}

describe("the sample's public documents' cover", () => {
  it("the memo and the full report print the same cover, from one bounded fetch of Brewerytown's aerial", async () => {
    fetchAerialImage.mockImplementation(async () => png(TINY_PNG));
    const { SAMPLE_COVER_POINT } = await import("@/lib/sample-cover");
    const { IMAGE_CREDIT } = await import("@/lib/imagery");
    const { memo, report } = await downloadBoth();
    expect(memo.headers.get("content-type")).toBe("application/pdf");
    expect(report.headers.get("content-type")).toBe("application/pdf");

    const memoCover = captured.memo?.cover ?? null;
    const reportCover = captured.report?.memo.cover ?? null;
    expect(memoCover).toEqual({ dataUri: TINY_PNG_DATA_URI, credit: IMAGE_CREDIT.aerial });
    expect(reportCover).toEqual(memoCover);
    // One USGS request for the two documents, at the cover's frame, on the
    // neighbourhood's own point — never a street address.
    expect(fetchAerialImage).toHaveBeenCalledTimes(1);
    expect(fetchAerialImage).toHaveBeenCalledWith(SAMPLE_COVER_POINT, COVER_SIZE);
    expect(SAMPLE_COVER_POINT.precision).toBe("area");
  });

  it("bytes react-pdf would hang on are no cover on either, and the next document asks again", async () => {
    fetchAerialImage.mockImplementation(async () => png(CORRUPT_PNG));
    await downloadBoth();
    expect(captured.memo?.cover ?? null).toBeNull();
    expect(captured.report?.memo.cover ?? null).toBeNull();
    // A cover that did not come through is not held for the day.
    const { sampleCover } = await import("@/lib/sample-cover");
    fetchAerialImage.mockImplementation(async () => png(TINY_PNG));
    const day = new Date().toISOString().slice(0, 10);
    expect((await sampleCover(day))?.dataUri).toBe(TINY_PNG_DATA_URI);
  });

  it("a USGS answer of nothing, or a fetch that throws, still serves both documents", async () => {
    fetchAerialImage.mockImplementation(async () => {
      throw new Error("USGS down");
    });
    const { memo, report } = await downloadBoth();
    expect(memo.status).toBe(200);
    expect(report.status).toBe(200);
    expect(captured.memo?.cover ?? null).toBeNull();
    expect(captured.report?.memo.cover ?? null).toBeNull();
  });
});

// The public memo and report are the documents a signed-in reader downloads
// for the sample (app/api/deals/[id]/memo and …/report), less only what a
// visitor cannot have: a firm's branding, the reader's dismissed submarket
// checks and the reader's own buy box.
describe("the sample's public documents are the signed-in sample's", () => {
  const argsOf = (rel: string, fn: string): string[] => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const call = src.match(new RegExp(`${fn}\\(([^()]*)\\)`));
    if (!call) throw new Error(`${rel} makes no ${fn}(…) call`);
    return call[1].split(",").map((a) => a.trim()).filter(Boolean);
  };

  it("each demo route hands its document every argument the signed-in route hands it, in its order", () => {
    expect(argsOf("app/api/demo/report/route.ts", "buildReportData")).toEqual(
      argsOf("app/api/deals/[id]/report/route.ts", "buildReportData"),
    );
    expect(argsOf("app/api/demo/memo/route.ts", "buildMemoData")).toEqual(
      argsOf("app/api/deals/[id]/memo/route.ts", "buildMemoData"),
    );
  });

  // The chain past the builders (audit C8, H1): the signed-in report wraps
  // its data in `withActuals` and the memo goes through `renderMemoPdf` with
  // an actuals line; the public routes had done neither, and the argument
  // lists above could not see it. lib/sample-documents.render.test.ts renders
  // both pairs and compares the PDFs' text; this holds the shape in source.
  it("each demo route wraps and draws its document as the signed-in route does", () => {
    const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
    const demoReport = src("app/api/demo/report/route.ts");
    const signedReport = src("app/api/deals/[id]/report/route.ts");
    const wrapper = /withActuals\(\s*buildReportData\([^()]*\),\s*actuals,?\s*\)/;
    expect(signedReport).toMatch(wrapper);
    expect(demoReport).toMatch(wrapper);
    for (const s of [demoReport, signedReport]) expect(s).toMatch(/renderReportPdf\(/);
    const demoMemo = src("app/api/demo/memo/route.ts");
    const signedMemo = src("app/api/deals/[id]/memo/route.ts");
    for (const s of [demoMemo, signedMemo]) {
      expect(s).toMatch(/renderMemoPdf\(memo\)/);
      expect(s).toMatch(/\{ \.\.\.buildMemoData\([^()]*\), actualsLine \}/);
      expect(s).not.toMatch(/renderToBuffer\(/);
    }
  });

  it("the public memo's actuals line is the signed-in route's expression on the sample's stored documents", async () => {
    fetchAerialImage.mockImplementation(async () => null);
    await downloadBoth();
    const { sampleActuals, sampleActualsLine } = await import("@/lib/sample-cover");
    expect(sampleActuals()).not.toBeNull();
    expect(captured.memo?.actualsLine).toBe(sampleActualsLine());
    expect(captured.memo?.actualsLine).toMatch(/T-12 NOI .*Rent roll \(as of May 31, 2026\)/);
    expect(captured.report?.actuals).toEqual(sampleActuals());
  });

  it("reads the sample's row as the seed action stores it, judged on the deal page's check source", async () => {
    const { sampleDocumentChecks, sampleDocumentRow } = await import("@/lib/sample-cover");
    const { SAMPLE_DEAL, SAMPLE_DEMO_BOX } = await import("@/lib/sample-deal");
    const { buyBoxRead, dealCheckSource } = await import("@/lib/buy-box-chip");
    const row = sampleDocumentRow() as unknown as Record<string, unknown>;
    expect(row.is_sample).toBe(true);
    expect(row.address).toEqual(SAMPLE_DEAL.address);
    expect(row.first_signal).toBeNull();
    // The homepage's chip and the deal header read the same checks.
    const read = buyBoxRead(
      SAMPLE_DEAL.asset_class,
      dealCheckSource(SAMPLE_DEAL.extraction as never, null, SAMPLE_DEAL.address as never),
      SAMPLE_DEMO_BOX,
    );
    expect(sampleDocumentChecks()).toEqual(read.checks);

    fetchAerialImage.mockImplementation(async () => png(TINY_PNG));
    await downloadBoth();
    expect(captured.report?.deal).toEqual(sampleDocumentRow());
    // One judgement on both (the report's chip adds the page its grid is on).
    const calls = (rows: { label: string; status: string }[] | undefined) => rows?.map((c) => [c.label, c.status]);
    expect(calls(captured.report?.memo.buyBox)).toEqual(calls(captured.memo?.buyBox));
    expect(calls(captured.memo?.buyBox)).toEqual(read.checks.map((c) => [c.label, c.status]));
    // Dated as the signed-in route dates a reader of no known zone.
    const { readerDateLong } = await import("@/lib/reader-day");
    expect(JSON.stringify(captured.memo)).toContain(readerDateLong(null, new Date()));
  });

  it("the homepage's memo tile is built from the download's own inputs, cover aside (audit C7, L4)", async () => {
    fetchAerialImage.mockImplementation(async () => png(TINY_PNG));
    await downloadBoth();
    const { sampleMemoData } = await import("@/lib/sample-memo");
    const preview = sampleMemoData(new Date());
    expect(captured.memo).not.toBeNull();
    expect({ ...preview, cover: null }).toEqual({ ...captured.memo!, cover: null });
    expect(preview.cover ?? null).toBeNull();
  });

  it("prints the model's read against today's published figures for the sample's market, as the signed-in report does", async () => {
    fetchAerialImage.mockImplementation(async () => null);
    const reads = { rates: [], zori: null, realtor: null, national: [], now: new Date() };
    todayReads.mockImplementation(async () => reads);
    const sentinel = { checks: [], scope: "test" } as never;
    modelVsMarketFor.mockImplementation(() => sentinel);
    await downloadBoth();
    expect(captured.report?.modelVsMarket).toBe(sentinel);
    const [metro] = todayReads.mock.calls[0] as [{ id: string; name: string } | null];
    expect(metro?.name).toMatch(/Philadelphia/);
    const args = modelVsMarketFor.mock.calls[0][0] as {
      metro: unknown;
      reads: unknown;
      storedAssetClass: string;
      firstSignal: unknown;
    };
    expect(args.metro).toBe(metro);
    expect(args.reads).toBe(reads);
    expect(args.storedAssetClass).toBe("multifamily");
    expect(args.firstSignal).toBeNull();
  });

  it("a live read that fails leaves the block out and the report served, grids and all", async () => {
    fetchAerialImage.mockImplementation(async () => null);
    const { report } = await downloadBoth();
    expect(report.status).toBe(200);
    expect(captured.report?.modelVsMarket ?? null).toBeNull();
    expect(captured.report?.sensitivity).toBeTruthy();
  });
});

// The public workbook (linked from the homepage's "Underwrite model") is the
// one a signed-in reader downloads for the sample (audit C7, M2): it had been
// `buildUnderwriteWorkbook(derived)` alone, with no OM Facts tab, no Market
// Read, no findings and no read of what the price buys.
describe("the sample's public workbook is the signed-in sample's", () => {
  /** A call's arguments, split at its top-level commas (they nest calls). */
  const callArgs = (rel: string, fn: string): string[] => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const at = src.indexOf(`${fn}(`);
    if (at < 0) throw new Error(`${rel} makes no ${fn}(…) call`);
    const args: string[] = [];
    let depth = 0;
    let cur = "";
    for (let i = at + fn.length + 1; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") depth++;
      if (ch === ")") {
        if (depth === 0) break;
        depth--;
      }
      if (ch === "," && depth === 0) {
        args.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  };

  it("hands the builder every argument the signed-in route hands it, in its order", () => {
    const signedIn = callArgs("app/api/deals/[id]/underwrite.xlsx/route.ts", "buildUnderwriteWorkbook");
    expect(signedIn).toContain("readOmFacts(extraction)");
    expect(callArgs("app/api/demo/underwrite.xlsx/route.ts", "buildUnderwriteWorkbook")).toEqual(signedIn);
  });

  it("builds with the sample's OM Facts, its findings and its day, the model's figures unmoved", async () => {
    const { readOmFacts } = await import("@/lib/underwrite/om-facts");
    const { SAMPLE_DEAL } = await import("@/lib/sample-deal");
    const { sampleDerivedInputs } = await import("@/lib/sample-derive");
    const route = await import("@/app/api/demo/underwrite.xlsx/route");
    const res = await route.GET();
    expect(res.status).toBe(200);
    const args = workbookArgs.value!;
    expect(args).toHaveLength(9);
    const [model, branding, marketRead, , asOf, findings, interest, , omFacts] = args as [
      { inputs: unknown },
      unknown,
      unknown,
      unknown,
      Date,
      unknown[],
      unknown,
      unknown,
      unknown,
    ];
    const facts = readOmFacts(SAMPLE_DEAL.extraction as never);
    expect(facts).not.toBeNull();
    expect(omFacts).toEqual(facts);
    expect(model.inputs).toEqual(sampleDerivedInputs().inputs);
    expect(branding).toBeNull();
    // the live read fails in a test: the tab is left out, the workbook served
    expect(marketRead).toBeNull();
    expect(asOf.toISOString()).toMatch(/T12:00:00\.000Z$/);
    expect(Array.isArray(findings)).toBe(true);
    expect(interest).toBeTruthy();
  });
});
