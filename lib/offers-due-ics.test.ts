/**
 * GET /api/deals/[id]/offers-due.ics (#467), driven with the server client
 * faked: the deal's deadline as one calendar event under the reader's own
 * session — the reader's date, else the memorandum's — and a bare 404 for a
 * deal nobody may open or one with no deadline.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  deal: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: state.deal, error: null }),
      };
      return q;
    },
  }),
}));

import { GET } from "@/app/api/deals/[id]/offers-due.ics/route";

const get = () =>
  GET(new Request("https://app.test/api/deals/d1/offers-due.ics"), { params: Promise.resolve({ id: "d1" }) });

describe("the call for offers as a calendar file (#467)", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.deal = null;
  });

  it("serves the deal's own deadline as one all-day event with its link", async () => {
    state.deal = { id: "d1", name: "The Maddox, Brewerytown", offers_due: "2026-10-15", extraction: null };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="offers-due-the-maddox-brewerytown.ics"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.text();
    expect(body).toContain("DTSTART;VALUE=DATE:20261015\r\n");
    expect(body).toContain("SUMMARY:Offers due — The Maddox\\, Brewerytown\r\n");
    expect(body).toContain("UID:offers-due-d1@underwrite-copilot\r\n");
    expect(body).toContain("/deals/d1");
  });

  it("falls back to the memorandum's date where the deal carries none", async () => {
    state.deal = {
      id: "d1",
      name: "The Maddox",
      offers_due: null,
      extraction: { metrics: [{ label: "Offers due", value: "October 15, 2026", page: "p. 2" }], totalPages: 40 },
    };
    const body = await (await get()).text();
    expect(body).toContain("DTSTART;VALUE=DATE:20261015");
  });

  // Research pass 35, F14: the memorandum's time of day was dropped.
  it("carries the memorandum's own words, its time and its page where the deadline is its day, still all day", async () => {
    const extraction = {
      metrics: [{ label: "Offers due", value: "Thursday, October 22, 2026 at 5:00 PM ET", page: "p. 2" }],
      totalPages: 40,
    };
    // A long DESCRIPTION is folded at 75 octets; read the file unfolded.
    const unfolded = async () => (await (await get()).text()).replace(/\r\n /g, "");
    for (const offers_due of [null, "2026-10-22"]) {
      state.deal = { id: "d1", name: "The Maddox", offers_due, extraction };
      const body = await unfolded();
      expect(body).toContain("DTSTART;VALUE=DATE:20261022\r\n");
      expect(body).toContain("DTEND;VALUE=DATE:20261023\r\n");
      expect(body).toContain("SUMMARY:Offers due 5:00 PM ET — The Maddox\r\n");
      expect(body).toMatch(
        /\r\nDESCRIPTION:Offers due as the memorandum states it: Thursday\\, October 22\\, 2026 at 5:00 PM ET \(OM p\. 2\)\\nhttps?:\/\/[^\r\n]*\/deals\/d1\r\n/,
      );
    }
    // A day the reader set that is not the memorandum's: the link alone.
    state.deal = { id: "d1", name: "The Maddox", offers_due: "2026-10-29", extraction };
    const body = await unfolded();
    expect(body).toContain("DTSTART;VALUE=DATE:20261029\r\n");
    expect(body).toContain("SUMMARY:Offers due — The Maddox\r\n");
    expect(body).toMatch(/\r\nDESCRIPTION:https?:\/\/[^\r\n]*\/deals\/d1\r\n/);
    expect(body).not.toContain("as the memorandum states it");
  });

  it("is a 404 with no deadline or no deal, and asks a signed-out visitor to sign in", async () => {
    state.deal = { id: "d1", name: "The Maddox", offers_due: null, extraction: { metrics: [{ label: "Offers due", value: "October 15th" }] } };
    expect((await get()).status).toBe(404);
    state.deal = null;
    expect((await get()).status).toBe(404);
    state.user = null;
    const res = await get();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?next=");
  });
});
