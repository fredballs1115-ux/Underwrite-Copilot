/**
 * The ⌘K palette's search (app/api/palette/route.ts). It read the fifty most
 * recently updated deals and filtered them in the browser, so a deal
 * updated fifty-one deals ago could not be found by any name. A typed query
 * now searches every deal the reader can see, by its name, on the server —
 * driven here over a fake database that answers as row-level security does
 * and matches a LIKE pattern the way PostgREST and Postgres would.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTE_LIMIT, PALETTE_QUERY_MAX, asksServer, nameSearchPattern, paletteCall, paletteMoreLine, uniqueById } from "./palette-search";

describe("nameSearchPattern — a typed query as an ILIKE pattern on the name", () => {
  it("wraps the text, trimmed, and answers null for nothing typed", () => {
    expect(nameSearchPattern("Harbor")).toBe("%Harbor%");
    expect(nameSearchPattern("  harbor view ")).toBe("%harbor view%");
    for (const empty of [null, undefined, "", "   "]) expect(nameSearchPattern(empty)).toBeNull();
  });

  it("escapes LIKE's own characters, so a name is matched as typed", () => {
    expect(nameSearchPattern("50%")).toBe("%50\\%%");
    expect(nameSearchPattern("Lot_7")).toBe("%Lot\\_7%");
    expect(nameSearchPattern("A\\B")).toBe("%A\\\\B%");
    // PostgREST turns a * into % before Postgres sees it, escape or not:
    // sent as one character's wildcard, it can never widen the search.
    expect(nameSearchPattern("Unit*1")).toBe("%Unit_1%");
    expect(nameSearchPattern("***")).not.toContain("*");
  });

  it("caps the text at a name's length", () => {
    expect(nameSearchPattern("x".repeat(500))).toBe(`%${"x".repeat(PALETTE_QUERY_MAX)}%`);
  });
});

describe("the palette's side — when it asks, and what it lists", () => {
  it("asks the server about a typed query unless the recent list already holds every deal", () => {
    expect(asksServer("harbor", PALETTE_LIMIT)).toBe(true);
    // Before the recent list has loaded, a typed query asks anyway.
    expect(asksServer("harbor", null)).toBe(true);
    // A list shorter than the limit is every deal the reader can see.
    expect(asksServer("harbor", PALETTE_LIMIT - 1)).toBe(false);
    expect(asksServer("harbor", 0)).toBe(false);
    // Nothing typed: the recent list is the answer.
    expect(asksServer("  ", PALETTE_LIMIT)).toBe(false);
  });

  it("lists each deal once, the recent ones first, then what searches found beyond them", () => {
    const d = (id: string) => ({ id });
    expect(uniqueById([d("a"), d("b")], [d("b"), d("z")], [d("a"), d("y")])).toEqual([d("a"), d("b"), d("z"), d("y")]);
    expect(uniqueById()).toEqual([]);
  });

  it("draws a deal's call the way the pipeline card does: a run outranks the call on file (research pass 34)", () => {
    // The call on file, where no run is replacing it.
    expect(paletteCall("pass", null)).toEqual({ dot: "bg-pass", word: null });
    expect(paletteCall("pass_on", null)).toEqual({ dot: "bg-kill", word: null });
    expect(paletteCall(null, null)).toEqual({ dot: "bg-line", word: null });
    // A re-screen running: the previous call is not drawn as the current one.
    expect(paletteCall("pass", "running")).toEqual({ dot: "pulse-bar bg-brand", word: "Re-screening" });
    expect(paletteCall(null, "running")).toEqual({ dot: "pulse-bar bg-brand", word: "Screening" });
    // Stalled and failed, in the pipeline's words.
    expect(paletteCall("pass", "stalled")).toEqual({ dot: "bg-caution", word: "Stalled" });
    expect(paletteCall("caution", "failed")).toEqual({ dot: "bg-kill", word: "Failed" });
  });
});

// ── The route, over a fake database ─────────────────────────────────────────

const READER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "33333333-3333-4333-8333-333333333333";

type Row = { id: string; name: string; user_id: string; updated_at: string; address: { label: string } | null; verdict?: { verdict: string } | null };
type Job = { deal_id: string; status: string; step: string | null; updated_at: string; created_at: string };

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  deals: [] as Row[],
  documents: [] as { deal_id: string; filename: string }[],
  /** each deal's runs, newest first as the route asks for them */
  jobs: [] as Job[],
  /** each query's filters, in order */
  calls: [] as { table: string; ilike?: [string, string]; order?: string; limit?: number; in?: string; range?: [number, number] }[],
  /** the most rows one response answers, as a project's max rows */
  maxRows: 1000,
  failTable: null as string | null,
}));

