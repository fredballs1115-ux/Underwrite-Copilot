// The screen's stages as the deal page's progress rail names them, in its
// order (app/(app)/deals/[id]/deal-view.tsx: `PIPELINE` and the rail's
// `steps`, "Step N of 6"): the first pass on the headline figures, then the
// extraction, the challenger, the broker comps, the market check and the
// verdict. Reconciling the buyer's own model is not one of them — it is a
// run of its own when the buyer adds a model, which re-runs the verdict
// (the rail's side jobs). No imports, so a public page and its tests read
// the one list; lib/screen-stages.test.ts holds the deal page's rail to it.

export const SCREEN_STAGES = [
  { key: "signal", label: "Signal" },
  { key: "extract", label: "Extract" },
  { key: "challenge", label: "Challenge" },
  { key: "comps", label: "Comps" },
  { key: "market", label: "Market" },
  { key: "verdict", label: "Verdict" },
] as const;

export type ScreenStageKey = (typeof SCREEN_STAGES)[number]["key"];

/** The run beside the screen, drawn apart from it. */
export const RECONCILE_RUN = { key: "reconcile", label: "Reconcile" } as const;
