import { describe, expect, it } from "vitest";
import { nameFromFile, prefillName } from "./deal-name";

describe("a deal's name from its memorandum's file name", () => {
  it("reads the file's name as words, the way the batch upload always has", () => {
    expect(nameFromFile("the-maddox_OM_v2.pdf")).toBe("The maddox OM v2");
    expect(nameFromFile("Harbor View Apartments.PDF")).toBe("Harbor View Apartments");
    expect(nameFromFile("__--.pdf")).toBe("Untitled OM");
    expect(nameFromFile(`${"a".repeat(120)}.pdf`)).toHaveLength(80);
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
});
