import { describe, expect, it } from "vitest";
import { DEAL_NAME_MAX, dealNameOf, nameFromFile, nameIsFromFile, prefillName, restoredFileName } from "./deal-name";

describe("a deal's name from its memorandum's file name", () => {
  it("reads the file's name as words, the way the batch upload always has", () => {
    expect(nameFromFile("the-maddox_OM_v2.pdf")).toBe("The maddox OM v2");
    expect(nameFromFile("Harbor View Apartments.PDF")).toBe("Harbor View Apartments");
    expect(nameFromFile("__--.pdf")).toBe("Untitled OM");
    // The one cap every name is stored under (research pass 42): the batch's
    // name is the deal's, so its cut is the stored name's 120, not 80.
    expect(nameFromFile(`${"a".repeat(200)}.pdf`)).toHaveLength(DEAL_NAME_MAX);
  });

  it("fills an empty name field from the chosen PDF, and a newer PDF replaces the name the last one gave", () => {
    expect(prefillName("", null, "the-maddox_OM_v2.pdf")).toBe("The maddox OM v2");
    expect(prefillName("   ", null, "harbor_view.pdf")).toBe("Harbor view");
    expect(prefillName("The maddox OM v2", "The maddox OM v2", "harbor_view.pdf")).toBe("Harbor view");
  });

  it("never writes over a name the reader typed, before or after choosing the file", () => {
    expect(prefillName("The Maddox at Brewerytown", null, "the-maddox_OM_v2.pdf")).toBeNull();
    expect(prefillName("The Maddox at Brewerytown", "The maddox OM v2", "harbor_view.pdf")).toBeNull();
  });

  it("keeps a file's name the next file's to replace across a reload or an upload error (the audit of 2026-09-30)", () => {
    // Choose harbor_view.pdf: the field takes its name and the draft marks it.
    const first = prefillName("", null, "harbor_view.pdf")!;
    const draft = { name: first, nameFromFile: nameIsFromFile(first, first) };
    expect(draft.nameFromFile).toBe(true);
    // Reload: the file is gone, the name comes back marked as the file's…
    const restored = restoredFileName(draft);
    expect(restored).toBe("Harbor view");
    // …so the Maddox PDF chosen next names the deal, never "Harbor view".
    expect(prefillName(draft.name, restored, "the-maddox_OM_v2.pdf")).toBe("The maddox OM v2");
    // A typed name is never marked, and a restore hands it back as the reader's.
    expect(nameIsFromFile("The Maddox at Brewerytown", "Harbor view")).toBe(false);
    expect(restoredFileName({ name: "The Maddox at Brewerytown", nameFromFile: false })).toBeNull();
    expect(restoredFileName({ name: "The Maddox at Brewerytown" })).toBeNull();
    expect(restoredFileName(null)).toBeNull();
  });
});
