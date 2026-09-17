import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_COUNT, TOOL_INDEX } from "./catalog";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty-one",
  "twenty-two",
  "twenty-three",
  "twenty-four",
  "twenty-five",
  "twenty-six",
  "twenty-seven",
  "twenty-eight",
  "twenty-nine",
  "thirty",
  "thirty-one",
  "thirty-two",
  "thirty-three",
  "thirty-four",
  "thirty-five",
];

// Longest first, so the alternation cannot match "twenty" inside
// "twenty-one" and then fail the whole pattern on the hyphen.
const BY_LENGTH = [...WORDS].sort((a, b) => b.length - a.length);

describe("the /tools catalog", () => {
  it("has a unique anchor per card", () => {
    const ids = TOOL_INDEX.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every card a label short enough to sit in a chip", () => {
    for (const t of TOOL_INDEX) {
      expect(t.label.length, t.id).toBeGreaterThan(0);
      expect(t.label.length, t.id).toBeLessThanOrEqual(20);
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("the page that renders the cards reads this list", () => {
    // Not a copy of it. A second list would be a second source of truth,
    // which is exactly how the homepage came to advertise four calculators
    // on a page that had eleven.
    const src = read("app/tools/deal-math-tools.tsx");
    expect(src).toContain('from "@/lib/tools/catalog"');
    expect(src).toContain("const INDEX = TOOL_INDEX");
  });

  it("the homepage reads it too", () => {
    const src = read("app/page.tsx");
    expect(src).toContain('from "@/lib/tools/catalog"');
    expect(src).toContain("TOOL_INDEX.map");
  });

  it("the page's own description names the count it actually serves", () => {
    // The description is prose with the number spelled out, so it cannot
    // render from the constant — but it can be held to it. This is the
    // exact claim that went stale twice in one evening.
    const src = read("app/tools/page.tsx");
    const word = WORDS[TOOL_COUNT];
    expect(word, `no word for ${TOOL_COUNT}`).toBeDefined();
    const said = src.match(new RegExp(`\\b(${BY_LENGTH.join("|")}) calculators\\b`, "i"));
    expect(said, "the description should say how many calculators there are").not.toBeNull();
    expect(said![1].toLowerCase()).toBe(word);
  });
});

/**
 * Every card's bars are marked `data-bar="…"` so a render test can count
 * them, and that namespace is FLAT across twenty-six cards in one file.
 * Two cards reaching for the same obvious word is not a hypothetical: it
 * has happened twice, `stack` between sources-and-uses and the capital
 * stack, and `exit` between the exit-cap solve and the prepayment card.
 *
 * Both times the collision surfaced as a render test counting six where
 * it wanted two — which is a fine way to find out, but only works where
 * a count assertion already exists. A card whose bars nobody counts
 * would collide silently and quietly inflate somebody else's total.
 *
 * So the check runs at the source: split the file at its card functions
 * and hold each marker to one of them.
 */
describe("the cards' bar markers", () => {
  const src = read("app/tools/deal-math-tools.tsx");
  // Each card is a top-level `function Name() {` in this file; the text
  // from one to the next is that card.
  const starts = [...src.matchAll(/^function ([A-Z]\w*)\(/gm)].map((m) => ({
    name: m[1],
    at: m.index!,
  }));

  const owners = new Map<string, string[]>();
  starts.forEach((card, i) => {
    const body = src.slice(card.at, starts[i + 1]?.at ?? src.length);
    for (const m of body.matchAll(/data-bar="([^"]+)"/g)) {
      const list = owners.get(m[1]) ?? [];
      if (!list.includes(card.name)) list.push(card.name);
      owners.set(m[1], list);
    }
  });

  it("finds the cards and their bars at all", () => {
    // Without this the loop above could quietly match nothing and the
    // collision check would pass on an empty map forever.
    expect(starts.length, "no card functions found").toBeGreaterThan(20);
    expect(owners.size, "no data-bar markers found").toBeGreaterThan(10);
  });

  it("gives each marker to exactly one card", () => {
    const shared = [...owners.entries()]
      .filter(([, cards]) => cards.length > 1)
      .map(([bar, cards]) => `${bar}: ${cards.join(" and ")}`);
    expect(
      shared,
      "two cards are using one data-bar name, so their render counts add together",
    ).toEqual([]);
  });
});
