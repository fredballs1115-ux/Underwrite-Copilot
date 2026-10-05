// A screen stored before a reader its figures turn on (research pass 42, M11).
// The pass's fixture: one memorandum — $10,000,000 for a 49% interest in a
// 120-unit building — reads "$170k/unit" with the tag "49% share" when the
// interest was read, and "$83k/unit" with no tag when the same deal was
// screened before #414. The figures are the readers' own and stay as they
// are; what changes is that the older screen now says so.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect() is not expected in a static render");
  },
}));
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return {
    createDeal: noop,
    createDealFromBatch: noop,
    createManualDeal: noop,
    updateManualFacts: noop,
    createSampleDeal: noop,
    setStage: noop,
    setOffersDue: noop,
    renameDeal: noop,
    deleteDeal: noop,
    rerunAnalysis: noop,
    replaceOm: noop,
    reconcileWithModel: noop,
    addDealNote: noop,
    deleteDealNote: noop,
    replacePicture: noop,
  };
});

import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy } from "./deal-strategy";
import { basisTag } from "./pipeline-slots";
import { interestTag } from "./interest";
import { olderScreen, olderScreenLine } from "./older-screen";
import { READER_ROUND, readerRoundOf } from "./reader-round";
import { OLDER_SCREEN_CHIP, olderScreenTag } from "./pipeline-tags";
import { buildManualExtraction } from "./manual-deal";
import { SAMPLE_DEAL } from "./sample-deal";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { OlderScreenNote } from "@/app/(app)/deals/[id]/older-screen-note";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "./deal-allowance";
import { visibleText } from "./render-lint";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "p. 3" });
const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "Deal", assetClass: "multifamily", market: "Dallas, TX", address: "", totalPages: 40, metrics, ...over }) as ExtractionResult;

const BASE = [m("Asking price", "$10,000,000"), m("Going-in cap rate", "5.40%"), m("Units", "120")];
const SHARE = {
  kind: "partial_interest" as const,
  summary: "",
  share: "49% limited partnership interest",
  groundLease: "",
  loan: "",
  page: "p. 2",
};
const LINE = "Screened before the site read what is being sold — re-screen to read it";

describe("olderScreen — a screen stored before the site read what is being sold", () => {
  it("says so on the pass's 49% share screened before #414, and not once the interest was read", () => {
    const now = ex(BASE, { interest: SHARE });
    const old = ex(BASE);
    // The readers' figures, unchanged: the share read is the whole's basis.
    expect(basisTag(now, inferStrategy(now).kind, "multifamily")).toBe("$170k/unit");
    expect(interestTag(now)).toBe("49% share");
    expect(olderScreen(now)).toBeNull();
    // The same deal screened before: the whole building's basis, no tag —
    // and now the sentence that says why.
    expect(basisTag(old, inferStrategy(old).kind, "multifamily")).toBe("$83k/unit");
    expect(interestTag(old)).toBeNull();
    expect(olderScreen(old)).toEqual({ field: "interest", line: LINE });
    expect(olderScreenLine({ what: "what is being sold" })).toBe(LINE);
  });

  it("never where the field is present, whatever it says", () => {
    const unknown = { ...SHARE, kind: "unknown" as const, share: "" };
    expect(olderScreen(ex(BASE, { interest: unknown }))).toBeNull();
    const fee = { ...SHARE, kind: "fee_simple" as const, share: "" };
    expect(olderScreen(ex(BASE, { interest: fee }))).toBeNull();
  });

  it("never on a screen stamped under a round that asked for it — the absence is the memorandum's", () => {
    expect(olderScreen(ex(BASE, { readerRound: READER_ROUND }))).toBeNull();
    expect(olderScreen(ex(BASE, { readerRound: 0 }))).toEqual({ field: "interest", line: LINE });
  });

  it("never on a deal typed by hand, stamped or stored before the stamp", () => {
    const typed = buildManualExtraction({
      name: "Fourplex",
      assetClass: "multifamily",
      market: "Dallas, TX",
      address: "",
      price: 1_000_000,
      capPct: null,
      noiAnnual: 60_000,
      units: 4,
      sf: null,
      avgRentMo: null,
      occupancyPct: null,
      yearBuilt: null,
      notes: "",
    } as Parameters<typeof buildManualExtraction>[0]);
    expect(typed.interest).toBeUndefined();
    expect(olderScreen(typed)).toBeNull();
    const unstamped = { ...typed };
    delete unstamped.readerRound;
    delete unstamped.screenedOn;
    expect(olderScreen(unstamped)).toBeNull();
  });

  it("never on the sample, whose extraction carries no interest", () => {
    const sample = SAMPLE_DEAL.extraction as unknown as ExtractionResult;
    expect(sample.interest).toBeUndefined();
    expect(olderScreen(sample, { isSample: true })).toBeNull();
    // the guard is what keeps it off: unflagged, it would say it
    expect(olderScreen(sample)).not.toBeNull();
  });

  it("never with no extraction", () => {
    expect(olderScreen(null)).toBeNull();
    expect(olderScreen(undefined)).toBeNull();
  });
});

