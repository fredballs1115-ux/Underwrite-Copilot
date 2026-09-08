#!/usr/bin/env node
// Reads rendered HTML files and reports what a visitor would trip on: a
// digit glued to a word, a doubled word, an image with no alt, a button or
// link a screen reader announces as nothing, a form control with no label,
// an id used twice. The same lint the render tests run on the signed-in
// views (lib/render-lint.ts), pointed at the public pages — which are
// server-rendered from live data and so only exist as HTML once fetched.
// live-verify runs it on every deploy; run it by hand against a local
// `next start`:
//
//   for p in "" why demo market whats-new login; do
//     curl -s "http://127.0.0.1:3000/$p" -o "page_${p:-home}.html"; done
//   node scripts/lint-pages.mjs page_*.html
//
// Exits 1 when anything is found. `--allow=word,word` names glued words
// that are quoted on purpose (a changelog entry that documents the very
// typo the lint exists to catch).
import { readFileSync } from "node:fs";
import { a11yIssues, gluedWords, visibleText } from "../lib/render-lint.ts";

const args = process.argv.slice(2);
const allow = new Set(
  args
    .filter((a) => a.startsWith("--allow="))
    .flatMap((a) => a.slice("--allow=".length).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: node scripts/lint-pages.mjs [--allow=word,word] page.html [...]");
  process.exit(2);
}

let glued = 0;
let a11y = 0;
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const words = gluedWords(visibleText(html)).filter((w) => !allow.has(w.toLowerCase()));
  const faults = a11yIssues(html);
  glued += words.length;
  a11y += faults.length;
  const status = words.length + faults.length === 0 ? "clean" : `${words.length} glued · ${faults.length} a11y`;
  console.log(`${file}: ${status}`);
  for (const w of words) console.log(`  glued: ${JSON.stringify(w)}`);
  for (const f of faults) console.log(`  a11y: ${f}`);
}
console.log(`PAGE LINT: ${files.length} pages · ${glued} glued words · ${a11y} accessibility faults`);
process.exit(glued + a11y === 0 ? 0 : 1);
