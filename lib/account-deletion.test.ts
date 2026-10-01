// A stopped account deletion says what its earlier steps had already done
// (lib/account-deletion). The page had said "nothing was deleted" after a
// subscription was cancelled, and "nothing was removed" after the team's
// deals had moved and the membership was gone. A finished one says what
// stayed with a team: a member whose work moved without a deal of theirs had
// been told all their data was gone.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deletedBanner,
  deletedHref,
  deletionStopCopy,
  deletionStopHref,
  deletionStopNotice,
  type DeletionStop,
} from "./account-deletion";

const STOPS: DeletionStop[] = ["handover", "cancelsub", "delete"];
const DONE = [
  { movedToTeam: false, cancelled: false },
  { movedToTeam: true, cancelled: false },
  { movedToTeam: false, cancelled: true },
  { movedToTeam: true, cancelled: true },
];

describe("deletionStopCopy — what failed, and what had already happened", () => {
  it("claims nothing changed only where nothing had", () => {
    for (const stop of STOPS) {
      for (const done of DONE) {
        // A handover or a cancel stops before any cancel has happened.
        if (stop !== "delete" && done.cancelled) continue;
        const text = deletionStopCopy(stop, done);
        const nothing = /nothing was (changed|deleted|removed)/i.test(text);
        expect(nothing, `${stop} ${JSON.stringify(done)}: ${text}`).toBe(!done.movedToTeam && !done.cancelled);
        expect(text.includes("moved to the team's owner"), `${stop} ${JSON.stringify(done)}`).toBe(done.movedToTeam);
        expect(text.includes("subscription was cancelled"), `${stop} ${JSON.stringify(done)}`).toBe(done.cancelled);
      }
    }
  });

  it("says each stop's own way forward", () => {
    expect(deletionStopCopy("cancelsub", DONE[0])).toBe(
      "We couldn't check or cancel your subscription automatically, so your account was not deleted. Nothing was changed. If you have an active subscription, cancel it from the Billing page, then try again.",
    );
    expect(deletionStopCopy("handover", DONE[1])).toContain("trying again moves the rest");
    expect(deletionStopCopy("delete", DONE[2])).toBe(
      "Deletion failed: your account and your own deals are still here, but before it stopped, your subscription was cancelled. Please try again, or email underwritecopilot.support@gmail.com.",
    );
  });

  it("goes to the account page and back through its query", () => {
    for (const stop of STOPS) {
      for (const done of DONE) {
        const q = new URL(deletionStopHref(stop, done), "https://app.test");
        expect(q.pathname).toBe("/account");
        const read = deletionStopNotice({
          error: q.searchParams.get("error") ?? undefined,
          moved: q.searchParams.get("moved") ?? undefined,
          cancelled: q.searchParams.get("cancelled") ?? undefined,
        });
        expect(read).toBe(deletionStopCopy(stop, done));
      }
    }
    // Any other code is the page's own map's.
    expect(deletionStopNotice({ error: "ownerdelete" })).toBeNull();
    expect(deletionStopNotice({})).toBeNull();
  });

  it("lands a finished deletion on the sentence for what stayed with a team", () => {
    expect(deletedHref({ deals: 2, work: 0 })).toBe("/login?deleted=team");
    expect(deletedHref({ deals: 1, work: 7 })).toBe("/login?deleted=team");
    // Work alone moved: the page had said all the account's data was gone.
    expect(deletedHref({ deals: 0, work: 3 })).toBe("/login?deleted=teamwork");
    expect(deletedHref({ deals: 0, work: 0 })).toBe("/login?deleted=1");
    expect(deletedBanner("1")).toBe("Your account and all its data have been deleted. Thanks for trying Underwrite Copilot.");
    for (const kept of ["team", "teamwork"]) {
      expect(deletedBanner(kept)).toMatch(/^Your account has been deleted, with your own deals and files\. .+ handed to its owner/);
      expect(deletedBanner(kept)).not.toContain("all its data");
    }
    // Only a deal handed over is said to be one.
    expect(deletedBanner("teamwork")).not.toContain("deals you added");
  });

  it("is what the account page shows, in place of the sentences it typed", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/account/page.tsx"), "utf8");
    expect(page).toContain("deletionStopNotice({ error, moved, cancelled })");
    for (const gone of ["nothing was deleted. Cancel it", "Deletion failed — nothing was removed", "We couldn't hand your work"]) {
      expect(page).not.toContain(gone);
    }
  });
});
