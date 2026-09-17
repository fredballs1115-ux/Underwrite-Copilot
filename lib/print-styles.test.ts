import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The page on paper.
 *
 * Every picture on this site is a background colour, and browsers drop
 * background colours when printing unless the page asks them not to —
 * "Background graphics" is an unticked checkbox in Chrome's print dialog.
 * Without the rule in globals.css, the default print of `/tools` is
 * nineteen cards of empty grey tracks: measured at 1,995 bytes of dropped
 * backgrounds in a Letter PDF, against zero with it.
 *
 * The measurement itself needs a real Chromium and is run by hand
 * (scratchpad, `page.pdf({printBackground:false})` against `true`). What
 * is checkable in CI is cheaper and still catches the way this breaks:
 * someone reformats globals.css and the rule goes, or someone adds a
 * photograph or a chrome element that has no print behaviour. So this
 * scans the source, the way `lib/a11y-source.test.ts` does for control
 * names.
 */

const read = (p: string) => readFileSync(p, "utf8");

describe("the print stylesheet", () => {
  const css = read("app/globals.css");

  it("asks the browser to print the colours the pictures are made of", () => {
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/print-color-adjust:\s*exact/);
    // The -webkit- prefix is still what Safari and older Chrome read.
    expect(css).toMatch(/-webkit-print-color-adjust:\s*exact/);
  });

  it("applies it page-wide, not to the bars alone", () => {
    // Targeting [data-bar] recovered just over half the dropped bytes: the
    // tracks, the legend swatches and the card fills are backgrounds too.
    const block = css.slice(css.indexOf("@media print"));
    expect(block).toMatch(/\*,\s*\n?\s*\*::before,\s*\n?\s*\*::after/);
  });

  it("keeps the measurement beside the rule", () => {
    // A rule whose reason is not written down is a rule someone deletes.
    expect(css).toContain("rule undone");
    expect(css).toContain("rule shipped");
  });
});

describe("what paper does not want", () => {
  it("leaves the photograph off the page", () => {
    // A full-bleed aerial is a page of ink for no information. The band it
    // sits in keeps its dark scrim and its white words without it, so the
    // heading still reads.
    expect(read("app/aerial-img.tsx")).toContain("print:hidden");
  });

  it("leaves the site chrome off it too", () => {
    const shell = read("app/public-shell.tsx");
    expect(shell).toMatch(/<header className="[^"]*print:hidden/);
    expect(shell).toMatch(/<footer className="[^"]*print:hidden/);
  });

  it("never splits a card between two sheets", () => {
    // The bar and the figure it belongs to would land on different pages,
    // which is worse than a short one.
    const tools = read("app/tools/deal-math-tools.tsx");
    expect(tools).toContain("print:break-inside-avoid");
    // The jump index and the copy button are screen affordances: a printed
    // list of links that cannot be clicked is noise.
    expect(tools).toMatch(/aria-label="The calculators on this page"[^>]*print:hidden/);
  });
});
