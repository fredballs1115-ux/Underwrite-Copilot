// Research pass 40, M8, then 2026-10-20: the challenger's own downside
// paragraph had been headed "Stress test" beside the stress test struck in
// code, and carried IRR arithmetic the engine never ran (the sample's read
// the first-draft model's run). The challenger is asked for the scenario in
// words now, and every surface heads the paragraph as the challenger's, with
// one line saying it is not a computed result. The sample's paragraph names
// no return at all.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { ChallengerView } from "@/app/(app)/deals/[id]/deal-sections";
import { CHALLENGER_SCENARIO_NOTE, CHALLENGER_SCENARIO_TITLE } from "@/lib/stress-test-title";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import type { DealRow } from "@/lib/deals";
import type { ChallengerResult } from "@/lib/anthropic/types";
import { visibleText } from "./render-lint";

const SAMPLE_CHALLENGES = SAMPLE_DEAL.challenges as ChallengerResult;
// A screen stored before the change: the challenger's own arithmetic.
const OLDER: ChallengerResult = {
  ...SAMPLE_CHALLENGES,
  stressTest: "Reverting the exit cap to 5.75% and rent growth to 2.5% takes the levered IRR from about 14% to about 9%.",
};

const page = (result: ChallengerResult) =>
  visibleText(renderToStaticMarkup(React.createElement(ChallengerView, { result, dealName: "x", totalPages: 48 })));

describe("whose words the challenger's downside paragraph is", () => {
  it("heads an older screen's paragraph as the challenger's scenario, never a computed result", () => {
    const text = page(OLDER);
    expect(text).toContain(CHALLENGER_SCENARIO_TITLE);
    expect(text).toContain(CHALLENGER_SCENARIO_NOTE);
    expect(text).toContain(OLDER.stressTest);
    expect(text).not.toMatch(/Stress test —/);
  });

  it("gives the sample's in words, with no return figure in it", () => {
    const text = page(SAMPLE_CHALLENGES);
    expect(text).toContain(CHALLENGER_SCENARIO_TITLE);
    expect(text).toContain(SAMPLE_CHALLENGES.stressTest);
    expect(SAMPLE_CHALLENGES.stressTest).not.toMatch(/IRR|multiple|cash-on-cash/i);
    expect(SAMPLE_CHALLENGES.stressTest).not.toMatch(/\d+(\.\d+)?% from/);
  });

  it("says the same in the full report", async () => {
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
    const older = await render(buildReportData({ ...deal, challenges: OLDER } as unknown as DealRow, "October 5, 2026"));
    expect(older.toUpperCase()).toContain(CHALLENGER_SCENARIO_TITLE.toUpperCase());
    expect(older).toContain(CHALLENGER_SCENARIO_NOTE);
    expect(older.toUpperCase()).not.toContain("STRESS TEST — THE SCREEN'S ESTIMATE");
  }, 120_000);
});
