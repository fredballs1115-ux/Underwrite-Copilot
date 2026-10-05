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

describe("a blank required field is named, never read as zero", () => {
  // A card that cannot answer without a field answers nothing and says
  // which (lib/tools/blanks). No figure is left in the card's text: none of
  // these cards writes a dollar in its fixed copy.
  const noAnswer = (text: string) => expect(text).not.toMatch(/\$\d/);

  it("the sale-leaseback", async () => {
    const text = textOf(await fromLink("?slbe="), "sale-leaseback");
    expect(text).toContain("Fill in the escalation — a blank is not read as zero.");
    noAnswer(text);
    expect(textOf(await fromLink("?lbsf=&slbt="), "sale-leaseback")).toContain(
      "Fill in the building's size and the term — a blank is not read as zero.",
    );
    // A lender test set sizes a loan, which needs its rate…
    expect(textOf(await fromLink("?lbr="), "sale-leaseback")).toContain(
      "Fill in the mortgage rate — a blank is not read as zero.",
    );
    // …and with every test blank there is no loan, so no rate is asked for.
    const noLoan = textOf(await fromLink("?slbl=&slbc=&slby=&lbr=&lba="), "sale-leaseback");
    expect(noLoan).not.toContain("Fill in");
    expect(noLoan).toContain("$27,000,000");
    // A blank discount rate is the market cap, the module's stated default,
    // and a typed 0 escalation is a flat lease: both answer.
    expect(textOf(await fromLink("?slbd="), "sale-leaseback")).not.toContain("Fill in");
    expect(textOf(await fromLink("?slbe=0"), "sale-leaseback")).toContain("$27,000,000");
  });

  it("insurance", async () => {
    const text = textOf(await fromLink("?insp="), "insurance");
    expect(text).toContain("Fill in the memorandum's premium — a blank is not read as zero.");
    expect(text).not.toContain("Enter the premium the memorandum states");
    // The quote's own bar is the figure typed, not an answer: nothing is
    // derived from it — no cap, no gap, no price.
    expect(text).not.toContain("bps");
    expect(text).not.toMatch(/\d\.\d\d%/);
    // A blank NOI leaves the cap out and answers the rest.
    const noNoi = textOf(await fromLink("?insn="), "insurance");
    expect(noNoi).not.toContain("Fill in");
    expect(noNoi).toContain("$3,250"); // the quote a unit
  });

  it("the lease-up", async () => {
    const text = textOf(await fromLink("?luop="), "lease-up");
    expect(text).toContain("Fill in the operating cost — a blank is not read as zero.");
    noAnswer(text);
    expect(textOf(await fromLink("?lufr=&luti="), "lease-up")).toContain(
      "Fill in the free rent and the allowance — a blank is not read as zero.",
    );
    // A blank pre-leasing is the empty building the card is named for, and
    // a blank debt service the unlevered case: both answer.
    const empty = textOf(await fromLink("?lupre="), "lease-up");
    expect(empty).not.toContain("Fill in");
    expect(empty).toMatch(/Worst month needs/);
    expect(empty).toMatch(/\$\d/);
  });

  it("economic occupancy", async () => {
    // A blank occupancy read as -1 and was told "0 to 100".
    const text = textOf(await fromLink("?eoO="), "economic-occupancy");
    expect(text).toContain("Fill in the occupancy — a blank is not read as zero.");
    expect(text).not.toContain("0 to 100");
    noAnswer(text);
    // An unstated deduction is absent, not nil: the bridge draws no line.
    expect(textOf(await fromLink(""), "economic-occupancy")).toMatch(/Loss to lease \$[\d,]+/);
    const noLtl = textOf(await fromLink("?eoL="), "economic-occupancy");
    expect(noLtl).not.toContain("Fill in");
    expect(noLtl).not.toMatch(/Loss to lease \$/);
    expect(noLtl).toMatch(/Effective gross income \$[\d,]+/);
  });

  it("below the line", async () => {
    // A blank NOI was read as zero: "NOI as stated $0", a cap on the cover
    // of 0.00%, and an owner's NOI below zero.
    const text = textOf(await fromLink("?blN="), "below-the-line");
    expect(text).toContain("Fill in the NOI as stated — a blank is not read as zero.");
    noAnswer(text);
    expect(textOf(await fromLink("?blO="), "below-the-line")).toContain(
      "Fill in the share that rolls a year — a blank is not read as zero.",
    );
    expect(textOf(await fromLink("?blA="), "below-the-line")).toContain(
      "Fill in the new TI — a blank is not read as zero.",
    );
    // Nothing rolls, so what re-leasing costs is not asked for…
    const noRoll = textOf(await fromLink("?blO=0&blA=&blB=&blC=&blD="), "below-the-line");
    expect(noRoll).not.toContain("Fill in");
    expect(noRoll).toContain("Replacement reserve");
    // …and a blank price leaves the caps out, and asks for it.
    expect(textOf(await fromLink("?blP="), "below-the-line")).toContain(
      "Enter a price to see what it is worth.",
    );
  });

  it("and no seeded card opens asking for a field", async () => {
    expect(visibleText(await fromLink(""))).not.toContain("a blank is not read as zero");
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
