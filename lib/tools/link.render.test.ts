import { describe, expect, it, vi } from "vitest";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";

/**
 * /tools as a browser draws it after reading a link.
 *
 * The render tests in lib/views.render.test.ts draw the page on the server,
 * which has no URL: `useSyncExternalStore` hands every field its seed, so a
 * card is only ever seen on its seeded figures — never with a field left
 * blank, a figure past the longest a card runs, or a lease worth less than
 * nothing. A link carries all three, and so does a reader typing. Here the
 * store hands the render its CLIENT snapshot — the one the browser renders
 * after hydration — and a `window` whose address carries the link, so the
 * page reads its fields the way it does in a browser.
 *
 * Each render reloads the page's module, because the page keeps the fields
 * it has read in a module-level map and would otherwise answer the second
 * link with the first one's figures.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: <T,>(_subscribe: unknown, getSnapshot: () => T): T => getSnapshot(),
  };
});

async function fromLink(query: string): Promise<string> {
  vi.resetModules();
  (globalThis as { window?: unknown }).window = {
    location: { search: query, pathname: "/tools" },
    history: { replaceState: () => {} },
  };
  try {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DealMathTools } = await import("@/app/tools/deal-math-tools");
    return renderToStaticMarkup(React.createElement(DealMathTools));
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

/** One card's markup: from its section to the next card's. */
function card(html: string, id: string): string {
  const at = html.indexOf(`<section id="${id}"`);
  if (at < 0) throw new Error(`no card #${id} on the page`);
  const end = html.indexOf("<section", at + 1);
  return html.slice(at, end < 0 ? undefined : end);
}

/** A card's visible text on one line: the lint breaks lines between elements. */
const textOf = (html: string, id: string) => visibleText(card(html, id)).replace(/\s+/g, " ");

describe("the harness reads a link the way the browser does", () => {
  it("draws a field from the link, and the seed where the link is silent", async () => {
    const html = await fromLink("?gln=9000000");
    expect(card(html, "ground-lease")).toContain('value="9000000"');
    expect(card(html, "ground-lease")).toContain('value="2,000,000"'); // the seeded rent
    expect(a11yIssues(html)).toEqual([]);
  });
});

describe("a ground lease worth less than nothing", () => {
  it("says the income does not cover the rent, with the figure, and no share past 100%", async () => {
    // A $2.1M NOI under the seed's $2M rent and its year-16 reset to $3.6M.
    // The card read "it is worth $-111,559 — -75.9% of that figure is a
    // reversion the fee owner keeps, and 181.5% is the rent reset".
    const html = await fromLink("?gln=2100000");
    const text = textOf(html, "ground-lease");
    expect(text).toContain(
      "the building's income does not cover the ground rent: the term's cash flows come to " +
        "−$111,559, so the leasehold is worth nothing.",
    );
    expect(text).toContain("Leasehold, over the term");
    expect(text).not.toContain("of that figure");
    expect(text).not.toContain("$-");
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("a figure run to the longest its card runs, said on the card", () => {
  it("the loan's term, held at forty years", async () => {
    const html = await fromLink("?dt=99");
    const text = textOf(html, "the-loan-over-the-hold");
    expect(text).toContain("Term read as 40 years, the longest this card runs.");
    expect(text).toContain("Balloon, year 40");
    // Rounded the way the schedule rounds it: 40.3 years is the 40 typed.
    expect(textOf(await fromLink("?dt=40.3"), "the-loan-over-the-hold")).not.toContain(
      "the longest this card runs",
    );
  });

  it("the rollover's hold, held at fifteen years", async () => {
    const text = textOf(await fromLink("?rrh=40"), "rollover");
    expect(text).toContain("Hold read as 15 years, the longest this card runs.");
    expect(text).toContain("Year 15");
    expect(text).not.toContain("Year 16");
  });

  it("the leaseback's term, held at fifty years", async () => {
    const text = textOf(await fromLink("?slbt=80"), "sale-leaseback");
    expect(text).toContain("Term read as 50 years, the longest this card runs.");
    expect(text).toContain("The rent reverts at year 50");
  });

  it("the lease-up's sixty months, where an answer falls past them", async () => {
    // At 1,500 feet a month it fills in month 58, so the free rent runs
    // past the end, and so does the cash coming back: two dashes, said.
    const slow = textOf(await fromLink("?lupa=1500"), "lease-up");
    expect(slow).toContain("Paid in full at");
    expect(slow).toContain(
      "Run to 60 months, the longest this card runs: by then it is not paid in full, nor is the cash back.",
    );
    // Debt service the stabilized building carries: full on time, the cash
    // back after the end.
    expect(textOf(await fromLink("?luds=150000"), "lease-up")).toContain(
      "Run to 60 months, the longest this card runs: the cash is not back by then.",
    );
    // Debt service it does not carry: still going out in the last month.
    expect(textOf(await fromLink("?luds=300000"), "lease-up")).toContain(
      "Run to 60 months, the longest this card runs: the cash is still going out at the end, so the worst month may come later.",
    );
    expect(textOf(await fromLink("?lupa=1500&luds=300000"), "lease-up")).toContain(
      "by then it is not paid in full and the cash is still going out, so the worst month may come later.",
    );
  });

  it("and nothing where the seed runs within every bound", async () => {
    // The seeded lease-up is paid in full at month 28 and its cash is back
    // at 53; no seeded figure is held.
    expect(visibleText(await fromLink(""))).not.toContain("the longest this card runs");
  });
});

describe("a negative written by the page, through the shared writer", () => {
  it("says a negative break-even hard cost as no cost penciling, never as one that does", async () => {
    // Land dear enough that free construction would not work: the solved
    // hard cost is below zero. It printed "pencils at a hard cost of $-…".
    const html = await fromLink("?feland=60000000");
    const text = textOf(html, "feasibility-rent");
    expect(text).toContain("The gap does not close from the cost side");
    expect(text).toMatch(/break-even hard cost is −\$[\d,]+\.\d\d a foot/);
    expect(text).toContain("free construction would not make the site work");
    expect(text).not.toContain("already pencils");
    expect(text).not.toContain("$-");
    expect(gluedWords(text)).toEqual([]);
  });

  it("says how far apart the two hotel levers are as a size, whichever wins", async () => {
    // Ancillary spend past the crossing: occupancy wins, and the gap (rate
    // less occupancy) is negative. "Apart" is a size.
    const html = await fromLink("?htor=60");
    const text = textOf(html, "hotel-revpar");
    expect(text).toContain("All rate $3.53M All occupancy $3.61M");
    // It printed "-$80,789 a year apart".
    expect(text).toContain("$80,789 a year apart");
    expect(text).not.toMatch(/[−-]\$[\d,]+ a year apart/);
  });
});
