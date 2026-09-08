/**
 * A lint over the migrations' row-level-security policies, in file order: no
 * table may end up with an INSERT / UPDATE / DELETE / ALL policy whose
 * predicate is a bare `true` unless a column grant narrows what that verb may
 * touch. Reads over shared reference data (`for select using (true)`) are
 * fine; a write anyone may make to a row everyone sees is how one signed-in
 * user rewrote the alert banner on every other user's screen (review 11).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "supabase", "migrations");

interface Policy {
  table: string;
  name: string;
  cmd: string;
  body: string;
  file: string;
}

/** The final policy set after every migration has run, keyed table/name. */
export function finalPolicies(dir = DIR): Map<string, Policy> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const policies = new Map<string, Policy>();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/drop policy if exists "([^"]+)" on public\.([a-z_]+)/gi)) {
      policies.delete(`${m[2]}/${m[1]}`);
    }
    for (const m of sql.matchAll(
      /create policy "([^"]+)" on public\.([a-z_]+)\s+for (select|insert|update|delete|all)\b([\s\S]*?);/gi,
    )) {
      policies.set(`${m[2]}/${m[1]}`, { name: m[1], table: m[2], cmd: m[3].toLowerCase(), body: m[4], file });
    }
  }
  return policies;
}

/** Tables whose write verb is narrowed to named columns by a later grant. */
export function columnGrantedWrites(dir = DIR): Set<string> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const out = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/grant (update|insert) \([^)]*\) on public\.([a-z_]+) to authenticated/gi)) {
      out.add(`${m[2]}/${m[1].toLowerCase()}`);
    }
  }
  return out;
}

const bareTrue = (body: string) => /\b(using|with check)\s*\(\s*true\s*\)/i.test(body);

describe("row-level security policies", () => {
  it("no write policy is a bare true without a column grant behind it", () => {
    const granted = columnGrantedWrites();
    const open = [...finalPolicies().values()].filter(
      (p) => p.cmd !== "select" && bareTrue(p.body) && !granted.has(`${p.table}/${p.cmd}`),
    );
    expect(open.map((p) => `${p.file}: ${p.table} "${p.name}" for ${p.cmd}`)).toEqual([]);
  });

  it("reads the policy set (sanity: the tables the app depends on are covered)", () => {
    const tables = new Set([...finalPolicies().values()].map((p) => p.table));
    for (const t of ["deals", "deal_documents", "analysis_jobs", "deal_shares", "regulatory_alerts"]) {
      expect(tables.has(t)).toBe(true);
    }
  });

  it("the alerts table lets users dismiss, not rewrite", () => {
    expect(columnGrantedWrites().has("regulatory_alerts/update")).toBe(true);
  });
});
