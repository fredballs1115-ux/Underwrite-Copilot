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

  // Audit C8, M3: a note, a leased fee, a share and a position were handed
  // the fee-simple building's list — a PCA, service contracts to assume and
  // a reassessment at our price — and none of their own.
  describe("what the price buys decides the list", () => {
    const interest = (kind: string, more: Record<string, string> = {}) =>
      ({ interest: { kind, summary: "", share: "", groundLease: "", loan: "", page: "", ...more } }) as Partial<ExtractionResult>;
    const PROPERTY_ONLY = [
      "Service contracts: review each and decide which to assume",
      "Property tax reassessment estimate at our price",
      "Insurance quote on our own program",
      "Tenant estoppels and SNDAs",
    ];

    it("a note: the loan file, its servicing and the collateral, never contracts or a reassessment", () => {
      const note = ddChecklist("office", ex("office", interest("note")));
      for (const i of PROPERTY_ONLY) expect(note).not.toContain(i);
      expect(note).not.toContain("Title commitment and survey");
      expect(note).toContain("Loan file: the note, the mortgage, the guaranties and the payment history");
      expect(note).toContain("Servicing history: payments, defaults, modifications and forbearance");
      expect(note).toContain("Title and lien search on the collateral: the mortgage's priority");
      expect(note).toContain("Collateral's property condition assessment (PCA)");
      expect(note).toContain("Collateral's documents: the borrower's rent roll, operating statements and insurance");
      expect(ddChecklist("land_infill", ex("land", interest("note")))).not.toContain("Collateral's property condition assessment (PCA)");
    });

    it("a leased fee: the ground lease, the leaseholder's estoppel and subordination, never the building's PCA or contracts", () => {
      const fee = ddChecklist("hospitality_str", ex("hotel", interest("leased_fee")));
      for (const i of PROPERTY_ONLY) expect(fee).not.toContain(i);
      expect(fee).not.toContain("Property condition assessment (PCA)");
      expect(fee).not.toContain("PIP and franchise: the brand's improvement plan and its approval of the sale");
      expect(fee).toContain("Title commitment and survey");
      expect(fee).toContain("Ground lease: the lease, its amendments and its rent schedule");
      expect(fee).toContain("Leaseholder's estoppel: the rent, the term and no default");
      expect(fee).toContain("Subordination: whether the fee stands behind the leaseholder's mortgage");
    });

    it("a share, a trust, a GP stake and a position: the entity's documents, its loan, the waterfall and the sponsor's reporting", () => {
      const share = ddChecklist("multifamily", ex("multifamily", interest("partial_interest", { share: "49% limited partnership interest" })));
      const dst = ddChecklist("multifamily", ex("multifamily", interest("partial_interest", { share: "beneficial interests in a Delaware statutory trust" })));
      const gp = ddChecklist("multifamily", ex("multifamily", interest("partial_interest", { share: "50% of the general partner interest" })));
      const pref = ddChecklist("multifamily", ex("multifamily", interest("preferred_equity")));
      for (const list of [share, dst, gp, pref]) {
        for (const i of [...PROPERTY_ONLY, "Title commitment and survey", "Property condition assessment (PCA)", "Lease audit: a sample of the leases against the rent roll"])
          expect(list).not.toContain(i);
        expect(list).toContain("The sponsor's reporting: the latest financials, rent roll and budget");
        expect(list).toContain("The property's reports: the sponsor's title policy, PCA and Phase I");
      }
      expect(share).toContain("Operating agreement: governance, major decisions, transfers and exit rights");
      expect(share).toContain("The waterfall: distributions, the promote and capital calls");
      expect(share).toContain("The entity's loan: its documents and the lender's consent to the transfer");
      expect(dst[0]).toBe("Trust agreement: the trustee's powers, transfers and how the trust ends");
      expect(gp[0]).toBe("General partner's agreement: our share of the promote, the fees and the decisions");
      expect(pref).toContain("The senior loan: its documents, maturity and the lender's consent to the position");
    });

    it("a tenancy in common takes title: the property's list, with the co-owners' agreement and the loan", () => {
      const tic = ddChecklist("multifamily", ex("multifamily", interest("partial_interest", { share: "30% undivided tenant-in-common interest" })));
      expect(tic).toContain("Title commitment and survey");
      expect(tic).toContain("Property condition assessment (PCA)");
      expect(tic).toContain("Tenancy-in-common agreement: decisions, transfers, partition and the manager");
      expect(tic).toContain("The property's loan: its documents and the lender's consent to our interest");
    });
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
