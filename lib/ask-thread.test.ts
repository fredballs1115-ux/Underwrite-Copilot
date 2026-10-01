/**
 * Ask's thread against the memorandum it was asked of.
 *
 *   - A cited page is held to the deck the answer read (lib/facts' absolute
 *     rule, `locatedPage`): one past the end, or one no length could
 *     validate, is never kept.
 *   - Each answer is stamped with the fingerprint of the deck it read, and a
 *     replaced OM marks the thread (the deal actions' `replaceOm`, through
 *     the same append-only RPC — migration 0036 forbids rewriting it), so an
 *     answer asked of the earlier memorandum says so, its page chips
 *     unlinked; the current memorandum's chips open the OM at their page.
 *
 * The action runs against a fake database and fakes of the storage read and
 * the model call.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEAL = "22222222-2222-4222-8222-222222222222";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OM_BYTES = Buffer.from("%PDF-1.7 the deck as uploaded");

const db = vi.hoisted(() => ({
  deal: {} as Record<string, unknown>,
  /** what the append RPC was handed */
  appended: [] as unknown[],
  /** the RPC fails (a database before 0017), so the fallback writes */
  rpcFails: false,
  updates: [] as unknown[],
  /** what the model call returns */
  answer: {
    answer: "",
    cites: [] as { page: string; note: string }[],
    pages: null as number | null,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing", () => ({ isPro: async () => true }));
vi.mock("@/lib/storage", () => ({ downloadOmPdf: async () => OM_BYTES }));
vi.mock("@/lib/anthropic/ask", () => ({
  askDealQuestion: async () => db.answer,
  dealContextFor: () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    rpc: async (_fn: string, args: { p_entry: unknown }) => {
      if (db.rpcFails) return { error: { message: "function append_deal_qa does not exist" } };
      db.appended.push(args.p_entry);
      return { error: null };
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        update: (patch: unknown) => {
          db.updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
        maybeSingle: async () => ({ data: db.deal, error: null }),
      };
      return q;
    },
  }),
}));

import { askDeal } from "@/app/(app)/deals/[id]/ask-actions";
import { AskPanel } from "@/app/(app)/deals/[id]/ask-panel";
import { OM_REPLACED, parseDealQa, type AskEntry } from "./deals";
import { omFingerprint } from "./om-fingerprint";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const ask = (question: string) => {
  const fd = new FormData();
  fd.set("dealId", DEAL);
  fd.set("question", question);
  return askDeal(null, fd);
};

beforeEach(() => {
  db.deal = { id: DEAL, om_storage_path: `${OWNER}/${DEAL}.pdf`, is_sample: false, qa: [], extraction: null };
  db.appended.length = 0;
  db.updates.length = 0;
  db.rpcFails = false;
  db.answer = {
    answer: "The OM states a 4.25% coupon on p. 12.",
    cites: [
      { page: "p. 12", note: "the loan terms" },
      { page: "p. 412", note: "a page past the deck's end" },
      { page: "the rent roll", note: "no page at all" },
    ],
    pages: 40,
  };
});

describe("askDeal — what an answer keeps", () => {
  it("drops a cited page outside the deck, and stamps the answer with the memorandum it read", async () => {
    expect(await ask("What is the coupon on the loan?")).toEqual({ ok: true });
    expect(db.appended).toHaveLength(1);
    const entry = db.appended[0] as AskEntry;
    expect(entry.cites).toEqual([{ page: "p. 12", note: "the loan terms" }]);
    expect(entry.om).toBe(omFingerprint(OM_BYTES));
    expect(entry.om).toMatch(/^[0-9a-f]{16}$/);
  });

  it("keeps no page at all where the read could not say how long the deck is", async () => {
    db.answer.pages = null;
    await ask("What is the coupon on the loan?");
    expect((db.appended[0] as AskEntry).cites).toEqual([]);
    // The answer itself is kept.
    expect((db.appended[0] as AskEntry).answer).toMatch(/4\.25% coupon/);
  });

  it("the fallback writes the thread as stored, a replaced OM's marker and all, and adds the answer after it", async () => {
    const marker = { at: "2026-09-20T00:00:00.000Z", event: OM_REPLACED, om: "0123456789abcdef" };
    const old = { at: "2026-09-01T00:00:00.000Z", q: "Who is the seller?", answer: "The receiver.", cites: [] };
    db.deal.qa = [old, marker];
    db.rpcFails = true;
    await ask("What is the coupon on the loan?");
    const written = (db.updates[0] as { qa: unknown[] }).qa;
    expect(written.slice(0, 2)).toEqual([old, marker]);
    expect(written).toHaveLength(3);
  });

  it("counts questions toward the cap, never a replaced OM's markers", async () => {
    const q = (i: number) => ({ at: `2026-09-01T00:00:${String(i).padStart(2, "0")}.000Z`, q: `Question ${i}?`, answer: "a", cites: [] });
    db.deal.qa = [...Array.from({ length: 24 }, (_, i) => q(i)), { at: "2026-09-02T00:00:00.000Z", event: OM_REPLACED, om: "ab" }];
    // 24 questions and a marker: the 25th question is still allowed.
    expect(await ask("One more question?")).toEqual({ ok: true });
  });
});

