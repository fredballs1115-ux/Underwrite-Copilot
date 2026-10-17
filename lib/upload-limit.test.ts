// A file picker's refusals (lib/upload-limit). A 32.0–32.5 MB file read
// "is 32 MB — the limit is 32 MB", and a type refusal lower-cased its hint
// to "pdf … 32 mb".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOO_LARGE_REMEDY, UPLOAD_MAX_BYTES, sizeAgainstLimit, tooLargeMessage, wrongTypeMessage } from "./upload-limit";

const MB = 1024 * 1024;

describe("a file over the limit never reads as equal to it", () => {
  it("says a file a byte over as just over, and a larger one to the nearest tenth", () => {
    // Rounded up, a byte over the limit had read "32.1 MB".
    expect(tooLargeMessage("deck.pdf", 32 * MB + 1, UPLOAD_MAX_BYTES)).toBe(
      '"deck.pdf" is just over the 32 MB limit. Try compressing or splitting it.',
    );
    expect(tooLargeMessage("deck.pdf", Math.round(32.4 * MB), UPLOAD_MAX_BYTES)).toBe(
      '"deck.pdf" is 32.4 MB — over the 32 MB limit. Try compressing or splitting it.',
    );
    expect(sizeAgainstLimit(32.5 * MB, UPLOAD_MAX_BYTES).size).toBe("32.5");
  });

  it("every size from a byte over to a MB over reads larger than the limit, or just over it, and never larger than it is", () => {
    for (let bytes = UPLOAD_MAX_BYTES + 1; bytes <= UPLOAD_MAX_BYTES + MB; bytes += 4099) {
      const { size, limit } = sizeAgainstLimit(bytes, UPLOAD_MAX_BYTES);
      expect(limit).toBe("32");
      if (size === null) {
        expect(bytes / MB, `${bytes} bytes`).toBeLessThan(32.05);
        continue;
      }
      expect(Number(size), `${bytes} bytes`).toBeGreaterThan(Number(limit));
      expect(Math.abs(Number(size) - bytes / MB), `${bytes} bytes`).toBeLessThanOrEqual(0.05);
    }
  });

  it("a whole size is said without a decimal, and a limit that is no whole MB keeps its tenth", () => {
    expect(sizeAgainstLimit(40 * MB, UPLOAD_MAX_BYTES)).toEqual({ size: "40", limit: "32" });
    expect(sizeAgainstLimit(13 * MB, 12 * MB)).toEqual({ size: "13", limit: "12" });
    expect(sizeAgainstLimit(2 * MB, 1.5 * MB)).toEqual({ size: "2", limit: "1.5" });
    // A limit that is no tenth of a MB still never ties the file over it.
    const odd = sizeAgainstLimit(1_000_001, 1_000_000);
    expect(odd.size).toBeNull();
    expect(tooLargeMessage("a.pdf", 1_000_001, 1_000_000)).toContain("is just over the 1 MB limit");
  });
});

describe("what to do with a file too large is said by what the file is (research pass 32)", () => {
  it("never tells a memorandum to be split, which would screen part of it", () => {
    const om = tooLargeMessage("deck.pdf", Math.round(40 * MB), UPLOAD_MAX_BYTES, "memorandum");
    expect(om).toBe(`"deck.pdf" is 40 MB — over the 32 MB limit. ${TOO_LARGE_REMEDY.memorandum}`);
    expect(om).not.toMatch(/splitting/);
    expect(tooLargeMessage("p.jpg", Math.round(13 * MB), 12 * MB, "picture")).toMatch(/Try a smaller copy\.$/);
  });

  it("the memorandum's pickers ask for it", () => {
    const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    expect(src("app/(app)/deals/pipeline.tsx")).toMatch(/name="om"[\s\S]{0,200}tooLarge="memorandum"/);
    expect(src("app/(app)/deals/[id]/replace-om.tsx")).toContain('"memorandum")');
    expect(src("app/(app)/deals/[id]/replace-picture.tsx")).toContain('"picture")');
  });
});

describe("a type refusal keeps the hint's own words", () => {
  it("never lower-cases PDF or MB", () => {
    expect(wrongTypeMessage("deck.docx", "PDF offering memorandum, up to 32 MB")).toBe(
      '"deck.docx" isn\'t a supported file type — PDF offering memorandum, up to 32 MB.',
    );
    expect(wrongTypeMessage("deck.docx")).toBe('"deck.docx" isn\'t a supported file type.');
  });
});

describe("the pickers say both through the helper", () => {
  for (const f of ["app/(app)/file-drop.tsx", "app/(app)/file-field.tsx"]) {
    it(f, () => {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).toContain("tooLargeMessage(");
      expect(src).not.toMatch(/toFixed\(0\)|the limit is|hint\.toLowerCase\(\)/);
    });
  }

  it("the drop zone's type refusal is the helper's, hint and all", () => {
    expect(readFileSync(join(process.cwd(), "app/(app)/file-drop.tsx"), "utf8")).toContain("wrongTypeMessage(file.name, hint)");
  });
});
