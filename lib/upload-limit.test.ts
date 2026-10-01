// A file picker's refusals (lib/upload-limit). A 32.0–32.5 MB file read
// "is 32 MB — the limit is 32 MB", and a type refusal lower-cased its hint
// to "pdf … 32 mb".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UPLOAD_MAX_BYTES, sizeAgainstLimit, tooLargeMessage, wrongTypeMessage } from "./upload-limit";

const MB = 1024 * 1024;

describe("a file over the limit never reads as equal to it", () => {
  it("says the shipped case as over the limit, to a tenth", () => {
    expect(tooLargeMessage("deck.pdf", 32 * MB + 1, UPLOAD_MAX_BYTES)).toBe(
      '"deck.pdf" is 32.1 MB — over the 32 MB limit. Try compressing or splitting it.',
    );
    expect(sizeAgainstLimit(Math.round(32.4 * MB), UPLOAD_MAX_BYTES).size).toBe("32.4");
    expect(sizeAgainstLimit(32.5 * MB, UPLOAD_MAX_BYTES).size).toBe("32.5");
  });

  it("every size from a byte over to a MB over reads larger than the limit", () => {
    for (let bytes = UPLOAD_MAX_BYTES + 1; bytes <= UPLOAD_MAX_BYTES + MB; bytes += 4099) {
      const { size, limit } = sizeAgainstLimit(bytes, UPLOAD_MAX_BYTES);
      expect(limit).toBe("32");
      expect(Number(size), `${bytes} bytes`).toBeGreaterThan(Number(limit));
      expect(Number(size), `${bytes} bytes`).toBeGreaterThanOrEqual(bytes / MB);
    }
  });

  it("a whole size is said without a decimal, and a limit that is no whole MB keeps its tenth", () => {
    expect(sizeAgainstLimit(40 * MB, UPLOAD_MAX_BYTES)).toEqual({ size: "40", limit: "32" });
    expect(sizeAgainstLimit(13 * MB, 12 * MB)).toEqual({ size: "13", limit: "12" });
    expect(sizeAgainstLimit(2 * MB, 1.5 * MB)).toEqual({ size: "2", limit: "1.5" });
    // A limit that is no tenth of a MB still never ties the file over it.
    const odd = sizeAgainstLimit(1_000_001, 1_000_000);
    expect(Number(odd.size)).toBeGreaterThan(Number(odd.limit));
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