/** A LIKE pattern as Postgres reads it, after PostgREST has turned each `*`
 *  into `%`: `\` escapes the next character, `%` is any run, `_` any one. */
function likeMatches(pattern: string, value: string): boolean {
  const p = pattern.replace(/\*/g, "%");
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    const lit = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (c === "\\" && i + 1 < p.length) re += lit(p[++i]);
    else if (c === "%") re += "[\\s\\S]*";
    else if (c === "_") re += "[\\s\\S]";
    else re += lit(c);
  }
  return new RegExp(`^${re}$`, "i").test(value);
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => {
      const call: (typeof db.calls)[number] = { table };
      let ids: string[] | null = null;
      const q = {
        select: () => q,
        ilike: (col: string, pattern: string) => {
          call.ilike = [col, pattern];
          return q;
        },
        order: (col: string, opts?: { ascending: boolean }) => {
          // The first order is the one a read is sorted by; a second is its
          // tie-break.
          call.order ??= `${col} ${opts?.ascending === false ? "desc" : "asc"}`;
          return q;
        },
        range: (from: number, to: number) => {
          call.range = [from, to];
          return q;
        },
        limit: (n: number) => {
          call.limit = n;
          return q;
        },
        in: (col: string, values: string[]) => {
          call.in = col;
          ids = values;
          return q;
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          db.calls.push(call);
          if (db.failTable === table) {
            (resolve as unknown as (v: { data: null; error: { message: string } }) => void)({ data: null, error: { message: "timeout" } });
            return;
          }
          // Row-level security: the reader's own deals, never another's.
          const visible = db.deals.filter((d) => d.user_id === db.user?.id);
          if (table === "deal_documents") {
            const docs = call.ilike
              ? db.documents
                  .map((doc, k) => ({ id: `doc-${k}`, ...doc }))
                  .filter((doc) => likeMatches(call.ilike![1], doc.filename) && visible.some((d) => d.id === doc.deal_id))
              : db.documents.filter((doc) => ids!.includes(doc.deal_id));
            resolve({ data: call.range ? docs.slice(call.range[0], call.range[1] + 1) : docs, error: null });
            return;
          }
          if (table === "analysis_jobs") {
            // Row-level security: runs of the reader's own deals.
            const own = new Set(visible.map((d) => d.id));
            resolve({ data: db.jobs.filter((j) => ids!.includes(j.deal_id) && own.has(j.deal_id)), error: null });
            return;
          }
          let rows = ids ? visible.filter((d) => ids!.includes(d.id)) : visible;
          const field = (d: (typeof rows)[number]) =>
            call.ilike![0] === "address->>label" ? ((d.address as { label?: string } | null)?.label ?? "") : d.name;
          if (call.ilike) rows = rows.filter((d) => likeMatches(call.ilike![1], field(d)));
          if (call.order) rows = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          if (call.limit != null) rows = rows.slice(0, call.limit);
          // A project's max rows: at most db.maxRows a response.
          if (call.range) rows = rows.slice(call.range[0], Math.min(call.range[1] + 1, call.range[0] + db.maxRows));
          resolve({
            data: rows.map((d) => ({ id: d.id, name: d.name, market: "Baltimore, MD", verdict: d.verdict ?? null, stage: "screening", address: d.address, updated_at: d.updated_at })),
            error: null,
          });
        },
      };
      return q;
    },
  }),
}));

