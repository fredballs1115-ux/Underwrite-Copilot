/**
 * The pipeline's bulk stage change: the form's reader (lib/bulk-stage) and
 * the server action (`bulkSetStage`), driven over a fake of the reader's
 * session client shaped the way row-level security answers it — a deal the
 * reader cannot see is not in a read's answer, and a write RLS refuses
 * matches no row. The action writes only through that client and the
 * single change's guarded write (lib/stage-write), never the sample deal,
 * and counts what it changed and what it refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---- the database, as RLS answers the current caller ------------------------
type Deal = { stage: string; stage_history: unknown; updated_at: string | null; is_sample: boolean };
const db = {
  signedIn: true,
  /** every deal in the table */
  deals: new Map<string, Deal>(),
  /** the deals RLS lets the caller read (and so try to write) */
  readable: new Set<string>(),
  /** the deals RLS lets the caller write */
  writable: new Set<string>(),
  /** the ids a bulk read asked for */
  inAsked: [] as string[][],
  /** every UPDATE that landed: its id and its patch */
  written: [] as { id: string; patch: Record<string, unknown> }[],
  /** the client the action used — never the service role */
  admin: 0,
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    db.admin++;
    throw new Error("the bulk change never reaches for the service role");
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
const revalidated: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/billing", () => ({ getBilling: vi.fn(), isPro: async () => true }));
vi.mock("@/lib/public-comps/run", () => ({ claimRecordComps: vi.fn(async () => false), runRecordComps: vi.fn() }));
vi.mock("@/lib/jobs", () => ({
  claimJob: vi.fn(),
  releaseClaim: vi.fn(),
  analysisWorkerEnabled: () => false,
  workerSchemaReady: vi.fn(async () => false),
  newJobRow: vi.fn(() => ({})),
}));
vi.mock("@/lib/anthropic/pipeline", () => ({ runAnalysis: vi.fn(), runReconciliation: vi.fn() }));

vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: db.signedIn ? { id: ME, email: "me@x.com" } : null } }) },
    from(table: string) {
      if (table !== "deals") throw new Error(`unexpected table ${table}`);
      const eqs: Record<string, unknown> = {};
      const nulls = new Set<string>();
      let inIds: string[] | null = null;
      let patch: Record<string, unknown> | null = null;
      let single = false;
      const visible = (k: string) => db.readable.has(k) && db.deals.has(k);
      const run = () => {
        if (patch) {
          const k = String(eqs.id);
          const row = db.deals.get(k);
          const matches =
            !!row &&
            visible(k) &&
            db.writable.has(k) &&
            (nulls.has("stage") ? row.stage == null : row.stage === eqs.stage) &&
            (nulls.has("updated_at") ? row.updated_at == null : row.updated_at === eqs.updated_at);
          if (!matches) return { data: [], error: null };
          Object.assign(row, patch);
          db.written.push({ id: k, patch });
          return { data: [{ id: k }], error: null };
        }
        if (inIds) {
          db.inAsked.push(inIds);
          return { data: inIds.filter(visible).map((k) => ({ id: k, is_sample: db.deals.get(k)!.is_sample })), error: null };
        }
        const k = String(eqs.id);
        if (!visible(k)) return { data: single ? null : [], error: null };
        const r = db.deals.get(k)!;
        return { data: { stage: r.stage, stage_history: r.stage_history, updated_at: r.updated_at }, error: null };
      };
      const q = {
        select: () => q,
        in: (_c: string, v: string[]) => {
          inIds = v;
          return q;
        },
        eq: (c: string, v: unknown) => {
          eqs[c] = v;
          return q;
        },
        is: (c: string) => {
          nulls.add(c);
          return q;
        },
        update: (p: Record<string, unknown>) => {
          patch = p;
          return q;
        },
        maybeSingle: () => {
          single = true;
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          return Promise.resolve(run()).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client };
});

import { bulkSetStage } from "@/app/(app)/deals/actions";
import { BULK_STAGE_MAX, bulkStageSentence, readBulkStageForm } from "./bulk-stage";

function form(stage: string, ids: string[]): FormData {
  const fd = new FormData();
  fd.set("stage", stage);
  for (const d of ids) fd.append("dealId", d);
  return fd;
}

function put(n: number, over: Partial<Deal> = {}, rls: { read?: boolean; write?: boolean } = {}) {
  db.deals.set(id(n), { stage: "screening", stage_history: [], updated_at: "2026-10-01T00:00:00.000Z", is_sample: false, ...over });
  if (rls.read !== false) db.readable.add(id(n));
  if (rls.write !== false && rls.read !== false) db.writable.add(id(n));
}

beforeEach(() => {
  db.signedIn = true;
  db.deals.clear();
  db.readable.clear();
  db.writable.clear();
  db.inAsked.length = 0;
  db.written.length = 0;
  db.admin = 0;
  revalidated.length = 0;
});

