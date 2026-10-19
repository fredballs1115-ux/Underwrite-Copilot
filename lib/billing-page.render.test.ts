// The billing page, rendered on fixtures: the plan it names is the one the
// reader pays for, else their team's, said as the team's. A Team-plan
// member with no subscription of their own had read "Pro · Active ·
// Subscription active." and a "Manage subscription" button that sent them
// to ?error=nocustomer, which told them to Upgrade on a page that showed no
// Upgrade button. The page reads a database no test can reach; its reads
// are faked here and its markup is linted.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Billing } from "./billing";
import type { TeamInfo } from "./teams";

const state = vi.hoisted(() => ({
  billing: null as unknown as Billing,
  team: null as TeamInfo | null,
  tz: undefined as string | undefined,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
  getCurrentUser: async () => ({ id: "u-1", email: "u@firm.example" }),
}));
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billing")>()),
  getBilling: async () => state.billing,
}));
vi.mock("@/lib/teams", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./teams")>()),
  getTeam: async () => state.team,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "uc_tz" && state.tz ? { value: state.tz } : undefined) }),
}));
vi.mock("@/app/(app)/billing/actions", () => ({ startCheckout: async () => {}, openPortal: async () => {} }));
vi.mock("@/app/(app)/team/actions", () => ({ removeMember: async () => {}, openTeamPortal: async () => {} }));

import BillingPage from "@/app/(app)/billing/page";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const billing = (over: Partial<Billing> = {}): Billing => ({
  plan: "free",
  isPro: false,
  status: null,
  stripeCustomerId: null,
  currentPeriodEnd: null,
  dealCount: 0,
  dealLimit: 3,
  canCreateDeal: true,
  team: null,
  ...over,
});

const teamInfo = (over: Partial<TeamInfo> = {}): TeamInfo => ({
  id: "t-1",
  name: "Meridian Acquisitions",
  role: "member",
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

async function page(search: Record<string, string> = {}): Promise<{ html: string; text: string }> {
  const html = renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve(search) }));
  expect(a11yIssues(html)).toEqual([]);
  const text = visibleText(html).replace(/\s+/g, " ");
  expect(gluedWords(text)).toEqual([]);
  return { html, text };
}

/** The "Current plan" card's own text. */
const currentPlan = (text: string) => text.slice(text.indexOf("Current plan"), text.indexOf("Free $0"));

beforeEach(() => {
  state.billing = billing();
  state.team = null;
  state.tz = undefined;
});

describe("a Team-plan member with no subscription of their own", () => {
  beforeEach(() => {
    state.billing = billing({ isPro: true, team: { id: "t-1", name: "Meridian Acquisitions", active: true, dealCount: 4 } });
    state.team = teamInfo();
  });

  it("reads the team's plan, not Pro, and no personal portal button", async () => {
    const { text } = await page();
    const card = currentPlan(text);
    expect(card).toContain("Team plan (via Meridian Acquisitions)");
    expect(card).toContain("Active");
    expect(card).toContain("you have no subscription of your own to manage");
    expect(card).toContain("the team's owner manages its subscription.");
    expect(card).not.toContain("Subscription active.");
    expect(text).not.toContain("Manage subscription");
    expect(text).not.toMatch(/Pro Active/);
  });

  it("links to the team page", async () => {
    const { html } = await page();
    expect(html).toContain('href="/team"');
    expect(html).toContain("Team page →");
  });

  it("an owner is told the team's subscription is managed from the Team page", async () => {
    state.team = teamInfo({ role: "owner" });
    const { text } = await page();
    expect(currentPlan(text)).toContain("the team's subscription is managed from the Team page.");
  });

  it("the past-due warning reads the team's status, and only the owner gets the button", async () => {
    state.team = teamInfo({ subscriptionStatus: "past_due" });
    let { text } = await page();
    expect(text).toContain("Meridian Acquisitions’s last payment for the Team plan didn’t go through.");
    expect(text).toContain("the team's owner can update the payment method.");
    expect(text).not.toContain("Update team payment method");
    expect(text).not.toContain("Your last payment didn’t go through");
    state.team = teamInfo({ role: "owner", subscriptionStatus: "past_due" });
    ({ text } = await page());
    expect(text).toContain("Update team payment method");
  });

  it("the Pro card says the features come through the team", async () => {
    const { text } = await page();
    expect(text).toContain("Through your team");
  });
});

describe("a reader's own subscription", () => {
  it("personal Pro keeps its portal button", async () => {
    state.billing = billing({ plan: "pro", isPro: true, currentPeriodEnd: "2026-11-01T12:00:00Z" });
    const { text } = await page();
    const card = currentPlan(text);
    expect(card).toMatch(/^Current plan Pro Active/);
    expect(text).toContain("Manage subscription");
  });

  it("personal Pro on a team keeps its own plan and portal", async () => {
    state.billing = billing({ plan: "pro", isPro: true, team: { id: "t-1", name: "Meridian Acquisitions", active: true, dealCount: 4 } });
    state.team = teamInfo();
    const { text } = await page();
    expect(currentPlan(text)).toMatch(/^Current plan Pro Active/);
    expect(text).toContain("Manage subscription");
  });

  it("a free reader on a team still in its trial reads Free", async () => {
    state.billing = billing({ team: { id: "t-1", name: "Meridian Acquisitions", active: false, dealCount: 1 } });
    state.team = teamInfo({ planActive: false, subscriptionStatus: null });
    const { text } = await page();
    expect(currentPlan(text)).toMatch(/^Current plan Free Free tier/);
    expect(text).toContain("Upgrade to Pro");
  });
});
