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
];

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
    const said = src.match(new RegExp(`\\b(${WORDS.join("|")}) calculators\\b`, "i"));
    expect(said, "the description should say how many calculators there are").not.toBeNull();
    expect(said![1].toLowerCase()).toBe(word);
  });
});
