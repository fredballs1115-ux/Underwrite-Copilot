import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { aOrAn, figureTakesAn, withArticle } from "./article";
import { ASSET_CLASS_LABEL } from "./asset-class";
import { STRATEGY_LABEL } from "./deal-strategy";
import { gluedWords } from "./render-lint";

// A figure, the article it takes, and why.
const FIGURES: Array<[string, "a" | "an"]> = [
  ["8", "an"], // eight
  ["8.0%", "an"],
  ["80", "an"], // eighty
  ["85.5%", "an"],
  ["800", "an"], // eight hundred
  ["8,000", "an"], // eight thousand
  ["$8.0M", "an"], // eight million dollars
  ["$800k", "an"],
  ["11", "an"], // eleven
  ["11.7%", "an"],
  ["11,000", "an"], // eleven thousand
  ["18", "an"], // eighteen
  ["18.0%", "an"],
  ["18,500", "an"], // eighteen thousand
  ["1850", "an"], // eighteen-fifty, read in pairs
  ["1", "a"],
  ["1.8%", "a"], // one point eight
  ["110%", "a"], // one hundred ten
  ["1,100", "a"], // one thousand one hundred
  ["1,800", "a"], // one thousand eight hundred
  ["180,000", "a"], // one hundred eighty thousand
  ["1031", "a"], // ten thirty-one
  ["2018", "a"], // twenty eighteen
  ["20.0%", "a"],
  ["$20.0M", "a"],
  ["0.8%", "a"], // zero point eight
  ["49%", "a"],
  ["5", "a"],
  ["9.25%", "a"],
];

describe("aOrAn — the article a figure takes is its first spoken word's", () => {
  it("reads eight, eleven, eighteen and eighty, and the groups they lead", () => {
    for (const [figure, want] of FIGURES) expect(aOrAn(figure), figure).toBe(want);
    expect(figureTakesAn("18")).toBe(true);
    expect(figureTakesAn("180")).toBe(false);
    // A comma-less run past four digits is grouped by thousands from the
    // right: 18000 is eighteen thousand, 180000 one hundred eighty thousand.
    expect(figureTakesAn("18000")).toBe(true);
    expect(figureTakesAn("180000")).toBe(false);
    expect(figureTakesAn("8000000")).toBe(true);
  });

  it("opens a sentence with a capital, and puts the text after the article", () => {
    expect(aOrAn("8%", true)).toBe("An");
    expect(aOrAn("20%", true)).toBe("A");
    expect(withArticle("18.0%")).toBe("an 18.0%");
    expect(withArticle("800 SF", true)).toBe("An 800 SF");
    expect(withArticle("$20.0M")).toBe("a $20.0M");
  });

  it("reads a word by its sound, not its letter", () => {
    expect(aOrAn("office")).toBe("an");
    expect(aOrAn("industrial")).toBe("an");
    expect(aOrAn("offering memorandum")).toBe("an");
    expect(aOrAn("unknown")).toBe("an");
    expect(aOrAn("unlevered return")).toBe("an");
    expect(aOrAn("unemployment")).toBe("an");
    expect(aOrAn("hour")).toBe("an");
    expect(aOrAn("honest read")).toBe("an");
    expect(aOrAn("unit")).toBe("a");
    expect(aOrAn("usable foot")).toBe("a");
    expect(aOrAn("utility")).toBe("a");
    expect(aOrAn("one-time fee")).toBe("a");
    expect(aOrAn("European bank")).toBe("a");
    expect(aOrAn("hotel")).toBe("a");
    expect(aOrAn("value-add")).toBe("a");
    expect(aOrAn("red-flag")).toBe("a");
    expect(aOrAn("material")).toBe("a");
    // An initialism is said letter by letter: an SFR, an NOI, a BTR — and
    // one said as a word is read as the word.
    expect(aOrAn("SFR / BTR property")).toBe("an");
    expect(aOrAn("NOI")).toBe("an");
    expect(aOrAn("MSA")).toBe("an");
    expect(aOrAn("BTR")).toBe("a");
    expect(aOrAn("CMBS loan")).toBe("a");
    expect(aOrAn("REIT")).toBe("a");
    // A sign is said first: a minus two, a plus three.
    expect(aOrAn("−8%")).toBe("a");
    expect(aOrAn("+8%")).toBe("a");
  });

  it("gives every asset class and every deal type the article it takes", () => {
    const an = new Set(["office", "industrial", "SFR / BTR", "unknown"]);
    for (const label of [...Object.values(ASSET_CLASS_LABEL), ...Object.values(STRATEGY_LABEL)]) {
      const word = /^[A-Z]{2,}/.test(label) ? label : label.toLowerCase();
      expect(aOrAn(word), label).toBe(an.has(word) ? "an" : "a");
    }
  });
});

