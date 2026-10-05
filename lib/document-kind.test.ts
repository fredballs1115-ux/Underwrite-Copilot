/**
 * The first signal says what the uploaded document IS (lib/document-kind),
 * and the deal page warns where it is not an offering memorandum — a lease
 * uploaded as the OM ran every step and stored a call on a document that is
 * no deal (research pass 30). A warning only: nothing stops the screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCUMENT_KINDS, documentKindOf, documentKindWarning } from "./document-kind";
import { firstSignalInstruction } from "./anthropic/prompts";
import { gluedWords } from "./render-lint";

describe("documentKindWarning — what the deal page says of a document that is not an OM", () => {
  it("an offering memorandum, and a signal that read no kind, say nothing", () => {
    expect(documentKindWarning("offering_memorandum")).toBeNull();
    expect(documentKindWarning(undefined)).toBeNull();
    expect(documentKindWarning(null)).toBeNull();
    expect(documentKindWarning("a brochure")).toBeNull();
    expect(documentKindOf("lease")).toBe("lease");
    expect(documentKindOf(42)).toBeNull();
  });

  it("every other kind is named, said to be read as an OM all the same, and pointed at Replace OM", () => {
    for (const kind of DOCUMENT_KINDS.filter((k) => k !== "offering_memorandum")) {
      const w = documentKindWarning(kind)!;
      expect(w, kind).toMatch(/Replace OM/);
      expect(gluedWords(w), kind).toEqual([]);
      // A warning, never a refusal.
      expect(w, kind).not.toMatch(/refused|stopped|won't run|will not run/i);
    }
    expect(documentKindWarning("lease")).toBe(
      "This reads as a lease, not an offering memorandum — the screen reads it as one all the same, so its call may judge a document that is no deal. Upload the OM with Replace OM; the lease can be kept with the deal under Documents.",
    );
    expect(documentKindWarning("rent_roll")).toContain("add the rent roll on the Overview, where it re-bases the model");
    expect(documentKindWarning("operating_statement")).toMatch(/^This reads as an operating statement, /);
    expect(documentKindWarning("flyer_or_teaser")).toMatch(/^This reads as a flyer or a teaser, not a full offering memorandum/);
    expect(documentKindWarning("other")).toMatch(/^This doesn't read as an offering memorandum/);
  });

  it("the first signal is asked every kind, after the document, and told the instructions' word for it decides nothing", () => {
    const p = firstSignalInstruction("auto");
    for (const kind of DOCUMENT_KINDS) expect(p, kind).toContain(`"${kind}"`);
    expect(p).toContain("never answer \"offering_memorandum\" because these instructions call the document one");
    // A note offered for sale is an offering memorandum, never a loan document.
    expect(p).toContain("never a note offered for sale, which is an offering memorandum");
    const signal = readFileSync(join(process.cwd(), "lib/anthropic/first-signal.ts"), "utf8");
    expect(signal).toContain("documentKind: z.enum(DOCUMENT_KINDS)");
  });

  it("the deal page warns from the stored signal, on a deal screened from an upload, and the pipeline never stops on it", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/page.tsx"), "utf8");
    expect(page).toContain("deal.om_storage_path ? documentKindWarning(firstSignal?.documentKind) : null");
    expect(page).toContain('data-qa="document-kind"');
    const pipeline = readFileSync(join(process.cwd(), "lib/anthropic/pipeline.ts"), "utf8");
    expect(pipeline).not.toMatch(/documentKind/);
  });
});
