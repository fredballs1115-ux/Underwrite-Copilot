/**
 * The Monday digest: what it counts, which deadlines it lists over which
 * window, how it marks a call a re-screen is replacing — the pure builder —
 * and what the runner does around it, driven against a recording fake of
 * the service-role client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CALL_NOTE,
  OFFERS_WINDOW_DAYS,
  buildDigest,
  digestWeek,
  newestJobs,
  runWeeklyDigests,
  type DigestDealRow,
  type DigestJobRow,
} from "./digest";
import { weeklyDigestEmail } from "./email-template";
import { readEmailUnsubscribeToken } from "./email-unsubscribe";
import { STALE_MS } from "./screen-run";

// Monday, Oct 5, 2026, 13:00 UTC — the digest's hour.
const NOW = Date.parse("2026-10-05T13:00:00Z");
const DAY = 86_400_000;
const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const SITE = "https://underwrite.example";

let n = 0;
const deal = (over: Partial<DigestDealRow> = {}): DigestDealRow => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Deal ${n}`,
    stage: "screening",
    offers_due: null,
    verdict: null,
    updated_at: new Date(NOW).toISOString(),
    is_sample: false,
    user_id: "u1",
    team_id: null,
    ...over,
  };
};
const build = (deals: DigestDealRow[], jobs: DigestJobRow[] = []) =>
  buildDigest(deals, newestJobs(jobs), { now: NOW, appUrl: SITE, pictureUrl: () => null });

describe("the digest counts open deals, never a closed one as live", () => {
  it("leaves Closed and Dead out of the count and the stages, and says \"open deals\"", () => {
    const content = build([
      deal({ stage: "screening" }),
      deal({ stage: "screening" }),
      deal({ stage: "under_contract" }),
      deal({ stage: "closed" }),
      deal({ stage: "dead" }),
    ])!;
    expect(content.stages).toEqual([
      { label: "Screening", count: 2 },
      { label: "Under contract / DD", count: 1 },
    ]);
    const { subject, html, text } = weeklyDigestEmail({ ...content, pipelineUrl: `${SITE}/deals`, settingsUrl: `${SITE}/account` });
    expect(subject).toBe("Your pipeline this week — 3 open deals");
    expect(html).toContain("3 open deals in your pipeline</h1>");
    expect(html).toContain("Open deals by stage");
    expect(text).toContain("3 open deals, by stage:");
    for (const out of [subject, html, text]) {
      expect(out).not.toMatch(/\blive\b/);
      expect(out).not.toContain("Closed");
    }
  });

  it("has nothing to say where nothing is open", () => {
    expect(build([deal({ stage: "closed" }), deal({ stage: "dead" })])).toBeNull();
    expect(build([])).toBeNull();
  });
});

describe("the digest lists open deals' deadlines over the window its heading names", () => {
  it("lists today through the sixth day after, soonest first, and heads the section with that last day", () => {
    expect(OFFERS_WINDOW_DAYS).toBe(7);
    const content = build([
      deal({ name: "Yesterday", offers_due: day(-1) }),
      deal({ name: "Sunday", offers_due: day(6) }),
      deal({ name: "Today", offers_due: day(0) }),
      deal({ name: "Next Monday", offers_due: day(7) }),
      deal({ name: "Wednesday", offers_due: day(2) }),
    ])!;
    expect(content.offersDue.map((o) => o.name)).toEqual(["Today", "Wednesday", "Sunday"]);
    expect(content.offersDue.map((o) => o.due)).toEqual(["Mon, Oct 5", "Wed, Oct 7", "Sun, Oct 11"]);
    expect(content.offersThrough).toBe("Sun, Oct 11");
    const { html, text } = weeklyDigestEmail({ ...content, pipelineUrl: `${SITE}/deals`, settingsUrl: `${SITE}/account` });
    expect(html).toContain(">Offers due by Sun, Oct 11</p>");
    expect(text).toContain("Offers due by Sun, Oct 11:");
    expect(html).not.toContain("this week</p>");
  });

  it("never lists a dead or a closed deal's deadline", () => {
    const content = build([
      deal({ name: "Open", offers_due: day(1) }),
      deal({ name: "Dead", stage: "dead", offers_due: day(1) }),
      deal({ name: "Closed", stage: "closed", offers_due: day(2) }),
    ])!;
    expect(content.offersDue.map((o) => o.name)).toEqual(["Open"]);
  });
});

describe("the digest marks a call its re-screen is replacing, as the pipeline card does", () => {
  const called = (over: Partial<DigestDealRow> = {}) =>
    deal({ verdict: { verdict: "pass", generatedAt: new Date(NOW - 2 * DAY).toISOString() }, ...over });
  const job = (d: DigestDealRow, over: Partial<DigestJobRow>): DigestJobRow => ({
    deal_id: d.id,
    status: "done",
    step: "verdict",
    updated_at: new Date(NOW - 60_000).toISOString(),
    created_at: new Date(NOW - 120_000).toISOString(),
    ...over,
  });

  it("says a running re-screen, a stalled one and a failed one beside the call it shows", () => {
    const running = called({ name: "Running" });
    const stalled = called({ name: "Stalled" });
    const failed = called({ name: "Failed" });
    const done = called({ name: "Done" });
    const content = build(
      [running, stalled, failed, done],
      [
        job(running, { status: "running", step: "market" }),
        job(stalled, { status: "running", step: "comps", updated_at: new Date(NOW - STALE_MS - 60_000).toISOString() }),
        job(failed, { status: "error", step: "challenge" }),
        job(done, { status: "done", step: "verdict" }),
      ],
    )!;
    const note = (name: string) => content.verdicts.find((v) => v.name === name)?.note;
    expect(note("Running")).toBe(CALL_NOTE.running);
    expect(note("Stalled")).toBe(CALL_NOTE.stalled);
    expect(note("Failed")).toBe(CALL_NOTE.failed);
    expect(note("Done")).toBeNull();
    // The call itself still shows, with the note beside it.
    expect(content.verdicts.find((v) => v.name === "Running")?.label).toBe("Go");
    const { html, text } = weeklyDigestEmail({ ...content, pipelineUrl: `${SITE}/deals`, settingsUrl: `${SITE}/account` });
    expect(html).toContain(">Running</a><br /><span style=\"font-size:12px;font-weight:600;color:#a05a1c;\">Re-screening now</span>");
    expect(text).toMatch(/Go: Failed \(Re-screen failed\) — /);
    expect(text).toMatch(/Go: Done — /);
  });

  it("leaves the call alone for a job that is no screen, or no job at all", () => {
    const comps = called({ name: "Comp search" });
    const none = called({ name: "No job" });
    const content = build([comps, none], [job(comps, { status: "running", step: "record_comps" })])!;
    expect(content.verdicts.map((v) => v.note)).toEqual([null, null]);
  });

  it("reads each deal's newest job row", () => {
    const d = called();
    const jobs = newestJobs([
      job(d, { status: "running", step: "market", created_at: "2026-10-05T12:00:00Z" }),
      job(d, { status: "done", created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(jobs.get(d.id)?.status).toBe("running");
  });
});

/* ------------------------------ the runner ------------------------------ */

