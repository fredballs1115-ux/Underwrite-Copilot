// The sample's public memo and full report print one cover (home-demo-gap
// M7): the report had printed none while the memo beside it printed the
// aerial. Both routes are driven here with the USGS fetch faked and the
// renders captured, so what each hands its document is compared directly.
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const png = (bytes: Buffer) => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png" } });

beforeEach(() => {
  vi.resetModules();
  fetchAerialImage.mockReset();
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
