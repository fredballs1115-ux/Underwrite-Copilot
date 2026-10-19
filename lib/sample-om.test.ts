// The sample's fictional memorandum (lib/sample-om, served by app/api/demo/om)
// read back as text: 48 pages, the stamp on every one, and every page the
// sample cites carrying the words it cites the page for.
import { describe, expect, it } from "vitest";
import { pdfPageTextsOf, pdfTextOf } from "@/lib/memo/pdf-text-of";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { parsePageNumber } from "@/lib/facts";
import { renderSampleOm, SAMPLE_OM_PAGES, SAMPLE_OM_STAMP, sampleOmCitations } from "@/lib/sample-om";
import { GET } from "@/app/api/demo/om/route";
import { SAMPLE_OM_HREF, SAMPLE_OM_VERSION } from "@/lib/sample-om-link";

const pdfPromise = renderSampleOm();

describe("the sample's fictional memorandum", () => {
  it("is a 48-page PDF, the sample's own stated length", async () => {
    const pdf = await pdfPromise;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(SAMPLE_OM_PAGES).toBe(48);
    expect(SAMPLE_DEAL.extraction.totalPages).toBe(48);
    expect(pdfPageTextsOf(pdf)).toHaveLength(48);
  });

  it("stamps every page as fictional, and numbers it", async () => {
    const pages = pdfPageTextsOf(await pdfPromise);
    pages.forEach((text, i) => {
      expect(text).toContain(SAMPLE_OM_STAMP);
      expect(text).toContain(`Page ${i + 1} of 48`);
    });
    expect(SAMPLE_OM_STAMP).toBe("FICTIONAL — ILLUSTRATIVE SAMPLE, NOT A REAL PROPERTY");
  });

  it("carries every fact the sample cites on the page it cites", async () => {
    const pages = pdfPageTextsOf(await pdfPromise);
    const cited = SAMPLE_DEAL.extraction.metrics.filter((m) => m.page);
    expect(cited.length).toBeGreaterThan(5);
    for (const m of cited) {
      const n = parsePageNumber(m.page)!;
      expect(n, m.label).toBeGreaterThanOrEqual(1);
      expect(n, m.label).toBeLessThanOrEqual(48);
      expect(pages[n - 1], `${m.label} on p. ${n}`).toContain(`${m.label}: ${m.value}`);
    }
  });

  it("carries every sale comp on the page the sample cites for it", async () => {
    const pages = pdfPageTextsOf(await pdfPromise);
    expect(SAMPLE_DEAL.comps.saleComps).toHaveLength(3);
    for (const c of SAMPLE_DEAL.comps.saleComps) {
      const n = parsePageNumber(c.page)!;
      expect(n).toBe(14);
      expect(pages[n - 1]).toContain(c.name);
      expect(pages[n - 1]).toContain(c.detail);
    }
    // The verdict's basis range cites p. 14 for the $252k and $261k trades.
    expect(pages[13]).toContain("$252k/unit");
    expect(pages[13]).toContain("$261k/unit");
  });

  it("states the cited figures nowhere but on their own pages", async () => {
    const pages = pdfPageTextsOf(await pdfPromise);
    const cited = sampleOmCitations();
    for (const [n, lines] of cited) {
      for (const line of lines) {
        const on = pages.flatMap((t, i) => (t.includes(line) ? [i + 1] : []));
        expect(on, line).toEqual([n]);
      }
    }
  });

  it("names no brokerage and claims to be nothing real", async () => {
    const text = pdfTextOf(await pdfPromise);
    expect(text).toContain("No brokerage, seller, lender or owner is represented,");
    expect(text).not.toMatch(/CBRE|JLL|Cushman|Newmark|Marcus|Colliers|Berkadia|Walker|Eastdil|Avison/i);
    expect(text).not.toMatch(/@|\(\d{3}\)|\d{3}-\d{3}-\d{4}/);
  });

  it("is the same bytes every time it is built", async () => {
    const again = await renderSampleOm();
    expect(Buffer.compare(again, await pdfPromise)).toBe(0);
  });
});

describe("the public route", () => {
  it("serves the PDF inline, immutable under its version", async () => {
    const res = await GET(new Request(`https://example.test${SAMPLE_OM_HREF}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(res.headers.get("cache-control")).toContain("immutable");
    const etag = res.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, await pdfPromise)).toBe(0);

    const same = await GET(new Request(`https://example.test${SAMPLE_OM_HREF}`, { headers: { "if-none-match": etag! } }));
    expect(same.status).toBe(304);
    expect(same.headers.get("etag")).toBe(etag);
  });

  it("revalidates a URL naming another version, or none", async () => {
    for (const url of ["/api/demo/om", `/api/demo/om?v=${SAMPLE_OM_VERSION}0`]) {
      const res = await GET(new Request(`https://example.test${url}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).not.toContain("immutable");
      expect(res.headers.get("cache-control")).toContain("no-cache");
    }
  });
});
