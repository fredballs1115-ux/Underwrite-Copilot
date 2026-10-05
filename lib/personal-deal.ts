// A deal in the reader's own pipeline while the reader is on a team: the
// teammates do not see it (row-level security reads a deal by its creator or
// its team, and it has no team). The create actions file a member's new deal
// there once the team's trial deals are in use and no Team plan has started
// (app/(app)/deals/actions.ts `teamAllowed`, so a member with their own
// allowance is never refused), and the deals a member had before joining
// stay there. Nothing said so: the pipeline marked a teammate's deal
// ("added by") and never one of the reader's own the team could not see, and
// /team said every deal anyone uploads lands in the shared pipeline. Pure: no
// I/O and no server-only import, so the client pipeline, the batch panel and
// the deal page read one set of words.

/** The chip a personal deal wears on the pipeline's card and row. */
export const PERSONAL_CHIP = "Personal — not shared";

/** What the chip means, for its tooltip. */
export const PERSONAL_TITLE = "In your own pipeline, not your team's: your teammates don't see this deal.";

/** The query value a create action lands with (`?filed=personal`) when it
 *  filed a team member's new deal in their own pipeline. */
export const FILED_PERSONAL = "personal";

/** Where a create action lands: the deal, saying so where it was filed in the
 *  member's own pipeline. */
export function dealLanding(dealId: string, filedPersonal: boolean): string {
  return `/deals/${dealId}${filedPersonal ? `?filed=${FILED_PERSONAL}` : ""}`;
}

/** The deal page's notice for that landing, with the team's trial allowance
 *  (lib/teams TEAM_TRIAL_DEALS, which the create action counts by). */
export function filedPersonalNotice(trialDeals: number): string {
  return `This deal went into your own pipeline, not your team's: the team's ${trialDeals} trial deals were in use and it has no Team plan, so your teammates don't see it. Once the team's owner starts the Team plan, new deals go into the shared pipeline.`;
}

/** The pipeline's sharing filter: every deal, the ones in a team's pipeline,
 *  or the reader's own. */
export const SHARING_OPTIONS: [string, string][] = [
  ["all", "All deals"],
  ["shared", "Shared"],
  ["personal", "Personal"],
];

/** Whether a deal passes the sharing filter. */
export function matchesSharing(filter: string, personal: boolean): boolean {
  if (filter === "shared") return !personal;
  if (filter === "personal") return personal;
  return true;
}
