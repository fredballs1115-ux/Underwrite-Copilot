import { describe, it, expect } from "vitest";
import { pdfSafe } from "./pdf-text";

describe("pdfSafe — WinAnsi-only text for the built-in Helvetica", () => {
  it("keeps plain text and Latin-1 verbatim", () => {
    expect(pdfSafe("Sterling Ridge Capital — 5.25% cap, $24.5M")).toBe(
      "Sterling Ridge Capital — 5.25% cap, $24.5M",
    );
    expect(pdfSafe("café £100 ±5 ©®")).toBe("café £100 ±5 ©®");
  });

  it("keeps the cp1252 extras (curly quotes, €, ™, bullets, dashes, the single angle quote)", () => {
    expect(pdfSafe("“smart” ‘quotes’ • €1M … ™ ›")).toBe(
      "“smart” ‘quotes’ • €1M … ™ ›",
    );
  });

  it("maps minus and en dash to a hyphen", () => {
    expect(pdfSafe("−5.2% and 2019–2024")).toBe("-5.2% and 2019-2024");
  });

  it("says a comparison, a direction and an arrow in text that reads right, never drops them", () => {
    // "NOI ↓ 4%" once printed as "NOI  4%": the direction was the claim.
    expect(pdfSafe("NOI ↓ 4% if taxes reset, ↑ 2% if not")).toBe("NOI down 4% if taxes reset, up 2% if not");
    expect(pdfSafe("DSCR ≥ 1.25x; LTV ≤ 65%; ≈$1.2M PIP")).toBe("DSCR >= 1.25x; LTV <= 65%; ~$1.2M PIP");
    expect(pdfSafe("Caution → Go; Go ← Caution")).toBe("Caution -> Go; Go <- Caution");
    // A symbol set against a word or a figure is spaced from it.
    expect(pdfSafe("NOI↓4%, IRR↑")).toBe("NOI down 4%, IRR up");
    // The non-breaking hyphen of "5‑year" and a narrow space in "1 000".
    expect(pdfSafe("5‑year hold; 1 000 units; 12 months")).toBe("5-year hold; 1 000 units; 12 months");
  });

  it("drops glyphs Helvetica cannot encode, and has no stand-in for, instead of mis-rendering them", () => {
    expect(pdfSafe("株式会社 Capital")).toBe(" Capital");
    expect(pdfSafe("Deal \u{1f680} rocket")).toBe("Deal  rocket");
    // Nothing a stand-in writes is outside WinAnsi.
    for (const ch of ["≥", "≤", "≈", "↑", "↓", "→", "←", "‑", "‐", " ", " "]) {
      expect(pdfSafe(`a ${ch} b`)).toMatch(/^[\n -~ -ÿ]*$/);
    }
  });

  it("keeps newlines", () => {
    expect(pdfSafe("line one\nline two")).toBe("line one\nline two");
  });
});
