// The billing page, rendered on fixtures: the plan it names is the one the
// reader pays for, else their team's, said as the team's. A Team-plan
// member with no subscription of their own had read "Pro · Active ·
// Subscription active." and a "Manage subscription" button that sent them
// to ?error=nocustomer, which told them to Upgrade on a page that showed no
// Upgrade button. The page reads a database no test can reach; its reads
// are faked here and its markup is linted.
import { readFileSync } from "node:fs";
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

// The confirmation is a browser dialog; the fake carries its words where
// the markup can show them.
vi.mock("@/app/(app)/team/team-client", async () => {
  const { createElement } = await import("react");
  return {
    ConfirmSubmit: ({ label, confirmText }: { label: string; confirmText: string }) =>
      createElement("button", { type: "submit", "data-confirm": confirmText }, label),
  };
});

import BillingPage from "@/app/(app)/billing/page";
import { LEAVING_KEEPS } from "./team-leaving";
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

  it("the renewal day is the reader's own, not the server's UTC day", async () => {
    // 02:00 UTC on Nov 1 is still Oct 31 in New York and Los Angeles.
    state.billing = billing({ plan: "pro", isPro: true, currentPeriodEnd: "2026-11-01T02:00:00Z" });
    state.tz = "America%2FLos_Angeles";
    expect((await page()).text).toContain("Renews October 31, 2026.");
    state.tz = "Asia/Tokyo";
    expect((await page()).text).toContain("Renews November 1, 2026.");
    // No cookie yet: Eastern, the default zone (lib/reader-day).
    state.tz = undefined;
    expect((await page()).text).toContain("Renews October 31, 2026.");
  });

  it("a team owner's renewal on the team section is the reader's day too", async () => {
    state.billing = billing({ isPro: true, team: { id: "t-1", name: "Meridian Acquisitions", active: true, dealCount: 4 } });
    state.team = teamInfo({ role: "owner" });
    expect((await page()).text).toContain("Renews October 31, 2026.");
  });

  it("the seat count is said to follow right after, never immediately or in the same action", async () => {
    // syncTeamSeats runs after the team action's response, best effort.
    const actions = readFileSync("app/(app)/team/actions.ts", "utf8");
    expect(actions.match(/after\(\(\) => syncTeamSeats\(/g)?.length).toBeGreaterThanOrEqual(3);
    state.billing = billing({ isPro: true, team: { id: "t-1", name: "Meridian Acquisitions", active: true, dealCount: 4 } });
    state.team = teamInfo({ role: "owner" });
    const { text } = await page();
    expect(text).toContain("One subscription, 2 seats. Adding or removing a member updates Stripe's seat count right after, and Stripe prorates the difference.");
    expect(text).toContain("Removing a member updates Stripe's seat count right after, and Stripe prorates the difference on the next invoice.");
    expect(text).not.toMatch(/immediately|in the same action/);
  });

  it("removing a member asks first, in the team page's words", async () => {
    state.billing = billing({ isPro: true, team: { id: "t-1", name: "Meridian Acquisitions", active: true, dealCount: 4 } });
    state.team = teamInfo({ role: "owner" });
    const { html } = await page();
    const confirms = [...html.matchAll(/data-confirm="([^"]*)"/g)].map((m) =>
      m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
    );
    // One a member, none for the owner.
    expect(confirms).toEqual([`Remove Sam Member from Meridian Acquisitions? ${LEAVING_KEEPS.them}`]);
    expect(readFileSync("app/(app)/team/page.tsx", "utf8")).toContain("${LEAVING_KEEPS.them}");
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
