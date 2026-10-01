/**
 * The upload's check (lib/pdf-open) on real files built by the report's own
 * PDF writer (lib/test-memorandum): a file that asks for a password to open
 * is refused, a "secured" one (owner password only) is not, a file past the
 * page limit is refused by pdfjs's own count, and anything unreadable is
 * "unknown" — never a refusal.
 */
import { describe, expect, it } from "vitest";
import { checkPdfOpens } from "./pdf-open";
import { MAX_OM_PAGES } from "./pdf";
import { testMemorandum } from "./test-memorandum";

describe("checkPdfOpens", () => {
  it("opens a plain memorandum and counts its pages", async () => {
    const pdf = await testMemorandum([{ text: "Offering memorandum" }, { text: "Financials" }]);
    expect(await checkPdfOpens(Buffer.from(pdf))).toEqual({ verdict: "ok", pages: 2 });
  });

  it("refuses a file that asks for a password to open, and never a secured one that opens without asking", async () => {
    const locked = await testMemorandum([{ text: "Offering memorandum" }], "user-password");
    expect((await checkPdfOpens(Buffer.from(locked))).verdict).toBe("password");
    for (const security of ["rc4-128", "aes-128"] as const) {
      const secured = await testMemorandum([{ text: "Offering memorandum" }], security);
      expect(await checkPdfOpens(Buffer.from(secured)), security).toEqual({ verdict: "ok", pages: 1 });
    }
  });

  it("refuses a memorandum longer than the analysis reads in one pass, by pdfjs's own count", async () => {
    const pages = Array.from({ length: MAX_OM_PAGES + 1 }, (_, i) => ({ text: `Page ${i + 1}` }));
    const long = await testMemorandum(pages);
    expect(await checkPdfOpens(Buffer.from(long))).toEqual({ verdict: "too_long", pages: MAX_OM_PAGES + 1 });
  }, 60_000);

  it("calls anything it cannot read unknown, never a refusal", async () => {
    expect((await checkPdfOpens(Buffer.from("%PDF-1.7\nnot really a pdf"))).verdict).toBe("unknown");
    expect((await checkPdfOpens(Buffer.alloc(0))).verdict).toBe("unknown");
  });
});
