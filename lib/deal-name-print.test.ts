// A deal's name the PDFs' font cannot print (research pass 42, M5). Standard
// Helvetica prints WinAnsi alone and `pdfSafe` drops the rest, so "東京ベイ・
// レジデンス 2" printed as the title "2", the PDF's own title " 2 —
// Screening Memo" and the report's running header "2 — full screening
// report"; "برج الخليج 12" printed "12". Two deals named in Japanese printed as
// "2" and "3": a committee could take one memo for another.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NAME_NOT_PRINTABLE, printableName } from "./memo/pdf-text";
import { MemoDocument, buildMemoData } from "./memo/memo-document";
import { buildReportData, renderReportPdf } from "./memo/report-document";
import { pdfPageTextsOf } from "./memo/pdf-text-of";
import { SAMPLE_DEAL } from "./sample-deal";
import type { DealRow } from "./deals";

const CJK = "東京ベイ・レジデンス 2";
const ARABIC = "برج الخليج 12";
const EMOJI = "🏢 Harbor Point Tower 🚀";
const COMBINING = "Cafe" + "́" + " Re" + "́" + "sidences";
const ADDRESS = "1200 N 31st St, Philadelphia, PA 19121";
const MARKET = (SAMPLE_DEAL.extraction as { market?: string }).market ?? "";

describe("printableName", () => {
  it("says a name the font cannot print as one, with the address, else the market", () => {
    expect(printableName(CJK, [ADDRESS, MARKET])).toBe(`${NAME_NOT_PRINTABLE} · ${ADDRESS}`);
    expect(printableName(ARABIC, [null, MARKET])).toBe(`${NAME_NOT_PRINTABLE} · ${MARKET}`);
    // An address the font cannot print either is passed over for the market.
    expect(printableName(CJK, ["東京都港区芝浦1-2-3", "Tokyo, Japan"])).toBe(`${NAME_NOT_PRINTABLE} · Tokyo, Japan`);
    expect(printableName(CJK, [])).toBe(NAME_NOT_PRINTABLE);
    // never a figure left over from the name
    expect(printableName(CJK, [ADDRESS])).not.toMatch(/^\s*2\s*$/);
  });

  it("prints a name the font can print — an emoji dropped, an accent composed", () => {
    expect(printableName(EMOJI, [ADDRESS])).toBe("Harbor Point Tower");
    expect(printableName(COMBINING, [ADDRESS])).toBe("Café Résidences");
    expect(printableName("The Maddox at Brewerytown", [ADDRESS])).toBe("The Maddox at Brewerytown");
    expect(printableName("🏢🚀", [ADDRESS])).toBe("Deal");
    expect(printableName(null)).toBe("Deal");
  });

  it("prints a name whose only symbols have stand-ins, the stand-in's letters no loss (audit C5, LOW-4)", () => {
    expect(printableName("Tower ↑ Redevelopment", [ADDRESS])).toBe("Tower up Redevelopment");
    expect(printableName("Main St → Annex", [ADDRESS])).toBe("Main St -> Annex");
    expect(printableName("Rents ≥ $2k Portfolio", [ADDRESS])).toBe("Rents >= $2k Portfolio");
    // A letter the font lacks is still a loss.
    expect(printableName("Łódź Logistics Park ↑", [ADDRESS])).toBe(`${NAME_NOT_PRINTABLE} · ${ADDRESS}`);
  });
});

/** The PDF's Title, decoded: pdfkit writes it as an indirect object holding
 *  a literal string, UTF-16BE behind a byte-order mark. */
function pdfTitleOf(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const ref = /\/Title (\d+) 0 R/.exec(raw);
  if (!ref) return "(none)";
  const obj = new RegExp(`\\n${ref[1]} 0 obj\\s*\\(`).exec(raw);
  if (!obj) return "(none)";
  const bytes: number[] = [];
  for (let i = obj.index + obj[0].length; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0x29) break; // the closing paren (an escaped one is read below)
    if (c === 0x5c) {
      const n = raw[++i];
      const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (n in esc) bytes.push(esc[n]);
      else if (/[0-7]/.test(n)) {
        let oct = n;
        while (oct.length < 3 && /[0-7]/.test(raw[i + 1])) oct += raw[++i];
        bytes.push(parseInt(oct, 8));
      }
      continue;
    }
    bytes.push(c);
  }
  const b = Buffer.from(bytes);
  if (b[0] === 0xfe && b[1] === 0xff) {
    const sw = Buffer.alloc(b.length - 2);
    for (let i = 2; i + 1 < b.length; i += 2) {
      sw[i - 2] = b[i + 1];
      sw[i - 1] = b[i];
    }
    return sw.toString("utf16le");
  }
  return b.toString("latin1");
}

const dealNamed = (name: string, address: string | null) =>
  ({
    name,
    address: address ? { label: address, street: "1200 N 31st St", city: "Philadelphia", state: "PA" } : null,
    asset_class: SAMPLE_DEAL.asset_class,
    extraction: SAMPLE_DEAL.extraction,
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    market: SAMPLE_DEAL.market,
    reconciliation: SAMPLE_DEAL.reconciliation,
    verdict: SAMPLE_DEAL.verdict,
    prior_screen: null,
  }) as unknown as DealRow;

describe("the memo and the report print what the font can", () => {
  it("titles the memo, and the PDF's own title, with the words and the address — never \"2\"", async () => {
    for (const [name, place] of [
      [CJK, ADDRESS],
      [ARABIC, ADDRESS],
    ] as const) {
      const data = buildMemoData(dealNamed(name, place), "October 5, 2026", []);
      const expected = `${NAME_NOT_PRINTABLE} · ${place}`;
      expect(data.name).toBe(expected);
      const buf = await renderToBuffer(React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0]);
      const page1 = (pdfPageTextsOf(buf)[0] ?? "").replace(/\s+/g, " ");
      expect(page1).toContain("Deal (name not printable in this PDF's font)");
      expect(page1).not.toMatch(/October 5, 2026 (· Screened \w+ \d+, \d+ )?(12|2) Caution/);
      expect(pdfTitleOf(buf)).toBe(`${expected} — Screening Memo`);
    }
    // An emoji is no letter: the name prints without it.
    const emoji = buildMemoData(dealNamed(EMOJI, ADDRESS), "October 5, 2026", []);
    expect(emoji.name).toBe("Harbor Point Tower");
  }, 180_000);

  it("heads every report page, and titles the report, with the same words — the market where no address is on file", async () => {
    const input = buildReportData(dealNamed(CJK, null), "October 5, 2026", [], null);
    const expected = `${NAME_NOT_PRINTABLE} · ${MARKET}`;
    const buf = await renderReportPdf(input);
    const second = (pdfPageTextsOf(buf)[1] ?? "").replace(/\s+/g, " ");
    expect(second).toContain(`${expected} — full screening report`);
    expect(pdfTitleOf(buf)).toBe(`${expected} — Full Screening Report`);
  }, 300_000);
});
