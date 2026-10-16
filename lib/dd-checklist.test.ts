// The due-diligence checklist by class and what the price buys (research
// pass 24, B16).
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { ddChecklist, unaddedChecklist } from "./dd-checklist";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({}) }));

const ex = (assetClass: string, over: Partial<ExtractionResult> = {}) =>
  ({ dealName: "X", assetClass, market: "", metrics: [], ...over }) as unknown as ExtractionResult;

describe("ddChecklist", () => {
  it("asks the work every building needs, and the tenancy item its class leases on", () => {
    const office = ddChecklist("office", ex("office"));
    expect(office).toEqual([
      "Title commitment and survey",
      "Zoning report",
      "Property condition assessment (PCA)",
      "Phase I environmental site assessment",
      "Tenant estoppels and SNDAs",
      "Service contracts: review each and decide which to assume",
      "Insurance quote on our own program",
      "Property tax reassessment estimate at our price",
    ]);
    const apartments = ddChecklist("multifamily", ex("multifamily"));
    expect(apartments).toContain("Lease audit: a sample of the leases against the rent roll");
    expect(apartments).not.toContain("Tenant estoppels and SNDAs");
  });

  it("adds a hotel's PIP, a park's utilities and a leasehold's ground lease; land has no building to inspect", () => {
    expect(ddChecklist("hospitality_str", ex("hotel"))).toContain("PIP and franchise: the brand's improvement plan and its approval of the sale");
    expect(ddChecklist("manufactured_housing", ex("manufactured housing"))).toContain(
      "Utilities: the water, sewer and electric systems, and who owns and bills them",
    );
    const leasehold = ddChecklist(
      "office",
      ex("office", { interest: { kind: "leasehold", summary: "", share: "", groundLease: "", loan: "", page: "" } } as Partial<ExtractionResult>),
    );
    expect(leasehold).toContain("Ground lease: the lease, its amendments and the ground lessor's estoppel");
    const land = ddChecklist("land_infill", ex("land"));
    expect(land).not.toContain("Property condition assessment (PCA)");
    expect(land).not.toContain("Service contracts: review each and decide which to assume");
    expect(land).toContain("Phase I environmental site assessment");
  });

  it("never adds an item already a task", () => {
    const items = ddChecklist("office", ex("office"));
    expect(unaddedChecklist(items, [{ title: "Zoning report" }])).not.toContain("Zoning report");
    expect(unaddedChecklist(items, items.map((title) => ({ title })))).toEqual([]);
  });
});

describe("the tasks card offers the checklist", () => {
  it("names how many items one click adds, and says they arrive undated", async () => {
    const { DealTasks } = await import("@/app/(app)/deals/[id]/deal-tasks");
    const items = ddChecklist("office", ex("office"));
    const html = renderToStaticMarkup(
      React.createElement(DealTasks, { dealId: "d1", tasks: [], assignees: [], todayIso: "2026-10-05", ddChecklist: items }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(visibleText(html)).toContain(`Add the due-diligence checklist (${items.length} items)`);
    expect(visibleText(html)).toContain("set each one's day from the contract");
    const none = renderToStaticMarkup(
      React.createElement(DealTasks, { dealId: "d1", tasks: [], assignees: [], todayIso: "2026-10-05", ddChecklist: null }),
    );
    expect(none).not.toContain("due-diligence checklist");
  });
});
