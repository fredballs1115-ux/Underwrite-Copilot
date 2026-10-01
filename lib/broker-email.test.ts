// The broker email the challenger's "Copy broker email" writes cites each
// question's page in the memorandum. The page is the model's, so it is held
// to the deck's own length (lib/facts `pageInDeck`) before it is sent to the
// broker who wrote the deck: a page their memorandum does not hold is the
// one misread citation that leaves the site.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBrokerEmail } from "@/app/(app)/deals/[id]/deal-sections";
import { pageInDeck } from "./facts";
import type { Challenge } from "./anthropic/types";

const ch = (page: string, question: string): Challenge =>
  ({ assumption: "Vacancy", challenge: "Too tight.", question, severity: "high", page }) as Challenge;

describe("the broker email cites only pages the memorandum has", () => {
  it("prints a page inside the deck, and none past it or where the length is unknown", () => {
    const qs = [ch("p. 12", "What is the T-12 vacancy?"), ch("p. 412", "Who holds the lease?")];
    const email = buildBrokerEmail(qs, "The Maddox", 60);
    expect(email).toContain("1. What is the T-12 vacancy? (OM p. 12)");
    expect(email).toContain("2. Who holds the lease?\n");
    expect(email).not.toContain("412");
    expect(buildBrokerEmail(qs, "The Maddox", null)).not.toMatch(/\(OM/);
  });

  it("pageInDeck reads a page the deck holds, and nothing else", () => {
    expect(pageInDeck("p. 12", 60)).toBe(12);
    expect(pageInDeck("Page 60", 60)).toBe(60);
    expect(pageInDeck("p. 61", 60)).toBeNull();
    expect(pageInDeck("p. 12", null)).toBeNull();
    expect(pageInDeck("", 60)).toBeNull();
  });

  it("the comps map's OM link reads the page through the same rule", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-sections.tsx"), "utf8");
    expect(src).toContain("const pageNum = pageInDeck(c.page, mapContext.totalPages);");
    expect(src).not.toMatch(/c\.page\?\.match\(/);
  });
});