type Row = Record<string, unknown>;
interface Db {
  profiles: Row[];
  team: { data: Row | null; error: { message: string } | null };
  deals: Row[];
  jobs: Row[];
  /** every call the runner made, in order */
  calls: { table: string; op: string; patch?: Row; inIds?: unknown[] }[];
}

function fakeAdmin(db: Db): SupabaseClient {
  return {
    from(table: string) {
      let op = "select";
      let patch: Row | undefined;
      let inIds: unknown[] | undefined;
      const q = {
        select: () => q,
        update: (p: Row) => {
          op = "update";
          patch = p;
          return q;
        },
        eq: () => q,
        or: () => q,
        in: (_col: string, ids: unknown[]) => {
          inIds = ids;
          return q;
        },
        maybeSingle: async () => {
          db.calls.push({ table, op });
          return table === "team_members" ? db.team : { data: null, error: null };
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          db.calls.push({ table, op, patch, inIds });
          let data: unknown = null;
          // A read hands back copies, as the database does.
          if (table === "profiles" && op === "select") data = db.profiles.map((p) => ({ ...p }));
          else if (table === "profiles" && op === "update") {
            const row = db.profiles[0];
            if (row && patch) Object.assign(row, patch);
            data = [{ id: row?.id }];
          } else if (table === "deals") data = db.deals;
          else if (table === "analysis_jobs") data = db.jobs;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
  } as unknown as SupabaseClient;
}

const env: Record<string, string | undefined> = {};
let sent: { subject: string; html: string; text: string; requestHeaders: Record<string, string> }[] = [];

beforeEach(() => {
  for (const k of ["RESEND_API_KEY", "RESEND_FROM", "RESEND_BASE_URL", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY"]) env[k] = process.env[k];
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM = "Underwrite Copilot <notify@underwrite.example>";
  process.env.RESEND_BASE_URL = "https://resend.test";
  process.env.NEXT_PUBLIC_APP_URL = SITE;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      sent.push({ ...JSON.parse(init.body), requestHeaders: init.headers });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LAST_WEEK = new Date(NOW - 7 * DAY).toISOString();
const dbWith = (over: Partial<Db> = {}): Db => ({
  profiles: [{ id: "u1", email_weekly_digest: true, last_digest_at: LAST_WEEK }],
  team: { data: { team_id: "t1" }, error: null },
  deals: [
    { ...deal({ name: "Harbor Point", offers_due: day(3) }) },
    { ...deal({ name: "The Maddox", verdict: { verdict: "pass_on", generatedAt: new Date(NOW - DAY).toISOString() } }) },
  ],
  jobs: [],
  calls: [],
  ...over,
});

describe("runWeeklyDigests", () => {
  it("sends the open deals' digest, reading the listed calls' job rows in ONE query", async () => {
    const db = dbWith();
    const maddox = db.deals[1].id as string;
    db.jobs = [{ deal_id: maddox, status: "running", step: "comps", updated_at: new Date(NOW - 60_000).toISOString(), created_at: new Date(NOW - 90_000).toISOString() }];
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Your pipeline this week — 2 open deals");
    expect(sent[0].text).toContain("Offers due by Sun, Oct 11:");
    expect(sent[0].text).toContain("No-go: The Maddox (Re-screening now)");
    const jobReads = db.calls.filter((c) => c.table === "analysis_jobs");
    expect(jobReads).toHaveLength(1);
    expect(jobReads[0].inIds).toEqual([maddox]);
  });

  it("reads no job rows where no call is listed", async () => {
    const db = dbWith({ deals: [{ ...deal({ name: "Harbor Point" }) }] });
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    expect(db.calls.some((c) => c.table === "analysis_jobs")).toBe(false);
  });

  it("on a failed team-membership read releases the claim and sends nothing, so the next tick retries", async () => {
    const db = dbWith({ team: { data: null, error: { message: "connection reset" } } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(0);
    expect(sent).toEqual([]);
    // The claim was taken, then put back to what it was.
    const stamps = db.calls.filter((c) => c.table === "profiles" && c.op === "update").map((c) => c.patch?.last_digest_at);
    expect(stamps).toEqual([new Date(NOW).toISOString(), LAST_WEEK]);
    expect(db.profiles[0].last_digest_at).toBe(LAST_WEEK);
    // …and no personal-only digest was built: the deals were never read.
    expect(db.calls.some((c) => c.table === "deals")).toBe(false);
    expect(String(err.mock.calls[0]?.[0])).toMatch(/team membership read failed for u1 — will retry next tick/);
  });

  it("keys each send by the person and the week, so the retry after a timed-out send is not a second email", async () => {
    expect(digestWeek(NOW)).toBe("2026-10-05");
    expect(digestWeek(Date.parse("2026-10-11T23:59:00Z"))).toBe("2026-10-05"); // the Sunday after
    expect(digestWeek(Date.parse("2026-10-04T23:59:00Z"))).toBe("2026-09-28"); // the Sunday before

    const db = dbWith();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // The first send times out — Resend may well have taken it.
    const keys: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        keys.push(init.headers["Idempotency-Key"]);
        throw new DOMException("The operation was aborted.", "AbortError");
      }),
    );
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(0);
    // The claim was released, so the next tick sends again — under the same key.
    expect(db.profiles[0].last_digest_at).toBe(LAST_WEEK);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        keys.push(init.headers["Idempotency-Key"]);
        return new Response("{}", { status: 200 });
      }),
    );
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW + 15 * 60_000, pauseMs: 0 })).toBe(1);
    expect(keys).toEqual(["weekly-digest/u1/2026-10-05", "weekly-digest/u1/2026-10-05"]);
    expect(err).toHaveBeenCalled();
  });

  it("carries RFC 8058's one-click pair and a visible one-click link, both naming that person's digest alone", async () => {
    const USER = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    const db = dbWith({ profiles: [{ id: USER, email_weekly_digest: true, last_digest_at: LAST_WEEK }] });
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    const email = sent[0] as unknown as { headers: Record<string, string>; html: string; text: string };
    const url = /^<(https:\/\/underwrite\.example\/api\/email\/unsubscribe\/([^>]+))>$/.exec(email.headers["List-Unsubscribe"]);
    expect(url).not.toBeNull();
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(readEmailUnsubscribeToken(url![2])).toEqual({ userId: USER, setting: "digest" });
    // The same URI, visible in the footer and the plain text.
    expect(email.html).toContain(`<a href="${url![1]}" style="color:#114e54;">Unsubscribe in one click</a>`);
    expect(email.text).toContain(`Unsubscribe in one click: ${url![1]}`);
  });

  it("without a key to sign with, carries no header and keeps the Account page's switch as the way out", async () => {
    const db = dbWith();
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    const email = sent[0] as unknown as { headers?: Record<string, string>; html: string };
    expect(email.headers).toBeUndefined();
    expect(email.html).toContain("Turn it off on your Account page");
  });

  it("sends nothing to someone whose deals are all closed or dead", async () => {
    const db = dbWith({ deals: [{ ...deal({ stage: "closed" }) }, { ...deal({ stage: "dead", offers_due: day(1) }) }] });
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(0);
    expect(sent).toEqual([]);
  });
});
