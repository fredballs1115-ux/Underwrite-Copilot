#!/usr/bin/env node
// Audit every source URL in the research layer (ship-it pass).
//
//   node scripts/audit-source-links.mjs            # research JSONs only
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-source-links.mjs
//                                                  # + DB benchmarks/rules
//
// HEAD-checks each unique http(s) URL (GET fallback for servers that reject
// HEAD), writes data/research/link_audit.json, and prints dead links. The
// app's provenance components consult that file: verified-dead links render
// as plain text instead of a clickable 404. Re-run any time; commit the
// updated audit file so the deployed app picks it up.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "data/research");

const urls = new Set();
const URL_RE = /https?:\/\/[^\s"'<>\\)\]]+/g;

for (const f of await readdir(dir)) {
  if (!f.endsWith(".json") || f === "link_audit.json") continue;
  const text = await readFile(path.join(dir, f), "utf8");
  for (const m of text.match(URL_RE) ?? []) urls.add(m.replace(/[.,;]+$/, ""));
}

// DB rows too, when credentials are present.
const supaUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (supaUrl && supaKey) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
  for (const table of ["benchmarks", "regulatory_rules"]) {
    try {
      const { data } = await supabase.from(table).select("source");
      for (const row of data ?? []) if (row.source) urls.add(String(row.source));
    } catch {
      console.error(`(${table}: not readable — skipped)`);
    }
  }
} else {
  console.log("(no Supabase credentials — auditing research JSONs only)");
}

const check = async (url) => {
  const probe = async (method) => {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      headers: { "user-agent": "underwrite-copilot-link-audit/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    return res.status;
  };
  try {
    let status = await probe("HEAD");
    if (status === 405 || status === 403 || status === 400) status = await probe("GET");
    return { ok: status >= 200 && status < 400, status };
  } catch {
    return { ok: false, status: null };
  }
};

const list = [...urls].sort();
console.log(`auditing ${list.length} unique source URLs…`);
const results = {};
const POOL = 8;
let i = 0;
await Promise.all(
  Array.from({ length: POOL }, async () => {
    while (i < list.length) {
      const url = list[i++];
      const r = await check(url);
      results[url] = { ...r, last_checked_at: new Date().toISOString() };
      if (!r.ok) console.log(`DEAD (${r.status ?? "network"}): ${url}`);
    }
  })
);

const dead = Object.values(results).filter((r) => !r.ok).length;
await writeFile(
  path.join(dir, "link_audit.json"),
  JSON.stringify(
    {
      $schema_note:
        "Written by scripts/audit-source-links.mjs. lib/link-audit.ts consults this before rendering provenance links: ok:false renders as plain text.",
      audited_at: new Date().toISOString(),
      results,
    },
    null,
    2
  ) + "\n"
);
console.log(`done: ${list.length} checked, ${dead} dead → data/research/link_audit.json`);
console.log("Commit the updated audit file so the deployed app picks it up.");
