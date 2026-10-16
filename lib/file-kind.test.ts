import { describe, expect, it } from "vitest";
import { FILE_KIND_WORDS, fileKindOf } from "./file-kind";

describe("fileKindOf", () => {
  it("reads the kind off the file's own name first", () => {
    expect(fileKindOf("Rent roll June.xlsx", "application/octet-stream")).toBe("sheet");
    expect(fileKindOf("T12.CSV")).toBe("sheet");
    expect(fileKindOf("CBRE BOV.pdf", null)).toBe("pdf");
    expect(fileKindOf("front.JPG")).toBe("image");
    expect(fileKindOf("loan terms.docx")).toBe("doc");
    expect(fileKindOf("notes.txt")).toBe("text");
  });

  it("falls to the stored type only where the name says nothing", () => {
    expect(fileKindOf("scan", "application/pdf")).toBe("pdf");
    expect(fileKindOf("photo", "image/webp")).toBe("image");
    expect(fileKindOf("export", "text/csv; charset=utf-8")).toBe("sheet");
    expect(fileKindOf("upload.bin", "application/octet-stream")).toBe("other");
    expect(fileKindOf("README")).toBe("other");
  });

  it("calls a doc a document, since it is not always Word's", () => {
    for (const name of ["a.docx", "a.odt", "a.rtf", "a.pages"]) expect(fileKindOf(name)).toBe("doc");
    expect(FILE_KIND_WORDS.doc).toBe("Document");
    expect(Object.values(FILE_KIND_WORDS).join(" ")).not.toMatch(/\bWord\b/);
  });
});
