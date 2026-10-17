import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { usd, usdCents, usdExact } from "./format";

/**
 * Every place a source writes a "$" straight before a figure it
 * interpolates — `$${n.toLocaleString()}` in a template, `${n}` after a
 * literal "$" in JSX text, `"$" + n` — which is a dollar written by hand:
 * it prints "$-1,234" for a negative and whatever precision the line chose.
 *
 * Read off TypeScript's own parse rather than a pattern over the text, so
 * a comment is never a hit and JSX text is told apart from a template.
 */
export function handWrittenDollars(file: string, src: string): Array<{ line: number; text: string }> {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const hits: Array<{ line: number; text: string }> = [];
  const hit = (node: ts.Node) => {
    const at = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    hits.push({ line: at.line + 1, text: node.getText(sf).replace(/\s+/g, " ").slice(0, 100) });
  };
  // "$", then nothing but space, then the figure.
  const endsInDollar = (s: string) => /\$\s*$/.test(s);
  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node)) {
      // The text before each interpolation: the head, then every middle.
      if (endsInDollar(node.head.text)) hit(node);
      node.templateSpans.forEach((span, i) => {
        if (i < node.templateSpans.length - 1 && endsInDollar(span.literal.text)) hit(span);
      });
    } else if (ts.isJsxText(node) && endsInDollar(node.text)) {
      const kids = ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent) ? node.parent.children : null;
      const next = kids ? kids[kids.indexOf(node) + 1] : undefined;
      if (next && ts.isJsxExpression(next)) hit(node);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = node.left;
      if ((ts.isStringLiteral(left) || ts.isNoSubstitutionTemplateLiteral(left)) && endsInDollar(left.text)) {
        hit(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/**
 * The one dollar writer behind /tools: the cards' tiles and the modules'
 * sentences both print through it, so one figure is said one way wherever
 * it sits.
 */
describe("the shared dollar writer", () => {
  it("says a figure compactly from a million, exactly under it", () => {
    expect(usd(13_480_465)).toBe("$13.48M");
    expect(usd(560_000)).toBe("$560,000");
    expect(usdExact(13_480_465)).toBe("$13,480,465");
    expect(usdCents(14)).toBe("$14.00");
    expect(usd(null)).toBe("—");
    expect(usdExact(null)).toBe("—");
    expect(usdCents(null)).toBe("—");
  });

  it("puts the minus sign outside the dollar, the way the site writes money", () => {
    // "$-385,213" is how a negative interpolated straight into a template
    // reads, and nobody writes money that way. The sign is U+2212, as on a
    // re-screen's diff ("−$1.5M") and under a fair market rent ("−$578/mo").
    expect(usdExact(-385_213)).toBe("−$385,213");
    expect(usd(-10_000_000)).toBe("−$10.00M");
    expect(usd(-9_350)).toBe("−$9,350");
    expect(usdCents(-3.2)).toBe("−$3.20");
    for (const s of [usd(-1), usdExact(-1), usdCents(-1), usd(-2_000_000)]) {
      expect(s).not.toContain("$-");
      expect(s).not.toContain("-$");
    }
  });

  it("gives a figure that rounds to nothing no sign", () => {
    // "−$0" is not an amount.
    expect(usdExact(-0.4)).toBe("$0");
    expect(usd(-0.4)).toBe("$0");
    expect(usdCents(-0.004)).toBe("$0.00");
    expect(usdExact(-0)).toBe("$0");
    // …while a figure that survives the rounding keeps it.
    expect(usdExact(-0.6)).toBe("−$1");
    expect(usdCents(-0.006)).toBe("−$0.01");
  });

  it("keeps each writer's precision: whole dollars whole, cents to the cent", () => {
    expect(usdExact(1_234.5)).toBe("$1,235");
    expect(usdCents(59.333)).toBe("$59.33");
    expect(usd(999_999.6)).toBe("$1,000,000");
    // A half-step rounds up, counted in whole numbers as every compact
    // figure on the site is (lib/money `compactUsd`): a float's toFixed
    // had read 1.005 as "1.00" (research pass 34).
    expect(usd(1_005_000)).toBe("$1.01M");
  });
});

describe("no /tools module writes a dollar of its own", () => {
  it("finds every shape a hand-written dollar takes, and passes the writer's", () => {
    const inTs = (src: string) => handWrittenDollars("x.ts", src).length;
    const inTsx = (src: string) => handWrittenDollars("x.tsx", src).length;
    expect(inTs("const s = `owed $${n.toLocaleString()} at the sale`;")).toBe(1);
    expect(inTs("const s = `${a} and $${b.toFixed(2)} a foot`;")).toBe(1);
    expect(inTs('const s = "$" + n.toLocaleString();')).toBe(1);
    expect(inTsx("const p = <p>The face rent is ${rent.toFixed(2)}.</p>;")).toBe(1);
    expect(inTsx("const p = <span value={`$${n}`} />;")).toBe(1);
    // The shared writer, a price written into the copy, and a comment
    // describing the old shape are none of them hand-written figures.
    expect(inTs("const s = `owed ${usdExact(n)} at the sale`;")).toBe(0);
    expect(inTs('const s = "a $20M price";')).toBe(0);
    expect(inTs("// it printed `$${n}` here\nconst x = 1;")).toBe(0);
    expect(inTsx("const p = <p>{usdCents(rent)} a foot</p>;")).toBe(0);
    expect(inTs("const r = new RegExp(`^${word}$`);")).toBe(0);
  });

  it("holds every module in lib/tools to the shared writer", () => {
    const dir = join(process.cwd(), "lib/tools");
    const files = readdirSync(dir).filter(
      (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && f !== "format.ts",
    );
    expect(files.length).toBeGreaterThan(40);
    const report = files.flatMap((f) =>
      handWrittenDollars(f, readFileSync(join(dir, f), "utf8")).map(
        (h) => `lib/tools/${f}:${h.line}: ${h.text}`,
      ),
    );
    expect(
      report,
      `write these through lib/tools/format (usd, usdExact, usdCents):\n${report.join("\n")}`,
    ).toEqual([]);
  });

  it("and the page's own cards, whose tiles and sentences sit beside the modules' notes", () => {
    // Twenty-three figures on the page were written by hand, among them a
    // negative break-even hard cost printed "$-12.34" and a negative land
    // residual a foot printed the same way.
    const dir = join(process.cwd(), "app/tools");
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files).toContain("deal-math-tools.tsx");
    const report = files.flatMap((f) =>
      handWrittenDollars(f, readFileSync(join(dir, f), "utf8")).map(
        (h) => `app/tools/${f}:${h.line}: ${h.text}`,
      ),
    );
    expect(
      report,
      `write these through lib/tools/format (usd, usdExact, usdCents):\n${report.join("\n")}`,
    ).toEqual([]);
  });
});
