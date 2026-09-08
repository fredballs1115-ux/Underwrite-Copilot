#!/usr/bin/env node
// Prose census: JSX text runs of N+ words in page and component sources, so
// the wordiest spots on the signed-in surfaces can be found without a login
// (the render tests reach some of them; a census reaches all of them).
//
//   node scripts/prose-census.mjs            # app/, 25+ words
//   node scripts/prose-census.mjs 20 app/market app/(app)/deals
//
// The rule it serves (CLAUDE.md, "The public pages say it in pictures"): a
// helper sentence under a card says only what the card cannot. Anything this
// lists is a candidate for a line, a chip, a fold or the bin.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const min = /^\d+$/.test(args[0] ?? "") ? Number(args.shift()) : 25;
const roots = args.length ? args : ["app"];

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(f) && !/\.test\./.test(f)) files.push(p);
  }
};
roots.forEach(walk);

const rows = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // A literal run between a closing ">" and the next tag or expression.
  const re = />([^<{}]+)</g;
  let m;
  while ((m = re.exec(src))) {
    const text = m[1].replace(/\s+/g, " ").trim();
    // Code that happens to sit between angle brackets (generics, arrow
    // functions) is not prose.
    if (/[;=]|=>|\bconst\b|\breturn\b/.test(text)) continue;
    const words = text.split(" ").filter((w) => /[a-z]/i.test(w)).length;
    if (words < min) continue;
    const line = src.slice(0, m.index).split("\n").length;
    rows.push({ file: f, line, words, text: text.slice(0, 96) });
  }
}
rows.sort((a, b) => b.words - a.words);
console.log(`${rows.length} text run${rows.length === 1 ? "" : "s"} of ${min}+ words in ${files.length} files`);
for (const r of rows) {
  console.log(`${String(r.words).padStart(3)}w  ${r.file}:${r.line}  ${r.text}${r.text.length >= 96 ? "…" : ""}`);
}
