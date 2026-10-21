// Every screen kept (migration 0038): the writes are best-effort and the
// reads fall back to none, so the app works before the table exists.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCREEN_SNAPSHOTS, keepScreen, keptScreensByDeal, priorScreenOf, readKeptScreens, screenSnapshotRow } from "./screen-history";

const kept = { at: "2026-10-01T00:00:00Z", extraction: { a: 1 }, verdict: { verdict: "caution", generatedAt: "2026-09-10T12:00:00Z" }, challenges: { challenges: [] } };

/** A client whose one table answers as given, recording what was asked. */
function client(answer: { data?: unknown; error?: { message: string } | null; throws?: boolean }) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const q = (table: string) => {
    const chain: Record<string, unknown> = {};
    const record = (op: string) => (...args: unknown[]) => {
      calls.push({ table, op, args });
      if (answer.throws) throw new Error("fetch failed");
      return chain;
    };
    for (const op of ["upsert", "select", "eq", "order", "limit"]) chain[op] = record(op);
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
    return chain;
  };
  return { from: q, calls } as unknown as { from: (t: string) => unknown; calls: typeof calls };
}

describe("screen-history", () => {
  it("a kept screen's row is keyed by the deal and its verdict's own stamp; a screen with no stamp is not kept", () => {
    expect(screenSnapshotRow("d1", kept)).toEqual({ deal_id: "d1", verdict_at: "2026-09-10T12:00:00Z", snapshot: kept });
    expect(screenSnapshotRow("d1", { ...kept, verdict: { verdict: "caution" } })).toBeNull();
    expect(screenSnapshotRow("d1", { ...kept, verdict: null })).toBeNull();
    expect(screenSnapshotRow("d1", { ...kept, verdict: { generatedAt: "not a date" } })).toBeNull();
  });

  it("keeps a screen with a duplicate-ignoring upsert, and swallows an error — the table not made yet — or a throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = client({});
    expect(await keepScreen(ok as never, "d1", kept)).toBe(true);
    expect(ok.calls[0]).toEqual({ table: SCREEN_SNAPSHOTS, op: "upsert", args: [screenSnapshotRow("d1", kept), { onConflict: "deal_id,verdict_at", ignoreDuplicates: true }] });
    expect(await keepScreen(client({ error: { message: 'relation "public.screen_snapshots" does not exist' } }) as never, "d1", kept)).toBe(false);
    expect(await keepScreen(client({ throws: true }) as never, "d1", kept)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("reads a deal's kept screens as the track record reads a prior screen, and none where the table cannot be read", async () => {
    const rows = [
      { deal_id: "d1", verdict_at: "2026-09-10T12:00:00Z", verdict: kept.verdict, challenges: kept.challenges },
      { deal_id: "d1", verdict_at: "2026-09-01T12:00:00Z", verdict: null, challenges: null },
      { deal_id: "d2", verdict_at: "2026-09-01T12:00:00Z", verdict: { generatedAt: "2026-09-01T12:00:00Z" }, challenges: "junk" },
    ];
    expect(await readKeptScreens(client({ data: rows }) as never, "d1")).toEqual([{ verdict: kept.verdict, challenges: kept.challenges }]);
    expect(keptScreensByDeal(rows).get("d2")).toEqual([{ verdict: { generatedAt: "2026-09-01T12:00:00Z" }, challenges: null }]);
    expect(priorScreenOf(null)).toBeNull();
    expect(await readKeptScreens(client({ error: { message: 'relation "public.screen_snapshots" does not exist' } }) as never, "d1")).toEqual([]);
    expect(await readKeptScreens(client({ throws: true }) as never, "d1")).toEqual([]);
  });

  it("both places a re-screen keeps the screen it replaces append it too", () => {
    for (const f of ["lib/anthropic/pipeline.ts", "app/(app)/deals/actions.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).toMatch(/prior_screen/);
      expect(src, f).toMatch(/await keepScreen\((admin|supabase), dealId, kept\)/);
    }
    // And both surfaces of the track record read every kept screen.
    expect(readFileSync(join(process.cwd(), "app/(app)/deals/[id]/page.tsx"), "utf8")).toMatch(/priorScreens: keptScreens/);
    expect(readFileSync(join(process.cwd(), "app/(app)/analytics/page.tsx"), "utf8")).toMatch(/priorScreens: keptByDeal\.get\(r\.id\)/);
  });

  it("the migration keeps the history append-only, closed to a signed-out caller, and unique by the deal and the verdict's stamp", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0038_screen_history.sql"), "utf8").replace(/--[^\n]*/g, "");
    expect(sql).toMatch(/references public\.deals \(id\) on delete cascade/);
    expect(sql).toMatch(/unique \(deal_id, verdict_at\)/);
    expect(sql).toMatch(/alter table public\.screen_snapshots enable row level security/);
    expect(sql).toMatch(/for insert with check \(public\.can_access_deal\(deal_id\)\)/);
    expect(sql).not.toMatch(/for (update|delete|all)\b/);
    expect(sql).toMatch(/revoke all on public\.screen_snapshots from anon, public/);
    const check = readFileSync(join(process.cwd(), "supabase/CHECK_MIGRATIONS.sql"), "utf8");
    expect(check).toMatch(/'0038_screen_history\.sql[^']*'[\s\S]*?array\['screen_snapshots'\]/);
  });
});
