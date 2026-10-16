import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_EXPORT_PATH, exportGate, exportGateDealOf, sampleExportsFree } from "./sample-exports";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("the downloads' Pro gate", () => {
  it("hands a free reader of the sample the public sample's files, never the row's", () => {
    const sample = exportGateDealOf({ is_sample: true, om_storage_path: null });
    expect(sampleExportsFree(sample)).toBe(true);
    // Not "open": the row is the reader's own and writable, so a free reader
    // who pasted a real deal's extraction onto it would get that deal's
    // files (audit C10, H1).
    expect(exportGate(false, sample)).toBe("sample");
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
      // A free reader's sample goes to the public file, before any build
      // from the row.
      expect(src, route).toMatch(/gate === "sample"[\s\S]*?SAMPLE_EXPORT_PATH\./);
      expect(src.indexOf('gate === "sample"'), route).toBeLessThan(src.indexOf("const deal = data as DealRow") >= 0 ? src.indexOf("const deal = data as DealRow") : Infinity);
    }
    for (const path of Object.values(SAMPLE_EXPORT_PATH)) {
      expect(() => read(`app${path}/route.ts`), path).not.toThrow();
    }
  });
});
