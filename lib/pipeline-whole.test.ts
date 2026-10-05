// The pipeline counts what it reads, and reads every deal (research pass 42,
// H1 and H2). One list read answers at most the project's max rows — 1,000
// unless the operator changed it — as a normal success, and the pipeline
// page and "the whole pipeline" workbook had each read their deals in one:
// past the cap, the newest 1,000, the count, the funnel, the verdict split,
// the CSV and the meeting's totals short with nothing saying the rest exist.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect() is not expected in a static render");
  },
}));
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return {
    createDeal: noop,
    createDealFromBatch: noop,
    createManualDeal: noop,
    updateManualFacts: noop,
    createSampleDeal: noop,
    setStage: noop,
    setOffersDue: noop,
    renameDeal: noop,
    deleteDeal: noop,
    rerunAnalysis: noop,
    replaceOm: noop,
    reconcileWithModel: noop,
    addDealNote: noop,
    deleteDealNote: noop,
    replacePicture: noop,
  };
});

/** A deals table larger than one response, answering as PostgREST does:
 *  each read at most `maxRows`, a count only where one is asked for. */
const db = {
  deals: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  maxRows: 3,
  countExtra: 0,
  reads: [] as string[],
  inSizes: [] as number[],
  failRead: null as string | null,
};
function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      let head = false;
      let counted = false;
      let ids: string[] | null = null;
      const q = {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          counted = opts?.count === "exact";
          head = !!opts?.head;
          return q;
        },
        order: () => q,
        in: (_col: string, list: string[]) => {
          ids = list;
          db.inSizes.push(list.length);
          return q;
        },
        limit: () => q,
        range: (from: number, to: number) => {
          range = [from, to];
          return q;
        },
        then<T>(resolve: (v: { data: unknown; count: number | null; error: unknown }) => T) {
          db.reads.push(table);
          const label = table === "deals" && ids ? "deals:ids" : table;
          if (db.failRead === label) return Promise.resolve({ data: null, count: null, error: { message: "timeout" } }).then(resolve);
          const source = table === "deals" ? db.deals : table === "analysis_jobs" ? db.jobs : [];
          const key = table === "analysis_jobs" ? "deal_id" : "id";
          const matched = ids ? source.filter((r) => ids!.includes(r[key] as string)) : source;
          const [from, to] = range;
          const rows = matched.slice(from, Math.min(to + 1, from + db.maxRows));
          return Promise.resolve({
            data: head ? null : rows,
            count: counted ? db.deals.length + db.countExtra : null,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => fakeClient() }));
vi.mock("@/lib/criteria-server", () => ({ getBuyBoxForDeal: async () => null }));
vi.mock("@/lib/teams", () => ({ getTeam: async () => null }));
vi.mock("@/lib/branding-server", () => ({ getActiveBranding: async () => ({ branding: null }) }));

import { GET } from "@/app/api/pipeline/export/route";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "./deal-allowance";
import { visibleText } from "./render-lint";

const deal = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  name: `Deal ${i}`,
  asset_class: "multifamily",
  created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600e3).toISOString(),
  verdict: i % 2 ? { verdict: "pass" } : null,
  extraction: null,
  first_signal: null,
  address: null,
  site_flags: null,
  user_id: "u1",
  team_id: null,
  stage: "screening",
  is_sample: false,
});

