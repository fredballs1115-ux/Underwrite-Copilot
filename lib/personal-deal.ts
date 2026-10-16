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

// ---- Moving a deal between the reader's own pipeline and the team's ------
// (research pass 17, item 12). The deal's creator may move it either way:
// migration 0007's protect_deal_identity lets the creator change team_id,
// and its update policy checks the reader is on the team it lands in. Each
// move is counted against the cap of the pipeline it lands in — the app
// reads the allowance first (`moveDeal` in app/(app)/deals/actions.ts), and
// migration 0036's update trigger refuses one the read let through.

/** Where a move lands (`?moved=`), or which way it was asked. */
export type MoveTarget = "team" | "personal";

/** The query codes a refused move lands with (`?error=`). */
export type MoveRefusal = "moveteamlimit" | "movelimit" | "movepermission" | "movenoteam" | "movefail";

const MOVE_REFUSALS: readonly MoveRefusal[] = ["moveteamlimit", "movelimit", "movepermission", "movenoteam", "movefail"];

export function isMoveRefusal(code: string | null | undefined): code is MoveRefusal {
  return !!code && (MOVE_REFUSALS as readonly string[]).includes(code);
}

/** The menu item that opens the question. */
export const MOVE_ITEM: Record<MoveTarget, string> = {
  team: "Share with team",
  personal: "Make personal",
};

/** The menu's question before a move — the confirm step's words. */
export function moveQuestion(to: MoveTarget, teamName: string | null): string {
  const team = teamName ? `${teamName}’s pipeline` : "your team’s pipeline";
  return to === "team"
    ? `Move this deal into ${team}? Every member of the team can then see and edit it. You can make it personal again from this menu.`
    : `Take this deal out of ${team}? Your teammates stop seeing it, and a task assigned to one of them stays on it where they can’t see it.`;
}

/** The notice a move lands with, or a refusal's words. The caps are handed
 *  in (lib/teams' TEAM_TRIAL_DEALS is server-only; lib/marketing-constants'
 *  FREE_DEALS) so this module stays pure. */
export function moveNotice(
  outcome: { moved: MoveTarget; teamName: string | null } | { refused: MoveRefusal },
  caps: { trialDeals: number; freeDeals: number },
): { tone: "ok" | "caution"; text: string } {
  if ("moved" in outcome) {
    const team = outcome.teamName ? `${outcome.teamName}’s pipeline` : "your team’s pipeline";
    return outcome.moved === "team"
      ? { tone: "ok", text: `This deal is in ${team} now: your teammates see it and can edit it.` }
      : { tone: "ok", text: "This deal is in your own pipeline now: your teammates no longer see it." };
  }
  switch (outcome.refused) {
    case "moveteamlimit":
      return {
        tone: "caution",
        text: `Your team’s free plan holds ${caps.trialDeals} deals, and they are in use — this deal stays in your own pipeline. Once the team’s owner starts the Team plan, it can be shared.`,
      };
    case "movelimit":
      return {
        tone: "caution",
        text: `Your free plan holds ${caps.freeDeals} deals of your own, and they are in use — this deal stays in your team’s pipeline. Upgrade to Pro to keep more deals of your own.`,
      };
    case "movepermission":
      return { tone: "caution", text: "Only the deal’s creator can move it between their own pipeline and the team’s. Nothing changed." };
    case "movenoteam":
      return { tone: "caution", text: "You’re not on a team, so there is no team pipeline to share this deal into. Nothing changed." };
    case "movefail":
      return { tone: "caution", text: "Couldn’t move the deal just now — nothing changed. Try again in a moment." };
  }
}
