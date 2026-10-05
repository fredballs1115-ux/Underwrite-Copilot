// "From your pipeline" (research pass 42, M1): the deal page read the forty
// newest screens the reader can see, of any class, teammates' included, and
// kept the first eight of the deal's class, under "as extracted from each OM
// you've screened". A team that screened forty offices since its last
// apartment deal showed an apartment deal no comps at all.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deriveInternalComps, internalCompCandidates, INTERNAL_COMP_CANDIDATES, type CompKeyRow } from "./internal-comps";
import { internalCompsLead } from "./internal-comps-lead";

const at = (k: number) => new Date(Date.UTC(2026, 8, 1) + k * 86_400_000).toISOString();
const key = (id: string, cls: string, k: number, over: Partial<CompKeyRow> = {}): CompKeyRow => ({
  id,
  asset_class: "auto",
  is_sample: false,
  created_at: at(k),
  ext_class: cls,
  ...over,
});

// Three apartment screens, then forty offices after them.
const KEYS: CompKeyRow[] = [
  ...Array.from({ length: 3 }, (_, i) => key(`apt${i}`, "Multifamily", i)),
  ...Array.from({ length: 40 }, (_, i) => key(`off${i}`, "Office", 10 + i)),
  key("sample", "Multifamily", 99, { is_sample: true }),
];

describe("internalCompCandidates — the class matched before the cut", () => {
  it("finds the apartment deals forty newer offices had pushed out of the read", () => {
    // The old read: the forty newest of any class, then the class.
    const newest40 = [...KEYS].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
    expect(newest40.filter((r) => r.ext_class === "Multifamily" && !r.is_sample)).toHaveLength(0);
    // The new: every key, the class first, newest first, never the sample.
    expect(internalCompCandidates(KEYS, "current", "multifamily", { assetClass: "multifamily" })).toEqual(["apt2", "apt1", "apt0"]);
    expect(internalCompCandidates(KEYS, "current", "office", { assetClass: "Office" })).toHaveLength(INTERNAL_COMP_CANDIDATES);
    expect(internalCompCandidates(KEYS, "apt1", "multifamily", null)).toEqual(["apt2", "apt0"]);
  });
});

describe("whose screens they are", () => {
  const row = (id: string, user: string, k: number) => ({
    id,
    name: id,
    asset_class: "multifamily",
    created_at: at(k),
    is_sample: false,
    verdict: { verdict: "pass" },
    user_id: user,
    extraction: {
      assetClass: "multifamily",
      market: "Dallas, TX",
      metrics: [
        { label: "Asking price", value: "$10,000,000", flagged: false, page: "p. 2" },
        { label: "Going-in cap rate", value: "5.40%", flagged: false, page: "p. 2" },
        { label: "Units", value: "100", flagged: false, page: "p. 2" },
      ],
    },
  });

  it("marks a teammate's screen where the caller says who is reading", () => {
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [row("mine", "me", 2), row("theirs", "mate", 1)], 8, "me");
    expect(comps.map((c) => [c.dealId, c.teammate])).toEqual([
      ["mine", false],
      ["theirs", true],
    ]);
    // A caller that says nothing gets no mark, as before.
    expect(deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [row("mine", "me", 2)])[0]).not.toHaveProperty("teammate");
  });

  it("says the most recent screens, counted, and whose", () => {
    expect(internalCompsLead(8, false)).toBe(
      "Your 8 most recent screens of the same asset class as extracted from each OM — your own frame of reference, not third-party comp data.",
    );
    expect(internalCompsLead(3, true)).toBe(
      "Your 3 most recent screens of the same asset class, yours and your team's, as extracted from each OM — your own frame of reference, not third-party comp data.",
    );
    expect(internalCompsLead(1, false)).toMatch(/^Your most recent screen of the same asset class /);
    for (const s of [internalCompsLead(8, false), internalCompsLead(3, true)]) expect(s).not.toContain("each OM you've screened");
  });

  it("is what the deal page draws, from a read that matches the class before any cut", () => {
    const view = readFileSync("app/(app)/deals/[id]/deal-view.tsx", "utf8");
    expect(view).toContain("internalCompsLead(comps.length, comps.some((c) => c.teammate))");
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(page).toContain('.select("id, asset_class, is_sample, created_at, ext_class:extraction->>assetClass")');
    expect(page).toContain("internalCompCandidates(");
    expect(page).not.toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(40\)/);
  });
});
