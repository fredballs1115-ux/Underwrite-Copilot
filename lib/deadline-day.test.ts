import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deadlineCommit, deadlineDay } from "./deadline-day";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a deadline typed into the deal's date field (research pass 33)", () => {
  it("is a real day between 2000 and 2100, never a year still being typed", () => {
    expect(deadlineDay("2027-10-15")).toBe("2027-10-15");
    expect(deadlineDay(" 2026-02-28 ")).toBe("2026-02-28");
    // The field's own values on the way to 2027.
    for (const partial of ["0002-10-15", "0020-10-15", "0202-10-15"]) expect(deadlineDay(partial)).toBeNull();
    expect(deadlineDay("2101-01-01")).toBeNull();
    expect(deadlineDay("1999-12-31")).toBeNull();
    // No real day.
    expect(deadlineDay("2027-06-31")).toBeNull();
    expect(deadlineDay("2027-13-01")).toBeNull();
    expect(deadlineDay("2027-02-29")).toBeNull();
    expect(deadlineDay("2028-02-29")).toBe("2028-02-29");
    expect(deadlineDay("Oct 15, 2027")).toBeNull();
  });

  it("saves a real deadline or a cleared field, and refuses a half-typed one", () => {
    expect(deadlineCommit("2027-10-15", false, null)).toBe("save");
    expect(deadlineCommit("2027-10-15", false, "2027-10-15")).toBe("same");
    expect(deadlineCommit("0002-10-15", false, "2027-10-15")).toBe("refuse");
    // A cleared field clears the deadline; a half-typed one reads as empty
    // too, and is never taken for a clear.
    expect(deadlineCommit("", false, "2027-10-15")).toBe("save");
    expect(deadlineCommit("", true, "2027-10-15")).toBe("refuse");
    expect(deadlineCommit("", false, null)).toBe("same");
  });

  it("is the rule the save action holds a deadline to", () => {
    const action = src("app/(app)/deals/actions.ts");
    const body = action.slice(action.indexOf("export async function setOffersDue"));
    expect(body.slice(0, 900)).toMatch(/deadlineDay\(raw\)/);
  });
});

describe("a control that saves only what the reader chose", () => {
  it("saves a typed deadline on leaving the field or on Enter, a picked one at once", () => {
    const field = src("app/(app)/deals/offers-due.tsx");
    expect(field).toMatch(/onChange=\{\(e\) => \{\s*if \(!typed\.current\) save\(/);
    expect(field).toMatch(/onBlur=\{\(e\) => \{\s*if \(typed\.current\) save\(/);
    expect(field).toMatch(/deadlineCommit\(/);
  });

  it("saves a stage reached with the keys on leaving the select, never at each arrow", () => {
    const select = src("app/(app)/deals/[id]/stage-select.tsx");
    expect(select).not.toMatch(/onChange=\{onPick\}/);
    expect(select).toMatch(/if \(byKeys\.current\) unsaved\.current = true;\s*else onPick\(\);/);
    expect(select).toMatch(/onBlur=\{\(\) => \{\s*if \(!unsaved\.current\) return;/);
  });
});
