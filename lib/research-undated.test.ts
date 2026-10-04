import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A research figure whose file states no date is undated, and says so. The
// benchmark builder once stamped such a figure with a hard-coded date
// (2026-08-25 on a metro snapshot, 2026-08-21 on a sector's cap bands,
// 2026-08-20 on the mortgage snapshot) and the market page's sector explorer
// printed "as of 2026-08-21" for a file with none — a date nobody recorded.

// The research files with their dates taken away, to see what the builder
// makes of a file that states none.
const { strip } = vi.hoisted(() => ({
  strip: async <T,>(load: () => Promise<{ default: T }>, drop: (d: T) => T) => ({ default: drop(structuredClone((await load()).default)) }),
}));
vi.mock("@/data/research/metros.json", async (orig) =>
  strip(orig as () => Promise<{ default: { metros: { sector_snapshot?: Record<string, unknown> | null }[] } }>, (d) => {
    for (const m of d.metros) if (m.sector_snapshot) delete m.sector_snapshot.as_of;
    return d;
  }),
);
vi.mock("@/data/research/office.json", async (orig) =>
  strip(orig as () => Promise<{ default: { as_of?: string } }>, (d) => {
    delete d.as_of;
    return d;
  }),
);
vi.mock("@/data/research/capital_markets.json", async (orig) =>
  strip(orig as () => Promise<{ default: { snapshot?: { mortgage_30y_pmms?: { as_of?: string } } } }>, (d) => {
    delete d.snapshot?.mortgage_30y_pmms?.as_of;
    return d;
  }),
);

import { seedBenchmarks } from "./research-data";
import { asOfLabel } from "./research";
import { benchmark30 } from "./debt-index";
import { SampleLeverageCard } from "@/app/demo/leverage-card";
import { visibleText } from "./render-lint";

describe("a research figure with no date in its file is undated, never given one", () => {
  it("says the file's own date, or 'undated'", () => {
    expect(asOfLabel("2026-08-21")).toBe("as of 2026-08-21");
    expect(asOfLabel("")).toBe("undated");
    expect(asOfLabel("  ")).toBe("undated");
    expect(asOfLabel(null)).toBe("undated");
    expect(asOfLabel(undefined)).toBe("undated");
  });

  it("the benchmark rows built from undated files carry no date", () => {
    const rows = seedBenchmarks();
    const snapshot = rows.filter((b) => b.metric.endsWith("_vacancy_pct"));
    expect(snapshot.length).toBeGreaterThan(0);
    for (const b of snapshot) expect(b.as_of, `${b.metro} ${b.metric}`).toBe("");
    const officeBands = rows.filter((b) => b.sector === "office" && b.metric.startsWith("cap_rate__"));
    expect(officeBands.length).toBeGreaterThan(0);
    for (const b of officeBands) expect(b.as_of).toBe("");
    const pmms = rows.find((b) => b.metric === "pmms_30y_fixed");
    expect(pmms?.as_of).toBe("");
    // Nothing the files did not state crept back in as a date.
    for (const b of [...snapshot, ...officeBands, pmms!]) expect(asOfLabel(b.as_of)).toBe("undated");
  });

  it("the leverage check reads an undated snapshot as undated, not 'as of' nothing", () => {
    const pmms = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed")!;
    const bench30 = benchmark30(null, pmms)!;
    const text = visibleText(renderToStaticMarkup(React.createElement(SampleLeverageCard, { capPct: 5.45, bench30, tenYear: null, today: "2026-09-21" })));
    expect(text).toContain("30-yr fixed (FRED PMMS, the checked-in snapshot, undated)");
    expect(text).not.toMatch(/as of\s*\)/);
  });

  it("no source falls back to a typed date where a file's own is missing", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(p);
      }
    };
    walk(join(process.cwd(), "app"));
    walk(join(process.cwd(), "lib"));
    const fallback = /(\?\?|\?\s*[\w.]+\s*:)\s*"20\d\d-\d\d-\d\d"/;
    const hits = files.filter((f) => fallback.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
