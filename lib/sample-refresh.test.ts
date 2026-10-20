import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL } from "./sample-deal";
import {
  SAMPLE_EDITION,
  currentSampleRow,
  sampleActualsRows,
  sampleEditionOf,
  sampleFixtureColumns,
  sampleRowOutdated,
} from "./sample-refresh";
import { refreshSampleDeal, syncSampleActuals, type SampleWriteClient } from "./sample-refresh-run";
import { readFileSync } from "node:fs";

// A sample seeded before a fixture change was never written again: the
// signed-in sample went on showing the old stress test beside a homepage and
// a /demo that drew the fixture as it stands (the "$238k/unit trade
// omitted" line, "Per the quoted term sheet" on the 6.00% rate, which the
// debt sizer read as a lender's quote, no tax, insurance or renovation rows,
// another headline). Every stored sample now carries the fixture's edition,
// and a row whose edition is not the current one is written again whole.

type Row = Record<string, unknown>;

/** An in-memory database answering the query shapes the refresh makes. */
function fakeDb(tables: Record<string, Row[]>): SampleWriteClient {
  let nextId = 100;
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let op: { kind: "select"; head: boolean } | { kind: "update"; patch: Row; select: boolean } | null = null;
      const matching = () => rows.filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (op?.kind === "update") {
          const hit = matching();
          for (const r of hit) Object.assign(r, structuredClone(op.patch));
          return { data: op.select ? hit.map((r) => ({ id: r.id })) : null, error: null };
        }
        const hit = matching();
        return op?.kind === "select" && op.head ? { count: hit.length, error: null } : { data: hit, error: null };
      };
      const q = {
        select(_cols?: string, opts?: { head?: boolean }) {
          if (op?.kind === "update") op.select = true;
          else op = { kind: "select", head: !!opts?.head };
          return q;
        },
        update(patch: Row) {
          op = { kind: "update", patch, select: false };
          return q;
        },
        insert(row: Row) {
          rows.push({ id: `r${nextId++}`, source_document_id: null, ...structuredClone(row) });
          return Promise.resolve({ error: null });
        },
        eq(col: string, v: unknown) {
          filters.push((r) => r[col] === v);
          return q;
        },
        is(col: string, v: unknown) {
          filters.push((r) => (r[col] ?? null) === v);
          return q;
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

/** A sample row as an older fixture seeded it: no edition stamp, the old
 *  challenger paragraph, the model's rate filed as a term sheet's quote,
 *  none of the tax, insurance or renovation rows. */
function oldSampleRow(): Row {
  const old = structuredClone(SAMPLE_DEAL) as unknown as Record<string, unknown>;
  const ex = old.extraction as { metrics: { label: string }[] };
  ex.metrics = ex.metrics.filter((m) => !/tax|assessed|insurance|renovat|classic|renovated/i.test(m.label));
  (old.challenges as { stressTest: string }).stressTest = "At a 5.50% exit the levered IRR falls to 8.7%; the $238k/unit trade omitted.";
  const model = old.model as { metrics: { key: string; rationale: string }[] };
  model.metrics = model.metrics.map((m) => (m.key === "rate" || /rate/i.test(m.key) ? { ...m, rationale: "Per the quoted term sheet." } : m));
  return {
    id: "sample-1",
    user_id: "u1",
    is_sample: true,
    stage: "screening",
    notes: [{ at: "2026-09-01T00:00:00Z", by: "reader", text: "kept" }],
    name: old.name,
    asset_class: old.asset_class,
    address: old.address,
    extraction: old.extraction,
    challenges: old.challenges,
    comps: old.comps,
    reconciliation: old.reconciliation,
    market: old.market,
    verdict: { ...(old.verdict as Row), reason: "An older call." },
    model: old.model,
  };
}

const oldRentRoll = (): Row => ({
  id: "rr1",
  deal_id: "sample-1",
  source_document_id: null,
  as_of_date: "2026-01-31",
  extraction: { rows: [] },
  summary: { unitCount: 248, occupiedUnits: 200 },
});

describe("the stored sample is kept to the fixture", () => {
  it("stamps the fixture's edition, which every column the seed writes moves", () => {
    expect(SAMPLE_EDITION).toMatch(/^e[0-9a-f]{8}$/);
    expect(sampleEditionOf(sampleFixtureColumns().extraction)).toBe(SAMPLE_EDITION);
    expect(sampleEditionOf(SAMPLE_DEAL.extraction)).toBeNull();
    expect(sampleRowOutdated({ is_sample: true, extraction: SAMPLE_DEAL.extraction })).toBe(true);
    expect(sampleRowOutdated({ is_sample: true, extraction: sampleFixtureColumns().extraction })).toBe(false);
    // A deal of the reader's own is never a sample to refresh.
    expect(sampleRowOutdated({ is_sample: false, extraction: SAMPLE_DEAL.extraction })).toBe(false);
  });

  it("reads an outdated row as the current fixture, and leaves a current one and a reader's deal alone", () => {
    const old = oldSampleRow();
    const read = currentSampleRow(old);
    expect(read).toEqual({ ...old, ...sampleFixtureColumns() });
    // What is the reader's stays: the stage, the notes, the ids.
    expect(read.notes).toBe(old.notes);
    const current = { ...old, ...sampleFixtureColumns() };
    expect(currentSampleRow(current)).toBe(current);
    const own = { ...old, is_sample: false };
    expect(currentSampleRow(own)).toBe(own);
  });

  it("writes an old stored sample, its rent roll and its T-12 again until they equal the current fixture", async () => {
    const old = oldSampleRow();
    const readersOwn: Row = { id: "rr2", deal_id: "sample-1", source_document_id: "doc-9", as_of_date: "2026-06-30", extraction: {}, summary: { mine: true } };
    const db = {
      deals: [old],
      deal_rent_rolls: [oldRentRoll(), readersOwn],
      deal_t12_statements: [{ id: "t1", deal_id: "sample-1", source_document_id: null, period_end_date: "2025-12-31", extraction: {}, summary: { noi: 1 } }],
    };
    const client = fakeDb(db);
    expect(JSON.stringify(old)).toContain("Per the quoted term sheet");
    expect(JSON.stringify(old)).toContain("238k/unit");
    expect(await refreshSampleDeal("sample-1", { client })).toBe("refreshed");
    const [row] = db.deals;
    const fixture = sampleFixtureColumns();
    for (const [col, value] of Object.entries(fixture)) expect(row[col], col).toEqual(value);
    // The reader's own state is untouched.
    expect(row).toMatchObject({ stage: "screening", notes: old.notes, user_id: "u1" });
    // The stale claims are gone: the old paragraph, the term sheet, and the
    // memorandum's tax, insurance and renovation rows are back.
    const text = JSON.stringify(row);
    expect(text).not.toContain("238k/unit");
    expect(text).not.toContain("Per the quoted term sheet");
    const labels = (row.extraction as { metrics: { label: string }[] }).metrics.map((m) => m.label);
    for (const l of ["Real estate taxes (2026)", "Insurance (pro forma)", "Renovation premium"]) expect(labels).toContain(l);
    // The seeded rent roll and T-12 are the fixture's; a rent roll the
    // reader read from a document of their own is never touched.
    const { rentRoll, t12 } = sampleActualsRows();
    expect(db.deal_rent_rolls[0]).toMatchObject(rentRoll);
    expect(db.deal_rent_rolls[1]).toEqual(readersOwn);
    expect(db.deal_t12_statements[0]).toMatchObject(t12);
    // A second pass finds it current and writes nothing.
    const snapshot = structuredClone(db);
    expect(await refreshSampleDeal("sample-1", { client })).toBe("current");
    expect(db).toEqual(snapshot);
  });

  it("adds the rent roll and T-12 where the sample has none, and never refreshes a deal that is not a sample", async () => {
    const db: Record<string, Row[]> = { deals: [oldSampleRow()], deal_rent_rolls: [], deal_t12_statements: [] };
    const client = fakeDb(db);
    expect(await refreshSampleDeal("sample-1", { client })).toBe("refreshed");
    expect(db.deal_rent_rolls).toHaveLength(1);
    expect(db.deal_rent_rolls[0]).toMatchObject({ deal_id: "sample-1", ...sampleActualsRows().rentRoll });
    expect(db.deal_t12_statements[0]).toMatchObject({ deal_id: "sample-1", ...sampleActualsRows().t12 });
    // Without `rewrite`, a sample's existing actuals are left as they are.
    db.deal_rent_rolls[0].summary = { edited: true };
    await syncSampleActuals("sample-1", { client });
    expect(db.deal_rent_rolls).toHaveLength(1);
    expect(db.deal_rent_rolls[0].summary).toEqual({ edited: true });

    const own: Record<string, Row[]> = { deals: [{ ...oldSampleRow(), is_sample: false }] };
    const before = structuredClone(own);
    expect(await refreshSampleDeal("sample-1", { client: fakeDb(own) })).toBe("not_sample");
    expect(own).toEqual(before);
  });

  it("never throws: a database that fails answers failed", async () => {
    const broken: SampleWriteClient = {
      from() {
        throw new Error("down");
      },
    };
    await expect(refreshSampleDeal("x", { client: broken })).resolves.toBe("failed");
    await expect(syncSampleActuals("x", { rewrite: true, client: broken })).resolves.toBeUndefined();
  });

  it("is run by the deal page on view, by the action on open, and read over the row by the documents", () => {
    const src = (p: string) => readFileSync(p, "utf8");
    const page = src("app/(app)/deals/[id]/page.tsx");
    expect(page).toContain("if (sampleRowOutdated(data as DealRow)) await refreshSampleDealWithin(id);");
    expect(page).toContain("const deal = currentSampleRow(data as DealRow);");
    const action = src("app/(app)/deals/actions.ts");
    expect(action).toContain("await refreshSampleDeal(existing.id as string);");
    expect(action).toContain("...sampleFixtureColumnsWithoutAddress()");
    // The old sentence check is gone, generalised by the edition.
    expect(action).not.toContain("levered IRR falls to");
    for (const route of ["memo", "report", "underwrite.xlsx"]) {
      expect(src(`app/api/deals/[id]/${route}/route.ts`), route).toContain("const deal = currentSampleRow(data as DealRow);");
    }
  });
});
