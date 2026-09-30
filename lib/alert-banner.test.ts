/**
 * The workspace-wide regulatory alert banner renders rows written outside the
 * request: only a real web URL ever becomes a link, and the headline is text.
 * Its Dismiss is this browser's alone — a cookie, never the shared row — and
 * the shared `dismissed_at` column, which any signed-in user may write, is
 * not read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const rows: Record<string, unknown>[] = [];
const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  cookie: undefined as string | undefined,
  sets: [] as { name: string; value: string; options: Record<string, unknown> }[],
  writes: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "uc_dismissed_alerts" && state.cookie !== undefined ? { name, value: state.cookie } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.sets.push({ name, value, options });
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    from(table: string) {
      const q = {
        select: (...a: unknown[]) => (state.calls.push(["select", table, ...a]), q),
        is: (...a: unknown[]) => (state.calls.push(["is", ...a]), q),
        gte: (...a: unknown[]) => (state.calls.push(["gte", ...a]), q),
        order: (...a: unknown[]) => (state.calls.push(["order", ...a]), q),
        limit: (...a: unknown[]) => (state.calls.push(["limit", ...a]), q),
        update: () => {
          state.writes += 1;
          return q;
        },
        eq: () => q,
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client, getCurrentUser: async () => ({ id: "u1" }) };
});

import { RegulatoryAlertBanner } from "@/app/(app)/regulatory-alert-banner";

async function html(): Promise<string> {
  const el = await RegulatoryAlertBanner();
  return renderToStaticMarkup(el as React.ReactElement);
}

/** The Dismiss form's server action, found in the rendered tree. */
function formAction(node: ReactNode): ((fd: FormData) => Promise<void>) | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const got = formAction(n);
      if (got) return got;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{ action?: unknown; children?: ReactNode }>;
  if (el.type === "form" && typeof el.props.action === "function") return el.props.action as (fd: FormData) => Promise<void>;
  return formAction(el.props.children);
}

const A = "0a000000-0000-4000-8000-000000000001";
const B = "0b000000-0000-4000-8000-000000000002";
const C = "0c000000-0000-4000-8000-000000000003";

beforeEach(() => {
  rows.length = 0;
  state.calls.length = 0;
  state.cookie = undefined;
  state.sets.length = 0;
  state.writes = 0;
});

describe("RegulatoryAlertBanner", () => {
  it("drops a non-web URL and keeps the headline as text", async () => {
    rows.push({
      id: "a1",
      rule_id: "nyc-ll97",
      headline: "URGENT: re-verify <b>your</b> account",
      url: "javascript:alert(document.cookie)",
      detail: null,
    });
    const out = await html();
    // (React's own server-action form placeholder is a javascript: action;
    // the test is about the headline link.)
    expect(out).not.toContain('href="javascript:');
    expect(out).not.toContain("<a ");
    expect(out).toContain("URGENT: re-verify &lt;b&gt;your&lt;/b&gt; account");
  });

  it("keeps a real web URL as the link", async () => {
    rows.push({ id: "a2", rule_id: null, headline: "LL97 amendment filed", url: "https://legistar.council.nyc.gov/x", detail: null });
    const out = await html();
    expect(out).toContain('href="https://legistar.council.nyc.gov/x"');
    expect(out).toContain("LL97 amendment filed");
  });

  it("renders nothing without open alerts", async () => {
    expect(await RegulatoryAlertBanner()).toBeNull();
  });

  it("reads the last 30 days' alerts and never the shared dismissed_at column", async () => {
    // A row someone marked dismissed in the shared column still shows: that
    // column is anyone's to write.
    rows.push({ id: A, rule_id: null, headline: "Rule A", url: null, detail: null, dismissed_at: "2026-09-29T00:00:00Z" });
    const before = Date.now();
    expect(await html()).toContain("Rule A");
    expect(state.calls.some((c) => c[0] === "is")).toBe(false);
    const gte = state.calls.find((c) => c[0] === "gte")!;
    expect(gte[1]).toBe("detected_at");
    const since = Date.parse(gte[2] as string);
    expect(before - since).toBeGreaterThanOrEqual(30 * 86_400_000 - 1_000);
    expect(before - since).toBeLessThanOrEqual(30 * 86_400_000 + 1_000);
  });

  it("hides only the alerts this browser dismissed, still showing up to three", async () => {
    const D = "0d000000-0000-4000-8000-000000000004";
    for (const [id, h] of [[A, "Rule A"], [B, "Rule B"], [C, "Rule C"], [D, "Rule D"]]) {
      rows.push({ id, rule_id: null, headline: h, url: null, detail: null });
    }
    state.cookie = `${B},not-an-id`;
    const out = await html();
    expect(out).not.toContain("Rule B");
    expect(out).toContain("Rule A");
    expect(out).toContain("Rule C");
    expect(out).toContain("Rule D");
    // Enough rows asked for that three undismissed ones remain.
    expect(state.calls.find((c) => c[0] === "limit")?.[1]).toBe(4);
  });

  it("dismisses into this browser's cookie, and writes nothing shared", async () => {
    rows.push({ id: A, rule_id: null, headline: "Rule A", url: null, detail: null });
    state.cookie = C;
    const action = formAction(await RegulatoryAlertBanner())!;
    expect(action).toBeTypeOf("function");
    const fd = new FormData();
    fd.set("id", A);
    await action(fd);
    expect(state.writes).toBe(0);
    expect(state.sets).toHaveLength(1);
    const set = state.sets[0];
    expect(set.name).toBe("uc_dismissed_alerts");
    expect(set.value).toBe(`${A},${C}`);
    expect(set.options).toMatchObject({ path: "/", httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 });
    // An id that is not an alert's sets nothing.
    fd.set("id", "a1; Path=/");
    await action(fd);
    expect(state.sets).toHaveLength(1);
  });
});
