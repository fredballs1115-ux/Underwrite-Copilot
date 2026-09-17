import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_COUNT } from "./tools/catalog";

/**
 * The operator list's own numbers, held to what they count.
 *
 * `WILL_TODO.md` is the document the operator actually reads, and it
 * states figures: how many calculations `/tools` answers, how many
 * tested modules are behind them, how many tests each of those has. Every
 * one of those went stale the moment a round shipped without touching the
 * paragraph — which is not hypothetical, it is what happened: the list
 * said "twenty-two calculations" one round after there were twenty-three,
 * and said "61 that render" while the file held 62.
 *
 * The prose cannot render from a constant, so it is held to one instead —
 * the same trick `catalog.test.ts` plays on the page's meta description,
 * for the same reason and after the same failure.
 *
 * The test counts are STATIC, counted by reading the test files rather
 * than running them, and that is exact here: the modules use plain
 * `it(...)` throughout, no `it.each`, no generated cases. A guard below
 * holds that assumption, because a single `it.each` would silently make
 * every count in this file wrong in the flattering direction.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "twenty-one",
  "twenty-two", "twenty-three", "twenty-four", "twenty-five", "twenty-six",
  "twenty-seven", "twenty-eight", "twenty-nine", "thirty", "thirty-one",
  "thirty-two", "thirty-three", "thirty-four", "thirty-five",
  "thirty-six", "thirty-seven", "thirty-eight", "thirty-nine", "forty",
  "forty-one", "forty-two", "forty-three", "forty-four", "forty-five", "forty-six", "forty-seven", "forty-eight", "forty-nine", "fifty",
];
// Longest first, so the alternation cannot match "twenty" inside
// "twenty-one" and then fail the whole pattern on the hyphen.
const BY_LENGTH = [...WORDS].sort((a, b) => b.length - a.length);

/** Every `it(` in a file, which is one test each in this codebase. */
function itCount(src: string): number {
  return (src.match(/^\s+it\(/gm) ?? []).length;
}

/** The pure math modules behind /tools — the catalog is data, not math. */
function mathTestFiles(): string[] {
  return readdirSync(join(root, "lib", "tools"))
    .filter((f) => f.endsWith(".test.ts") && f !== "catalog.test.ts")
    .sort();
}

const willTodo = read("WILL_TODO.md");

describe("the operator list's numbers", () => {
  it("counts the calculations /tools actually answers", () => {
    const word = WORDS[TOOL_COUNT];
    expect(word, `no word for ${TOOL_COUNT}`).toBeDefined();
    const said = willTodo.match(
      new RegExp(`\\*\\*(${BY_LENGTH.join("|")}) calculations\\*\\*`, "i"),
    );
    expect(said, "WILL_TODO should say how many calculations there are").not.toBeNull();
    expect(said![1].toLowerCase()).toBe(word);
  });

  it("counts the modules behind them", () => {
    const files = mathTestFiles();
    const word = WORDS[files.length];
    expect(word, `no word for ${files.length}`).toBeDefined();
    const said = willTodo.match(new RegExp(`the (${BY_LENGTH.join("|")}) modules`, "i"));
    expect(said, "WILL_TODO should say how many math modules there are").not.toBeNull();
    expect(said![1].toLowerCase()).toBe(word);
  });

  it("counts the tests on those modules", () => {
    const total = mathTestFiles().reduce(
      (a, f) => a + itCount(read(join("lib", "tools", f))),
      0,
    );
    const said = willTodo.match(/\*\*(\d+) tests\*\* on/);
    expect(said, "WILL_TODO should say how many module tests there are").not.toBeNull();
    expect(Number(said![1]), "the module test count has drifted").toBe(total);
  });

  it("counts the tests that render the page", () => {
    // The `/tools` block of views.render.test.ts, from its own describe to
    // the next one at column 0.
    const src = read("lib/views.render.test.ts");
    const at = src.indexOf('describe("the deal math tools"');
    expect(at, "the deal math tools block moved or was renamed").toBeGreaterThan(-1);
    const rest = src.slice(at + 10);
    const next = rest.search(/^describe\(/m);
    const block = next === -1 ? rest : rest.slice(0, next);
    const said = willTodo.match(/plus \*\*(\d+)\*\* that render/);
    expect(said, "WILL_TODO should say how many render tests there are").not.toBeNull();
    expect(Number(said![1]), "the render test count has drifted").toBe(itCount(block));
  });
});

describe("what the static counting assumes", () => {
  it("finds a plausible number of files and tests at all", () => {
    // Without this, a rename that empties the glob would make every count
    // above agree at zero and the guard would pass forever.
    const files = mathTestFiles();
    expect(files.length, "no math test files found").toBeGreaterThan(15);
    for (const f of files) {
      expect(itCount(read(join("lib", "tools", f))), f).toBeGreaterThan(0);
    }
  });

  it("holds the modules to plain `it(`, never a generated case", () => {
    // `it.each` would produce more tests at run time than the source
    // shows, so every count here would understate — quietly, and in the
    // direction that never fails.
    for (const f of mathTestFiles()) {
      const src = read(join("lib", "tools", f));
      expect(src, `${f} uses it.each; the static count would understate`).not.toMatch(
        /\bit\.each\b/,
      );
      expect(src, `${f} uses describe.each; the static count would understate`).not.toMatch(
        /\bdescribe\.each\b/,
      );
    }
  });
});
