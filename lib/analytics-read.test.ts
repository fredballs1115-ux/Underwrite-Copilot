// Analytics reads every screen, newest first, and says whose they are
// (research pass 42, H3). It had read the OLDEST 300 screened deals — past
// them every newer screen was missing from every figure — and called a
// team's deals "an OM you ran".
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect() is not expected here");
  },
}));

const db = { rows: [] as Record<string, unknown>[], maxRows: 3, orders: [] as string[] };
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "u1" }),
  createSupabaseServerClient: async () => ({
    from() {
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      let desc = false;
      const q = {
        select: () => q,
        not: () => q,
        limit: () => q,
        order: (col: string, opts?: { ascending?: boolean }) => {
          db.orders.push(`${col}:${opts?.ascending === false ? "desc" : "asc"}`);
          if (col === "created_at") desc = opts?.ascending === false;
          return q;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          const sorted = [...db.rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) * (desc ? -1 : 1));
          const [from, to] = range;
          return Promise.resolve({ data: sorted.slice(from, Math.min(to + 1, from + db.maxRows)), error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));

import AnalyticsPage from "@/app/(app)/analytics/page";
import { analyticsScope } from "./analytics";
import { visibleText } from "./render-lint";

const row = (i: number, user: string) => ({
  id: `d${i}`,
  name: `Deal ${i}`,
  asset_class: "multifamily",
  created_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
  is_sample: false,
  stage: "screening",
  verdict: { verdict: "pass" },
  user_id: user,
  first_signal: null,
  extraction: {
    dealName: `Deal ${i}`,
    assetClass: "multifamily",
    market: "Dallas, TX",
    metrics: [
      { label: "Asking price", value: "$10,000,000", flagged: false, page: "p. 2" },
      { label: "Going-in cap rate", value: "5.50%", flagged: false, page: "p. 2" },
      { label: "Units", value: "100", flagged: false, page: "p. 2" },
    ],
  },
});

describe("analytics — every screen, newest first, and whose", () => {
  it("counts every screened deal past one response's rows, reading newest first", async () => {
    db.rows = [...Array.from({ length: 2 }, (_, i) => row(i, "u1")), ...Array.from({ length: 5 }, (_, i) => row(10 + i, "mate"))];
    db.orders = [];
    const html = renderToStaticMarkup(await AnalyticsPage());
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toMatch(/Deals screened 7\b/);
    expect(db.orders).toContain("created_at:desc");
    expect(text).toContain("What the screens in your pipeline add up to — 2 of yours and 5 of your team's");
    expect(text).not.toContain("an OM you ran");
  });

  it("says the reader's own where no teammate's screen is among them", async () => {
    db.rows = Array.from({ length: 4 }, (_, i) => row(i, "u1"));
    const text = visibleText(renderToStaticMarkup(await AnalyticsPage())).replace(/\s+/g, " ");
    expect(text).toContain("What your own screens add up to");
    expect(analyticsScope(4, 0)).toBe("What your own screens add up to — every figure below was extracted from an OM you screened, never restated.");
  });
});
