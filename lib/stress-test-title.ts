// Whose figures the challenger's stress test is (research pass 40, M8). On a
// screened deal the sentence is the challenger's own: a Claude step asked
// what reverting an assumption does to the returns answers without running
// the engine — the screen's estimate, not the model's, as the full report has
// always headed it. On the sample the sentence is the first-draft model's
// (lib/model/compute, run at the reconciled case and the OM's in
// lib/sample-deal), whose pinned figures stay; the heading says so, since the
// screening playground beside it prints other figures at the same levers.
//
// No imports: the deal page's client sections, the demo and the report read it.

/** A screened deal's heading. */
export const STRESS_TEST_ESTIMATE = "Stress test — the screen's estimate, not the model's";

/** The sample's heading: its sentence is the first-draft model's run. */
export const STRESS_TEST_FIRST_DRAFT = "Stress test — the first-draft model's figures";

/** The heading for a deal, the sample's where it is the sample. */
export const stressTestTitle = (sample: boolean): string => (sample ? STRESS_TEST_FIRST_DRAFT : STRESS_TEST_ESTIMATE);
