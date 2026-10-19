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
