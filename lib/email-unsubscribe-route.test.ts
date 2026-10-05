/**
 * The public route behind the digest's one-click unsubscribe, driven with
 * the database faked: a POST carrying `List-Unsubscribe=One-Click` turns
 * the ONE setting off for the ONE user its token names; a GET — a link
 * scanner's, or the reader's own click before confirming — changes nothing;
 * a bad or forged token answers 404 and changes nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  updates: [] as { table: string; patch: Record<string, unknown>; where: [string, unknown][] }[],
  fail: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (col: string, val: unknown) => {
          db.updates.push({ table, patch, where: [[col, val]] });
          return { error: db.fail ? { message: "connection reset" } : null };
        },
      }),
    }),
  }),
}));

import { GET, POST } from "@/app/api/email/unsubscribe/[token]/route";
import { emailUnsubscribeToken } from "./email-unsubscribe";
import { a11yIssues } from "./render-lint";

const USER = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  db.updates.length = 0;
  db.fail = false;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  vi.restoreAllMocks();
});

const at = (token: string) => `https://underwrite.example/api/email/unsubscribe/${token}`;
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const post = (token: string, body: BodyInit | null, type: string | null = "application/x-www-form-urlencoded") =>
  POST(new Request(at(token), { method: "POST", body, headers: type ? { "content-type": type } : {} }), ctx(token));

describe("the one-click unsubscribe route", () => {
  it("on the provider's POST, turns off the digest for the one user the token names, and nothing else", async () => {
    const token = emailUnsubscribeToken(USER, "digest")!;
    const res = await post(token, "List-Unsubscribe=One-Click");
    expect(res.status).toBe(200);
    expect(db.updates).toEqual([{ table: "profiles", patch: { email_weekly_digest: false }, where: [["id", USER]] }]);
    expect(await res.text()).toContain("You’re unsubscribed from the weekly pipeline digest");
  });

  it("takes the request as a multipart field too, as the confirm page's own form may send it", async () => {
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    const res = await POST(new Request(at(emailUnsubscribeToken(USER, "digest")!), { method: "POST", body: form }), ctx(emailUnsubscribeToken(USER, "digest")!));
    expect(res.status).toBe(200);
    expect(db.updates).toHaveLength(1);
  });

  it("on a GET changes nothing — a link scanner never unsubscribes anyone — and offers the button that POSTs", async () => {
    const token = emailUnsubscribeToken(USER, "digest")!;
    const res = await GET(new Request(at(token)), ctx(token));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(db.updates).toEqual([]);
    expect(html).toContain(`<form method="post" action="/api/email/unsubscribe/${token}">`);
    expect(html).toContain('<input type="hidden" name="List-Unsubscribe" value="One-Click">');
    expect(html).toContain('<button type="submit">Unsubscribe</button>');
    expect(a11yIssues(html)).toEqual([]);
  });

  it("answers 404 to a bad or forged token, and changes nothing", async () => {
    const token = emailUnsubscribeToken(USER, "digest")!;
    const forged = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    for (const t of ["not-a-token", forged, `${USER}.analysis.${token.slice(-22)}`]) {
      expect((await GET(new Request(at(t)), ctx(t))).status).toBe(404);
      expect((await post(t, "List-Unsubscribe=One-Click")).status).toBe(404);
    }
    // A key rotated since the email went out retires its link.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect((await post(token, "List-Unsubscribe=One-Click")).status).toBe(404);
    expect(db.updates).toEqual([]);
  });

  it("changes nothing on a POST that is not the one-click request", async () => {
    const token = emailUnsubscribeToken(USER, "digest")!;
    for (const body of ["", "List-Unsubscribe=Yes", "anything"]) {
      expect((await post(token, body)).status).toBe(400);
    }
    expect((await post(token, "x".repeat(5000))).status).toBe(413);
    expect(db.updates).toEqual([]);
  });

  it("is outside the proxy's matcher: no sign-in bounce and no host redirect a provider's POST would not follow", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    const matcher = /matcher: \[\s*"([^"]+)"/.exec(proxy)![1].replaceAll("\\\\", "\\");
    const runs = (path: string) => new RegExp(`^${matcher}$`).test(path);
    expect(runs("/deals")).toBe(true);
    expect(runs(`/api/email/unsubscribe/${emailUnsubscribeToken(USER, "digest")}`)).toBe(false);
  });

  it("says so, and changes nothing it claims, when the write fails", async () => {
    db.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(emailUnsubscribeToken(USER, "digest")!, "List-Unsubscribe=One-Click");
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("That didn’t go through");
  });
});