describe("the reader round — stamped where the screen stamps its day", () => {
  it("is stamped on a deal typed by hand", () => {
    const typed = buildManualExtraction(
      { name: "Lot", assetClass: "multifamily", market: "", address: "", price: null, capPct: null, noiAnnual: null, units: null, sf: null, avgRentMo: null, occupancyPct: null, yearBuilt: null, notes: "" } as Parameters<
        typeof buildManualExtraction
      >[0],
    );
    expect(typed.readerRound).toBe(READER_ROUND);
    expect(readerRoundOf(typed)).toBe(READER_ROUND);
  });

  it("reads a missing or malformed stamp as round 0", () => {
    for (const r of [undefined, null, "1", 1.5, -2, 0, Number.NaN]) {
      expect(readerRoundOf({ readerRound: r }), String(r)).toBe(0);
    }
    expect(readerRoundOf(null)).toBe(0);
    expect(readerRoundOf({ readerRound: 3 })).toBe(3);
  });
});

describe("where it is said", () => {
  it("is a chip on the pipeline's card and row, the sentence in its title, never on the picture", () => {
    expect(olderScreenTag(null)).toBeNull();
    expect(olderScreenTag(LINE)).toEqual({ key: "older", text: OLDER_SCREEN_CHIP, tone: "caution", title: LINE });
    const card = (over: Partial<DealCard> & Pick<DealCard, "id" | "name">): DealCard => ({
      assetClass: "multifamily",
      createdAt: "2026-09-01T12:00:00Z",
      verdict: "caution",
      stage: "screening",
      addedBy: null,
      fit: null,
      score: null,
      mandateVerdict: null,
      market: "Dallas, TX",
      coveredMarket: "Dallas–Fort Worth",
      offersDue: null,
      slots: { cap: "5.40%", price: "$10,000,000", yoc: null, basis: "$83k/unit" },
      jobStatus: null,
      hasAddress: true,
      ...over,
    });
    const deals = [card({ id: "old", name: "Harbor View Apartments", older: LINE }), card({ id: "new", name: "Elm Street Lofts" })];
    for (const view of ["cards", "list"] as const) {
      const html = renderToStaticMarkup(
        React.createElement(
          ToastProvider,
          null,
          React.createElement(Pipeline, {
            deals,
            errorMessage: null,
            notice: null,
            onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
            billing: { isPro: true, canCreateDeal: true, allowance: dealAllowance({ plan: "pro", dealCount: 2, team: null }) },
            todayIso: "2026-10-05",
            initialView: view,
          }),
        ),
      );
      // Once, for the one older deal, with the server's sentence as its title.
      expect(visibleText(html).split(OLDER_SCREEN_CHIP).length - 1, view).toBe(1);
      expect(html.split(`title="${LINE}"`).length - 1, view).toBe(1);
      expect(html).not.toContain('data-tags="picture"');
    }
  });

  it("is one line at the head of the deal page's panels, with the re-screen control handed in", () => {
    const html = renderToStaticMarkup(
      React.createElement(OlderScreenNote, { line: LINE, action: React.createElement("button", { type: "submit" }, "Re-screen") }),
    );
    expect(html).toContain('data-qa="older-screen"');
    expect(html).toContain('role="status"');
    expect(visibleText(html)).toContain(LINE);
    expect(visibleText(html)).toContain("Re-screen");
  });
});
