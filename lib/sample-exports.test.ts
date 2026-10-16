import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportGate, exportGateDealOf, sampleExportsFree } from "./sample-exports";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("the downloads' Pro gate", () => {
  it("opens the sample as seeded to a free reader", () => {
    const sample = exportGateDealOf({ is_sample: true, om_storage_path: null });
    expect(sampleExportsFree(sample)).toBe(true);
    expect(exportGate(false, sample)).toBe("open");
  });

  it("keeps a free reader's own deal behind Pro", () => {
    expect(exportGate(false, exportGateDealOf({ is_sample: false, om_storage_path: "u/d.pdf" }))).toBe("upsell");
    expect(exportGate(false, exportGateDealOf({ is_sample: false, om_storage_path: null }))).toBe("upsell");
    expect(exportGate(false, exportGateDealOf({}))).toBe("upsell");
    expect(exportGate(false, null)).toBe("upsell");
  });

  it("keeps a sample that carries a memorandum behind Pro", () => {
    // The app refuses an OM on the sample; one written to the row by hand
    // must not turn the sample flag into a way round Pro.
    const doctored = exportGateDealOf({ is_sample: true, om_storage_path: "u/d.pdf" });
    expect(sampleExportsFree(doctored)).toBe(false);
    expect(exportGate(false, doctored)).toBe("upsell");
  });

  it("opens every deal to Pro", () => {
    expect(exportGate(true, exportGateDealOf({ is_sample: false, om_storage_path: "u/d.pdf" }))).toBe("open");
    expect(exportGate(true, null)).toBe("open");
  });

  it("reads only a true flag as the sample", () => {
    expect(sampleExportsFree(exportGateDealOf({ is_sample: null }))).toBe(false);
  });

  it("is the gate all three download routes ask, after reading the deal", () => {
    for (const route of [
      "app/api/deals/[id]/memo/route.ts",
      "app/api/deals/[id]/report/route.ts",
      "app/api/deals/[id]/underwrite.xlsx/route.ts",
    ]) {
      const src = read(route);
      expect(src, route).toMatch(/exportGate\(/);
      expect(src, route).toMatch(/exportGateDealOf\(/);
      // The deal is read before the gate, so the sample is known to it.
      expect(src.indexOf('.from("deals")'), route).toBeLessThan(src.indexOf("exportGate("));
    }
  });
});
