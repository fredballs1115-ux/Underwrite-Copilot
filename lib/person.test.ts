import { describe, expect, it } from "vitest";
import {
  PERSON_TONES,
  displayName,
  emailLocalPart,
  looksLikeEmail,
  personInitials,
  personName,
  personToneIndex,
  readFullName,
  viewerName,
  FULL_NAME_MAX,
} from "./person";
import { initials } from "@/app/(app)/deals/deal-card-parts";

describe("a person's initials", () => {
  it("reads an email by its local part alone, never its domain", () => {
    // Signed-in gaps H1: each of these had worn the domain's letter.
    expect(personInitials("fredballs1115@gmail.com")).toBe("F");
    expect(personInitials("jordan.lee@firm.com")).toBe("JL");
    expect(personInitials("jordan@firm.co.uk")).toBe("J");
  });

  it("drops a +tag, and reads dots, underscores, hyphens and digits as breaks", () => {
    expect(personInitials("fred+deals@gmail.com")).toBe("F");
    expect(personInitials("a+b@example.com")).toBe("A");
    expect(personInitials("jordan_lee-smith@x.com")).toBe("JS");
    expect(personInitials("j2smith@x.com")).toBe("JS");
    expect(personInitials("JORDAN.LEE@FIRM.COM")).toBe("JL");
    // Digits alone are still a mark of the person's own.
    expect(personInitials("1115@gmail.com")).toBe("1");
  });

  it("reads a name by its first and last words", () => {
    expect(personInitials("Jordan Lee")).toBe("JL");
    expect(personInitials("jordan lee")).toBe("JL");
    expect(personInitials("Jane Q. Doe")).toBe("JD");
    expect(personInitials("J. R. Smith, CCIM")).toBe("JS");
    expect(personInitials("Mary-Jane Watson")).toBe("MW");
    expect(personInitials("Madonna")).toBe("M");
    expect(personInitials("Émile Zola")).toBe("ÉZ");
    expect(personInitials("  Ana  Lima (Acquisitions) ")).toBe("AL");
    expect(personInitials("Conan O'Brien")).toBe("CO");
  });

  it("wears the same initials for an email and its local part shown as a name", () => {
    for (const email of ["fredballs1115@gmail.com", "jordan.lee@firm.com", "j2smith@x.com", "jordan_lee-smith@x.com"]) {
      expect(personInitials(displayName(email)), email).toBe(personInitials(email));
    }
  });

  it("is the pipeline's row and card badge's own rule", () => {
    expect(initials("fredballs1115@gmail.com")).toBe("F");
    expect(initials("jordan.lee@firm.com")).toBe("JL");
    expect(initials("Jordan Lee")).toBe("JL");
  });

  it("is a question mark where nothing is a letter or a digit", () => {
    expect(personInitials("")).toBe("?");
    expect(personInitials(null)).toBe("?");
    expect(personInitials(" — ")).toBe("?");
  });
});

describe("a person's name", () => {
  it("is the name they set, else the email's local part, never the whole address", () => {
    expect(personName("Fred Balls", "fredballs1115@gmail.com")).toBe("Fred Balls");
    expect(personName("  ", "fredballs1115@gmail.com")).toBe("fredballs1115");
    expect(personName(null, "fred+deals@gmail.com")).toBe("fred");
    expect(personName(null, null)).toBe("Teammate");
    expect(personName(undefined, "", "You")).toBe("You");
  });

  it("names the reader to themselves from the account's own copy, else the email's local part", () => {
    expect(viewerName({ email: "fredballs1115@gmail.com", user_metadata: { full_name: "Fred Balls" } })).toBe("Fred Balls");
    expect(viewerName({ email: "fredballs1115@gmail.com", user_metadata: { full_name: 7 } })).toBe("fredballs1115");
    expect(viewerName({ email: "fredballs1115@gmail.com", user_metadata: {} })).toBe("fredballs1115");
    expect(viewerName(null)).toBe("You");
  });

  it("shows a label that may be an email as its local part", () => {
    expect(displayName("jordan.lee@firm.com")).toBe("jordan.lee");
    expect(displayName("Jordan Lee")).toBe("Jordan Lee");
    expect(displayName(null)).toBe("");
    expect(looksLikeEmail("a@b")).toBe(true);
    expect(looksLikeEmail("Jordan Lee")).toBe(false);
    expect(looksLikeEmail("me @ firm")).toBe(false);
    expect(emailLocalPart("+x@y.com")).toBe("+x");
  });
});

describe("a person's tone", () => {
  // WCAG relative luminance, against the white the initials are set in.
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastWithWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);

  it("reads white initials at 4.5:1 or better on every tone", () => {
    for (const t of PERSON_TONES) expect(contrastWithWhite(t), t).toBeGreaterThanOrEqual(4.5);
  });

  it("is the same for the same key, whatever its case, and spreads people across the tones", () => {
    expect(personToneIndex("33333333-3333-4333-8333-333333333333")).toBe(personToneIndex("33333333-3333-4333-8333-333333333333"));
    expect(personToneIndex("Jordan Lee")).toBe(personToneIndex("jordan lee"));
    const seen = new Set(Array.from({ length: 64 }, (_, i) => personToneIndex(`user-${i}`)));
    expect(seen.size).toBe(PERSON_TONES.length);
    for (let i = 0; i < 64; i++) {
      const n = personToneIndex(`user-${i}`);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(PERSON_TONES.length);
    }
    expect(personToneIndex(null)).toBe(personToneIndex(""));
  });
});

describe("the name the account page saves", () => {
  it("keeps the words typed, one space between them, and reads an empty field as no name", () => {
    expect(readFullName("  Fred   Balls ")).toEqual({ ok: true, name: "Fred Balls" });
    expect(readFullName("Fred​ Balls\n")).toEqual({ ok: true, name: "Fred Balls" });
    expect(readFullName("   ")).toEqual({ ok: true, name: null });
    expect(readFullName(null)).toEqual({ ok: true, name: null });
    expect(readFullName("Zoë O'Brien-Núñez")).toEqual({ ok: true, name: "Zoë O'Brien-Núñez" });
  });

  it("refuses an email, which would print whole on every row, and a name past the limit", () => {
    expect(readFullName("fredballs1115@gmail.com")).toEqual({ ok: false, why: "email" });
    expect(readFullName("x".repeat(FULL_NAME_MAX))).toEqual({ ok: true, name: "x".repeat(FULL_NAME_MAX) });
    expect(readFullName("x".repeat(FULL_NAME_MAX + 1))).toEqual({ ok: false, why: "long" });
  });
});
