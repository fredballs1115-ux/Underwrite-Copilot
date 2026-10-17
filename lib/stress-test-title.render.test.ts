// Research pass 40, M8: the deal page headed the challenger's stress test
// "Stress test" bare, beside the screening playground's own returns, while
// the full report headed the same text "Stress test — the screen's estimate,
// not the model's". On a screened deal any IRR in it is the challenger's own
// arithmetic; on the sample it is the first-draft model's run (8.7% from
// 16.8%), which the report's heading then mislabelled. Both surfaces now say
// whose figures they are, the sample's pinned sentence unchanged.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { ChallengerView } from "@/app/(app)/deals/[id]/deal-sections";
import { STRESS_TEST_ESTIMATE, STRESS_TEST_FIRST_DRAFT } from "@/lib/stress-test-title";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import type { DealRow } from "@/lib/deals";
import type { ChallengerResult } from "@/lib/anthropic/types";
import { visibleText } from "./render-lint";

const SAMPLE_CHALLENGES = SAMPLE_DEAL.challenges as ChallengerResult;
// A screened deal's stress test: the challenger's own sentence.
const SCREENED: ChallengerResult = {
  ...SAMPLE_CHALLENGES,
  stressTest: "Reverting the exit cap to 5.75% and rent growth to 2.5% takes the levered IRR from about 14% to about 9%.",
};

const page = (result: ChallengerResult, sample?: boolean) =>
  visibleText(renderToStaticMarkup(React.createElement(ChallengerView, { result, dealName: "x", totalPages: 48, sample })));

describe("whose figures the stress test is (research pass 40, M8)", () => {
  it("heads a screened deal's as the screen's estimate on the deal page, as the report does", () => {
    const text = page(SCREENED);
    expect(text).toContain(STRESS_TEST_ESTIMATE);
    expect(text).toContain(SCREENED.stressTest!);
  });

  it("heads the sample's as the first-draft model's, its pinned sentence unchanged", () => {
    const text = page(SAMPLE_CHALLENGES, true);
    expect(text).toContain(STRESS_TEST_FIRST_DRAFT);
    expect(text).not.toContain(STRESS_TEST_ESTIMATE);
    expect(SAMPLE_CHALLENGES.stressTest).toMatch(/the levered IRR falls to 8\.7%, from 16\.8% at the OM's 5\.25% exit/);
    expect(text).toContain(SAMPLE_CHALLENGES.stressTest!);
  });

  it("says the same in the full report, the sample's by its own flag", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      reconciliation: SAMPLE_DEAL.reconciliation,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const render = async (input: ReturnType<typeof buildReportData>) =>
      (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    // The report sets its headings in capitals.
    const sample = (await render({ ...buildReportData(deal, "October 5, 2026"), sample: true })).toUpperCase();
    expect(sample).toContain(STRESS_TEST_FIRST_DRAFT.toUpperCase());
    expect(sample).not.toContain(STRESS_TEST_ESTIMATE.toUpperCase());
    const screened = (await render(buildReportData({ ...deal, challenges: SCREENED } as unknown as DealRow, "October 5, 2026"))).toUpperCase();
    expect(screened).toContain(STRESS_TEST_ESTIMATE.toUpperCase());
  }, 120_000);
});
