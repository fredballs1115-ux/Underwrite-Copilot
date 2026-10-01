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
