// The stress test as the call is struck on it (the audit of 2026-10-28):
// the verdict's brief — and so the snapshot the verdict keeps — is built
// with no lender's quote (a quote-decided row would carry the quote's rate
// into the call's words, which reach the shared screen) and none of the
// reader's past screens (they are the reader's other deals; the basis row
// says so by name, `PAST_SCREENS_IN_BRIEF`). The deal page builds its own
// test with both, so a "since the call" read set against the page's test
// read a quote on file as the debt row changing. This is the ONE way the
// call's test is built, from any surface's arguments: the pipeline builds
// the brief's test through it, and the deal page builds the test it sets
// against the verdict's snapshot through it (lib/stress-drift). Pure.

import { PAST_SCREENS_IN_BRIEF } from "@/lib/stress-basis-evidence";
import { buildStressTest, type StressTestArgs } from "@/lib/stress-test";
import type { StressTest } from "@/lib/stress-test-types";

/** A surface's arguments as the call's test takes them: no quote, no past
 *  screens, the past screens withheld by name. */
export function stressArgsAtCall(args: StressTestArgs): StressTestArgs {
  return { ...args, loanQuote: null, pastScreens: null, pastScreensWithheld: PAST_SCREENS_IN_BRIEF };
}

/** Whether the arguments already are the call's: no quote, no past screens
 *  and the past screens withheld by the call's own reason. */
function atCallAlready(args: StressTestArgs): boolean {
  return args.loanQuote == null && args.pastScreens == null && args.pastScreensWithheld === PAST_SCREENS_IN_BRIEF;
}

/**
 * The stress test as the call is struck on it. `built` is the surface's own
 * test from the same arguments, handed back unbuilt again where the
 * arguments already are the call's; else the test is built once more, on
 * `stressArgsAtCall`.
 */
export function stressTestAtCall(args: StressTestArgs, built?: StressTest | null): StressTest {
  if (built && atCallAlready(args)) return built;
  return buildStressTest(stressArgsAtCall(args));
}
