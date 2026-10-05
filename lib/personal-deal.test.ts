// A deal in the reader's own pipeline while they are on a team is one their
// teammates do not see (lib/personal-deal). The create actions file a
// member's new deal there once the team's trial deals are in use, and
// nothing said so: no mark on the pipeline, no word where they landed, and
// /team said every deal anyone uploads lands in the shared pipeline.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FILED_PERSONAL, PERSONAL_CHIP, SHARING_OPTIONS, dealLanding, filedPersonalNotice, matchesSharing } from "./personal-deal";
import { PERSONAL_TAG } from "./pipeline-tags";
import { TEAM_TRIAL_DEALS } from "./teams";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("a team member's own deal, said as one", () => {
  it("the sharing filter: a team's deals, or the reader's own, or both", () => {
    expect(SHARING_OPTIONS.map(([v]) => v)).toEqual(["all", "shared", "personal"]);
    expect([matchesSharing("all", true), matchesSharing("all", false)]).toEqual([true, true]);
    expect([matchesSharing("shared", true), matchesSharing("shared", false)]).toEqual([false, true]);
    expect([matchesSharing("personal", true), matchesSharing("personal", false)]).toEqual([true, false]);
  });

  it("the chip is a quiet tag on the pipeline's line, not a warning", () => {
    expect(PERSONAL_TAG).toMatchObject({ key: "personal", text: PERSONAL_CHIP, tone: "muted" });
    expect(PERSONAL_CHIP).toBe("Personal — not shared");
  });

  it("a create action lands on the deal with the flag only where it filed the deal in the member's own pipeline", () => {
    expect(dealLanding("d-1", true)).toBe(`/deals/d-1?filed=${FILED_PERSONAL}`);
    expect(dealLanding("d-1", false)).toBe("/deals/d-1");
  });

  it("the OM upload form lands through it too, so its notice is never dropped (research pass 32)", () => {
    // The form calls createDealFromBatch and pushes the landing itself; it
    // had pushed `/deals/<id>` and ignored `personal`.
    const form = read("app/(app)/deals/pipeline.tsx");
    expect(form).toContain("router.push(dealLanding(res.dealId, !!res.personal))");
    expect(form).not.toMatch(/router\.push\(`\/deals\/\$\{res\.dealId\}`\)/);
  });

  it("the deal page says it, counting the trial by the constant the action counts by, and only while it is so", () => {
    expect(filedPersonalNotice(TEAM_TRIAL_DEALS)).toContain(`the team's ${TEAM_TRIAL_DEALS} trial deals were in use`);
    const page = read("app/(app)/deals/[id]/page.tsx");
    expect(page).toContain("filedPersonalNotice(TEAM_TRIAL_DEALS)");
    // The reader's own deal, in no team's pipeline, the reader on a team.
    expect(page).toContain("filed === FILED_PERSONAL && !!user && ownership.user_id === user.id && !ownership.team_id");
    expect(page).toMatch(/\.from\("team_members"\)\.select\("team_id"\)\.eq\("user_id", user\.id\)\.maybeSingle\(\)/);
  });

  it("the pipeline page marks a deal no team holds as personal only for a reader on a team", () => {
    const page = read("app/(app)/deals/page.tsx");
    expect(page).toContain("personal: !!billing?.team && !d.team_id,");
    expect(page).toContain("onTeam={!!billing?.team}");
  });

  it("the homepage's FAQ says what the shared pipeline takes, not that every deal lands there", () => {
    const home = read("app/page.tsx");
    expect(home).not.toContain("every deal anyone uploads");
    expect(home).toContain(
      "the deals you all add land in one shared pipeline, with the same screens, verdicts, models, and memos for everyone: up to ${TEAM_TRIAL_DEALS} shared deals free to try it, and every one on the Team plan.",
    );
  });

  it("/team says what the create actions do with a member's deal past the trial", () => {
    const src = read("app/(app)/team/page.tsx").replace(/\s+/g, " ");
    expect(src).not.toContain("every deal anyone uploads lands in one shared pipeline");
    expect(src).toContain(
      'the deals you all add land in one shared pipeline: up to {TEAM_TRIAL_DEALS}{" "}on the free trial, every one on the Team plan. Once the trial&apos;s deals are in use, a new deal goes into its adder&apos;s own pipeline, which teammates don&apos;t see, until the plan starts.',
    );
  });
});
