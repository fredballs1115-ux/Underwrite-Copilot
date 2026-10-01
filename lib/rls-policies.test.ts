/**
 * A lint over the migrations' access rules, read from their SQL in file order.
 *
 * - No table may end up with an INSERT / UPDATE / DELETE / ALL policy whose
 *   predicate is a bare `true` unless a column grant narrows what that verb
 *   may touch. Reads over shared reference data (`for select using (true)`)
 *   are fine; a write anyone may make to a row everyone sees is how one
 *   signed-in user rewrote the alert banner on every other user's screen
 *   (review 11).
 * - Every table turns row-level security on in the file that creates it. The
 *   operator runs the files by hand, one at a time, and a table without it is
 *   open to the anon key through PostgREST from the moment its file runs.
 * - No SECURITY DEFINER function may be run by a signed-out caller unless it
 *   is listed below as deliberate. A definer function runs as its owner, past
 *   row-level security, so the anon key reaching one reads whatever the
 *   function reads: nearest_property handed the anon key the owner names and
 *   mailing addresses `properties` shows only to signed-in users (the review
 *   of 2026-09-30, migration 0036).
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "supabase", "migrations");

/** Each migration's SQL with its comments stripped, in the order they run. */
function migrations(dir = DIR): { file: string; sql: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "") }));
}

/** Every match of a pattern in the migrations, in the order they run. */
function inOrder(dir: string, pattern: RegExp): { m: RegExpMatchArray; file: string }[] {
  return migrations(dir).flatMap(({ file, sql }) => [...sql.matchAll(pattern)].map((m) => ({ m, file })));
}

interface Policy {
  table: string;
  name: string;
  cmd: string;
  body: string;
  file: string;
}

/** The final policy set after every migration has run, keyed table/name. */
export function finalPolicies(dir = DIR): Map<string, Policy> {
  const policies = new Map<string, Policy>();
  for (const { file, sql } of migrations(dir)) {
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
  const out = new Set<string>();
  for (const { sql } of migrations(dir)) {
    for (const m of sql.matchAll(/grant (update|insert) \([^)]*\) on public\.([a-z_]+) to authenticated/gi)) {
      out.add(`${m[2]}/${m[1].toLowerCase()}`);
    }
  }
  return out;
}

const bareTrue = (body: string) => /\b(using|with check)\s*\(\s*true\s*\)/i.test(body);

/**
 * Every table the migrations create that does not turn row-level security on
 * in its own file, or that a later file turns it off for — as "<file>: <table>".
 */
export function tablesWithoutRls(dir = DIR): string[] {
  const open: string[] = [];
  const disabled = new Set(
    inOrder(dir, /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-z_][a-z0-9_]*)\s+disable\s+row\s+level\s+security/gi)
      .map(({ m }) => m[1].toLowerCase()),
  );
  for (const { file, sql } of migrations(dir)) {
    const enabled = new Set(
      [...sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi)]
        .map((m) => m[1].toLowerCase()),
    );
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
      const table = m[1].toLowerCase();
      if (!enabled.has(table) || disabled.has(table)) open.push(`${file}: ${table}`);
    }
  }
  return open;
}

export interface FunctionState {
  /** the last definition's attributes (a `create or replace` restates them all) */
  definer: boolean;
  trigger: boolean;
  searchPath: boolean;
  /** argument counts seen across definitions — more than one is an overload */
  arities: Set<number>;
  /** who holds EXECUTE after every grant and revoke */
  holders: Set<string>;
  file: string;
}

/**
 * A new function's EXECUTE holders: Postgres grants it to PUBLIC, and
 * Supabase's default privileges on the public schema grant it to these three
 * roles by name — so `revoke … from public` alone leaves anon holding it.
 * A `create or replace` keeps the grants a function already has.
 */
const NEW_FUNCTION_HOLDERS = ["public", "anon", "authenticated", "service_role"];

/**
 * Every public function the migrations define, with its final attributes and
 * EXECUTE holders, replayed in the order the statements run. Grants and
 * revokes are read by function name: `arities` shows when a name is
 * overloaded, which this reader would have to learn signatures for.
 */
