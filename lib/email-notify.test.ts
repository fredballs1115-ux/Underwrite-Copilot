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

import {
  EMAIL_PICTURE_WAIT_MS,
  emailPicture,
  emailSetup,
  notifyAnalysisReady,
  senderDomain,
  wantsAnalysisEmail,
} from "./email";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_FROM", "RESEND_BASE_URL", "NEXT_PUBLIC_APP_URL"]) env[k] = process.env[k];
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
  const BANNER_URL = /^https:\/\/underwrite\.example\/api\/email\/picture\/[^?]+\?s=banner$/;

  it("looks for the memorandum's cover alone, bounded, before the email goes", async () => {
    pic.found = PICTURE;
    const p = await emailPicture(admin, DEAL, { cache: null, omPath: "u1/d.pdf" });
    expect(p).toEqual({ url: expect.stringMatching(BANNER_URL) });
    expect(pic.asked).toEqual([
      expect.objectContaining({ omPath: "u1/d.pdf", isSample: false, waitMs: EMAIL_PICTURE_WAIT_MS, gallery: false }),
    ]);
  });

  it("never searches for a deal whose picture is stored", async () => {
    pic.may = false;
    const cache: DealVisualCache = { picture: PICTURE };
    const p = await emailPicture(admin, DEAL, { cache, omPath: "u1/d.pdf" });
    expect(pic.asked).toEqual([]);
    expect(p!.url).toMatch(BANNER_URL);
  });

  it("decides no alt at send time: the route serves what is stored when the email is OPENED", async () => {
    // Whatever the search found, the email names no photograph — the
    // template's alt (bannerAlt) is true of the photograph and of the cover.
    for (const found of [PICTURE, null]) {
      pic.found = found;
      expect(Object.keys((await emailPicture(admin, DEAL, { cache: null, omPath: "u1/d.pdf" }))!)).toEqual(["url"]);
    }
  });

  it("goes with what is stored when the search fails or runs past its bound", async () => {
    pic.throws = true;
    expect((await emailPicture(admin, DEAL, { cache: { picture: PICTURE }, omPath: "x" }))!.url).toMatch(BANNER_URL);
    pic.throws = false;
    pic.hang = true;
    vi.useFakeTimers();
    const pending = emailPicture(admin, DEAL, { cache: null, omPath: "x" });
    await vi.advanceTimersByTimeAsync(EMAIL_PICTURE_WAIT_MS + 10_001);
    expect((await pending)!.url).toMatch(BANNER_URL);
  });

  it("carries no picture where no link can be minted", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await emailPicture(admin, DEAL, { cache: null, omPath: "x" })).toBeNull();
    expect(pic.asked).toEqual([]);
  });

  it("hands Resend an email that opens on the building", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Underwrite Copilot <notify@underwrite.example>";
    process.env.RESEND_BASE_URL = "https://resend.test";
    pic.found = PICTURE;
    const sent: { html: string; subject: string; from: string }[] = [];
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
    expect(sent[0].from).toBe("Underwrite Copilot <notify@underwrite.example>");
    expect(sent[0].subject).toBe("Go: The Maddox — screen complete");
    expect(sent[0].html).toMatch(/<img src="https:\/\/underwrite\.example\/api\/email\/picture\/[^"]+\?s=banner" width="520" height="260" alt="The Maddox — open the deal"/);
  });
});

