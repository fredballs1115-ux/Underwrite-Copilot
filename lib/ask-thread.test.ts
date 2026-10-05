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
  /** what the model call was handed: the deal's context and the options */
  context: undefined as string | null | undefined,
  opts: undefined as Record<string, unknown> | undefined,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing", () => ({ isPro: async () => true }));
vi.mock("@/lib/storage", () => ({ downloadOmPdf: async () => OM_BYTES }));
vi.mock("@/lib/anthropic/ask", async () => {
  // The model call is faked; the deal's context is the real reader's, so a
  // test reads what Ask is told.
  const { dealContextFor } = await import("@/lib/deal-context");
  return {
    askDealQuestion: async (_pdf: Buffer, _q: string, context?: string | null, opts?: Record<string, unknown>) => {
      db.context = context;
      db.opts = opts;
      return db.answer;
    },
    dealContextFor,
  };
});
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
import { OM_REPLACED, memorandumReplacedSince, parseDealQa, type AskEntry } from "./deals";
import { omFingerprint } from "./om-fingerprint";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { ASK_QUESTION_CAP } from "./ask-cap";
import { readFileSync } from "node:fs";

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
  db.context = undefined;
  db.opts = undefined;
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
    // Who asked, by user id — the stable identity, as the decision log keeps it.
    expect(entry.by).toBe(OWNER);
  });

  it("hands the question the length the screen stored, which a PDF read holds its pages to (audit c66)", async () => {
    db.deal = { ...db.deal, extraction: { dealName: "x", metrics: [], totalPages: 40, omRead: "pdf" } };
    await ask("What is the coupon on the loan?");
    expect(db.opts?.totalPages).toBe(40);
    expect(db.opts?.omRead).toBe("pdf");
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

  it("at the cap, says so and hands the typed question back to the box, as every other refusal does", async () => {
    const q = (i: number) => ({ at: `2026-09-01T00:00:${String(i).padStart(2, "0")}.000Z`, q: `Question ${i}?`, answer: "a", cites: [] });
    db.deal.qa = Array.from({ length: 25 }, (_, i) => q(i));
    const state = await ask("What does the OM say about the roof?");
    expect(state?.error).toMatch(/reached its 25-question cap/);
    expect(state?.question).toBe("What does the OM say about the roof?");
    expect(db.appended).toEqual([]);
  });

  it("counts questions toward the cap, never a replaced OM's markers", async () => {
    const q = (i: number) => ({ at: `2026-09-01T00:00:${String(i).padStart(2, "0")}.000Z`, q: `Question ${i}?`, answer: "a", cites: [] });
    db.deal.qa = [...Array.from({ length: 24 }, (_, i) => q(i)), { at: "2026-09-02T00:00:00.000Z", event: OM_REPLACED, om: "ab" }];
    // 24 questions and a marker: the 25th question is still allowed.
    expect(await ask("One more question?")).toEqual({ ok: true });
  });

  it("counts only the questions asked of the memorandum the deal holds now (audit c66)", async () => {
    // Twenty-five answers asked of the earlier deck, then its replacement:
    // the reissued deck has been asked nothing, and the refusal had told its
    // reader "the thread above should have it covered".
    const EARLIER = "aaaaaaaaaaaaaaaa";
    const NOW = omFingerprint(OM_BYTES);
    const answer = (i: number, om: string) => ({ at: `2026-09-01T00:00:${String(i).padStart(2, "0")}.000Z`, q: `Question ${i}?`, answer: "a", cites: [], om });
    const replaced = { at: "2026-10-01T00:00:00.000Z", event: OM_REPLACED, om: NOW };
    const earlier = Array.from({ length: 25 }, (_, i) => answer(i, EARLIER));
    db.deal.qa = [...earlier, replaced];
    expect(parseDealQa(db.deal.qa).filter((e) => e.earlier)).toHaveLength(25);
    expect(await ask("What changed in the reissued deck?")).toEqual({ ok: true });

    // Twenty-five of the current deck's own reach its cap, said of it.
    db.appended.length = 0;
    db.deal.qa = [...earlier, replaced, ...Array.from({ length: 25 }, (_, i) => answer(i, NOW))];
    const state = await ask("And the roof?");
    expect(state?.error).toBe("This memorandum reached its 25-question cap — the thread above should have it covered.");
    expect(db.appended).toEqual([]);
  });
});