export function finalFunctions(dir = DIR): { functions: Map<string, FunctionState>; unknown: string[] } {
  type Event =
    | { at: number; kind: "create"; name: string; args: string; header: string; file: string }
    | { at: number; kind: "grant" | "revoke"; names: string[]; roles: string[]; file: string }
    | { at: number; kind: "drop"; name: string; file: string };
  const functions = new Map<string, FunctionState>();
  const unknown: string[] = [];
  for (const { file, sql } of migrations(dir)) {
    const events: Event[] = [];
    for (const m of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)([\s\S]*?)\bas\s+\$[a-z_]*\$/gi,
    )) {
      events.push({ at: m.index ?? 0, kind: "create", name: m[1].toLowerCase(), args: m[2], header: m[3], file });
    }
    for (const m of sql.matchAll(
      /\b(grant|revoke)\s+(?:execute|all(?:\s+privileges)?)\s+on\s+function\s+([\s\S]+?)\s+(?:to|from)\s+((?:[a-z_]+\s*,\s*)*[a-z_]+)/gi,
    )) {
      events.push({
        at: m.index ?? 0,
        kind: m[1].toLowerCase() as "grant" | "revoke",
        names: [...m[2].matchAll(/public\.([a-z_][a-z0-9_]*)\s*\(/gi)].map((n) => n[1].toLowerCase()),
        roles: m[3].split(",").map((r) => r.trim().toLowerCase()),
        file,
      });
    }
    for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
      events.push({ at: m.index ?? 0, kind: "drop", name: m[1].toLowerCase(), file });
    }
    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (e.kind === "create") {
        const prior = functions.get(e.name);
        const args = e.args.trim();
        functions.set(e.name, {
          definer: /\bsecurity\s+definer\b/i.test(e.header),
          trigger: /\breturns\s+trigger\b/i.test(e.header),
          searchPath: /\bset\s+search_path\b/i.test(e.header),
          arities: new Set([...(prior?.arities ?? []), args === "" ? 0 : args.split(",").length]),
          holders: prior?.holders ?? new Set(NEW_FUNCTION_HOLDERS),
          file: e.file,
        });
      } else if (e.kind === "drop") {
        functions.delete(e.name);
      } else {
        for (const name of e.names) {
          const f = functions.get(name);
          if (!f) {
            unknown.push(`${e.file}: ${e.kind} on ${name}, which no earlier migration creates`);
            continue;
          }
          for (const role of e.roles) {
            if (e.kind === "grant") f.holders.add(role);
            else f.holders.delete(role);
          }
        }
      }
    }
  }
  return { functions, unknown };
}

/**
 * SECURITY DEFINER functions a signed-out caller may run on purpose, with the
 * reason. Nothing else may be.
 */
const DELIBERATE_ANON: Record<string, string> = {
  invite_team_name:
    "0015: shows a live invite's team name before it is accepted; the 128-bit token is the permission. " +
    "(The join page now sits behind sign-in, so authenticated alone would do.)",
};

const anonCanRun = (f: FunctionState) => f.holders.has("anon") || f.holders.has("public");

export interface Trigger {
  table: string;
  name: string;
  timing: string;
  events: string;
  fn: string;
  file: string;
}

/** The final trigger set after every migration has run, keyed table/name. */
export function finalTriggers(dir = DIR): Map<string, Trigger> {
  const triggers = new Map<string, Trigger>();
  for (const { file, sql } of migrations(dir)) {
    const events: { at: number; apply: () => void }[] = [];
    for (const m of sql.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)\s+on\s+public\.([a-z_][a-z0-9_]*)/gi)) {
      events.push({ at: m.index ?? 0, apply: () => triggers.delete(`${m[2]}/${m[1]}`) });
    }
    for (const m of sql.matchAll(
      /create\s+trigger\s+([a-z_][a-z0-9_]*)\s+(before|after|instead\s+of)\s+([\s\S]+?)\s+on\s+public\.([a-z_][a-z0-9_]*)\s+for\s+each\s+(?:row|statement)\s+execute\s+(?:function|procedure)\s+public\.([a-z_][a-z0-9_]*)/gi,
    )) {
      events.push({
        at: m.index ?? 0,
        apply: () =>
          triggers.set(`${m[4]}/${m[1]}`, {
            name: m[1],
            timing: m[2].toLowerCase(),
            events: m[3].replace(/\s+/g, " ").toLowerCase(),
            table: m[4],
            fn: m[5],
            file,
          }),
      });
    }
    for (const e of events.sort((a, b) => a.at - b.at)) e.apply();
  }
  return triggers;
}

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

  it("every table turns row-level security on in the file that creates it", () => {
    expect(tablesWithoutRls()).toEqual([]);
  });

  it("the table reader sees every table (sanity: a table the app reads is found)", () => {
    const created = inOrder(DIR, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi).map(
      ({ m }) => m[1],
    );
    for (const t of ["deals", "analysis_jobs", "deal_shares", "properties", "recorded_sales", "submarkets"]) {
      expect(created).toContain(t);
    }
  });
});