// Resend delivers mail from its shared resend.dev sender only to the address
// that owns the Resend account. With a key and that default — or no sender
// at all — the emails went nowhere a customer would see while the account
// page showed both switches on; they are paused instead.
describe("the emails are paused without a sender a customer receives mail from", () => {
  const KEY = { RESEND_API_KEY: "re_live" };

  it("reads a key with no sender, a blank one, or one on resend.dev as paused", () => {
    expect(emailSetup({})).toEqual({ state: "off" });
    expect(emailSetup({ RESEND_FROM: "notify@underwrite.example" })).toEqual({ state: "off" });
    for (const from of [undefined, "", "   "]) {
      const s = emailSetup({ ...KEY, RESEND_FROM: from });
      expect(s.state, String(from)).toBe("paused");
      expect(s.state === "paused" && s.reason).toBe("RESEND_FROM is not set");
    }
    for (const from of [
      "Underwrite Copilot <onboarding@resend.dev>", // the old default
      "onboarding@resend.dev",
      "ONBOARDING@RESEND.DEV",
      "Notices <notify@mail.resend.dev>",
    ]) {
      const s = emailSetup({ ...KEY, RESEND_FROM: from });
      expect(s.state, from).toBe("paused");
      expect(s.state === "paused" && s.reason, from).toMatch(/resend\.dev domain, which delivers only to the Resend account's own address/);
    }
    const noAddress = emailSetup({ ...KEY, RESEND_FROM: "Underwrite Copilot" });
    expect(noAddress.state === "paused" && noAddress.reason).toMatch(/names no address/);
  });

  it("sends from a verified domain's sender, as written", () => {
    expect(emailSetup({ ...KEY, RESEND_FROM: " Underwrite Copilot <notify@underwritecopilot.com> " })).toEqual({
      state: "on",
      key: "re_live",
      from: "Underwrite Copilot <notify@underwritecopilot.com>",
    });
    // A domain that only contains the shared one is not on it.
    expect(emailSetup({ ...KEY, RESEND_FROM: "a@notresend.dev" }).state).toBe("on");
    expect(emailSetup({ ...KEY, RESEND_FROM: "a@resend.dev.example.com" }).state).toBe("on");
  });

  it("reads a sender's domain, in angle brackets or bare", () => {
    expect(senderDomain("Underwrite Copilot <Notify@UnderwriteCopilot.com>")).toBe("underwritecopilot.com");
    expect(senderDomain("notify@underwritecopilot.com")).toBe("underwritecopilot.com");
    expect(senderDomain('"Copilot, Inc." <a@b.example>')).toBe("b.example");
    expect(senderDomain("Underwrite Copilot")).toBeNull();
    expect(senderDomain("@resend.dev")).toBeNull();
    expect(senderDomain("Copilot <>")).toBeNull();
  });

  it("attempts no send and reads nothing while paused, and says why once", async () => {
    // A fresh module: the one log line is once a process.
    vi.resetModules();
    const email = await import("./email");
    const { runWeeklyDigests } = await import("./digest");
    process.env.RESEND_API_KEY = "re_live";
    delete process.env.RESEND_FROM;
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const read: string[] = [];
    const db = {
      from: (table: string) => {
        read.push(table);
        throw new Error(`read ${table} while paused`);
      },
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
    } as unknown as SupabaseClient;
    try {
      expect(email.emailEnabled()).toBe(false);
      await email.notifyAnalysisReady(db, DEAL);
      expect(await runWeeklyDigests(db)).toBe(0);
      expect(await email.sendEmail("buyer@example.com", "Subject", "<p>Body</p>", "Body")).toBe(false);
      // The shared sender the module used to fall back to is paused the same way.
      process.env.RESEND_FROM = "Underwrite Copilot <onboarding@resend.dev>";
      await email.notifyAnalysisReady(db, DEAL);
      expect(await email.sendEmail("buyer@example.com", "Subject", "<p>Body</p>", "Body")).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(read).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/^\[email\] paused: RESEND_FROM is not set — no email is sent until/);
    } finally {
      warn.mockRestore();
    }
  });

  it("stays silent with no key at all, as it always has", async () => {
    vi.resetModules();
    const email = await import("./email");
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(email.emailEnabled()).toBe(false);
      expect(await email.sendEmail("buyer@example.com", "Subject", "<p>Body</p>", "Body")).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// The account page's switch: an email per finished screen, and one when a
// screen fails before its verdict. A failed read of the switch had counted
// as ON, so a database blip could email someone who had turned it off.
describe("the analysis emails go only where the reader has not said no", () => {
  const prefs = (result: { data?: unknown; error?: unknown } | "throw") =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (result === "throw") throw new Error("connection reset");
              return { data: result.data ?? null, error: result.error ?? null };
            },
          }),
        }),
      }),
    }) as unknown as SupabaseClient;

  it("sends by default and where the switch is on, never where it is off or unread", async () => {
    expect(await wantsAnalysisEmail(prefs({ data: null }), "u1")).toBe(true);
    expect(await wantsAnalysisEmail(prefs({ data: { email_on_analysis: true } }), "u1")).toBe(true);
    expect(await wantsAnalysisEmail(prefs({ data: { email_on_analysis: false } }), "u1")).toBe(false);
    expect(await wantsAnalysisEmail(prefs({ error: { message: "timeout" } }), "u1")).toBe(false);
    expect(await wantsAnalysisEmail(prefs("throw"), "u1")).toBe(false);
  });

  it("the worker emails a screen it gives up on, or that throws, as the pipeline does its own", () => {
    const src = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    expect(src).toMatch(/if \(payload\.kind === "screen"\) await notifyAnalysisFailed\(admin, next\.deal_id as string, INTERRUPTED_MSG\)/);
    expect(src).toMatch(/if \(failed && job\.payload\.kind === "screen"\) await notifyAnalysisFailed\(admin, job\.dealId, message\)/);
    const email = readFileSync(join(process.cwd(), "lib/email.ts"), "utf8");
    // Both notifiers read the switch through the one reader.
    expect(email.match(/await wantsAnalysisEmail\(admin, deal\.user_id as string\)/g)).toHaveLength(2);
  });
});
