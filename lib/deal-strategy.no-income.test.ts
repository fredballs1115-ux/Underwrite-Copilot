// Research pass 37: a building with no income today. A vacant 42,000 SF
// office stated "Occupancy 0%" and no NOI, offered "to owner-users or
// investors", read "Deal type: Stabilized" — inferStrategy read no occupancy —
// and, filed as the lease-up it is, its plan paragraph spoke of "the
// stabilized NOI" and "the construction or renovation budget" its memorandum
// never states. Words and the deal's kind only: the model's figures on such a
// deal are the owner's call.
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { assessPlausibility, inferStrategy, planSummary, plausibilityNote } from "./deal-strategy";
import { dealContextFor } from "./deal-context";
import { gluedWords } from "./render-lint";

const row = (label: string, value: string, basis: ExtractedMetric["basis"] = "na"): ExtractedMetric => ({ label, value, flagged: false, page: "p. 3", basis });
const unknownPlan = { kind: "unknown" as const, summary: "", capitalBudget: "", timeline: "" };

const office = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  dealName: "1200 Corporate Drive",
  assetClass: "Office",
  strategy: unknownPlan,
  metrics: [row("Asking price", "8,500,000"), row("Total SF", "42,000 SF"), row("Year built", "1999"), ...metrics],
  ...over,
});

describe("inferStrategy — a building with no income today is a lease-up, not stabilized", () => {
  it("reads a stated in-place occupancy of 0% with no in-place or Year-1 NOI as a lease-up", () => {
    const s = inferStrategy(office([row("Occupancy", "0%", "in_place")]));
    expect(s).toMatchObject({ kind: "lease_up", source: "inferred" });
    // The research fixture, its own words beside it.
    expect(inferStrategy(office([row("Occupancy", "0%", "in_place")], { dealName: "1200 Corporate Drive (vacant, owner-user or investor)" })).kind).toBe("lease_up");
  });

  it("reads the deal's own words — vacant, owner-user — where no occupancy is stated", () => {
    for (const dealName of ["1200 Corporate Drive (vacant)", "Owner-user opportunity: 1200 Corporate Drive", "1200 Corporate Drive — owner/user or investor"]) {
      expect(inferStrategy(office([], { dealName })).kind, dealName).toBe("lease_up");
    }
    // The first read's words count, as they do for every plan word.
    expect(inferStrategy(office([]), { take: "A vacant suburban office building offered to owner-users." }).kind).toBe("lease_up");
  });

  it("leaves an operating building, a part of one vacant, a stated occupancy above 0% and land as they were", () => {
    // An NOI stated today is income: the words do not move it.
    expect(inferStrategy(office([row("Occupancy", "0%", "in_place"), row("NOI (in-place)", "$650,000", "in_place")])).kind).toBe("stabilized");
    expect(inferStrategy(office([row("NOI (Year 1)", "$650,000")], { dealName: "1200 Corporate Drive (vacant)" })).kind).toBe("stabilized");
    // Nor does a pro forma NOI move: on a building read as stabilized the
    // model runs it as year 1 and a lease-up's model never does, so reading
    // it as a lease-up would move the model's figures (the owner's call).
    const proForma = row("NOI (stabilized, pro forma)", "$650,000", "pro_forma");
    expect(inferStrategy(office([row("Occupancy", "0%", "in_place"), proForma])).kind).toBe("stabilized");
    expect(inferStrategy(office([proForma], { dealName: "1200 Corporate Drive (vacant)" })).kind).toBe("stabilized");
    // A stated occupancy above 0% says tenants are in place, whatever the words:
    // where a lease-up begins above 0% is the owner's call.
    expect(inferStrategy(office([row("Occupancy", "15%", "in_place")], { dealName: "1200 Corporate Drive (vacant, owner-user or investor)" })).kind).toBe(
      "stabilized",
    );
    // A vacant part of a building, or vacant land, is no vacant building.
    for (const dealName of ["1200 Corporate Drive, two vacant suites", "Retail center with a vacant pad", "Vacant land on Corporate Drive"]) {
      expect(inferStrategy(office([], { dealName })).kind, dealName).toBe("stabilized");
    }
    // Land is no building to lease.
    const land = office([], { assetClass: "Land", dealName: "Vacant 22-acre site, owner-user or developer" });
    expect(inferStrategy(land).kind).not.toBe("lease_up");
    // The extraction's own read wins, as ever.
    expect(inferStrategy(office([row("Occupancy", "0%", "in_place")], { strategy: { ...unknownPlan, kind: "stabilized" } })).kind).toBe("stabilized");
  });
});