import { GET } from "@/app/api/palette/route";

const ask = async (q?: string) => {
  const res = await GET(new Request(`http://localhost/api/palette${q == null ? "" : `?q=${encodeURIComponent(q)}`}`));
  return { status: res.status, body: (await res.json()) as { deals: { id: string; name: string; address: string; docs: string }[] } };
};

describe("GET /api/palette — the recent deals, or every deal a typed query names", () => {
  beforeEach(() => {
    db.user = { id: READER };
    db.calls = [];
    // Sixty of the reader's deals, one a day, the oldest first — and the
    // oldest is the one looked for.
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
    db.deals = Array.from({ length: 60 }, (_, n) => ({
      id: `deal-${n}`,
      name: n === 0 ? "Harbor View Apartments" : n === 1 ? "Tower at 50% occupancy" : n === 2 ? "Lot_7 Flex" : `Maple Court ${n}`,
      user_id: READER,
      updated_at: day(n),
      address: n === 0 ? { label: "12 Harbor Rd, Baltimore, MD" } : null,
    }));
    // Another account's deal of the same name, which the reader must never get.
    db.deals.push({ id: "theirs", name: "Harbor View Apartments", user_id: STRANGER, updated_at: day(90), address: null });
    db.documents = [{ deal_id: "deal-0", filename: "Harbor View rent roll.xlsx" }];
    db.jobs = [];
  });

  it("refuses a signed-out caller before reading anything, as before", async () => {
    db.user = null;
    const { status, body } = await ask("harbor");
    expect(status).toBe(401);
    expect(body.deals).toEqual([]);
    expect(db.calls).toEqual([]);
  });

  it("with nothing typed, the most recently updated deals — the oldest is not among them", async () => {
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body.deals).toHaveLength(PALETTE_LIMIT);
    expect(body.deals[0].id).toBe("deal-59");
    expect(body.deals.map((d) => d.name)).not.toContain("Harbor View Apartments");
    expect(db.calls[0]).toEqual({ table: "deals", order: "updated_at desc", limit: PALETTE_LIMIT });
    // An empty query is no search.
    expect((await ask("   ")).body.deals).toHaveLength(PALETTE_LIMIT);
  });

  it("a typed query finds the deal by its name however long ago it was updated, with its address and documents", async () => {
    const { body } = await ask("harbor");
    expect(db.calls[0]).toMatchObject({ table: "deals", ilike: ["name", "%harbor%"], order: "updated_at desc" });
    expect(body.deals.map((d) => d.id)).toEqual(["deal-0"]);
    expect(body.deals[0]).toMatchObject({ address: "12 Harbor Rd, Baltimore, MD", docs: "Harbor View rent roll.xlsx" });
    // Row-level security still decides whose: the other account's twin is not there.
    expect(body.deals.map((d) => d.id)).not.toContain("theirs");
  });

  it("finds an old deal by its address or a document's file name, not only by its name (research pass 42)", async () => {
    db.deals[5].address = { label: "900 Pratt St, Baltimore, MD" };
    db.documents.push({ deal_id: "deal-3", filename: "Ellicott OM final.pdf" });
    expect((await ask("pratt st")).body.deals.map((d) => d.id)).toEqual(["deal-5"]);
    expect((await ask("ellicott")).body.deals.map((d) => d.id)).toEqual(["deal-3"]);
    // a stranger's document names no deal of the reader's
    db.documents.push({ deal_id: "theirs", filename: "Ellicott OM final.pdf" });
    expect((await ask("ellicott")).body.deals.map((d) => d.id)).toEqual(["deal-3"]);
  });

  it("says how many matched where it lists fewer, counting past one response's rows", async () => {
    db.maxRows = 7;
    const { status, body } = await ask("maple court");
    db.maxRows = 1000;
    expect(status).toBe(200);
    expect(body.deals).toHaveLength(PALETTE_LIMIT);
    expect(body.deals[0].id).toBe("deal-59");
    expect((body as unknown as { total: number }).total).toBe(57);
    expect(paletteMoreLine(PALETTE_LIMIT, 57)).toBe(
      "Listing the 50 most recently updated of the 57 deals whose name, address or document name holds this — type more to narrow.",
    );
    expect(paletteMoreLine(3, 3)).toBeNull();
    expect(paletteMoreLine(3, null)).toBeNull();
  });

  it("the palette says the count under its results", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(app)/command-palette.tsx", "utf8");
    expect(src).toContain("paletteMoreLine(answered.shown ?? 0, answered.total)");
    expect(src).toContain('data-qa="palette-more"');
  });

  it("answers an error, never no matches, where a read failed", async () => {
    db.failTable = "deal_documents";
    const { status } = await ask("harbor");
    db.failTable = null;
    expect(status).toBe(500);
  });

  it("matches LIKE's own characters as typed, never as wildcards", async () => {
    expect((await ask("50%")).body.deals.map((d) => d.name)).toEqual(["Tower at 50% occupancy"]);
    expect((await ask("t_7")).body.deals.map((d) => d.name)).toEqual(["Lot_7 Flex"]);
    // Unescaped, "%" matched every name and "_" any character: typed, each
    // finds the one name that holds it.
    expect((await ask("%")).body.deals.map((d) => d.name)).toEqual(["Tower at 50% occupancy"]);
    expect((await ask("_")).body.deals.map((d) => d.name)).toEqual(["Lot_7 Flex"]);
    for (const c of db.calls) if (c.ilike) expect(c.ilike[1]).not.toContain("*");
  });

  it("carries each deal's latest run, read as the pipeline reads it, so the palette never draws a call a run is replacing (research pass 34)", async () => {
    const now = Date.now();
    const at = (msAgo: number) => new Date(now - msAgo).toISOString();
    const go = { verdict: "pass" };
    db.deals = [
      { id: "settled", name: "Settled", user_id: READER, updated_at: at(1_000), address: null, verdict: go },
      { id: "rescreen", name: "Re-screened", user_id: READER, updated_at: at(2_000), address: null, verdict: go },
      { id: "stalled", name: "Stalled", user_id: READER, updated_at: at(3_000), address: null, verdict: go },
      { id: "failed", name: "Failed", user_id: READER, updated_at: at(4_000), address: null, verdict: go },
      { id: "first", name: "First screen", user_id: READER, updated_at: at(5_000), address: null, verdict: null },
    ];
    db.jobs = [
      { deal_id: "settled", status: "done", step: "verdict", updated_at: at(60_000), created_at: at(120_000) },
      { deal_id: "rescreen", status: "running", step: "challenge", updated_at: at(30_000), created_at: at(90_000) },
      { deal_id: "stalled", status: "running", step: "challenge", updated_at: at(11 * 60_000), created_at: at(20 * 60_000) },
      { deal_id: "failed", status: "error", step: "comps", updated_at: at(60_000), created_at: at(120_000) },
      { deal_id: "first", status: "running", step: "extract", updated_at: at(10_000), created_at: at(20_000) },
    ];
    const { body } = await ask();
    const runs = Object.fromEntries((body.deals as unknown as { id: string; call: string | null; run: string | null }[]).map((d) => [d.id, [d.call, d.run]]));
    expect(runs).toEqual({
      settled: ["pass", null],
      rescreen: ["pass", "running"],
      stalled: ["pass", "stalled"],
      failed: ["pass", "failed"],
      first: [null, "running"],
    });
    // What the palette draws for each.
    expect(paletteCall("pass", "running").word).toBe("Re-screening");
    // The jobs are read for the listed deals only.
    expect(db.calls.find((c) => c.table === "analysis_jobs")).toMatchObject({ in: "deal_id", order: "created_at desc" });
  });
});