describe("parseDealQa — which memorandum each answer was asked of", () => {
  const A = "aaaaaaaaaaaaaaaa";
  const B = "bbbbbbbbbbbbbbbb";
  const entry = (q: string, om?: string) => ({ at: "2026-09-01T00:00:00.000Z", q, answer: "…", cites: [], ...(om ? { om } : {}) });
  const replaced = (om: string) => ({ at: "2026-09-10T00:00:00.000Z", event: OM_REPLACED, om });

  it("with no marker, every answer is the current memorandum's — stamped or saved before the stamp", () => {
    const qa = parseDealQa([entry("old, unstamped"), entry("stamped", A)]);
    expect(qa.map((e) => e.earlier)).toEqual([false, false]);
  });

  it("an answer before a marker was asked of the earlier memorandum; one after it, of the current", () => {
    const qa = parseDealQa([entry("unstamped, before"), entry("stamped, before", A), replaced(B), entry("after", B)]);
    expect(qa.map((e) => e.q)).toEqual(["unstamped, before", "stamped, before", "after"]);
    expect(qa.map((e) => e.earlier)).toEqual([true, true, false]);
  });

  it("goes by the stamp where there is one: an answer to the old deck landing after the marker is still the old deck's", () => {
    const qa = parseDealQa([replaced(B), entry("asked of the old deck, saved late", A), entry("asked of the new deck", B)]);
    expect(qa.map((e) => e.earlier)).toEqual([true, false]);
  });

  it("the same deck uploaded again keeps its stamped answers current", () => {
    const qa = parseDealQa([entry("stamped", A), replaced(A)]);
    expect(qa[0].earlier).toBe(false);
  });
});

describe("AskPanel — page chips open the OM only for the memorandum the deal holds now", () => {
  const OM_URL = `/api/deals/${DEAL}/om`;
  const qa = parseDealQa([
    { at: "2026-09-01T00:00:00.000Z", q: "What was the asking price?", answer: "$20M.", cites: [{ page: "p. 3", note: "the cover" }], om: "aaaaaaaaaaaaaaaa" },
    { at: "2026-09-10T00:00:00.000Z", event: OM_REPLACED, om: "bbbbbbbbbbbbbbbb" },
    { at: "2026-09-11T00:00:00.000Z", q: "What is the asking price now?", answer: "$18M.", cites: [{ page: "p. 4", note: "the cover" }], om: "bbbbbbbbbbbbbbbb" },
  ]);
  const html = renderToStaticMarkup(
    React.createElement(AskPanel, { dealId: DEAL, qa, hasOm: true, isSample: false, isPro: true, omUrl: OM_URL }),
  );

  it("says which answer was asked of the earlier memorandum, and links only the current one's pages", () => {
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text.split("asked of the earlier memorandum").length - 1).toBe(1);
    expect(html).toContain(`href="${OM_URL}#page=4"`);
    expect(html).not.toContain(`href="${OM_URL}#page=3"`);
    // The earlier answer's page still shows, as the earlier deck's, unlinked.
    expect(html).toMatch(/<span[^>]*title="the cover"[^>]*>p\. 3<\/span>/);
  });

  it("links nothing where the deal has no OM to open", () => {
    const bare = renderToStaticMarkup(
      React.createElement(AskPanel, { dealId: DEAL, qa, hasOm: false, isSample: false, isPro: true, omUrl: null }),
    );
    expect(bare).not.toMatch(/#page=/);
  });
});
