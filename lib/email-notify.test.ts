import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealPicture, DealVisualCache } from "./deal-location";

// The screen-complete email's picture (#464): the cover looked for before
// the email goes where nobody has, bounded, and the banner in the email
// Resend is handed.
const pic = vi.hoisted(() => ({
  may: true,
  found: null as unknown,
  hang: false,
  throws: false,
  asked: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/deal-picture", () => ({
  pictureMayBeInMemorandum: () => pic.may,
  ensureDealPicture: (_s: unknown, _id: string, opts: Record<string, unknown>) => {
    pic.asked.push(opts);
    if (pic.throws) return Promise.reject(new Error("storage down"));
    if (pic.hang) return new Promise(() => {});
    return Promise.resolve(pic.found);
  },
}));
vi.mock("@/lib/criteria-server", () => ({ getBuyBoxForDeal: async () => null }));

import { EMAIL_PICTURE_WAIT_MS, emailPicture, notifyAnalysisReady } from "./email";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
const PICTURE: DealPicture = {
  hero: `photos/${DEAL}/1-hero.jpg`,
  thumb: `photos/${DEAL}/1-thumb.jpg`,
  width: 1600,
  height: 1067,
  source: "om",
  at: "2026-09-01T00:00:00Z",
};
const admin = {} as SupabaseClient;
const env: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_BASE_URL", "NEXT_PUBLIC_APP_URL"]) env[k] = process.env[k];
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://underwrite.example";
  Object.assign(pic, { may: true, found: null, hang: false, throws: false, asked: [] });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the screen-complete email's picture (#464)", () => {
  it("looks for the memorandum's cover alone, bounded, and names a photograph it found", async () => {
    pic.found = PICTURE;
    const p = await emailPicture(admin, DEAL, "The Maddox", { cache: null, omPath: "u1/d.pdf" });
    expect(p!.url).toMatch(/^https:\/\/underwrite\.example\/api\/email\/picture\/[^?]+\?s=banner$/);
    expect(p!.alt).toBe("Photograph of The Maddox");
    expect(pic.asked).toEqual([
      expect.objectContaining({ omPath: "u1/d.pdf", isSample: false, waitMs: EMAIL_PICTURE_WAIT_MS, gallery: false }),
    ]);
  });

  it("draws the cover, decorative, where the memorandum holds no photograph", async () => {
    const p = await emailPicture(admin, DEAL, "The Maddox", { cache: null, omPath: "u1/d.pdf" });
    expect(p!.alt).toBe("");
  });

  it("never searches for a deal whose picture is stored, and says it is a photograph", async () => {
    pic.may = false;
    const cache: DealVisualCache = { picture: PICTURE };
    const p = await emailPicture(admin, DEAL, "The Maddox", { cache, omPath: "u1/d.pdf" });
    expect(pic.asked).toEqual([]);
    expect(p!.alt).toBe("Photograph of The Maddox");
  });

  it("takes the search's answer over an old picture it no longer takes for the cover", async () => {
    const p = await emailPicture(admin, DEAL, "The Maddox", { cache: { picture: PICTURE }, omPath: "u1/d.pdf" });
    expect(pic.asked).toHaveLength(1);
    expect(p!.alt).toBe("");
  });

  it("goes on what the cache held when the search fails or runs past its bound", async () => {
    pic.throws = true;
    expect((await emailPicture(admin, DEAL, "The Maddox", { cache: { picture: PICTURE }, omPath: "x" }))!.alt).toBe(
      "Photograph of The Maddox",
    );
    pic.throws = false;
    pic.hang = true;
    vi.useFakeTimers();
    const pending = emailPicture(admin, DEAL, "The Maddox", { cache: null, omPath: "x" });
    await vi.advanceTimersByTimeAsync(EMAIL_PICTURE_WAIT_MS + 10_001);
    expect((await pending)!.alt).toBe("");
  });

  it("carries no picture where no link can be minted", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await emailPicture(admin, DEAL, "The Maddox", { cache: null, omPath: "x" })).toBeNull();
    expect(pic.asked).toEqual([]);
  });

  it("hands Resend an email that opens on the building", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_BASE_URL = "https://resend.test";
    pic.found = PICTURE;
    const sent: { html: string; subject: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body));
        return new Response("{}", { status: 200 });
      }),
    );
    const row = {
      name: "The Maddox",
      user_id: "u1",
      team_id: null,
      asset_class: "multifamily",
      extraction: null,
      verdict: { verdict: "pass", reason: "Priced under the range." },
      is_sample: false,
      photo: null,
      om_storage_path: "u1/d.pdf",
    };
    const fake = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === "deals" ? row : { email_on_analysis: true }, error: null }),
          }),
        }),
      }),
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
    } as unknown as SupabaseClient;
    await notifyAnalysisReady(fake, DEAL);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Go: The Maddox — screen complete");
    expect(sent[0].html).toMatch(/<img src="https:\/\/underwrite\.example\/api\/email\/picture\/[^"]+\?s=banner" width="520" height="260" alt="Photograph of The Maddox"/);
  });
});
