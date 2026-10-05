import { describe, expect, it } from "vitest";
import { setPath } from "../fields";
import type { Assumptions } from "../model";
import {
  currentVersionId,
  defaultPair,
  needsSnapshot,
  nextAutoLabel,
  saveFailure,
  type VersionLike,
} from "../version-rules";

const BASE = {
  purchasePrice: 13_700_000,
  holdMonths: 60,
  exitCapPct: 0.08,
  allInRatePct: 0.06,
} as Assumptions;

/** An in-memory deal_versions table that keeps the rules the page and the
 *  action keep: a view snapshots when the live set left the latest base; a
 *  save writes the base first, then the scenario; labels must be unique. */
function store() {
  const rows: VersionLike[] = [];
  let clock = Date.parse("2026-09-01T00:00:00Z");
  const insert = (assumptions: Assumptions, automatic: boolean, label?: string) => {
    const version_label = label ?? nextAutoLabel(rows.map((r) => r.version_label));
    if (rows.some((r) => r.version_label === version_label)) throw new Error(`duplicate label ${version_label}`);
    clock += 60_000;
    const row = { id: `id${rows.length + 1}`, version_label, assumptions, automatic, created_at: new Date(clock).toISOString() };
    rows.push(row);
    return row;
  };
  return {
    rows,
    view(current: Assumptions) {
      if (needsSnapshot(current, rows)) insert(current, true);
    },
    save(current: Assumptions, scenario: Assumptions, label?: string) {
      if (needsSnapshot(current, rows)) insert(current, true);
      return insert(scenario, false, label);
    },
  };
}

describe("the bridge keeps a record of changes, not of page views", () => {
  it("takes no copy of the base after a scenario is saved on top of it", () => {
    const s = store();
    s.view(BASE);
    s.view(BASE);
    const scenario = s.save(BASE, setPath(BASE, "purchasePrice", 12_000_000), "broker case");
    s.view(BASE);
    s.view(BASE);
    expect(s.rows.map((r) => r.version_label)).toEqual(["v1", "broker case"]);
    // …and the page opens on the scenario against the base it came from.
    const pair = defaultPair(s.rows, scenario.id);
    expect(pair.from?.version_label).toBe("v1");
    expect(pair.to?.version_label).toBe("broker case");
    expect(defaultPair(s.rows).from?.version_label).toBe("v1");
  });

  it("opens a later base against the base before it, never against a scenario", () => {
    const s = store();
    s.view(BASE);
    s.save(BASE, setPath(BASE, "exitCapPct", 0.07));
    const moved = setPath(BASE, "allInRatePct", 0.0612);
    s.view(moved);
    const pair = defaultPair(s.rows);
    expect(pair.to?.version_label).toBe("v3");
    expect(pair.from?.version_label).toBe("v1");
  });

  it("keeps labels unique past sixty versions — the sixty-first never reaches for v1 again", () => {
    const s = store();
    for (let day = 0; day < 75; day++) s.view(setPath(BASE, "allInRatePct", 0.06 + day * 0.0001));
    const labels = s.rows.map((r) => r.version_label);
    expect(new Set(labels).size).toBe(75);
    expect(labels.at(-1)).toBe("v75");
    // The page lists the newest sixty; the label is unique against them all.
    expect(nextAutoLabel(labels.slice(-60))).toBe("v76");
  });

  it("never hands a deleted number, or a manual vN, to a new version", () => {
    expect(nextAutoLabel([])).toBe("v1");
    expect(nextAutoLabel(["v1", "v3"])).toBe("v4");
    expect(nextAutoLabel(["broker case", "v10", "v2"])).toBe("v11");
  });

  it("marks the version that is the deal as it stands", () => {
    const s = store();
    s.view(BASE);
    s.save(BASE, setPath(BASE, "purchasePrice", 12_000_000), "retrade");
    expect(currentVersionId(BASE, s.rows)).toBe("id1");
    expect(currentVersionId(setPath(BASE, "exitCapPct", 0.09), s.rows)).toBeNull();
    expect(currentVersionId(null, s.rows)).toBeNull();
  });

  it("honours an asked-for pair", () => {
    const s = store();
    s.view(BASE);
    const a = s.save(BASE, setPath(BASE, "purchasePrice", 12_000_000), "a");
    const b = s.save(BASE, setPath(BASE, "purchasePrice", 11_000_000), "b");
    const pair = defaultPair(s.rows, b.id, a.id);
    expect([pair.from?.id, pair.to?.id]).toEqual([a.id, b.id]);
    expect(defaultPair([], "x").to).toBeNull();
  });

  it("says which of three things a failed save was", () => {
    expect(saveFailure({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe("label_taken");
    expect(saveFailure({ code: "42501", message: "new row violates row-level security policy" })).toBe("denied");
    expect(saveFailure({ code: "08006", message: "connection failure" })).toBe("failed");
    expect(saveFailure(null)).toBe("failed");
  });
});

describe("the deal as it stands is kept on the server, not only hidden on the page", () => {
  it("the delete action refuses the current version before it deletes anything", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/bridge/actions.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function deleteDealVersion"));
    const refusal = body.indexOf("if (currentVersionId(current, versions) === versionId) redirect(");
    expect(refusal).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(body.indexOf('.from("deal_versions").delete()'));
    const page = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/bridge/page.tsx"), "utf8");
    expect(page).toContain("current: \"That version is the deal's assumptions as they stand");
  });
});