describe("askDeal — what Ask is told about the deal, as the screen's steps are (audit c66)", () => {
  // An office whose own words name no plan — read alone, stabilized — and a
  // first signal that calls it a conversion: the deal page and every screen
  // step read a conversion, and Ask had read "Stabilized".
  const extraction = {
    dealName: "1400 Market",
    assetClass: "office",
    market: "Center City, Philadelphia, PA",
    metrics: [
      { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 3" },
      { label: "In-place NOI", value: "$1,100,000", flagged: false, page: "p. 9" },
    ],
  };
  const signal = {
    dealName: "1400 Market",
    assetClass: "office",
    market: "Center City, Philadelphia, PA",
    askPrice: "$20,000,000",
    size: "182,400 SF",
    goingInCap: "",
    perUnit: "",
    take: "An office-to-residential conversion — check the construction budget before the price.",
  };
  const ADDRESS = "1400 Market St, Philadelphia, PA 19102";
  const flags = (label: string, status = "ok", pointIsBuilding = true) => ({
    status,
    subject: { lat: 39.95, lng: -75.16, label },
    tractGeoid: null,
    opportunityZone: null,
    flood: { zone: "AE", subtype: null, isHighRisk: true },
    pointIsBuilding,
    retrievedAt: "2026-10-01T00:00:00.000Z",
    note: "",
  });

  it("reads the deal's kind with its first signal", async () => {
    db.deal = { ...db.deal, extraction, first_signal: signal };
    await ask("What does the construction budget cover?");
    expect(db.context).toContain("Deal type: Conversion");
    // Without the signal the same extraction reads as it did.
    db.deal = { ...db.deal, first_signal: null };
    await ask("What does the construction budget cover?");
    expect(db.context).toContain("Deal type: Stabilized");
  });

  it("carries FEMA's zone where the lookup answered for the address the deal has now", async () => {
    db.deal = { ...db.deal, extraction, first_signal: null, site_flags: flags(ADDRESS), address: { label: ADDRESS } };
    await ask("Is it in a flood zone?");
    expect(db.context).toContain("FEMA's flood map puts the building's point in Zone AE, a Special Flood Hazard Area");
    // A lookup made at a point placed only to the street is the address's
    // point, as the flood view says it (the audit's L10).
    db.deal = { ...db.deal, site_flags: flags(ADDRESS, "ok", false) };
    await ask("Is it in a flood zone?");
    expect(db.context).toContain("FEMA's flood map puts the point the address was placed at in Zone AE");
    // A lookup made for the address before an edit is the old building's,
    // and one still pending has said nothing: neither is read.
    for (const stale of [flags("500 Elm St, Philadelphia, PA 19103"), flags(ADDRESS, "pending")]) {
      db.deal = { ...db.deal, site_flags: stale };
      await ask("Is it in a flood zone?");
      expect(db.context ?? "").not.toContain("Zone AE");
    }
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

describe("memorandumReplacedSince — whether the thread says the deck changed after a moment", () => {
  const A = "aaaaaaaaaaaaaaaa";
  const B = "bbbbbbbbbbbbbbbb";
  const marker = (at: string, om: string) => ({ at, event: OM_REPLACED, om });
  const question = { at: "2026-10-03T00:00:00.000Z", q: "?", answer: "…", cites: [], om: A };
  // The deal's last screen finished on Oct 2, 2026 (its verdict's generatedAt).
  const LAST_SCREEN = "2026-10-02T12:00:00.000Z";

  it("no marker, or none newer than the last screen and naming these bytes: not replaced since", () => {
    expect(memorandumReplacedSince(undefined, LAST_SCREEN, A)).toBe(false);
    expect(memorandumReplacedSince([question], LAST_SCREEN, A)).toBe(false);
    expect(memorandumReplacedSince([marker("2026-10-01T09:00:00.000Z", A), question], LAST_SCREEN, A)).toBe(false);
    // …and with no screen ever finished, a thread with no marker says nothing either.
    expect(memorandumReplacedSince([question], null, A)).toBe(false);
  });

  it("a marker newer than the last screen: replaced since", () => {
    expect(memorandumReplacedSince([marker("2026-10-03T08:00:00.000Z", A)], LAST_SCREEN, A)).toBe(true);
    // Any marker, where no screen is known to have finished since.
    expect(memorandumReplacedSince([marker("2026-10-01T09:00:00.000Z", A)], null, A)).toBe(true);
    expect(memorandumReplacedSince([marker("2026-10-01T09:00:00.000Z", A)], "not a date", A)).toBe(true);
  });

  it("the newest marker naming other bytes than the ones being read: changed after it, so since", () => {
    expect(memorandumReplacedSince([marker("2026-10-01T09:00:00.000Z", B)], LAST_SCREEN, A)).toBe(true);
    expect(
      memorandumReplacedSince([marker("2026-09-01T09:00:00.000Z", B), marker("2026-10-01T09:00:00.000Z", A)], LAST_SCREEN, A),
    ).toBe(false);
  });

  it("a marker whose moment does not read cannot be placed before the last screen", () => {
    expect(memorandumReplacedSince([{ event: OM_REPLACED, om: A }], LAST_SCREEN, A)).toBe(true);
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

  it("says the questions asked of the memorandum it holds now, against the cap, before the cap refuses one (research pass 42)", () => {
    // the earlier memorandum's answer counts toward that deck's cap, not this one's
    expect(visibleText(html)).toContain("1 of 25 questions asked of this memorandum");
    expect(ASK_QUESTION_CAP).toBe(25);
    expect(readFileSync("app/(app)/deals/[id]/ask-actions.ts", "utf8")).toContain("const MAX_QUESTIONS = ASK_QUESTION_CAP;");
  });

  it("promises no answer time: nothing measures one", () => {
    expect(visibleText(html)).toMatch(/Answers cite the OM’s pages\./);
    expect(visibleText(html)).not.toMatch(/second|minute/);
  });

  it("links nothing where the deal has no OM to open", () => {
    const bare = renderToStaticMarkup(
      React.createElement(AskPanel, { dealId: DEAL, qa, hasOm: false, isSample: false, isPro: true, omUrl: null }),
    );
    expect(bare).not.toMatch(/#page=/);
  });
});

describe("AskPanel — on the sample deal, said with the plan it needs (research pass 32)", () => {
  const sample = (isPro: boolean) =>
    visibleText(
      renderToStaticMarkup(
        React.createElement(AskPanel, { dealId: DEAL, qa: [], hasOm: false, isSample: true, isPro, omUrl: null }),
      ),
    );

  it("tells a free reader Ask is Pro on a real deal, never to ask away", () => {
    expect(sample(false)).toContain("On Pro, you can put questions to a real deal's memorandum.");
    expect(sample(false)).not.toMatch(/ask away/);
    expect(sample(true)).toContain("upload a real deal and ask away");
  });
});

describe("AskPanel — who asked, on a team deal", () => {
  const MATE = "33333333-3333-4333-8333-333333333333";
  const GONE = "44444444-4444-4444-8444-444444444444";
  const asked = (q: string, by?: string) => ({ at: "2026-09-01T00:00:00.000Z", q, answer: "…", cites: [], ...(by ? { by } : {}) });
  const qa = parseDealQa([
    asked("Mine?", OWNER),
    asked("A teammate's?", MATE),
    asked("A former teammate's?", GONE),
    asked("Asked before askers were recorded?"),
  ]);
  const panel = (askers: { me: string | null; names: Record<string, string> } | null) =>
    visibleText(
      renderToStaticMarkup(
        React.createElement(AskPanel, { dealId: DEAL, qa, hasOm: true, isSample: false, isPro: true, askers }),
      ),
    );

  it("names the reader as you and a teammate by name, and no one whose name is not the reader's to see", () => {
    const text = panel({ me: OWNER, names: { [MATE]: "Jordan Lee" } });
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/Mine\?\s*Sep 1 · asked by you/);
    expect(text).toMatch(/A teammate's\?\s*Sep 1 · asked by Jordan Lee/);
    expect(text.match(/asked by/g)).toHaveLength(2);
  });

  it("names no one on a personal deal", () => {
    expect(panel(null)).not.toMatch(/asked by/);
  });
});
