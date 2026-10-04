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

import { ACCOUNT_PAUSED_FAILURE, CREDENTIALS_FAILURE } from "./anthropic/operator-failures";
import {
  EMAIL_PICTURE_WAIT_MS,
  alertOperators,
  emailPicture,
  emailSetup,
  notifyAnalysisFailed,
  notifyAnalysisReady,
  occasionKey,
  screenEmailRecipient,
  sendEmail,
  senderDomain,
  wantsAnalysisEmail,
} from "./email";
import { replyToAddress } from "./email-send";
import { readEmailPictureToken } from "./email-picture";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
/** The person a screen's email goes to: its picture link is signed for them. */
const BUYER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
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
    const p = await emailPicture(admin, DEAL, { cache: null, omPath: "u1/d.pdf" }, BUYER);
    expect(p).toEqual({ url: expect.stringMatching(BANNER_URL) });
    expect(pic.asked).toEqual([
      expect.objectContaining({ omPath: "u1/d.pdf", isSample: false, waitMs: EMAIL_PICTURE_WAIT_MS, gallery: false }),
    ]);
  });

  it("never searches for a deal whose picture is stored", async () => {
    pic.may = false;
    const cache: DealVisualCache = { picture: PICTURE };
    const p = await emailPicture(admin, DEAL, { cache, omPath: "u1/d.pdf" }, BUYER);
    expect(pic.asked).toEqual([]);
    expect(p!.url).toMatch(BANNER_URL);
  });

  it("decides no alt at send time: the route serves what is stored when the email is OPENED", async () => {
    // Whatever the search found, the email names no photograph — the
    // template's alt (bannerAlt) is true of the photograph and of the cover.
    for (const found of [PICTURE, null]) {
      pic.found = found;
      expect(Object.keys((await emailPicture(admin, DEAL, { cache: null, omPath: "u1/d.pdf" }, BUYER))!)).toEqual(["url"]);
    }
  });

  it("goes with what is stored when the search fails or runs past its bound", async () => {
    pic.throws = true;
    expect((await emailPicture(admin, DEAL, { cache: { picture: PICTURE }, omPath: "x" }, BUYER))!.url).toMatch(BANNER_URL);
    pic.throws = false;
    pic.hang = true;
    vi.useFakeTimers();
    const pending = emailPicture(admin, DEAL, { cache: null, omPath: "x" }, BUYER);
    await vi.advanceTimersByTimeAsync(EMAIL_PICTURE_WAIT_MS + 10_001);
    expect((await pending)!.url).toMatch(BANNER_URL);
  });

  it("carries no picture where no link can be minted", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await emailPicture(admin, DEAL, { cache: null, omPath: "x" }, BUYER)).toBeNull();
    expect(pic.asked).toEqual([]);
  });

  it("hands Resend an email that opens on the building, its picture signed for whoever asked for the run", async () => {
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
    // A team deal a teammate re-screened: the email, and its picture link,
    // are the teammate's, never the deal's creator's.
    const CREATOR = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
    const row = {
      name: "The Maddox",
      user_id: CREATOR,
      team_id: "t1",
      asset_class: "multifamily",
      extraction: null,
      verdict: { verdict: "pass", reason: "Priced under the range." },
      is_sample: false,
      photo: null,
      om_storage_path: "u1/d.pdf",
    };
    const chain = (data: unknown) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data, error: null }) };
      return q;
    };
    const fake = {
      from: (table: string) =>
        chain(table === "deals" ? row : table === "team_members" ? { user_id: BUYER } : { email_on_analysis: true }),
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
    } as unknown as SupabaseClient;
    await notifyAnalysisReady(fake, DEAL, { requestedBy: BUYER });
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("Underwrite Copilot <notify@underwrite.example>");
    expect(sent[0].subject).toBe("Go: The Maddox — screen complete");
    expect(sent[0].html).toMatch(/<img src="https:\/\/underwrite\.example\/api\/email\/picture\/[^"]+\?s=banner" width="520" height="260" alt="The Maddox — open the deal"/);
    const token = /\/api\/email\/picture\/([^?"]+)\?s=banner/.exec(sent[0].html)![1];
    expect(readEmailPictureToken(token)).toEqual({ dealId: DEAL, recipient: BUYER });
  });
});

