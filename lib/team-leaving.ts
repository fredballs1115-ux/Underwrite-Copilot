/** What a member who leaves, or is removed, keeps of the deals they added:
 *  the deals stay in the team's pipeline under their name (removeMember and
 *  leaveTeam move nothing), and row-level security reads a deal by its
 *  creator — so they still open it, mint a share link to it and delete it
 *  (0007's read and delete policies, 0017's share links). An edit to the
 *  deal itself is refused while it stays in a team they are not on (0007's
 *  update check).
 *
 *  Pure, so the team page's and the billing page's confirmations say it
 *  the same way. */
export const LEAVING_KEEPS = {
  them: "The deals they added stay in the team pipeline, and they keep access to them: they can still open them, share them by link and delete them.",
  you: "You'll stop seeing your teammates' deals. The deals you added stay in the team pipeline, and you keep access to them: you can still open them, share them by link and delete them.",
};