describe("the bulk form's reader", () => {
  it("takes one of the ladder's stages, and deal ids — a repeat once, anything else dropped", () => {
    const r = readBulkStageForm(form("tracking", [id(1), id(1).toUpperCase(), "not-an-id", "", id(2)]));
    expect(r).toEqual({ ok: true, stage: "tracking", ids: [id(1), id(2)] });
  });

  it("refuses a stage off the ladder, no deal at all, and more than the limit — whole, never cut", () => {
    expect(readBulkStageForm(form("reviewing", [id(1)]))).toEqual({ ok: false, error: "stage" });
    expect(readBulkStageForm(form("", [id(1)]))).toEqual({ ok: false, error: "stage" });
    expect(readBulkStageForm(form("dead", ["x", "y"]))).toEqual({ ok: false, error: "none" });
    const many = Array.from({ length: BULK_STAGE_MAX + 1 }, (_, k) => id(k + 1));
    expect(readBulkStageForm(form("dead", many))).toEqual({ ok: false, error: "toomany" });
    expect(readBulkStageForm(form("dead", many.slice(0, BULK_STAGE_MAX))).ok).toBe(true);
    expect(BULK_STAGE_MAX).toBe(50);
  });

  it("says what a change did, in the stage's own words", () => {
    expect(bulkStageSentence({ ok: true, stage: "tracking", changed: 3, unchanged: 1, refused: 2 })).toBe(
      "3 deals moved to Tracking; 1 already there; 2 could not be changed.",
    );
    expect(bulkStageSentence({ ok: true, stage: "dead", changed: 1, unchanged: 0, refused: 0 })).toBe("1 deal marked Dead.");
    expect(bulkStageSentence({ ok: true, stage: "dead", changed: 0, unchanged: 0, refused: 1 })).toBe(
      "No deals marked Dead; 1 could not be changed.",
    );
    expect(bulkStageSentence({ ok: false, error: "toomany" })).toMatch(/50 deals at most/);
  });
});

describe("bulkSetStage", () => {
  it("moves the reader's deals through the guarded write, each change dated in its history", async () => {
    put(1);
    put(2, { stage: "tracking", stage_history: [{ stage: "tracking", at: "2026-09-01T00:00:00.000Z" }] });
    const r = await bulkSetStage(form("active_pursuit", [id(1), id(2)]));
    expect(r).toEqual({ ok: true, stage: "active_pursuit", changed: 2, unchanged: 0, refused: 0 });
    expect(db.written.map((w) => w.id).sort()).toEqual([id(1), id(2)]);
    const two = db.written.find((w) => w.id === id(2))!.patch;
    expect(two.stage).toBe("active_pursuit");
    expect(two.stage_history).toEqual([
      { stage: "tracking", at: "2026-09-01T00:00:00.000Z" },
      { stage: "active_pursuit", at: two.updated_at },
    ]);
    expect(revalidated).toEqual(expect.arrayContaining([`/deals/${id(1)}`, `/deals/${id(2)}`, "/deals"]));
    expect(db.admin).toBe(0);
  });

  it("refuses what RLS hides, what it will not let the reader write, and the sample deal — writing none of them", async () => {
    put(1); // the reader's own
    put(2, {}, { read: false }); // another account's: not in the read's answer
    put(3, {}, { write: false }); // readable, but RLS refuses the write
    put(4, { is_sample: true }); // the sample deal
    put(5, { stage: "dead" }); // already there
    const r = await bulkSetStage(form("dead", [id(1), id(2), id(3), id(4), id(5)]));
    expect(r).toEqual({ ok: true, stage: "dead", changed: 1, unchanged: 1, refused: 3 });
    expect(db.written.map((w) => w.id)).toEqual([id(1)]);
    expect(db.deals.get(id(2))!.stage).toBe("screening");
    expect(db.deals.get(id(3))!.stage).toBe("screening");
    expect(db.deals.get(id(4))!.stage).toBe("screening");
    // One read for which deals the reader may see, of the ids asked for.
    expect(db.inAsked).toEqual([[id(1), id(2), id(3), id(4), id(5)]]);
    expect(revalidated).not.toContain(`/deals/${id(3)}`);
  });

  it("asks nothing of the database for a request it refuses, and nothing of a reader not signed in", async () => {
    put(1);
    const many = Array.from({ length: BULK_STAGE_MAX + 1 }, (_, k) => id(k + 1));
    expect(await bulkSetStage(form("dead", many))).toEqual({ ok: false, error: "toomany" });
    expect(await bulkSetStage(form("nowhere", [id(1)]))).toEqual({ ok: false, error: "stage" });
    expect(await bulkSetStage(form("dead", []))).toEqual({ ok: false, error: "none" });
    db.signedIn = false;
    expect(await bulkSetStage(form("dead", [id(1)]))).toEqual({ ok: false, error: "auth" });
    expect(db.inAsked).toEqual([]);
    expect(db.written).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it("revalidates nothing where nothing moved", async () => {
    put(1, { stage: "tracking" });
    expect(await bulkSetStage(form("tracking", [id(1)]))).toEqual({ ok: true, stage: "tracking", changed: 0, unchanged: 1, refused: 0 });
    expect(revalidated).toEqual([]);
  });
});
