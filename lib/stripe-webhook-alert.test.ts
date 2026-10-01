/**
 * The Stripe webhook's price alert: an operator-only email when a
 * subscription carries a price this app does not sell. It had posted to
 * Resend by hand — no timeout, no setup check, from Resend's shared
 * resend.dev sender by default (which reaches only the Resend account's
 * owner) — and Stripe's response waited on it. It now goes through the one
 * sender, after the response.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  scheduled: [] as (() => unknown)[],
  sends: [] as unknown[][],
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void h.scheduled.push(fn) }));
vi.mock("@/lib/email-send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./email-send")>()),
  sendEmail: vi.fn(async (...args: unknown[]) => {
    h.sends.push(args);
    return true;
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/stripe/seats", () => ({ syncTeamSeats: vi.fn() }));
vi.mock("@/lib/stripe/prices", () => ({
  assertKnownPrices: () => ({ ok: false, unknown: ["price_rogue"], seen: ["price_rogue"] }),
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => ({
        id: "evt_123",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_9" } },
      }),
    },
    subscriptions: { retrieve: async () => ({ id: "sub_9", customer: "cus_7", status: "active", items: { data: [] } }) },
  }),
}));

import { POST } from "@/app/api/stripe/webhook/route";

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ["STRIPE_WEBHOOK_SECRET", "BILLING_ALERT_EMAIL"]) saved[k] = process.env[k];
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  delete process.env.BILLING_ALERT_EMAIL;
  h.scheduled.length = 0;
  h.sends.length = 0;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

const deliver = () =>
  POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" }));

describe("the webhook's unknown-price alert", () => {
  it("answers Stripe before any email is sent, then alerts through the one sender, keyed by the event", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await deliver();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("skipped: unknown price id");
    // Nothing was sent while Stripe waited: the alert is scheduled after.
    expect(h.sends).toEqual([]);
    expect(h.scheduled).toHaveLength(1);
    expect(String(err.mock.calls[0]?.[0])).toMatch(/^\[stripe\] ALERT unknown price id\(s\) \[price_rogue\] on subscription sub_9/);

    await h.scheduled[0]();
    expect(h.sends).toHaveLength(1);
    const [to, subject, html, text, opts] = h.sends[0] as [string, string, string, string, { idempotencyKey: string }];
    expect(to).toBe("underwritecopilot.support@gmail.com");
    expect(subject).toBe("Stripe webhook: unknown price on sub_9");
    expect(text).toContain("Event NOT processed.");
    expect(html).toContain("price_rogue");
    expect(opts.idempotencyKey).toBe("stripe-unknown-price/evt_123");
  });

  it("goes to BILLING_ALERT_EMAIL where it is set, and a blank one is unset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.BILLING_ALERT_EMAIL = "  ";
    await deliver();
    await h.scheduled[0]();
    expect(h.sends[0][0]).toBe("underwritecopilot.support@gmail.com");
    process.env.BILLING_ALERT_EMAIL = "billing@firm.example";
    await deliver();
    await h.scheduled[1]();
    expect(h.sends[1][0]).toBe("billing@firm.example");
  });

  it("never posts to Resend by hand, nor names the shared resend.dev sender", () => {
    const src = readFileSync(join(process.cwd(), "app/api/stripe/webhook/route.ts"), "utf8");
    expect(src).not.toMatch(/api\.resend\.com|onboarding@resend\.dev|RESEND_API_KEY|fetch\(/);
    expect(src).toMatch(/from "@\/lib\/email-send"/);
  });
});