describe("SECURITY DEFINER functions", () => {
  const { functions, unknown } = finalFunctions();
  const definers = [...functions.entries()].filter(([, f]) => f.definer);

  it("every grant and revoke names a function a migration made, and no name is overloaded", () => {
    expect(unknown).toEqual([]);
    const overloaded = [...functions.entries()].filter(([, f]) => f.arities.size > 1).map(([n]) => n);
    expect(overloaded).toEqual([]);
  });

  it("no signed-out caller may run one, unless it is listed as deliberate", () => {
    // A trigger function cannot be called on its own ("trigger functions can
    // only be called as triggers"), so its grant reaches nothing.
    const open = definers
      .filter(([name, f]) => !f.trigger && anonCanRun(f) && !(name in DELIBERATE_ANON))
      .map(([name, f]) => `${f.file}: ${name} — revoke execute from public, anon`);
    expect(open).toEqual([]);
  });

  it("the deliberate list names only definer functions anon can in fact run", () => {
    for (const name of Object.keys(DELIBERATE_ANON)) {
      const f = functions.get(name);
      expect(f, name).toBeDefined();
      expect(f!.definer && !f!.trigger && anonCanRun(f!), name).toBe(true);
    }
  });

  it("every one pins its search_path", () => {
    expect(definers.filter(([, f]) => !f.searchPath).map(([name, f]) => `${f.file}: ${name}`)).toEqual([]);
  });

  it("the public-record RPCs: the card's session keeps nearest_property, the comps pull's service role nearby_sales", () => {
    const nearest = functions.get("nearest_property")!;
    const nearby = functions.get("nearby_sales")!;
    expect(nearest.definer && nearby.definer).toBe(true);
    expect([...nearest.holders].sort()).toEqual(["authenticated", "service_role"]);
    expect([...nearby.holders].sort()).toEqual(["service_role"]);
  });
});

describe("the readers can fail (synthetic migrations)", () => {
  const made: string[] = [];
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });
  /** A throwaway migrations folder holding the given files. */
  const fixture = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "rls-lint-"));
    made.push(dir);
    for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
    return dir;
  };

  it("revoking a definer function from PUBLIC alone leaves anon holding it (Supabase's defaults)", () => {
    const dir = fixture({
      "0001_a.sql": `create or replace function public.peek(x int) returns int
        language sql stable security definer set search_path = public as $$ select x $$;
        revoke all on function public.peek(int) from public;`,
      "0002_b.sql": `create or replace function public.peek(x int) returns int
        language sql stable security definer set search_path = public as $$ select x + 1 $$;`,
    });
    const peek = finalFunctions(dir).functions.get("peek")!;
    expect(peek.definer).toBe(true);
    expect(anonCanRun(peek)).toBe(true); // a replace keeps grants; anon's was never revoked
    const closed = fixture({
      "0001_a.sql": `create function public.peek(x int) returns int
        language sql security definer set search_path = public as $$ select x $$;
        revoke execute on function public.peek(int) from public, anon;`,
    });
    expect(anonCanRun(finalFunctions(closed).functions.get("peek")!)).toBe(false);
  });

  it("a definer function without a pinned search_path, and a revoke of nothing, are both seen", () => {
    const dir = fixture({
      "0001_a.sql": `create function public.loose() returns int language sql security definer as $$ select 1 $$;
        revoke execute on function public.typo() from anon;`,
    });
    const { functions, unknown } = finalFunctions(dir);
    expect(functions.get("loose")!.searchPath).toBe(false);
    expect(unknown).toEqual(["0001_a.sql: revoke on typo, which no earlier migration creates"]);
  });

  it("a table left without row-level security, or given it only by a later file, is reported", () => {
    const dir = fixture({
      "0001_a.sql": `create table if not exists public.open_one (id int);
        create table if not exists public.late_one (id int);
        create table if not exists public.fine_one (id int);
        alter table public.fine_one enable row level security;`,
      "0002_b.sql": `alter table public.late_one enable row level security;`,
    });
    expect(tablesWithoutRls(dir)).toEqual(["0001_a.sql: open_one", "0001_a.sql: late_one"]);
  });
});

describe("the guards 0036 put on writes a user's session could otherwise shape", () => {
  const triggers = finalTriggers();
  const on = (table: string, name: string) => triggers.get(`${table}/${name}`);

  it("the free-deal cap runs on insert and on the updates that could dodge it", () => {
    expect(on("deals", "enforce_free_deal_cap")).toMatchObject({ timing: "before", events: "insert" });
    expect(on("deals", "enforce_free_deal_cap_update")).toMatchObject({
      timing: "before",
      events: "update of is_sample, team_id",
      fn: "enforce_free_deal_cap",
    });
  });

  it("a share link's token and expiry are the database's", () => {
    expect(on("deal_shares", "deal_shares_mint_guard")).toMatchObject({ timing: "before", events: "insert" });
    expect(on("deal_shares", "deal_shares_guard")).toMatchObject({ timing: "before", events: "update" });
  });

  it("a job's place in the worker's queue is the database's", () => {
    expect(on("analysis_jobs", "analysis_jobs_queue_guard")).toMatchObject({
      timing: "before",
      events: "insert or update of created_at",
    });
  });

  it("Ask's thread only grows", () => {
    expect(on("deals", "deal_qa_append_only")).toMatchObject({ timing: "before", events: "update of qa" });
  });
});
