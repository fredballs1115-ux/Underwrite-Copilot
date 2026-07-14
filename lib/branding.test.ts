import { describe, it, expect } from "vitest";
import { sanitizeBranding, isEmptyBranding, FIRM_NAME_MAX, FOOTER_TEXT_MAX } from "./branding";

describe("sanitizeBranding", () => {
  it("trims and keeps real values", () => {
    expect(
      sanitizeBranding({ firmName: "  Sterling Ridge Capital ", footerText: " Confidential " }),
    ).toEqual({ firmName: "Sterling Ridge Capital", footerText: "Confidential" });
  });
  it("caps lengths at 50 / 200", () => {
    const b = sanitizeBranding({
      firmName: "x".repeat(80),
      footerText: "y".repeat(300),
    })!;
    expect(b.firmName).toHaveLength(FIRM_NAME_MAX);
    expect(b.footerText).toHaveLength(FOOTER_TEXT_MAX);
  });
  it("whitespace-only and empty objects become null", () => {
    expect(sanitizeBranding({ firmName: "   ", footerText: "" })).toBeNull();
    expect(sanitizeBranding({})).toBeNull();
    expect(sanitizeBranding(null)).toBeNull();
    expect(sanitizeBranding("junk")).toBeNull();
  });
  it("keeps the logo path verbatim (a storage key, not display text)", () => {
    expect(sanitizeBranding({ logoPath: "branding/u1/logo-abc.png" })).toEqual({
      logoPath: "branding/u1/logo-abc.png",
    });
  });
});

describe("isEmptyBranding", () => {
  it("null / blank-only is empty; any real field is not", () => {
    expect(isEmptyBranding(null)).toBe(true);
    expect(isEmptyBranding({ firmName: " " })).toBe(true);
    expect(isEmptyBranding({ footerText: "x" })).toBe(false);
  });
});
