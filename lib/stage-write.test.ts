// A deal's stage and history written onto the row as read (audit C8, L4):
// the outcome's write had put the old history back over a stage change a
// teammate made between its read and its write.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeStageGuarded, type StageRow } from "./stage-write";
import { parseStageHistory } from "./stages";
import { withOutcome } from "./deal-outcome";

/** One deals row, its updates filtered as PostgREST filters them; `between`
 *  runs once, after the first read — a teammate's write landing in between. */
function fakeDb(row: StageRow, between?: (row: StageRow) => void) {
  let reads = 0;
  const db = {
    writes: 0,
    from() {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      const q = {
        select() {
          return q;
        },
        update(p: Record<string, unknown>) {
          patch = p;
          return q;
        },
        eq(col: string, v: unknown) {
          if (col !== "id") filters.push([col, v]);
          return q;
        },
        is(col: string, v: unknown) {
          filters.push([col, v]);
          return q;
        },
        async maybeSingle() {
          const data = { ...row };
          if (reads++ === 0 && between) between(row);
          return { data, error: null };
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          // the update's `.select("id")`
          const match = filters.every(([c, v]) => (row as unknown as Record<string, unknown>)[c] === v);
          if (patch && match) {
            Object.assign(row, patch);
            db.writes++;
            resolve({ data: [{ id: "d1" }], error: null });
          } else resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
  return db;
}

const at = (d: string) => `2026-10-${d}T12:00:00.000Z`;

describe("writeStageGuarded", () => {
  it("writes onto the row as read", async () => {
    const row: StageRow = { stage: "screening", stage_history: [{ stage: "screening", at: at("01") }], updated_at: at("01") };
    const db = fakeDb(row);
    const res = await writeStageGuarded(db as unknown as SupabaseClient, "d1", (r) => ({
      patch: { stage: "tracking", stage_history: [...parseStageHistory(r.stage_history), { stage: "tracking", at: at("02") }], updated_at: at("02") },
    }));
    expect(res).toEqual({ ok: true });
    expect(row.stage).toBe("tracking");
  });

  it("keeps a stage change made between the outcome's read and its write", async () => {
    const dead = [
      { stage: "screening", at: at("01") },
      { stage: "dead", at: at("02") },
    ];
    const row: StageRow = { stage: "dead", stage_history: dead, updated_at: at("02") };
    // A teammate revives the deal while the trade is being saved.
    const db = fakeDb(row, (r) => {
      r.stage = "screening";
      r.stage_history = [...dead, { stage: "screening", at: at("03") }];
      r.updated_at = at("03");
    });
    const res = await writeStageGuarded(db as unknown as SupabaseClient, "d1", (r) => {
      const history = withOutcome(r.stage, parseStageHistory(r.stage_history), { reason: "price", trade: null });
      return history ? { patch: { stage_history: history, updated_at: at("04") } } : { skip: "refused" };
    });
    // Read again on the revived deal, the outcome no longer applies: nothing
    // is written, and the teammate's move stands.
    expect(res).toEqual({ ok: false, why: "refused" });
    expect(db.writes).toBe(0);
    expect(parseStageHistory(row.stage_history).map((h) => h.stage)).toEqual(["screening", "dead", "screening"]);
  });

  it("two stage moves in a race both land in the history", async () => {
    const row: StageRow = { stage: "screening", stage_history: [{ stage: "screening", at: at("01") }], updated_at: at("01") };
    const db = fakeDb(row, (r) => {
      r.stage = "tracking";
      r.stage_history = [...parseStageHistory(r.stage_history), { stage: "tracking", at: at("02") }];
      r.updated_at = at("02");
    });
    const res = await writeStageGuarded(db as unknown as SupabaseClient, "d1", (r) => ({
      patch: { stage: "active_pursuit", stage_history: [...parseStageHistory(r.stage_history), { stage: "active_pursuit", at: at("03") }], updated_at: at("03") },
    }));
    expect(res).toEqual({ ok: true });
    expect(parseStageHistory(row.stage_history).map((h) => h.stage)).toEqual(["screening", "tracking", "active_pursuit"]);
  });

  it("gives up after its attempts where the row keeps moving, and says so", async () => {
    const row: StageRow = { stage: "screening", stage_history: [], updated_at: at("01") };
    let n = 0;
    const db = fakeDb(row);
    const moving = {
      ...db,
      from() {
        row.updated_at = at(String(10 + n++));
        const q = db.from();
        const read = q.maybeSingle;
        q.maybeSingle = async () => {
          const r = await read();
          row.updated_at = at(String(10 + n++));
          return r;
        };
        return q;
      },
    };
    const res = await writeStageGuarded(moving as unknown as SupabaseClient, "d1", () => ({ patch: { stage: "tracking" } }), 2);
    expect(res).toEqual({ ok: false, why: "conflict" });
  });
});