// A send that timed out may have been taken: the key names the email and
// its occasion, and "Resend checks whether an email with the same
// idempotency key has already been sent in the last 24 hours".
describe("every send names its occasion in Resend's Idempotency-Key header", () => {
  const requests: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  beforeEach(() => {
    requests.length = 0;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Underwrite Copilot <notify@underwrite.example>";
    process.env.RESEND_BASE_URL = "https://resend.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string>; body: string }) => {
        requests.push({ headers: init.headers, body: JSON.parse(init.body) });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("sends the header with a key, and none without one", async () => {
    expect(await sendEmail("a@example.com", "S", "<p>B</p>", "B", { idempotencyKey: "weekly-digest/u1/2026-10-05" })).toBe(true);
    expect(await sendEmail(["a@example.com", "b@example.com"], "S", "<p>B</p>", "B")).toBe(true);
    expect(requests[0].headers["Idempotency-Key"]).toBe("weekly-digest/u1/2026-10-05");
    expect("Idempotency-Key" in requests[1].headers).toBe(false);
    expect(requests[1].body.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("carries a Reply-To only where the operator set an address for it, never a default", async () => {
    const saved = process.env.RESEND_REPLY_TO;
    try {
      delete process.env.RESEND_REPLY_TO;
      await sendEmail("a@example.com", "S", "<p>B</p>", "B");
      process.env.RESEND_REPLY_TO = "   ";
      await sendEmail("a@example.com", "S", "<p>B</p>", "B");
      process.env.RESEND_REPLY_TO = "Underwrite Copilot support";
      await sendEmail("a@example.com", "S", "<p>B</p>", "B");
      process.env.RESEND_REPLY_TO = " Support <support@underwrite.example> ";
      await sendEmail("a@example.com", "S", "<p>B</p>", "B");
      expect(requests.map((r) => r.body.reply_to)).toEqual([undefined, undefined, undefined, "Support <support@underwrite.example>"]);
      expect(replyToAddress({})).toBeNull();
      expect(replyToAddress({ RESEND_REPLY_TO: "help@underwrite.example" })).toBe("help@underwrite.example");
    } finally {
      if (saved === undefined) delete process.env.RESEND_REPLY_TO;
      else process.env.RESEND_REPLY_TO = saved;
    }
  });

  it("builds a key from the email's kind and its occasion, or none where a part is missing", () => {
    expect(occasionKey("screen-complete", DEAL, "2026-10-05T13:02:03.004Z")).toBe(
      `screen-complete/${DEAL}/2026-10-05T13:02:03.004Z`,
    );
    expect(occasionKey("screen-stopped", DEAL, null)).toBeNull();
    expect(occasionKey("screen-stopped", DEAL, "  ")).toBeNull();
    expect(occasionKey("x", "a b/c")).toBe("x/a-b-c");
  });

  it("keys the screen-complete email by its verdict, and the stopped one by its run", async () => {
    const generatedAt = "2026-10-05T13:02:03.004Z";
    const created = "2026-10-05T12:58:00.000Z";
    const fake = (verdict: unknown) =>
      ({
        from: (table: string) => {
          const q = {
            select: () => q,
            eq: () => q,
            order: () => q,
            limit: () => q,
            maybeSingle: async () => ({
              data:
                table === "deals"
                  ? { name: "The Maddox", user_id: "u1", team_id: null, verdict, is_sample: false, photo: null, om_storage_path: null }
                  : table === "analysis_jobs"
                    ? { status: "error", step: "comps", created_at: created }
                    : { email_on_analysis: true },
              error: null,
            }),
          };
          return q;
        },
        auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
      }) as unknown as SupabaseClient;
    await notifyAnalysisReady(fake({ verdict: "pass", reason: "", generatedAt }), DEAL);
    await notifyAnalysisFailed(fake(null), DEAL, "The analysis service is overloaded right now — try again in a few minutes.");
    expect(requests.map((r) => r.headers["Idempotency-Key"])).toEqual([
      `screen-complete/${DEAL}/${generatedAt}`,
      `screen-stopped/${DEAL}/${created}`,
    ]);
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

  it("the worker emails a screen it gives up on, or that throws, as the pipeline does its own — to whoever asked", () => {
    const src = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    expect(src).toMatch(
      /if \(payload\.kind === "screen"\) \{\s*await notifyAnalysisFailed\(admin, next\.deal_id as string, INTERRUPTED_MSG, \{\s*requestedBy: requesterOf\(payload\.requestedBy\),/,
    );
    expect(src).toMatch(
      /if \(failed && job\.payload\.kind === "screen"\) \{\s*await notifyAnalysisFailed\(admin, job\.dealId, message, \{ requestedBy: requesterOf\(job\.payload\.requestedBy\) \}\)/,
    );
    expect(src).toMatch(/requestedBy: requesterOf\(job\.payload\.requestedBy\),\s*\}\);/);
    const email = readFileSync(join(process.cwd(), "lib/email.ts"), "utf8");
    // Both notifiers find the recipient, and read their switch, through the one reader.
    expect(email.match(/await screenEmailAddress\(/g)).toHaveLength(2);
    expect(email.match(/await wantsAnalysisEmail\(admin, recipient\)/g)).toHaveLength(1);
  });
});

// The stopped-screen email: on a re-screen the call that still stands, and
// for a failure only the operator can fix, a word to the operators too.
describe("a stopped screen's email says what stands, and tells the operators what is theirs", () => {
  const sends: { to: string[]; subject: string; text: string; key: string | undefined }[] = [];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    sends.length = 0;
    saved.OPERATOR_EMAILS = process.env.OPERATOR_EMAILS;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Underwrite Copilot <notify@underwrite.example>";
    process.env.RESEND_BASE_URL = "https://resend.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
        const body = JSON.parse(init.body);
        sends.push({ to: body.to, subject: body.subject, text: body.text, key: init.headers["Idempotency-Key"] });
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    if (saved.OPERATOR_EMAILS === undefined) delete process.env.OPERATOR_EMAILS;
    else process.env.OPERATOR_EMAILS = saved.OPERATOR_EMAILS;
  });

  const admin = (verdict: unknown, job: unknown, analysisSwitch = true) =>
    ({
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data:
              table === "deals"
                ? { name: "The Maddox", user_id: "u1", team_id: null, is_sample: false, verdict }
                : table === "analysis_jobs"
                  ? job
                  : { email_on_analysis: analysisSwitch },
            error: null,
          }),
        };
        return q;
      },
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
    }) as unknown as SupabaseClient;
  const CALL = { verdict: "pass", reason: "", generatedAt: "2026-09-12T15:00:00Z" };
  const FAILED_RUN = { status: "error", step: "comps", created_at: "2026-10-05T12:00:00Z" };

  it("says the previous call still stands where the run never reached its verdict", async () => {
    await notifyAnalysisFailed(admin(CALL, FAILED_RUN), DEAL, "The analysis service is overloaded right now.");
    expect(sends[0].text).toContain("The previous call still stands: Go, screened Sep 12, 2026.");
    // A first screen has no call; an unread job row says nothing of one.
    await notifyAnalysisFailed(admin(null, FAILED_RUN), DEAL, "Stopped.");
    await notifyAnalysisFailed(admin(CALL, null), DEAL, "Stopped.");
    expect(sends.slice(1).map((s) => s.text.includes("still stands"))).toEqual([false, false]);
  });

  it("tells the operators named in OPERATOR_EMAILS of a failure only they can fix, at most once an hour, whatever the customer's switch", async () => {
    process.env.OPERATOR_EMAILS = "Ops@Underwrite.example; second@underwrite.example";
    const now = Date.parse("2026-10-05T13:42:00Z");
    expect(await alertOperators(CREDENTIALS_FAILURE, now)).toBe(true);
    expect(sends[0].to).toEqual(["ops@underwrite.example", "second@underwrite.example"]);
    expect(sends[0].subject).toBe("Screens are stopping: the analysis service refuses our credentials");
    expect(sends[0].key).toBe("operator-alert/credentials/2026-10-05T13");
    expect(sends[0].text).toContain(CREDENTIALS_FAILURE);
    // The body names no deal: a second send inside the hour is the same email.
    expect(sends[0].text).not.toContain(DEAL);

    // Through the stopped-screen email, with the customer's own switch off.
    sends.length = 0;
    await notifyAnalysisFailed(admin(CALL, FAILED_RUN, false), DEAL, ACCOUNT_PAUSED_FAILURE);
    expect(sends.map((s) => s.to)).toEqual([["ops@underwrite.example", "second@underwrite.example"]]);
    expect(sends[0].key).toMatch(/^operator-alert\/account-paused\/\d{4}-\d{2}-\d{2}T\d{2}$/);
  });

  it("alerts nobody for an ordinary failure, or where no operator is named", async () => {
    process.env.OPERATOR_EMAILS = "ops@underwrite.example";
    expect(await alertOperators("The analysis service is overloaded right now — try again in a few minutes.")).toBe(false);
    delete process.env.OPERATOR_EMAILS;
    expect(await alertOperators(CREDENTIALS_FAILURE)).toBe(false);
    await notifyAnalysisFailed(admin(CALL, FAILED_RUN), DEAL, CREDENTIALS_FAILURE);
    // Only the customer's email.
    expect(sends.map((s) => s.to)).toEqual([["buyer@example.com"]]);
  });

  it("says a worker that gave up in plain words, with the deal page's own button", () => {
    const src = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    const msg = /const INTERRUPTED_MSG =([\s\S]*?);\n/.exec(src)![1];
    expect(msg).not.toMatch(/worker|hit /);
    expect(msg).toContain("while our servers restarted");
    expect(msg).toContain("Choose “Try again” on the deal page");
  });
});

// Any member can re-screen a team deal; the screen's emails went to the
// deal's creator, who had asked for nothing. They go to the person who
// asked — never to anyone the deal's row-level security would hide it from.
describe("a screen's emails go to whoever asked for the run", () => {
  const CREATOR = "11111111-1111-4111-8111-111111111111";
  const MEMBER = "22222222-2222-4222-8222-222222222222";
  const OUTSIDER = "33333333-3333-4333-8333-333333333333";
  const TEAM = "44444444-4444-4444-8444-444444444444";

  interface World {
    deal: Record<string, unknown>;
    members: string[];
    membersFail?: boolean;
    switches: Record<string, boolean>;
    emails: Record<string, string>;
  }

  /** A fake that answers each read by what it was asked for. */
  function worldAdmin(w: World): SupabaseClient {
    return {
      from: (table: string) => {
        const eqs: Record<string, unknown> = {};
        const q = {
          select: () => q,
          eq: (col: string, val: unknown) => {
            eqs[col] = val;
            return q;
          },
          order: () => q,
          limit: () => q,
          maybeSingle: async () => {
            if (table === "deals") return { data: w.deal, error: null };
            if (table === "team_members") {
              if (w.membersFail) return { data: null, error: { message: "timeout" } };
              const hit = eqs.team_id === w.deal.team_id && w.members.includes(String(eqs.user_id));
              return { data: hit ? { user_id: eqs.user_id } : null, error: null };
            }
            if (table === "profiles") {
              const on = w.switches[String(eqs.id)];
              return { data: on === undefined ? null : { email_on_analysis: on }, error: null };
            }
            if (table === "analysis_jobs") return { data: { status: "error", step: "comps", created_at: "2026-10-05T12:00:00Z" }, error: null };
            return { data: null, error: null };
          },
        };
        return q;
      },
      auth: {
        admin: {
          getUserById: async (id: string) => ({ data: { user: w.emails[id] ? { email: w.emails[id] } : null } }),
        },
      },
    } as unknown as SupabaseClient;
  }

  const world = (over: Partial<World> = {}): World => ({
    deal: {
      name: "The Maddox",
      user_id: CREATOR,
      team_id: TEAM,
      asset_class: "multifamily",
      extraction: null,
      verdict: { verdict: "pass", reason: "", generatedAt: "2026-10-05T13:00:00Z" },
      is_sample: false,
      photo: null,
      om_storage_path: null,
    },
    members: [CREATOR, MEMBER],
    switches: { [CREATOR]: true, [MEMBER]: true, [OUTSIDER]: true },
    emails: { [CREATOR]: "creator@firm.example", [MEMBER]: "member@firm.example", [OUTSIDER]: "outsider@else.example" },
    ...over,
  });

  const recipients: string[][] = [];
  beforeEach(() => {
    recipients.length = 0;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Underwrite Copilot <notify@underwrite.example>";
    process.env.RESEND_BASE_URL = "https://resend.test";
    pic.may = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        recipients.push(JSON.parse(init.body).to);
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("names the member who asked, the creator where no one is recorded, and nobody the deal is hidden from", async () => {
    const w = world();
    const admin = worldAdmin(w);
    const deal = { user_id: CREATOR, team_id: TEAM };
    expect(await screenEmailRecipient(admin, deal, MEMBER)).toBe(MEMBER);
    expect(await screenEmailRecipient(admin, deal, MEMBER.toUpperCase())).toBe(MEMBER);
    expect(await screenEmailRecipient(admin, deal, CREATOR)).toBe(CREATOR);
    // A run queued before the requester was carried — or a value that is no user id.
    expect(await screenEmailRecipient(admin, deal, null)).toBe(CREATOR);
    expect(await screenEmailRecipient(admin, deal, "not-a-user")).toBe(CREATOR);
    // Someone who is not on the deal's team (never a member, or since left).
    expect(await screenEmailRecipient(admin, deal, OUTSIDER)).toBeNull();
    // A personal deal is its creator's alone.
    expect(await screenEmailRecipient(admin, { user_id: CREATOR, team_id: null }, MEMBER)).toBeNull();
    // A membership read that fails names nobody.
    expect(await screenEmailRecipient(worldAdmin(world({ membersFail: true })), deal, MEMBER)).toBeNull();
  });

  it("emails the screen-complete and the stopped screen to the member who asked, under the member's own switch", async () => {
    await notifyAnalysisReady(worldAdmin(world()), DEAL, { requestedBy: MEMBER });
    await notifyAnalysisFailed(worldAdmin(world()), DEAL, "The analysis service is overloaded right now.", { requestedBy: MEMBER });
    expect(recipients).toEqual([["member@firm.example"], ["member@firm.example"]]);

    // The member turned these emails off: nothing goes — never to the creator instead.
    recipients.length = 0;
    const off = world({ switches: { [CREATOR]: true, [MEMBER]: false } });
    await notifyAnalysisReady(worldAdmin(off), DEAL, { requestedBy: MEMBER });
    await notifyAnalysisFailed(worldAdmin(off), DEAL, "Stopped.", { requestedBy: MEMBER });
    expect(recipients).toEqual([]);
  });

  it("emails nobody for a requester the deal is hidden from, and the creator for a run that recorded no one", async () => {
    await notifyAnalysisReady(worldAdmin(world()), DEAL, { requestedBy: OUTSIDER });
    await notifyAnalysisFailed(worldAdmin(world()), DEAL, "Stopped.", { requestedBy: OUTSIDER });
    expect(recipients).toEqual([]);
    await notifyAnalysisReady(worldAdmin(world()), DEAL);
    await notifyAnalysisFailed(worldAdmin(world()), DEAL, "Stopped.");
    expect(recipients).toEqual([["creator@firm.example"], ["creator@firm.example"]]);
  });
});
