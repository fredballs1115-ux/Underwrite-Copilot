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
