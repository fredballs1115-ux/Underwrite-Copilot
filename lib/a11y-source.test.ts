// Every form control in the app has an accessible name — checked at the
// source, across every page, including the signed-in ones no render test
// reaches (a Server Component that needs a database row cannot be rendered
// on a fixture). The render tests' a11yIssues lint is the runtime half of
// the same rule; this is the static half. Fourteen controls had no name
// when this was first run: a rename field, a task field, a question box,
// the rent-roll mapping selects, the team-name field. The fix at a site is
// `aria-label`, an `id` with a `<label htmlFor>`, or a wrapping `<label>`.
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

/** The JSX opening tag that starts at `i`: up to the `>` outside every
 *  brace and string, so an arrow handler's `=>` does not end it early. */
function tagAt(src: string, i: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === "\\") j++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i, i + 200);
}

/** Every `<input>`, `<select>` and `<textarea>` in `src` that carries no
 *  accessible name: no aria-label / aria-labelledby / title, no `id` a
 *  `<label htmlFor>` in the file points at, and no `<label>` open around
 *  it. Controls a reader never meets are skipped: hidden / submit / button
 *  / checkbox / radio types (the last two are labelled by their wrapping
 *  label in this codebase), `aria-hidden`, a `hidden` or `sr-only` class,
 *  and tags inside a comment. */
export function unlabelledControls(src: string): Array<{ line: number; tag: string }> {
  const out: Array<{ line: number; tag: string }> = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    const idx = m.index ?? 0;
    const lineText = src.slice(src.lastIndexOf("\n", idx) + 1, idx).trim();
    if (lineText.startsWith("//") || lineText.startsWith("*") || lineText.startsWith("/*")) continue;
    const tag = tagAt(src, idx);
    if (/type=["'](hidden|submit|button|checkbox|radio)["']/.test(tag)) continue;
    if (/aria-hidden|className="(?:[^"]*\s)?(?:hidden|sr-only)(?:\s[^"]*)?"/.test(tag)) continue;
    if (/aria-label|aria-labelledby|\btitle=/.test(tag)) continue;
    const id = tag.match(/\bid=["']([^"']+)["']|\bid=\{([^}]+)\}/);
    if (id) {
      const key = id[1] ?? id[2];
      if (src.includes(`htmlFor="${key}"`) || src.includes(`htmlFor={${key}}`)) continue;
    }
    const before = src.slice(0, idx);
    const lastOpen = before.lastIndexOf("<label");
    const lastClose = before.lastIndexOf("</label>");
    if (lastOpen !== -1 && lastOpen > lastClose) continue;
    out.push({ line: before.split("\n").length, tag: tag.replace(/\s+/g, " ").slice(0, 120) });
  }
  return out;
}

describe("every form control in app/ has an accessible name", () => {
  it("finds the shapes it exists for, and passes each labelled form", () => {
    expect(unlabelledControls(`<input name="q" onChange={(e) => go(e)} />`)).toHaveLength(1);
    expect(unlabelledControls(`<select name="stage"><option>a</option></select>`)).toHaveLength(1);
    expect(unlabelledControls(`<textarea name="text" placeholder="Note" />`)).toHaveLength(1);
    for (const ok of [
      `<input name="q" aria-label="Search deals" onChange={(e) => go(e)} />`,
      `<label htmlFor="q">Search</label><input id="q" />`,
      `<label>Search <input name="q" /></label>`,
      `<input type="hidden" name="dealId" />`,
      `<input type="checkbox" name="remember" />`,
      `<input type="file" className="sr-only" aria-hidden />`,
      `<input ref={r} type="file" className="hidden" onChange={(e) => take(e)} />`,
      ` * <input type="file"> in a doc comment`,
    ]) {
      expect(unlabelledControls(ok), ok).toEqual([]);
    }
  });

  it("no page or component carries one", () => {
    const report: string[] = [];
    for (const f of tsxFiles(join(process.cwd(), "app"))) {
      for (const h of unlabelledControls(readFileSync(f, "utf8"))) {
        report.push(`${f.replace(process.cwd() + "/", "")}:${h.line}: ${h.tag}`);
      }
    }
    expect(report, `give each control a name (aria-label, a label htmlFor, or a wrapping label):\n${report.join("\n")}`).toEqual([]);
  });
});
