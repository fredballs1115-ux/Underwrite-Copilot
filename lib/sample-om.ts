/**
 * The sample deal's fictional offering memorandum, as a file a visitor can
 * open (app/api/demo/om). The sample cites its memorandum's pages — the
 * asking price on p. 3, the caps on p. 8, the comps on p. 14 — and until
 * this there was no file behind a single chip.
 *
 * Written by the PDF writer the report, the memo and the test memoranda
 * already ship with (`@react-pdf/pdfkit`, under `@react-pdf/renderer`), in
 * standard Helvetica (WinAnsi text only), deterministically: a fixed
 * creation date, so the same fixture is the same bytes on every process.
 *
 * Three rules:
 *  - every page carries `SAMPLE_OM_STAMP`, at its head and its foot;
 *  - every page the sample cites carries the words the sample cites it for,
 *    read off the fixture (lib/sample-deal) — each fact as "Label: value",
 *    each sale comp as its name and its detail line — so the chip and the
 *    page can never disagree;
 *  - every other page is a heading and one sentence saying it states
 *    nothing: no figure, place, company or person the sample does not.
 */

import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { parsePageNumber } from "@/lib/facts";
import { SAMPLE_OM_STAMP } from "@/lib/sample-om-link";

export { SAMPLE_OM_STAMP };

/** pdfkit ships no types; these are the few calls this file makes. */
interface PdfKitDoc {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  addPage(options?: object): PdfKitDoc;
  font(name: string): PdfKitDoc;
  fontSize(size: number): PdfKitDoc;
  fillColor(color: string): PdfKitDoc;
  rect(x: number, y: number, w: number, h: number): PdfKitDoc;
  fill(color?: string): PdfKitDoc;
  text(text: string, x?: number, y?: number, options?: object): PdfKitDoc;
  end(): void;
}
type PdfKit = new (options?: object) => PdfKitDoc;

/** The memorandum's length: the sample's own stated page count. */
export const SAMPLE_OM_PAGES = SAMPLE_DEAL.extraction.totalPages ?? 48;

/** What one page says beyond the stamp: its heading and its lines. */
export interface SampleOmPage {
  heading: string;
  lines: string[];
}

/** The headings, page by page. A cited page's heading names what it cites. */
const HEADINGS: Record<number, string> = {
  1: "Offering Memorandum",
  2: "About this sample memorandum",
  3: "Offering summary",
  4: "Contents",
  5: "Investment highlights",
  6: "Executive summary",
  7: "Property overview",
  8: "Financial summary",
  9: "Site plan",
  10: "Building systems",
  11: "Unit features",
  12: "Unit mix and rents",
  13: "Amenities",
  14: "Sale comparables",
  15: "Rent comparables",
  16: "Neighborhood overview",
  17: "Location",
  18: "Demographics",
  19: "Employment",
  20: "Transportation",
  21: "Capital history",
  22: "Operating history",
  23: "Income detail",
  24: "Expense detail",
  25: "Renovation program",
  26: "Rent roll summary",
  27: "Real estate taxes",
  28: "Insurance",
  29: "Utilities",
  30: "Management",
  31: "Leasing",
  32: "Competitive set",
  33: "Supply pipeline",
  34: "Market rents",
  35: "Absorption",
  36: "Valuation approach",
  37: "Ten-year cash flow",
  38: "Sensitivity",
  39: "Operating assumptions",
  40: "Pro forma assumptions",
  41: "Pro forma cash flow and exit",
  42: "Capital plan",
  43: "Reserves",
  44: "Financing",
  45: "Offering process",
  46: "Due diligence materials",
  47: "Terms of sale",
  48: "Contact",
};

/** What a page with nothing cited on it says. */
export const SAMPLE_OM_FILLER = [
  "A placeholder page of the sample memorandum. It states no figures,",
  "and nothing on it describes a real property, place, company or person.",
];

/** The sample's cited lines, by the page each cites: every fact with a page
 *  as "Label: value", every sale comp as "Name: detail". */
export function sampleOmCitations(): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (page: string | undefined, line: string) => {
    const n = parsePageNumber(page);
    if (n == null || n < 1 || n > SAMPLE_OM_PAGES) return;
    out.set(n, [...(out.get(n) ?? []), line]);
  };
  for (const m of SAMPLE_DEAL.extraction.metrics) add(m.page, `${m.label}: ${m.value}`);
  for (const c of SAMPLE_DEAL.comps.saleComps) add(c.page, `${c.name}: ${c.detail}`);
  return out;
}

