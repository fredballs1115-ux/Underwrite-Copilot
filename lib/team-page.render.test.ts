// The team page, rendered on fixtures, its reads faked and its markup
// linted: what it says about the plan's renewal, the seat count and what a
// teammate sees, each held to the code behind it.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamInfo } from "./teams";

const state = vi.hoisted(() => ({
  team: null as TeamInfo | null,
  tz: undefined as string | undefined,
}));

vi.mock("@/lib/supabase/server", () => {
  // The owner's invite list: a chain that answers no rows.
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "is", "order"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [] });
  return {
    createSupabaseServerClient: async () => ({ from: () => chain }),
    getCurrentUser: async () => ({ id: "u-0", email: "owner@firm.example" }),
  };
});
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billing")>()),
  getBilling: async () => ({ plan: "free" }),
}));
vi.mock("@/lib/teams", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./teams")>()),
  getTeam: async () => state.team,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "uc_tz" && state.tz ? { value: state.tz } : undefined) }),
}));
vi.mock("@/app/(app)/team/actions", () => {
  const noop = async () => {};
  return {
    createTeam: noop,
    createInvite: noop,
    revokeInvite: noop,
    removeMember: noop,
    leaveTeam: noop,
    startTeamCheckout: noop,
    openTeamPortal: noop,
    deleteTeam: noop,
  };
});

import TeamPage from "@/app/(app)/team/page";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const teamInfo = (over: Partial<TeamInfo> = {}): TeamInfo => ({
  id: "t-1",
  name: "Meridian Acquisitions",
  role: "owner",
  planActive: true,
  subscriptionStatus: "active",
  currentPeriodEnd: "2026-11-01T02:00:00Z",
  members: [
    { userId: "u-0", role: "owner", email: "owner@firm.example", fullName: "Dana Owner", joinedAt: "2026-01-01" },
    { userId: "u-1", role: "member", email: "u@firm.example", fullName: "Sam Member", joinedAt: "2026-02-01" },
  ],
  seatCount: 2,
  dealCount: 4,
  ...over,
});

async function page(): Promise<{ html: string; text: string }> {
  const html = renderToStaticMarkup(await TeamPage({ searchParams: Promise.resolve({}) }));
  expect(a11yIssues(html)).toEqual([]);
  const text = visibleText(html).replace(/\s+/g, " ");
  expect(gluedWords(text)).toEqual([]);
  return { html, text };
}

beforeEach(() => {
  state.team = teamInfo();
  state.tz = undefined;
});

describe("the team's renewal", () => {
  it("is the reader's own day, not the server's UTC one", async () => {
    state.tz = "America/Chicago";
    expect((await page()).text).toContain("renews October 31, 2026.");
    state.tz = "Europe/London";
    expect((await page()).text).toContain("renews November 1, 2026.");
  });
});

describe("the seat count", () => {
  it("is said to follow right after a roster change, as syncTeamSeats runs after the response", async () => {
    const { text } = await page();
    expect(text).toContain("Adding or removing a member updates Stripe's seat count right after, and Stripe prorates the difference.");
    expect(text).not.toMatch(/immediately|in the same action/);
  });
});
