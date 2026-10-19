// The deal page's sections and analyses — its information architecture — and
// the two reads its section bar draws from them: each section's state (its
// dot) and each tab's finding count. ONE copy, read by the deal page
// (app/(app)/deals/[id]/deal-view.tsx) and by the public pages that draw the
// sample deal's tabs (/demo's sections, the homepage's walkthrough), so a tab
// a visitor meets carries the dot and the count the signed-in sample's does.
// Pure: no I/O, no React.
import type {
  BrokerCompsResult,
  ChallengerResult,
  ExtractionResult,
  MarketResult,
  ReconciliationResult,
  VerdictResult,
} from "@/lib/anthropic/types";

/** The deal's stored results, as the deal page hands them to its sections. */
export type DealResults = {
  extraction: ExtractionResult | null;
  challenges: ChallengerResult | null;
  comps: BrokerCompsResult | null;
  reconciliation: ReconciliationResult | null;
  market: MarketResult | null;
  verdict: VerdictResult | null;
};

/*
  Information hierarchy: five top-level sections, ONE visible at a time.
  Inside Analyses, the five analysis views sit behind a secondary pill nav
  in the order an acquisitions analyst checks them — the verdict first,
  then the critique that produced it.
*/
export type SectionKey = "overview" | "financials" | "buybox" | "analyses" | "documents";
export type AnalysisKey = "verdict" | "challenger" | "comps" | "market" | "reconciler";

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "buybox", label: "Buy box" },
  { key: "analyses", label: "Analyses" },
  { key: "documents", label: "Documents" },
];

export const ANALYSES: { key: AnalysisKey; label: string; result: keyof DealResults }[] = [
  { key: "verdict", label: "Verdict", result: "verdict" },
  { key: "challenger", label: "Challenger", result: "challenges" },
  { key: "comps", label: "Comps", result: "comps" },
  { key: "market", label: "Market", result: "market" },
  { key: "reconciler", label: "Reconciler", result: "reconciliation" },
];

/** Old ?tab= values (bookmarks, memo links, OverviewView jump links) map
 *  onto the new section structure instead of 404-ing to Overview. */
export const LEGACY_TABS: Record<string, { section: SectionKey; analysis?: AnalysisKey }> = {
  overview: { section: "overview" },
  terms: { section: "financials" },
  model: { section: "financials" },
  financials: { section: "financials" },
  buybox: { section: "buybox" },
  analyses: { section: "analyses" },
  verdict: { section: "analyses", analysis: "verdict" },
  challenger: { section: "analyses", analysis: "challenger" },
  comps: { section: "analyses", analysis: "comps" },
  market: { section: "analyses", analysis: "market" },
  reconciler: { section: "analyses", analysis: "reconciler" },
  documents: { section: "documents" },
};

// The automatic pass, in order — drives the progress rail and pending logic.
export const PIPELINE = ["signal", "extract", "challenge", "comps", "market", "verdict"];

/** Which analyses/steps light which section while a run is in flight. */
const SECTION_STEPS: Record<SectionKey, string[]> = {
  overview: ["signal"],
  financials: ["extract", "model"],
  buybox: [],
  analyses: ["challenge", "comps", "market", "verdict", "reconcile", "comps_search"],
  documents: [],
};

export type SectionState = "done" | "running" | "pending" | "idle";

/** A section's dot: finished, being worked on now, waiting on a step still
 *  to come, or idle. */
export function sectionStateOf(
  key: SectionKey,
  {
    results,
    live,
    step,
    buyBox,
  }: {
    results: DealResults;
    /** a screen is running on the deal */
    live: boolean;
    /** the running job's step */
    step: string | null;
    buyBox: { hasBox: boolean; checks: readonly unknown[] };
  },
): SectionState {
  const steps = SECTION_STEPS[key];
  if (live && step && steps.includes(step)) return "running";
  switch (key) {
    case "overview":
      return results.verdict || results.extraction ? "done" : live ? "running" : "idle";
    case "financials":
      if (results.extraction) return "done";
      break;
    case "analyses":
      if (results.verdict || results.challenges || results.comps || results.market) return "done";
      break;
    case "buybox":
      return buyBox.hasBox && buyBox.checks.length ? "done" : "idle";
    case "documents":
      return "idle";
  }
  if (live && steps.length) {
    const cur = PIPELINE.indexOf(step ?? "");
    const first = PIPELINE.indexOf(steps[0]);
    if (first >= 0 && (cur < 0 || first > cur)) return "pending";
  }
  return "idle";
}

// Finding counts, so a finished run shows where the problems live without
// opening every section.
// Each array is guarded: the schemas force these shapes on every write
// the app makes, but a legacy or hand-edited row with a null list must
// not take every tab down with it.
export function analysisCounts(results: DealResults): Record<AnalysisKey, number> {
  return {
    verdict: 0,
    challenger: (results.challenges?.challenges ?? []).filter((c) => c.severity === "high").length,
    comps: results.comps
      ? (results.comps.redFlags ?? []).length +
        [...(results.comps.saleComps ?? []), ...(results.comps.leaseComps ?? [])].filter((x) => x.support === "stretched")
          .length
      : 0,
    market: (results.market?.checks ?? []).filter((c) => c.assessment === "aggressive").length,
    reconciler: (results.reconciliation?.rows ?? []).filter((r) => r.direction === "unfavorable").length,
  };
}

/** Each section's count: the buy box's criteria missed outright, and the
 *  analyses' findings summed. */
export function sectionCounts(
  analysis: Record<AnalysisKey, number>,
  buyBoxChecks: readonly { status: string }[],
): Record<SectionKey, number> {
  return {
    overview: 0,
    financials: 0,
    buybox: buyBoxChecks.filter((c) => c.status === "miss").length,
    analyses: analysis.challenger + analysis.comps + analysis.market + analysis.reconciler,
    documents: 0,
  };
}
