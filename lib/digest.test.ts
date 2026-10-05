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
import { readEmailPictureToken } from "./email-picture";
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
  buildDigest(deals, newestJobs(jobs), { now: NOW, appUrl: SITE, recipient: "u1", pictureUrl: () => null });

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

describe("a cut list says what it left out (research pass 42, H4c)", () => {
  // The pass's account: 200 open deals, fifteen deadlines inside the week the
  // digest names and ten calls in it. The lists stop at six; nine deadlines
  // had been dropped with no sign, and the preheader had said "6 verdicts".
  const stages = ["screening", "tracking", "active_pursuit", "loi_submitted", "under_contract"];
  const deals = Array.from({ length: 200 }, (_, i) =>
    deal({
      name: `The Maddox at Brewerytown ${i}`,
      stage: stages[i % stages.length],
      offers_due: i < 15 ? day(i % 7) : null,
      verdict:
        i < 10
          ? { verdict: ["pass", "caution", "pass_on"][i % 3], generatedAt: new Date(NOW - (i + 1) * 12 * 3600e3).toISOString() }
          : { verdict: "caution", generatedAt: "2026-01-15T00:00:00Z" },
    }),
  );

  it("counts every deadline and every call, lists six of each, and says the rest", () => {
    const content = build(deals)!;
    expect(content.offersDue).toHaveLength(6);
    expect(content.offersDueTotal).toBe(15);
    expect(content.verdicts).toHaveLength(6);
    expect(content.verdictsTotal).toBe(10);
    const pipelineUrl = `${SITE}/deals`;
    const { html, text } = weeklyDigestEmail({ ...content, pipelineUrl, settingsUrl: `${SITE}/account` });
    expect(text).toContain(`  and 9 more due by Sun, Oct 11 — open the pipeline: ${pipelineUrl}`);
    expect(text).toContain("  and 4 more since last week");
    expect(html).toContain(`and 9 more due by Sun, Oct 11 — <a href="${pipelineUrl}" style="color:#114e54;font-weight:600;">open the pipeline</a>`);
    expect(html).toContain("and 4 more since last week</p>");
    // The inbox preheader leads with the true count of deadlines — the
    // preview line an inbox shows is cut at 140 characters (PREVIEW_MAX).
    const pre = /mso-hide:all;">([^<]*)</.exec(html)?.[1] ?? "";
    expect(pre).toMatch(/^15 offers due by Sun, Oct 11: The Maddox at Brewerytown 0 \(Mon, Oct 5\), /);
    // With no deadline to lead, the calls' true count is the one said.
    const quiet = build(deals.map((d) => ({ ...d, offers_due: null })))!;
    const calm = weeklyDigestEmail({ ...quiet, pipelineUrl, settingsUrl: `${SITE}/account` });
    expect(/mso-hide:all;">([^<]*)</.exec(calm.html)?.[1]).toBe("200 open deals in your pipeline. 10 verdicts since last week.");
  });

  it("says nothing more where nothing was left out", () => {
    const content = build(deals.slice(0, 4).map((d) => ({ ...d })))!;
    expect(content.offersDueTotal).toBe(content.offersDue.length);
    const { html, text } = weeklyDigestEmail({ ...content, pipelineUrl: `${SITE}/deals`, settingsUrl: `${SITE}/account` });
    expect(text).not.toMatch(/\bmore (due|since)\b/);
    expect(html).not.toMatch(/\bmore (due|since)\b/);
    expect(/mso-hide:all;">([^<]*)</.exec(html)?.[1]).toMatch(/^Offers due: /);
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
  calls: { table: string; op: string; patch?: Row; inIds?: unknown[]; or?: string; order?: string; range?: [number, number] }[];
  /** the most rows one response holds, as a project's max rows caps a read
   *  that asks for more — a normal success, with no sign the rest exist */
  maxRows?: number;
}

/** The claim's own filter, as the database applies it: a profile with no
 *  digest yet, or whose last one is older than the cutoff. */
function dueByOr(or: string | undefined) {
  const m = /^last_digest_at\.is\.null,last_digest_at\.lt\.(.+)$/.exec(or ?? "");
  return (row: Row) => !m || row.last_digest_at == null || String(row.last_digest_at) < m[1];
}

function fakeAdmin(db: Db): SupabaseClient {
  return {
    from(table: string) {
      let op = "select";
      let patch: Row | undefined;
      let inIds: unknown[] | undefined;
      let or: string | undefined;
      let order: string | undefined;
      let range: [number, number] | undefined;
      const eqs: [string, unknown][] = [];
      const q = {
        select: () => q,
        update: (p: Row) => {
          op = "update";
          patch = p;
          return q;
        },
        eq: (col: string, val: unknown) => {
          eqs.push([col, val]);
          return q;
        },
        or: (s: string) => {
          or = s;
          return q;
        },
        in: (_col: string, ids: unknown[]) => {
          inIds = ids;
          return q;
        },
        order: (col: string) => {
          order = col;
          return q;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return q;
        },
        maybeSingle: async () => {
          db.calls.push({ table, op });
          return table === "team_members" ? db.team : { data: null, error: null };
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          db.calls.push({ table, op, patch, inIds, or, order, range });
          let data: unknown = null;
          let rows: Row[] | null = null;
          // A read hands back copies, as the database does.
          if (table === "profiles" && op === "select") {
            rows = db.profiles.filter((p) => eqs.every(([c, v]) => p[c] === v)).filter(dueByOr(or)).map((p) => ({ ...p }));
          } else if (table === "profiles" && op === "update") {
            const row = db.profiles.find((p) => eqs.every(([c, v]) => p[c] === v) && dueByOr(or)(p));
            if (row && patch) Object.assign(row, patch);
            data = row ? [{ id: row.id }] : [];
          } else if (table === "deals") rows = db.deals.map((d) => ({ ...d }));
          else if (table === "analysis_jobs") data = db.jobs;
          if (rows) {
            if (order) rows.sort((a, b) => String(a[order!]).localeCompare(String(b[order!])));
            const [from, to] = range ?? [0, Number.MAX_SAFE_INTEGER];
            data = rows.slice(from, Math.min(to + 1, from + (db.maxRows ?? Number.MAX_SAFE_INTEGER)));
          }
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

  it("carries RFC 8058's one-click pair and a visible unsubscribe link, both naming that person's digest alone", async () => {
    const USER = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    const db = dbWith({ profiles: [{ id: USER, email_weekly_digest: true, last_digest_at: LAST_WEEK }] });
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    const email = sent[0] as unknown as { headers: Record<string, string>; html: string; text: string };
    const url = /^<(https:\/\/underwrite\.example\/api\/email\/unsubscribe\/([^>]+))>$/.exec(email.headers["List-Unsubscribe"]);
    expect(url).not.toBeNull();
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(readEmailUnsubscribeToken(url![2])).toEqual({ userId: USER, setting: "digest" });
    // The same URI, visible in the footer and the plain text — said as what
    // it does: a page with one button, and no sign-in.
    expect(email.html).toContain(`<a href="${url![1]}" style="color:#114e54;">Unsubscribe without signing in</a>`);
    expect(email.text).toContain(`Unsubscribe without signing in: ${url![1]}`);
  });

  it("signs each deal's square for the person the digest goes to, a teammate's deal included", async () => {
    const USER = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    const db = dbWith({ profiles: [{ id: USER, email_weekly_digest: true, last_digest_at: LAST_WEEK }] });
    // The team's deal, created by someone else: the reader sees it today.
    db.deals[0] = { ...db.deals[0], user_id: "someone-else", team_id: "t1" };
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    const tokens = [...sent[0].html.matchAll(/\/api\/email\/picture\/([^?"]+)\?s=thumb/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    for (const t of tokens) expect(readEmailPictureToken(t, NOW)?.recipient).toBe(USER);
    expect(new Set(tokens.map((t) => readEmailPictureToken(t, NOW)?.dealId))).toEqual(
      new Set(db.deals.map((d) => d.id as string)),
    );
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

describe("runWeeklyDigests past the project's row cap (research pass 42, H4a and H4b)", () => {
  it("reads every due profile — the cutoff in the query, in id order, a page at a time", async () => {
    // Seven opted-in profiles, two stamped this week; the database answers
    // three rows a response. One capped read had seen three, in no order.
    const profiles: Row[] = Array.from({ length: 7 }, (_, i) => ({
      id: `u${7 - i}`,
      email_weekly_digest: true,
      last_digest_at: i < 2 ? new Date(NOW - DAY).toISOString() : LAST_WEEK,
    }));
    profiles.push({ id: "u0", email_weekly_digest: false, last_digest_at: null });
    const db = dbWith({ profiles, maxRows: 3, team: { data: null, error: null } });
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(5);
    const reads = db.calls.filter((c) => c.table === "profiles" && c.op === "select");
    expect(reads.length).toBeGreaterThan(1);
    for (const r of reads) {
      expect(r.or).toBe(`last_digest_at.is.null,last_digest_at.lt.${new Date(NOW - 5 * DAY).toISOString()}`);
      expect(r.order).toBe("id");
    }
    // Every due profile was claimed; the two stamped this week and the one
    // opted out were not.
    const claimed = db.profiles.filter((p) => p.last_digest_at === new Date(NOW).toISOString()).map((p) => p.id);
    expect(claimed.sort()).toEqual(["u1", "u2", "u3", "u4", "u5"]);
  });

  it("counts one person's whole pipeline, a page at a time", async () => {
    const deals = Array.from({ length: 8 }, (_, i) => ({ ...deal({ name: `Open ${i}`, offers_due: i < 7 ? day(1) : null }) }));
    const db = dbWith({ deals, maxRows: 3 });
    expect(await runWeeklyDigests(fakeAdmin(db), { now: NOW, pauseMs: 0 })).toBe(1);
    expect(sent[0].subject).toBe("Your pipeline this week — 8 open deals");
    expect(sent[0].text).toContain("  and 1 more due by Sun, Oct 11 — open the pipeline");
    const reads = db.calls.filter((c) => c.table === "deals");
    expect(reads.length).toBeGreaterThan(1);
    expect(reads.every((r) => r.order === "id" && r.range)).toBe(true);
  });
});
