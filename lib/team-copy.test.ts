// What /team, its join page and the pipeline's welcome say about invites,
// leaving and joining, held to the code behind each sentence:
//   - a link lets one person join, once (0012), and an unused one expires on
//     0007's default; /team said it "works until it expires";
//   - a dead link says so, where the join page had offered "Join the team"
//     on a used, revoked or expired link and then failed;
//   - a member who leaves, or is removed, keeps the deals they added — row-
//     level security reads, links and deletes a deal by its creator — which
//     the two confirmations left out;
//   - joining moves no deal, where the welcome said "this pipeline is now
//     shared".
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: { data: null as string | null, error: null as { message: string } | null },
  team: null as { name: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: async () => state.rpc }),
  getCurrentUser: async () => ({ id: "u-1", email: "u@firm.example" }),
}));
vi.mock("@/lib/teams", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./teams")>()),
  getTeam: async () => state.team,
}));
vi.mock("@/app/(app)/team/actions", () => ({ joinTeam: async () => {} }));

import JoinTeamPage from "@/app/(app)/team/join/[token]/page";
import { INVITE_DAYS } from "./teams";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (rel: string) => read(rel).replace(/\s+/g, " ");
const DEAD = "This invite link is no longer valid — ask the team's owner for a new one.";

async function joinPage(error?: string): Promise<string> {
  const page = await JoinTeamPage({
    params: Promise.resolve({ token: "0a1b2c3d" }),
    searchParams: Promise.resolve(error ? { error } : {}),
  });
  return renderToStaticMarkup(page);
}

beforeEach(() => {
  state.rpc = { data: null, error: null };
  state.team = null;
});

describe("the join page says a dead link is dead", () => {
  it("a used, revoked or expired link (the preview names no team) gets its own state, not a Join button", async () => {
    const html = await joinPage();
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain(DEAD);
    expect(text).toContain(`A link lets one person join, once, and stops working when it is revoked or after ${INVITE_DAYS} days unused.`);
    expect(text).not.toContain("Join the team");
    expect(html).toContain('href="/deals"');
    // After a failed join on it, the sentence is said once.
    expect(visibleText(await joinPage("invalid")).split(DEAD)).toHaveLength(2);
  });

  it("a live link names its team and offers the button", async () => {
    state.rpc = { data: "Meridian Acquisitions", error: null };
    const text = visibleText(await joinPage()).replace(/\s+/g, " ");
    expect(text).toContain("You've been invited to Meridian Acquisitions on Underwrite Copilot.");
    expect(text).toContain("Join the team");
    expect(text).not.toContain(DEAD);
  });

  it("a preview that cannot be read says nothing either way: the generic copy and the button", async () => {
    state.rpc = { data: null, error: { message: "function invite_team_name does not exist" } };
    const text = visibleText(await joinPage());
    expect(text).toContain("You've been invited to a team on Underwrite Copilot.");
    expect(text).toContain("Join the team");
    expect(text).not.toContain(DEAD);
  });

  it("a reader already on a team is told that, whatever the link", async () => {
    state.team = { name: "Meridian Acquisitions" };
    const text = visibleText(await joinPage());
    expect(text).toContain("You're already on Meridian Acquisitions");
    expect(text).not.toContain(DEAD);
  });
});

describe("/team says what an invite link does", () => {
  it("lives as long as migration 0007's default, and lets one person join once (0012)", () => {
    const m = read("supabase/migrations/0007_teams.sql").match(/expires_at timestamptz not null default \(now\(\) \+ interval '(\d+) days'\)/);
    expect(Number(m?.[1])).toBe(INVITE_DAYS);
    // No later migration sets the invites' expiry another way.
    const later = readdirSync(join(ROOT, "supabase/migrations")).filter(
      (f) => Number(f.slice(0, 4)) > 7 && /team_invites[\s\S]*interval '\d+ days'/.test(read(`supabase/migrations/${f}`)),
    );
    expect(later).toEqual([]);
    // The join claims the link: unused, then marked used, in one statement.
    expect(read("supabase/migrations/0012_single_use_invites.sql")).toMatch(/set used_at = now\(\), used_by = uid[\s\S]*and used_at is null/);
    const page = flat("app/(app)/team/page.tsx");
    expect(page).toContain("Each link lets one person join, once. An unused link expires {INVITE_DAYS} days after you make it, and you can revoke it anytime.");
    expect(page).not.toContain("works until it expires");
  });
});

describe("leaving or removing a member says what they keep", () => {
  it("the deals they added: still theirs to open, share and delete, as row-level security reads them", () => {
    const teams = flat("supabase/migrations/0007_teams.sql");
    // Read and delete are the creator's whatever the team.
    expect(teams).toContain('create policy "read own or team deals" on public.deals for select using ( user_id = auth.uid()');
    expect(teams).toContain('create policy "delete own deals or team owner" on public.deals for delete using ( user_id = auth.uid()');
    // An edit is checked against the team: refused once they are off it,
    // which is why the sentence does not offer one.
    expect(teams).toContain("with check ( user_id is not null and (team_id is null or public.is_team_member(team_id)) )");
    // A share link is minted on any deal the creator can read.
    expect(flat("supabase/migrations/0017_notes_share_qa_digest.sql")).toContain("d.user_id = auth.uid()");
    const page = flat("app/(app)/team/page.tsx");
    expect(page).toContain("confirmText={`Remove ${memberLabel(m)} from ${team.name}? ${LEAVING_KEEPS.them}`}");
    expect(page).toContain("confirmText={`Leave ${team.name}? ${LEAVING_KEEPS.you}`}");
    expect(page).toContain(
      'them: "The deals they added stay in the team pipeline, and they keep access to them: they can still open them, share them by link and delete them."',
    );
    expect(page).toContain(
      "you: \"You'll stop seeing your teammates' deals. The deals you added stay in the team pipeline, and you keep access to them: you can still open them, share them by link and delete them.\"",
    );
    expect(page).not.toMatch(/editing|edit them/);
  });
});

describe("joining says which deals are shared", () => {
  it("the ones added from now on, not the ones already in the pipeline", () => {
    // join_team_with_token adds the membership and nothing else.
    const join12 = read("supabase/migrations/0012_single_use_invites.sql");
    expect(join12).not.toMatch(/update public\.deals/);
    const page = flat("app/(app)/deals/page.tsx");
    expect(page).toContain(
      "Welcome to the team. The deals you add from now on go into its shared pipeline while the team's trial or plan allows; the deals you already had stay personal.",
    );
    expect(page).not.toContain("this pipeline is now shared");
  });
});
