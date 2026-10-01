// What a stopped account deletion had already done, said on the account page
// it lands on. deleteAccount (app/(app)/account/actions.ts) runs its steps in
// the order that keeps what can still be kept: it hands what the account had
// in a team's pipeline to the team's owner (lib/account-handover), then
// cancels a live personal subscription, then deletes the user. Each step can
// stop the deletion, and by then the steps before it have happened: the page
// had said "nothing was deleted" after a subscription was cancelled, and
// "nothing was removed" after the deals had moved and the team membership was
// gone. The action names the stop and what was done in the redirect's query
// (`deletionStopHref`); the page reads it back (`deletionStopNotice`). Pure:
// no I/O.

/** The step a deletion stopped at. */
export type DeletionStop = "handover" | "cancelsub" | "delete";

/** What the steps before the stop had already done. */
export interface DeletionDone {
  /** deals or work already handed to a team's owner */
  movedToTeam: boolean;
  /** the personal subscription already cancelled */
  cancelled: boolean;
}

const STOPS: readonly DeletionStop[] = ["handover", "cancelsub", "delete"];
const SUPPORT = "underwritecopilot.support@gmail.com";

/** The account page's address for a stop, with what was done as flags. */
export function deletionStopHref(stop: DeletionStop, done: DeletionDone): string {
  const q = new URLSearchParams({ error: stop });
  if (done.movedToTeam) q.set("moved", "1");
  if (done.cancelled) q.set("cancelled", "1");
  return `/account?${q.toString()}`;
}

/** What failed, what had already happened, and what to do — one sentence or
 *  three. */
export function deletionStopCopy(stop: DeletionStop, done: DeletionDone): string {
  const kept = "What you had in a team's pipeline has already moved to the team's owner, and stays with the team.";
  if (stop === "handover") {
    return done.movedToTeam
      ? `Part of what you had in a team's pipeline moved to the team's owner before the rest could, so your account was not deleted. What moved stays with the team, and trying again moves the rest. Please try again, or email ${SUPPORT}.`
      : `We couldn't hand what you have in a team's pipeline to the team's owner, so nothing was changed and your account was not deleted. Please try again, or email ${SUPPORT}.`;
  }
  if (stop === "cancelsub") {
    const head = "We couldn't check or cancel your subscription automatically, so your account was not deleted.";
    const then = "If you have an active subscription, cancel it from the Billing page, then try again.";
    return done.movedToTeam ? `${head} ${kept} ${then}` : `${head} Nothing was changed. ${then}`;
  }
  const already = [
    done.cancelled ? "your subscription was cancelled" : null,
    done.movedToTeam ? "what you had in a team's pipeline moved to the team's owner, where it stays" : null,
  ].filter((p): p is string => p !== null);
  return already.length
    ? `Deletion failed: your account and your own deals are still here, but before it stopped, ${already.join(" and ")}. Please try again, or email ${SUPPORT}.`
    : `Deletion failed — nothing was removed. Please try again, or email ${SUPPORT}.`;
}

/** Where a finished deletion lands: the sign-in page, saying what stayed
 *  with a team — the deals handed to a team's owner (`team`), the user's
 *  work on a team's deals alone (`teamwork`: a member who added no deal
 *  but whose versions or valuations moved had been told all their data
 *  was gone), or nothing (`1`). */
export function deletedHref(moved: { deals: number; work: number }): string {
  return `/login?deleted=${moved.deals > 0 ? "team" : moved.work > 0 ? "teamwork" : "1"}`;
}

const THANKS = "Thanks for trying Underwrite Copilot.";
const OWN_GONE = "Your account has been deleted, with your own deals and files.";

/** The sign-in page's sentence for its `?deleted=` value. */
export function deletedBanner(param: string): string {
  if (param === "team") {
    return `${OWN_GONE} The deals you added to a team's pipeline stay with the team, handed to its owner, as does any work of yours on the team's deals. ${THANKS}`;
  }
  if (param === "teamwork") {
    return `${OWN_GONE} Your work on a team's deals — saved versions, valuations and rent roll imports — stays with the team, handed to its owner. ${THANKS}`;
  }
  return `Your account and all its data have been deleted. ${THANKS}`;
}

/** The sentence for the account page's query, or null where it names no
 *  deletion stop. */
export function deletionStopNotice(params: { error?: string; moved?: string; cancelled?: string }): string | null {
  const stop = STOPS.find((s) => s === params.error);
  if (!stop) return null;
  return deletionStopCopy(stop, { movedToTeam: params.moved === "1", cancelled: params.cancelled === "1" });
}
