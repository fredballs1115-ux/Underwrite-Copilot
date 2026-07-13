import { describe, it, expect } from "vitest";
import { pdfSafe } from "./pdf-text";

describe("pdfSafe — WinAnsi-only text for the built-in Helvetica", () => {
  it("keeps plain text and Latin-1 verbatim", () => {
    expect(pdfSafe("Sterling Ridge Capital — 5.25% cap, $24.5M")).toBe(
      "Sterling Ridge Capital — 5.25% cap, $24.5M",
    );
    expect(pdfSafe("café £100 ±5 ©®")).toBe("café £100 ±5 ©®");
  });

  it("keeps the cp1252 extras (curly quotes, €, ™, bullets, dashes)", () => {
    expect(pdfSafe("“smart” ‘quotes’ • €1M … ™")).toBe(
      "“smart” ‘quotes’ • €1M … ™",
    );
  });

  it("maps arrow and minus/en-dash to safe stand-ins", () => {
    expect(pdfSafe("Go → verdict")).toBe("Go › verdict");
    expect(pdfSafe("−5.2% and 2019–2024")).toBe("-5.2% and 2019-2024");
  });

  it("drops glyphs Helvetica cannot encode instead of mis-rendering them", () => {
    // ↑/↓ previously printed as stray curly quotes.
    expect(pdfSafe("IRR ↑ 4pt ↓")).toBe("IRR  4pt ");
    expect(pdfSafe("株式会社 Capital")).toBe(" Capital");
    expect(pdfSafe("Deal \u{1f680} rocket")).toBe("Deal  rocket");
  });

  it("keeps newlines", () => {
    expect(pdfSafe("line one\nline two")).toBe("line one\nline two");
  });
});
