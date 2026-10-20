// Whose words the challenger's downside paragraph is (research pass 40, M8;
// 2026-10-20). The challenger had been asked "what happens to returns" and
// answered with IRR arithmetic it worked out without the engine, under a
// heading of "Stress test" beside the stress test struck in code
// (lib/stress-test). It is asked for the scenario in words now, with no
// return figure, and every surface heads the paragraph as the challenger's,
// with one line saying it is not a computed result — a screen stored before
// the change may still carry the challenger's own figures. The sample's
// paragraph is words alone (lib/sample-deal).
//
// No imports: the deal page's client sections, the demo and the report read it.

/** The paragraph's heading, on every deal and on the sample. */
export const CHALLENGER_SCENARIO_TITLE = "The challenger's downside scenario";

/** The line under the heading: whose words they are, and whose moves are
 *  computed. True on a plan deal too, whose stress test re-runs the plan's
 *  yield on cost in code rather than the model's levered return. */
export const CHALLENGER_SCENARIO_NOTE =
  "In the challenger's words, not a computed result: any return it names is the challenger's estimate, and the stress test's moves are computed in code.";
