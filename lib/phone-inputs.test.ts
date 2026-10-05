// iPhone Safari zooms the page into any text field whose type is under
// 16px the moment it takes the focus, and leaves the reader zoomed in.
// Every field a visitor types into on /tools and /login is 16px below
// `sm` (text-base) and keeps its smaller size from `sm` up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

/** The JSX opening tag that starts at `i`, braces and strings respected. */
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
  return src.slice(i, i + 400);
}

/** Every control a visitor types into or picks from: no checkbox, radio,
 *  hidden field or button, which take no text. */
function typedControls(src: string): string[] {
  return [...src.matchAll(/<(input|select|textarea)\b/g)]
    .filter((m) => {
      // A tag named in a comment is not a control.
      const idx = m.index ?? 0;
      const line = src.slice(src.lastIndexOf("\n", idx) + 1, idx).trim();
      return !(line.startsWith("//") || line.startsWith("*") || line.startsWith("/*"));
    })
    .map((m) => tagAt(src, m.index ?? 0))
    .filter((tag) => !/type=["'](checkbox|radio|hidden|submit|button)["']/.test(tag));
}

/** A class list that is 16px on a phone and never smaller there. */
function phoneSafe(cls: string): boolean {
  const bare = cls.split(/\s+/).filter((c) => /^text-(xs|sm|\[\d+px\])$/.test(c));
  return /(^|\s)text-base(\s|$)/.test(cls) && bare.length === 0;
}

describe("a field a visitor types into is 16px on a phone", () => {
  it("on /tools, every input, select and paste box", () => {
    const controls = typedControls(read("app/tools/deal-math-tools.tsx"));
    expect(controls.length).toBeGreaterThanOrEqual(10);
    for (const tag of controls) {
      const cls = /className=(?:"([^"]*)"|\{`([^`]*)`)/.exec(tag);
      expect(cls, tag.slice(0, 120)).not.toBeNull();
      expect(phoneSafe(cls![1] ?? cls![2]), tag.slice(0, 160)).toBe(true);
    }
  });

  it("on /login, through the form's one class", () => {
    const src = read("app/login/login-form.tsx");
    const inputCls = /const inputCls =\s*"([^"]*)"/.exec(src)?.[1] ?? "";
    expect(phoneSafe(inputCls), inputCls).toBe(true);
    expect(inputCls).toContain("sm:text-sm");
    const controls = typedControls(src);
    expect(controls.length).toBeGreaterThan(0);
    for (const tag of controls) expect(tag, tag.slice(0, 120)).toMatch(/className=\{(?:inputCls|`\$\{inputCls\})/);
  });
});
