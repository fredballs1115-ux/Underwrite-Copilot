// What the billing page says about the reader's own plan, pure.
//
// `Billing.isPro` is true for a personal Pro subscription OR an active Team
// plan (lib/billing), and it is the right gate for a feature. It is the
// wrong thing to print as the reader's plan: a Team-plan member with no
// subscription of their own read "Pro · Active · Subscription active." and
// a "Manage subscription" button that opened nothing (the portal action
// finds no Stripe customer and sends them to ?error=nocustomer, which told
// them to Upgrade — on a page that shows no Upgrade button to a Pro reader).
// The plan shown is the one the reader pays for, else the team's, said as
// the team's.

/** The fields of lib/billing's `Billing` the plan line reads. */
export interface PlanBillingLike {
  plan: "free" | "pro";
  isPro: boolean;
  team: { name: string; active: boolean } | null;
}

export type PlanShown =
  /** a subscription of the reader's own: its portal is theirs to open */
  | { kind: "personal"; label: string; badge: string }
  /** Pro features through the team's active plan, and no subscription of
   *  their own: the team's subscription is managed from /team */
  | { kind: "team"; label: string; badge: string; teamName: string }
  | { kind: "free"; label: string; badge: string };

export function planShownOf(billing: PlanBillingLike | null): PlanShown {
  if (billing?.plan === "pro") return { kind: "personal", label: "Pro", badge: "Active" };
  if (billing?.isPro && billing.team?.active) {
    return {
      kind: "team",
      label: `Team plan (via ${billing.team.name})`,
      badge: "Active",
      teamName: billing.team.name,
    };
  }
  return { kind: "free", label: "Free", badge: "Free tier" };
}

/**
 * What a change to the roster does to the bill. The team actions sync
 * Stripe's seat count after their response (`after(() =>
 * syncTeamSeats(…))` in app/(app)/team/actions.ts), best effort, and the
 * webhook syncs again on a membership change — so the pages say "right
 * after", never "immediately" or "in the same action".
 */
export const SEAT_SYNC =
  "Adding or removing a member updates Stripe's seat count right after, and Stripe prorates the difference.";
export const SEAT_SYNC_REMOVE =
  "Removing a member updates Stripe's seat count right after, and Stripe prorates the difference on the next invoice.";

/**
 * The day a subscription renews, on the reader's own calendar —
 * "November 1, 2026". Stripe stamps the period's end as an instant; the
 * server's clock runs UTC, so a period ending at 2 am UTC had read a day
 * late from 8 pm Eastern. Read in the zone the reader's browser reports
 * (lib/reader-day `readerTimeZone`, the `uc_tz` cookie).
 */
export function renewsOn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}
