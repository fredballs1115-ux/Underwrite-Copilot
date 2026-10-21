// What the stress test does not check yet (2026-10-21): the claims an OM
// makes that no row of lib/stress-test sets against evidence, each with the
// evidence that would test it or the rule that keeps it out. /how-we-test
// draws the list beside the methods, so the page says what is NOT tested as
// plainly as what is. Every item is held to the code by
// lib/not-tested.test.ts: no item is a row the test strikes, and each
// "beside it" names what a tested row really shows. Pure: no I/O.

import { ROSTER_UNTESTED_PCT } from "@/lib/stress-test";
import type { StressKey } from "@/lib/stress-test-types";
import { HOLD_MONTHS } from "@/lib/underwrite/inputs";

export interface NotTested {
  /** a stable id, never one of STRESS_KEYS */
  id: string;
  /** the claim, in a few words */
  title: string;
  /** why it is not tested: what is missing, or the rule that blocks it */
  why: string;
  /** what a tested row, or the headline, shows of it instead — said only
   *  where that row really shows it */
  beside?: { key: StressKey | "headline"; line: string };
}

/** The page section's heading and its anchor. */
export const NOT_TESTED_HEADING = "What the test does not check yet";
export const NOT_TESTED_ID = "not-tested";
/** The intro's one line to it. */
export const NOT_TESTED_LINK = "What the test does not check yet is listed too.";

export const NOT_TESTED: readonly NotTested[] = [
  {
    id: "expense_lines",
    title: "Each operating expense line on its own",
    why: "The management fee, payroll, repairs and utilities are not each held to a figure: the operating-expense row holds their total, less the taxes and insurance, to the T-12.",
    beside: { key: "opex", line: "Each T-12 line is shown a unit beside the row, with the OM's own line where it states one, deciding nothing." },
  },
  {
    id: "other_income",
    title: "Other income",
    why: "Parking, utility billing and fees have no row: the model folds them into its rent line.",
    beside: { key: "noi", line: "The NOI row sets the OM's other income against the T-12's in words, where both state one, deciding nothing." },
  },
  {
    id: "concessions",
    title: "Concessions and free rent",
    why: "No row of their own: no evidence on file prices a concession package.",
    beside: { key: "vacancy", line: "Where a T-12 nets them into its vacancy and credit loss, the vacancy row reads that economic figure." },
  },
  {
    id: "market_rent",
    title: "Market rent and loss-to-lease",
    why: "No row of their own: a challenge naming them is filed on the rent growth row.",
    beside: { key: "noi", line: "The NOI row sets the rent roll's in-place rent against the pro forma's, in words." },
  },
  {
    id: "reserves",
    title: "Replacement reserves",
    why: "No row: the model runs the higher of the OM's stated replacement reserve and the class's default, its source note saying which; nothing sets either against a condition report.",
  },
  {
    id: "leasing_capital",
    title: "Leasing capital on a commercial building",
    why: "Tenant improvements, commissions and downtime between leases: the model carries none, and no row tests the OM's.",
    beside: {
      key: "headline",
      line: `The headline names a tenant roster that rolls ${ROSTER_UNTESTED_PCT}% or more of its listed rent in one year before the sale.`,
    },
  },
  {
    id: "hold_and_sale",
    title: "The hold and the cost of sale",
    why: `The model runs its own ${HOLD_MONTHS / 12}-year hold and its default cost of sale, whatever the OM states; neither is a row.`,
  },
  {
    id: "om_return",
    title: "The OM's own stated return",
    why: "The IRR or multiple a memorandum quotes is not re-run or set against the model's: every return the test prints is the engine's.",
  },
  {
    id: "floating_rate",
    title: "A floating-rate loan",
    why: "A rate quoted over SOFR, or a coupon that resets, is shown as stated and priced on nothing: the debt row stands unchecked, and no rate cap is priced.",
    beside: { key: "debt", line: "The lender tests and the leverage read are shown, sized at the model's own rate." },
  },
  {
    id: "debt_no_rate",
    title: "The debt where no rate is stated",
    why: "Where the OM states no loan rate the debt row is unchecked, or left off where nothing is read beside it, and nothing is re-run on it.",
    beside: { key: "debt", line: "The lender tests and the leverage read are shown, sized at the model's own rate." },
  },
];