/** The building's name, as the sample's deal name gives it. */
function sampleOmName(): string {
  return (SAMPLE_DEAL.extraction.dealName ?? SAMPLE_DEAL.name).replace(/^Sample — /, "");
}

/** Every page's heading and lines, in page order. */
export function sampleOmPages(): SampleOmPage[] {
  const cited = sampleOmCitations();
  const name = sampleOmName();
  return Array.from({ length: SAMPLE_OM_PAGES }, (_, i): SampleOmPage => {
    const n = i + 1;
    const heading = HEADINGS[n] ?? `Appendix, page ${n}`;
    if (n === 1) {
      return {
        heading,
        lines: [
          name,
          "A fictional apartment building, made up to show how Underwrite Copilot",
          "reads a memorandum. No brokerage, seller, lender or owner is represented,",
          "and every figure is invented.",
        ],
      };
    }
    if (n === 2) {
      return {
        heading,
        lines: [
          "This file is an illustrative sample.",
          "The building does not exist and is not for sale.",
          "Its pages carry the figures the sample deal cites, on the pages it cites them.",
          "Every other page is a placeholder that states nothing.",
        ],
      };
    }
    if (n === 4) {
      return {
        heading,
        lines: [...cited.keys()]
          .sort((a, b) => a - b)
          .map((p) => `${HEADINGS[p] ?? `Page ${p}`} — page ${p}`),
      };
    }
    const lines = cited.get(n);
    if (lines) {
      const comps = n === parsePageNumber(SAMPLE_DEAL.comps.saleComps[0]?.page);
      return {
        heading,
        lines: comps ? [...lines, "The comparables are fictional, like the building."] : lines,
      };
    }
    if (n === SAMPLE_OM_PAGES) {
      return {
        heading,
        lines: ["No broker or seller is named: this memorandum is a fictional sample."],
      };
    }
    return { heading, lines: [...SAMPLE_OM_FILLER] };
  });
}

// Letter, portrait, in points.
const W = 612;
const H = 792;
const MARGIN = 54;
const STAMP_RED = "#b42318";

/** The PDF, built once per call; the route keeps one per process. */
export async function renderSampleOm(): Promise<Buffer> {
  // @ts-expect-error -- @react-pdf/pdfkit ships no types (the interface above)
  const mod = (await import("@react-pdf/pdfkit")) as { default: PdfKit };
  const PDFDocument = mod.default;
  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 18,
    // Uncompressed: pdfkit deflates each stream on its own async zlib
    // stream and writes it whenever that finishes, so a compressed file's
    // objects land in a different order on every run. Forty-eight pages of
    // text are small either way.
    compress: false,
    info: {
      Title: `${sampleOmName()} — fictional sample offering memorandum`,
      Subject: SAMPLE_OM_STAMP,
      Creator: "Underwrite Copilot",
      Producer: "Underwrite Copilot",
      // Fixed, so the file is the same bytes on every process: the file ID
      // is a hash of this date and the rest of the info.
      CreationDate: new Date("2026-01-01T00:00:00Z"),
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on("end", resolve));

  const pages = sampleOmPages();
  pages.forEach((page, i) => {
    const n = i + 1;
    doc.addPage({ size: "LETTER", layout: "portrait", margin: 18 });
    // The stamp, a red band at the head of the page.
    doc.rect(0, 0, W, 34).fill(STAMP_RED);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff").text(SAMPLE_OM_STAMP, MARGIN, 12, { lineBreak: false });

    if (n === 1) {
      doc.font("Helvetica").fontSize(14).fillColor("#555555").text(page.heading, MARGIN, 220, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(30).fillColor("#111111").text(page.lines[0], MARGIN, 244, { lineBreak: false });
      page.lines.slice(1).forEach((line, j) => {
        doc.font("Helvetica").fontSize(11).fillColor("#333333").text(line, MARGIN, 300 + j * 20, { lineBreak: false });
      });
    } else {
      doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text(page.heading, MARGIN, 72, { lineBreak: false });
      page.lines.forEach((line, j) => {
        // One line each, never wrapped, so a cited figure is one run of
        // text a reader (and the test) finds whole.
        doc.font("Helvetica").fontSize(11).fillColor("#222222").text(line, MARGIN, 120 + j * 22, { lineBreak: false });
      });
    }

    // The foot: the stamp again, and the page.
    doc.font("Helvetica-Bold").fontSize(8).fillColor(STAMP_RED).text(SAMPLE_OM_STAMP, MARGIN, H - 40, { lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#555555")
      .text(`Page ${n} of ${pages.length}`, W - MARGIN - 60, H - 40, { lineBreak: false });
  });
  doc.end();
  await done;
  return Buffer.concat(chunks);
}