describe("the meeting workbook is the whole pipeline", () => {
  it("reads every deal past one response's rows, and its totals count them all", async () => {
    db.deals = Array.from({ length: 7 }, (_, i) => deal(i));
    db.countExtra = 0;
    const res = await GET(new Request("https://underwrite.example/api/pipeline/export"));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
    const ws = wb.getWorksheet("Pipeline")!;
    expect(String(ws.getCell("D2").value)).toMatch(/^7 deals · exported /);
    const names: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(2).value;
      if (typeof v === "string" && /^Deal \d$/.test(v)) names.push(v);
    });
    expect(names.sort()).toEqual(Array.from({ length: 7 }, (_, i) => `Deal ${i}`));
  });

  it("builds no workbook short of the deals its count says there are", async () => {
    db.deals = Array.from({ length: 7 }, (_, i) => deal(i));
    db.countExtra = 1;
    const res = await GET(new Request("https://underwrite.example/api/pipeline/export"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/deals?error=exportfail");
    db.countExtra = 0;
  });

  it("reads every deal's deadline and latest screen a hundred ids a request", async () => {
    db.deals = Array.from({ length: 250 }, (_, i) => ({ ...deal(i), offers_due: "2026-12-01" }));
    db.jobs = db.deals.map((d) => ({
      deal_id: d.id,
      status: "running",
      step: "challenge",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    db.maxRows = 120;
    db.inSizes = [];
    const res = await GET(new Request("https://underwrite.example/api/pipeline/export"));
    expect(res.status).toBe(200);
    expect(Math.max(...db.inSizes)).toBeLessThanOrEqual(100);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
    const ws = wb.getWorksheet("Pipeline")!;
    let due = 0;
    let rescreening = 0;
    ws.eachRow((row) => {
      if (row.getCell(13).value === "2026-12-01") due++;
      if (String(row.getCell(11).value).startsWith("Re-screening")) rescreening++;
    });
    // Every deal's deadline; every deal with a call reads as re-screening.
    expect(due).toBe(250);
    expect(rescreening).toBe(125);
    db.maxRows = 3;
    db.jobs = [];
  });

  it("builds no workbook where a deadline or a screen's state could not be read", async () => {
    db.deals = Array.from({ length: 7 }, (_, i) => deal(i));
    for (const fail of ["deals:ids", "analysis_jobs"]) {
      db.failRead = fail;
      const res = await GET(new Request("https://underwrite.example/api/pipeline/export"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/deals?error=exportfail");
    }
    db.failRead = null;
  });
});

describe("the pipeline page reads every deal and states the count", () => {
  it("reads a page at a time in a stable order, with the exact count beside it", () => {
    const page = readFileSync("app/(app)/deals/page.tsx", "utf8");
    const read = page.slice(page.indexOf("readAllResult<Row>("), page.indexOf("readAllResult<Row>(") + 700);
    expect(read).toContain('.order("created_at", { ascending: false })');
    expect(read).toContain('.order("id")');
    expect(read).toContain(".range(from, to)");
    expect(page).toContain('supabase.from("deals").select("id", { count: "exact", head: true })');
    expect(page).toContain("totalDeals={dealTotal ?? null}");
  });

  it("says the deals read, and both where the count is larger", () => {
    const card = (i: number): DealCard => ({
      id: `d${i}`,
      name: `Deal ${i}`,
      assetClass: "multifamily",
      createdAt: "2026-09-01T12:00:00Z",
      verdict: null,
      stage: "screening",
      addedBy: null,
      fit: null,
      score: null,
      mandateVerdict: null,
      market: "Dallas, TX",
      coveredMarket: null,
      offersDue: null,
      slots: { cap: null, price: null, yoc: null },
      jobStatus: null,
      hasAddress: false,
    });
    const render = (totalDeals: number | null) =>
      visibleText(
        renderToStaticMarkup(
          React.createElement(
            ToastProvider,
            null,
            React.createElement(Pipeline, {
              deals: [card(1), card(2), card(3)],
              errorMessage: null,
              notice: null,
              onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
              billing: { isPro: true, canCreateDeal: true, allowance: dealAllowance({ plan: "pro", dealCount: 3, team: null }) },
              todayIso: "2026-10-05",
              totalDeals,
            }),
          ),
        ),
      ).replace(/\s+/g, " ");
    expect(render(3)).toContain("3 deals");
    expect(render(null)).toContain("3 deals");
    expect(render(4)).toContain("3 of 4 deals");
  });

  it("says over the list a read beside the deals that failed", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(Pipeline, {
          deals: [],
          errorMessage: null,
          notice: null,
          onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
          billing: null,
          todayIso: "2026-10-05",
          readNote: "Part of the pipeline couldn’t be read just now: no offers-due date is shown. Refresh in a moment.",
        }),
      ),
    );
    expect(html).toContain('data-qa="pipeline-read-note"');
    expect(visibleText(html)).toContain("no offers-due date is shown");
  });
});
