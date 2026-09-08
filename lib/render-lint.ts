// Text-level lint for a static render of a page or a view: the visible
// words, and the ones a reader would trip on. The homepage once read
// "aboutabout half a minute" and "9real scenarios" — a compiler quirk that
// no unit test on the data could see. Every render smoke test reads its
// markup through these two helpers, so a sentence glued to the number
// before it fails in CI rather than on a visitor's phone. (Test tooling:
// imported by the render tests only, never by the app.)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The visible text of a render, block boundaries kept as newlines and the
 *  entities React writes turned back into characters. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(
      /<(br|\/p|\/li|\/h\d|\/div|\/td|\/th|\/tr|\/section|\/span|\/a|\/button|\/dt|\/dd|\/summary|\/details|\/label|\/option|\/legend|\/figcaption)[^>]*>/g,
      "\n",
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// Units a digit may legitimately touch: "5yr", "30bps", "10k", "250sf",
// "2BR", "1BA", "3rd".
const UNIT_SUFFIX =
  /^(st|nd|rd|th|px|pt|bps|yr|yrs|mo|mos|am|pm|k|m|mm|x|sf|ac|bn|hr|hrs|min|sec|kb|mb|gb|ft|in|ml|s|br|ba|bd|bed|beds|bath|baths|unit|units|key|keys|pp|pct)$/i;

/** Glued words a reader would trip on: a digit run into a word ("9real"),
 *  a word doubled ("aboutabout"), a doubled article or preposition ("the
 *  the"). Words that legitimately double ("that that", "had had") are rare
 *  in product copy and are flagged so a human decides. */
export function gluedWords(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d+)([a-z]{3,})\b/g)) {
    // A git sha ("543ebdb" in the build stamp) is digits and letters by
    // nature, not a glued word: live-verify once failed on its own stamp.
    if (UNIT_SUFFIX.test(m[2]) || /^[0-9a-f]{7,40}$/.test(m[0])) continue;
    out.add(m[0]);
  }
  for (const m of text.matchAll(/\b([a-z]{3,})\1\b/g)) out.add(m[0]);
  // "From verdict to to-do list" is fine: the doubled word must not be the
  // start of a hyphenated one.
  for (const m of text.matchAll(/\b(a|an|the|of|to|in|on|for|and|or|with|at|by|from|is|it)\s+\1\b(?!-)/gi)) out.add(m[0]);
  return [...out];
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const hasAttr = (tag: string, name: string): boolean => new RegExp(`\\s${name}(\\s|=|>|/)`, "i").test(tag);
const innerText = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

/**
 * The accessibility faults a static render can show: an image with no alt,
 * a button or link a screen reader would announce as nothing, a form control
 * with no label, an id used twice. Not a substitute for an audit with a real
 * assistive tool — the cheap, deterministic floor under one, run on every
 * render the suite makes.
 */
export function a11yIssues(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!hasAttr(m[0], "alt")) out.push(`img without alt: ${m[0].slice(0, 80)}`);
  }
  const named = (tag: string) =>
    (attr(tag, "aria-label") ?? "").trim() || (attr(tag, "aria-labelledby") ?? "").trim() || (attr(tag, "title") ?? "").trim();
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const open = `<button${m[1]}>`;
    if (!innerText(m[2]) && !named(open) && !/<img\b[^>]*\salt\s*=\s*"[^"]+"/i.test(m[2])) {
      out.push(`button with no accessible name: ${open.slice(0, 90)}`);
    }
  }
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const open = `<a${m[1]}>`;
    if (hasAttr(open, "href") && !innerText(m[2]) && !named(open) && !/<img\b[^>]*\salt\s*=\s*"[^"]+"/i.test(m[2])) {
      out.push(`link with no accessible name: ${open.slice(0, 90)}`);
    }
  }
  const labelFor = new Set([...html.matchAll(/<label\b[^>]*\sfor\s*=\s*"([^"]+)"/gi)].map((m) => m[1]));
  for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    const type = (attr(tag, "type") ?? "").toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "checkbox" || type === "radio") continue;
    const id = attr(tag, "id");
    const wrapped = false; // a <label> wrapping the control is checked below
    if (named(tag) || (id && labelFor.has(id)) || wrapped) continue;
    // A control inside a <label>…</label> is labelled by its text.
    const idx = m.index ?? 0;
    const before = html.lastIndexOf("<label", idx);
    const closeBefore = html.lastIndexOf("</label>", idx);
    if (before !== -1 && before > closeBefore) continue;
    out.push(`${m[1]} with no label: ${tag.slice(0, 90)}`);
  }
  const ids = new Map<string, number>();
  for (const m of html.matchAll(/\sid\s*=\s*"([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push(`duplicate id "${id}" ×${n}`);
  return out;
}

/**
 * The visual half of a render smoke test, run by hand: with VIEW_SHOTS_DIR
 * set, each rendered view is also written as a complete document — the
 * signed-in app's shell around it, the built stylesheets (VIEW_SHOTS_CSS, a
 * comma-separated list of hrefs) linked — so a headless browser can open it
 * at any width and look for horizontal overflow, a clipped table, a card
 * that breaks its grid. The signed-in pages sit behind auth, which is why a
 * crawl of the live site never reaches them. A no-op in CI.
 *
 *   VIEW_SHOTS_DIR=/tmp/views VIEW_SHOTS_CSS=file:///…/.next/static/chunks/x.css \
 *     npx vitest run lib/views.render.test.ts
 */
export function dumpView(name: string, fragment: string): void {
  const dir = process.env.VIEW_SHOTS_DIR;
  if (!dir) return;
  const links = (process.env.VIEW_SHOTS_CSS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  const doc =
    `<!doctype html><html lang="en" class="h-full js"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title>${links}</head>` +
    // The same column the app shell renders (app/(app)/app-shell.tsx): the
    // min-w-0 is what lets a wide table scroll inside its own container
    // instead of widening the page.
    `<body class="flex min-h-full flex-col font-sans antialiased"><div class="flex min-h-screen bg-canvas">` +
    `<div class="flex min-w-0 flex-1 flex-col"><main class="flex-1"><div class="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">` +
    `${fragment}</div></main></div></div></body></html>`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name.replace(/[^a-z0-9_-]+/gi, "_")}.html`), doc);
}
