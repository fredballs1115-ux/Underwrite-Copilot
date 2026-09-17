// The public changelog folds a long note behind its opening; the opening
// must be whole sentences, never a mid-word cut, and a short note must come
// back untouched.
import { describe, expect, it } from "vitest";
import { LONG_NOTE, blurbExcerpt, changelogEntries } from "./changelog";
import { TOOL_INDEX } from "./tools/catalog";

describe("blurbExcerpt — a note's opening, in whole sentences", () => {
  it("returns a short note whole", () => {
    const s = "Analytics counts a plan deal's yield on cost, never a cap.";
    expect(blurbExcerpt(s)).toBe(s);
    expect(blurbExcerpt("  padded  ")).toBe("padded");
  });

  it("ends a long note at a sentence boundary inside the window, with an ellipsis", () => {
    const first = "The deal page had learned to read a conversion as a plan rather than a stabilized building.";
    const second = " Three surfaces that add deals up or hand them to someone else had not.";
    const rest = " Analytics counted a conversion's stabilized cap as a going-in cap, so one plan deal could drag the portfolio's median, and the export followed it.";
    const out = blurbExcerpt(first + second + rest, 200);
    expect(out).toBe(first + second + " …");
    expect(out.length).toBeLessThanOrEqual(205);
  });

  it("breaks at a word when no sentence ends in the back half of the window", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const out = blurbExcerpt(words, 100);
    expect(out.endsWith(" …")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(103);
    expect(/word\d+ …$/.test(out)).toBe(true);
  });

  it("never leaves a dangling comma or dash before the ellipsis", () => {
    const s = "Alpha beta gamma delta epsilon zeta, eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega alpha beta gamma";
    const out = blurbExcerpt(s, 40);
    expect(/[,;:—–-] …$/.test(out)).toBe(false);
  });

  it("the shipped log's longest note folds and its opening reads", () => {
    const longest = changelogEntries(100).reduce((a, b) => (b.blurb.length > a.blurb.length ? b : a));
    expect(longest.blurb.length).toBeGreaterThan(LONG_NOTE);
    const out = blurbExcerpt(longest.blurb);
    expect(out.length).toBeLessThan(longest.blurb.length);
    expect(out.endsWith("…")).toBe(true);
    expect(longest.blurb.startsWith(out.slice(0, 40))).toBe(true);
  });
});

/**
 * Where a note points.
 *
 * Two surfaces link these — the pipeline's What's-new card and the
 * homepage footer's latest-improvement stamp — and a fragment that names
 * no element does not fail anywhere: the browser simply leaves the reader
 * at the top of the page, reading the wrong card. This round nearly
 * shipped `/tools#loan-schedule`, which is what the card is called and
 * not what its id is (`the-loan-over-the-hold`).
 *
 * The ids are data in `lib/tools/catalog.ts`, which the page's cards and
 * its jump index both render from, so checking against it checks against
 * what is really on the page.
 */
describe("a note's link", () => {
  const entries = changelogEntries(100);

  it("is a path on this site, never bare or external", () => {
    for (const e of entries) {
      if (!e.href) continue;
      expect(e.href.startsWith("/"), `${e.title}: ${e.href}`).toBe(true);
    }
  });

  it("names a card that exists when it points into /tools", () => {
    const ids = new Set(TOOL_INDEX.map((t) => t.id));
    const pointed = entries.filter((e) => e.href?.startsWith("/tools#"));
    // If this ever drops to zero the check has stopped checking anything.
    expect(pointed.length, "no /tools anchors left to verify").toBeGreaterThan(0);
    for (const e of pointed) {
      const id = e.href!.slice("/tools#".length);
      expect(ids.has(id), `${e.title} points at #${id}, which no card carries`).toBe(true);
    }
  });
});

/**
 * The other direction, which is the one that actually went wrong.
 *
 * The link check above can only catch a note pointing at a card that is
 * not there. It cannot catch the opposite — a card shipped with no note —
 * and that is the failure that happened twice in a row: two new
 * calculators went live while `/whats-new` and the homepage's latest
 * stamp still ended at the round before them. A changelog that silently
 * stops is worse than no changelog, because the page keeps insisting the
 * newest thing is the newest thing.
 */
describe("a card's note", () => {
  /**
   * The cards that shipped before `/whats-new` carried a note per card —
   * they arrived in batch rounds that got one note between them.
   *
   * FROZEN. A new card never joins this list; that is the entire point of
   * it. Adding an id here to make the test pass defeats the guard rather
   * than satisfying it — write the changelog entry instead.
   */
  const BEFORE_THE_CONVENTION = new Set([
    "size-the-loan",
    "cash-flow-strip",
    "sources-and-uses",
    "unit-mix",
    "the-site",
    "residual-land",
    "the-waterfall",
    "net-effective-rent",
    "rentable-vs-usable",
    "after-tax",
    "cap-rate-triangle",
    "rent-converter",
    "operating-expense",
    "build-or-buy",
  ]);

  const noted = new Set(
    changelogEntries(100)
      .filter((e) => e.href?.startsWith("/tools#"))
      .map((e) => e.href!.slice("/tools#".length)),
  );

  it("exists for every card added since the changelog started naming them", () => {
    const missing = TOOL_INDEX.filter(
      (t) => !BEFORE_THE_CONVENTION.has(t.id) && !noted.has(t.id),
    ).map((t) => t.id);
    expect(
      missing,
      "these cards are live with nothing on /whats-new saying so — write the note, " +
        "do not widen BEFORE_THE_CONVENTION",
    ).toEqual([]);
  });

  it("keeps the frozen list honest", () => {
    // Every id on it must still be a real card, so the list cannot rot
    // into a set of names that excuse nothing.
    const ids = new Set(TOOL_INDEX.map((t) => t.id));
    for (const id of BEFORE_THE_CONVENTION) {
      expect(ids.has(id), `${id} is on the frozen list but is not a card`).toBe(true);
    }
    // And it never GROWS. That is the only property that matters here —
    // the list is a majority of the page today and will shrink as a
    // share of it, but one more entry means a card shipped silently and
    // the guard was widened to let it. Pinning the count is what makes
    // that a failing test rather than a one-line diff nobody questions.
    expect(
      BEFORE_THE_CONVENTION.size,
      "the frozen list grew — a new card needs a changelog note, not an exemption",
    ).toBe(14);
  });
});
