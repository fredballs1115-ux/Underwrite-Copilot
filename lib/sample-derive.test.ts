// One derivation for every public entry point that runs the sample deal
// through the model. The demo report once derived without the sample's
// rent roll and T-12 and printed the deck's story — a 5.71% cap, an 11.8%
// IRR and a sensitivity page that cleared the hurdle — beside a demo page
// that ran the actuals and did not.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_DEAL } from "./sample-deal";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { computeUnderwrite } from "./underwrite/engine";
import { SAMPLE_ACTUALS, sampleDerivedInputs } from "./sample-derive";
import { constructionSeedFor, modelMarketFor, modelRatesLine } from "./model-market";
import type { DebtSeeds } from "./debt-index";

describe("sampleDerivedInputs — the sample deal, actuals included", () => {
  it("anchors year 1 on the T-12 actual NOI and the rent roll's SF, not the OM's narrative", () => {
    const d = sampleDerivedInputs();
    expect(d.inputs.rsf).toBe(SAMPLE_DEAL.rentRoll.summary.totalSf);
    expect(d.sources.rsf?.provenance).toBe("extracted");
    expect(d.sources.inPlaceRentAnnual?.note).toMatch(/T-12 actual NOI/);
    // The derivation without the actuals is a different model — the one the
    // report used to ship.
    const bare = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name);
    expect(bare.inputs.rsf).not.toBe(d.inputs.rsf);
    expect(bare.sources.rsf?.provenance).toBe("assumption");
  });

  it("every public entry point derives through it — the page, the workbook and the report", () => {
    const root = process.cwd();
    for (const rel of ["app/demo/page.tsx", "app/api/demo/underwrite.xlsx/route.ts", "app/api/demo/report/route.ts"]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toContain("sampleDerivedInputs()");
      expect(src, rel).not.toMatch(/deriveUnderwriteInputs\(/);
    }
  });
});

describe("the signed-in sample deal is never seeded — its IRR does not move with the Treasury", () => {
  // A table with every index fresh: what a real deal's model is seeded from.
  const seeds: DebtSeeds = {
    permanent: { id: "DGS5", short: "5-yr", pct: 4.12, asOf: "2026-09-29", kind: "treasury" },
    floating: { id: "SOFR30DAYAVG", short: "30-day avg SOFR", pct: 4.3, asOf: "2026-09-29", kind: "sofr" },
    tenYear: { id: "DGS10", short: "10-yr", pct: 4.4, asOf: "2026-09-29", kind: "treasury" },
    survey30: null,
  };
  const derive = (isSample: boolean) =>
    deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name, SAMPLE_ACTUALS, modelMarketFor(isSample, seeds));

  it("derives the sample at the flat, unseeded rate the demo runs it at, with the demo's returns", () => {
    const signedIn = derive(true);
    const demo = sampleDerivedInputs();
    expect(signedIn.inputs.allInRatePct).toBe(0.06);
    expect(signedIn.meta.rateSeed ?? null).toBeNull();
    expect(signedIn.inputs).toEqual(demo.inputs);
    const irr = computeUnderwrite(signedIn.inputs).returns.leveredIrrPct;
    expect(irr).not.toBeNull();
    expect(irr).toBe(computeUnderwrite(demo.inputs).returns.leveredIrrPct);
    // The figure the demo pins (lib/sample-derive's comment: 9.3%).
    expect((irr! * 100).toFixed(1)).toBe("9.3");
  });

  it("a real deal on the same table is seeded — the index plus the class spread, not the flat default", () => {
    const real = derive(false);
    expect(real.meta.rateSeed).not.toBeNull();
    expect(real.inputs.allInRatePct).not.toBe(0.06);
    expect(real.sources.allInRatePct?.note).toMatch(/5-yr Treasury 4\.12%/);
  });

  it("the sample's construction panel and first-draft model are handed no rate either", () => {
    expect(constructionSeedFor(true, seeds)).toBeNull();
    expect(constructionSeedFor(false, seeds)).not.toBeNull();
    expect(modelRatesLine(true, seeds, 60)).toBeNull();
    expect(modelRatesLine(false, seeds, 60)).toMatch(/4\.12%/);
  });

  it("every surface that seeds a deal's model asks lib/model-market, never the index itself", () => {
    // The deal page, the workbook and report routes, the bridge's current
    // assumptions and the first-draft model build all seed from today's
    // rates; a surface that read `debt.permanent` itself would seed the
    // sample again.
    const root = process.cwd();
    const files = ["app", "lib"].flatMap((dir) =>
      (readdirSync(join(root, dir), { recursive: true }) as string[])
        .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => join(dir, f)),
    );
    const offenders: string[] = [];
    const seeding: string[] = [];
    for (const rel of files) {
      if (rel === join("lib", "model-market.ts")) continue;
      const src = readFileSync(join(root, rel), "utf8");
      // A debt index handed to a model as an object literal of its own.
      if (/\bdebtIndex:\s*[A-Za-z]/.test(src)) offenders.push(`${rel}: debtIndex literal`);
      const derives = src.includes("deriveUnderwriteInputs(") && src.includes("liveDebtSeeds(");
      const lines = /\b(ratesPromptLine|modelRatesLine)\(/.test(src) && src.includes("liveDebtSeeds(");
      if (derives || lines) {
        seeding.push(rel);
        if (!/\b(modelMarketFor|modelRatesLine)\(/.test(src)) offenders.push(`${rel}: seeds without lib/model-market`);
      }
    }
    expect(offenders).toEqual([]);
    expect(seeding.sort()).toEqual(
      [
        join("app", "(app)", "deals", "[id]", "page.tsx"),
        join("app", "api", "deals", "[id]", "report", "route.ts"),
        join("app", "api", "deals", "[id]", "rent-roll.xlsx", "route.ts"),
        join("app", "api", "deals", "[id]", "underwrite.xlsx", "route.ts"),
        join("lib", "bridge", "deal-assumptions.ts"),
        join("lib", "model", "build-model.ts"),
      ].sort(),
    );
  });
});
