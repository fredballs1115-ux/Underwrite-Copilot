// Research pass 38, C28: /tools' "Size the loan" card printed a loan over
// the price and a negative "Equity" with nothing beside them, where the
// reader typed a loan-to-value over 100% or a coverage test under 1.00x.
// One line under the figures says why now. The page is drawn as a browser
// draws it after reading a link (lib/tools-link.render.test.ts' harness).
import { describe, expect, it, vi } from "vitest";
import { gluedWords, visibleText } from "@/lib/render-lint";
import { loanPastPriceLine, sizeLoan } from "@/lib/tools/deal-math";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: <T,>(_subscribe: unknown, getSnapshot: () => T): T => getSnapshot(),
  };
});

async function sizerFromLink(query: string): Promise<string> {
  vi.resetModules();
  (globalThis as { window?: unknown }).window = {
    location: { search: query, pathname: "/tools" },
    history: { replaceState: () => {} },
  };
  try {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DealMathTools } = await import("@/app/tools/deal-math-tools");
    const html = renderToStaticMarkup(React.createElement(DealMathTools));
    const at = html.indexOf('<section id="size-the-loan"');
    const end = html.indexOf("<section", at + 1);
    return visibleText(html.slice(at, end < 0 ? undefined : end)).replace(/\s+/g, " ");
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

const base = { price: 20_000_000, noi: 1_200_000, ratePct: 6.5, amortYears: 30, io: false, maxLtvPct: null, minDscr: null, minDebtYieldPct: null };

describe("a loan sized past the price says why (research pass 38, C28)", () => {
  it("names the test that lends past the building's value", () => {
    const ltv = { ...base, maxLtvPct: 120 };
    expect(loanPastPriceLine(ltv, sizeLoan(ltv))).toBe(
      "The loan is more than the price, so the equity reads as a negative cheque: a loan-to-value over 100% lends past the building's value.",
    );
    const dscr = { ...base, minDscr: 0.5 };
    expect(loanPastPriceLine(dscr, sizeLoan(dscr))).toBe(
      "The loan is more than the price, so the equity reads as a negative cheque: a debt service coverage under 1.00x lends past the building's value.",
    );
    const dy = { ...base, minDebtYieldPct: 3 };
    expect(loanPastPriceLine(dy, sizeLoan(dy))).toBe(
      "The loan is more than the price, so the equity reads as a negative cheque: the tests as set lend past the building's value.",
    );
    // Within the price, nothing.
    const fine = { ...base, maxLtvPct: 65, minDscr: 1.25 };
    expect(loanPastPriceLine(fine, sizeLoan(fine))).toBeNull();
  });

  it("draws the line on the card under the negative equity", async () => {
    const text = await sizerFromLink("?ltv=120&dscr=&dy=");
    expect(text).toContain("a loan-to-value over 100% lends past the building's value.");
    expect(gluedWords(text)).toEqual([]);
    const seeded = await sizerFromLink("");
    expect(seeded).not.toContain("more than the price");
  });
});