describe("the render lint reads the same rule back", () => {
  it("flags an article the figure after it does not take — both ways — and agrees with aOrAn on every figure", () => {
    for (const [figure, want] of FIGURES) {
      const wrong = want === "an" ? "a" : "an";
      expect(gluedWords(`It prices at ${want} ${figure} cap.`), `${want} ${figure}`).toEqual([]);
      expect(gluedWords(`It prices at ${wrong} ${figure} cap.`), `${wrong} ${figure}`).toEqual([`${wrong} ${figure}`]);
    }
  });

  it("reads a capital as an article only where a sentence opens — mid-sentence it is a label", () => {
    expect(gluedWords("A 8% increase breaks even at a 25.8% move-out.")).toEqual(["A 8%"]);
    expect(gluedWords("The quote is fine.\nA 18% return needs growth.")).toEqual(["A 18%"]);
    expect(gluedWords("Class A 8% cap, Tranche A 18% pref, Series A 11% coupon.")).toEqual([]);
    expect(gluedWords("An 8% increase breaks even at a 25.8% move-out.")).toEqual([]);
  });

  it("flags a lowercase article before a word it does not fit, and leaves the exceptions alone", () => {
    expect(gluedWords("It is a office building.")).toEqual(["a office"]);
    expect(gluedWords("It is an building.")).toEqual(["an building"]);
    for (const fine of [
      "an office building",
      "a one-time fee",
      "a once-a-year reset",
      "a European lender",
      "a unit",
      "a usable foot",
      "an hour",
      "an honest read",
      "Class A office space",
    ]) {
      expect(gluedWords(fine), fine).toEqual([]);
    }
  });
});

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** An article typed before an interpolation — `a ${…}` in a template, or
 *  `a {…}` / `a{" "}{…}` / `a <span>{…}` in JSX — where the value decides
 *  the article and the source cannot know it. */
export function articleBeforeValue(src: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  const re = /(?<![\w$.'’-])(?:a|A|an|An)(?:\{" "\}|[ \t]+|[ \t]*\n)[ \t\n]*(?:<(?:span|strong|b|em)\b[^>]*>)?[ \t]*\$?\{(?!" "\})/g;
  const lines = src.split("\n");
  for (const m of src.matchAll(re)) {
    const line = src.slice(0, m.index).split("\n").length;
    const text = lines[line - 1].trim();
    if (text.startsWith("//") || text.startsWith("*") || text.startsWith("/*")) continue;
    hits.push({ line, text: text.slice(0, 100) });
  }
  return hits;
}

describe("no sentence types its article before a value", () => {
  it("detects every shape, and passes the helper's", () => {
    expect(articleBeforeValue("`at a ${pct}% cap`")).toHaveLength(1);
    expect(articleBeforeValue("<p>at a {pct} cap</p>")).toHaveLength(1);
    expect(articleBeforeValue('<p>at a{" "}\n  {pct} cap</p>')).toHaveLength(1);
    expect(articleBeforeValue('<p>buying a{" "}\n  <span className="x">{pct}</span></p>')).toHaveLength(1);
    expect(articleBeforeValue("`at ${withArticle(pct)} cap`")).toHaveLength(0);
    // A tag and a cell reference are not articles.
    expect(articleBeforeValue("const open = `<a${m[1]}>`;")).toHaveLength(0);
    expect(articleBeforeValue("f(`A${r}-1`)")).toHaveLength(0);
  });

  it("no source in app/, lib/ or worker/ carries the shape", () => {
    const files = ["app", "lib", "worker"].flatMap((d) => sources(join(process.cwd(), d)));
    expect(files.length).toBeGreaterThan(100);
    const report: string[] = [];
    for (const f of files) {
      for (const h of articleBeforeValue(readFileSync(f, "utf8"))) {
        report.push(`${f.replace(process.cwd() + "/", "")}:${h.line}: ${h.text}`);
      }
    }
    expect(report, `put the value through aOrAn / withArticle (lib/article) at:\n${report.join("\n")}`).toEqual([]);
  });
});