describe("assessPlausibility — no income in place on a deal read as stabilized", () => {
  const stated = (metrics: ExtractedMetric[]) => office(metrics, { strategy: { ...unknownPlan, kind: "stabilized" } });

  it("names a stated in-place occupancy of 0% beside no in-place NOI", () => {
    const f = assessPlausibility(stated([row("Occupancy", "0%", "in_place")]));
    expect(f).toEqual([
      {
        code: "no_income_in_place",
        severity: "medium",
        title: "Occupancy is 0% and no in-place NOI is stated, on a deal read as stabilized",
        detail:
          "An operating asset produces income. Either this is a lease-up, conversion or development the deck does not name plainly, or the figure was misread. Settle the strategy first — every return depends on it.",
      },
    ]);
    // An in-place NOI stated beside it, or an occupancy above 0%, makes no such finding.
    expect(assessPlausibility(stated([row("Occupancy", "0%", "in_place"), row("NOI (in-place)", "$650,000", "in_place")])).map((x) => x.code)).not.toContain(
      "no_income_in_place",
    );
    expect(assessPlausibility(stated([row("Occupancy", "5%", "in_place")]))).toEqual([]);
    // A stated NOI of nothing still names itself, once.
    const zero = assessPlausibility(stated([row("Occupancy", "0%", "in_place"), row("NOI (in-place)", "$0", "in_place")]));
    expect(zero.filter((x) => x.code === "no_income_in_place").map((x) => x.title)).toEqual(["NOI (in-place) is $0 on a deal read as stabilized"]);
    // A building its strategy leaves stabilized because it states a pro forma
    // NOI, with 0% stated beside it, is named the same way.
    const proForma = assessPlausibility(office([row("Occupancy", "0%", "in_place"), row("NOI (stabilized, pro forma)", "$650,000", "pro_forma")]));
    expect(proForma.filter((x) => x.code === "no_income_in_place").map((x) => x.title)).toEqual([
      "Occupancy is 0% and no in-place NOI is stated, on a deal read as stabilized",
    ]);
  });
});

describe("plausibilityNote — a lease-up's paragraph speaks only of what the memorandum states", () => {
  it("says a stabilized NOI and a budget the memorandum does not state are not stated, and never tests them", () => {
    const e = office([row("Occupancy", "0%", "in_place")], { dealName: "1200 Corporate Drive (vacant, owner-user or investor)" });
    const s = inferStrategy(e);
    const note = plausibilityNote(assessPlausibility(e, s), s, planSummary(e, s), e);
    expect(note).toContain("stabilized NOI not stated");
    expect(note).toContain("The memorandum states no stabilized NOI, so there is no pro forma for the leased building to test and no yield on cost to judge, and none is built here.");
    expect(note).toContain(
      "Nor does it state a construction, renovation or leasing budget: ask for the tenant improvements, the commissions and the downtime the lease-up will cost before any rent is paid.",
    );
    expect(note).not.toMatch(/The stabilized NOI is|the construction or renovation budget and schedule|Test whether the stabilized NOI/);
    expect(note).toContain("so any stabilized NOI is a forward figure over total cost");
    expect(dealContextFor(e)).toContain("Deal type: Lease-up");
    expect(gluedWords(note)).toEqual([]);
  });

  it("tests a stabilized NOI and a budget where the memorandum states them", () => {
    const e = office([row("Occupancy", "0%", "in_place"), row("NOI (stabilized, pro forma)", "$1,050,000", "pro_forma"), row("Renovation budget", "$2,100,000")], {
      strategy: { kind: "lease_up", summary: "Lease the vacant building", capitalBudget: "", timeline: "" },
    });
    const s = inferStrategy(e);
    const note = plausibilityNote([], s, planSummary(e, s), e);
    expect(note).toContain("The stabilized NOI is the sponsor's pro forma for the building once it is leased");
    expect(note).toContain("Test the budget it states — the tenant improvements, the commissions, any renovation — and its schedule against comparable lease-ups.");
    expect(note).toContain("Test whether the stabilized NOI is as conservative as the deck presents it");
    expect(note).not.toMatch(/states no stabilized NOI|Nor does it state/);
    // A development's paragraph is as it was.
    const dev = office([row("NOI (stabilized, pro forma)", "$1,050,000", "pro_forma"), row("Total project cost", "$12,000,000")], {
      strategy: { kind: "development", summary: "Ground-up office", capitalBudget: "", timeline: "" },
    });
    const ds = inferStrategy(dev);
    expect(plausibilityNote([], ds, planSummary(dev, ds), dev)).toContain("The stabilized NOI is the sponsor's post-completion pro forma");
  });
});
