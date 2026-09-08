// The compiler drops the leading space of a JSX text node that spans lines
// and carries an HTML entity (verified against the bundled binding: in
//   <p>{n} real scenarios — DC to
//      Brooklyn County&apos;s rolling</p>
// the text child compiles to "real scenarios …", glued to the number, while
// the same node without the entity keeps its space). The homepage read
// "aboutabout half a minute", "9real scenarios" and "Seattlepipelines wired"
// before the sites were found by rendering every public page and reading the
// text. This scan finds the shape at the source, across every page — the
// signed-in ones no crawl reaches — so the next such sentence fails here,
// not on a visitor's phone. The fix at a site is an explicit {" "}.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Every JSX text node that (a) opens with a space right after an
 *  expression `}` or a closing tag `>`, (b) runs past a line break before the
 *  next `{` or `<`, and (c) carries an HTML entity anywhere in the node. */
export function gluedTextSites(src: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  const lines = src.split("\n");
  const re = /[}>]( )(?=[A-Za-z0-9("'“‘])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + 1;
    const stops = [src.indexOf("{", start), src.indexOf("<", start)].filter((i) => i !== -1);
    const end = stops.length ? Math.min(...stops) : src.length;
    const node = src.slice(start, end);
    if (!node.includes("\n")) continue;
    if (!/&[a-z]+;|&#\d+;/i.test(node)) continue;
    const line = src.slice(0, start).split("\n").length;
    const text = lines[line - 1].trim();
    // Not JSX text: a comment, or a template / string literal on the line.
    if (text.startsWith("//") || text.startsWith("*") || text.startsWith("/*") || text.includes("`")) continue;
    hits.push({ line, text: text.slice(0, 100) });
  }
  return hits;
}

describe("JSX text that the compiler would glue to the expression before it", () => {
  it("detects the shape on the sentence that shipped glued, and passes the fixed form", () => {
    const glued = `<p>\n  {SCENARIO_COUNT} real scenarios, one click apart — DC to\n  Brooklyn County&apos;s rolling age exemption.\n</p>`;
    expect(gluedTextSites(glued)).toHaveLength(1);
    const fixed = `<p>\n  {SCENARIO_COUNT}{" "}real scenarios, one click apart — DC to\n  Brooklyn County&apos;s rolling age exemption.\n</p>`;
    expect(gluedTextSites(fixed)).toHaveLength(0);
    // A single-line node with an entity keeps its space in the compiler, and
    // a multi-line node without one does too — neither is a hit.
    expect(gluedTextSites(`<p>{n} with entity &amp; same line</p>`)).toHaveLength(0);
    expect(gluedTextSites(`<p>{n} two lines no entity\n  here — dash</p>`)).toHaveLength(0);
  });

  it("no page in app/ or lib/ carries the shape", () => {
    const files = [...tsxFiles(join(process.cwd(), "app")), ...tsxFiles(join(process.cwd(), "lib"))];
    expect(files.length).toBeGreaterThan(50);
    const report: string[] = [];
    for (const f of files) {
      for (const h of gluedTextSites(readFileSync(f, "utf8"))) {
        report.push(`${f.replace(process.cwd() + "/", "")}:${h.line}: ${h.text}`);
      }
    }
    expect(report, `spell the space with {" "} at:\n${report.join("\n")}`).toEqual([]);
  });
});
