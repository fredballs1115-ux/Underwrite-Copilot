import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every Claude step is told today's date (lib/anthropic/today): no step
 * was, so "recent" sales, a lease's end and a figure's period were judged
 * from the model's training. The line rides last, after the document —
 * never in the system prompt or anything before the cached memorandum —
 * and each request reads it off the clock, which these tests fake.
 */

type Block = { type: string; text?: string; cache_control?: unknown };
type Request = { system?: unknown; messages: { role: string; content: string | Block[] }[] };
const requests: Request[] = [];

vi.mock("./client", () => {
  const record = vi.fn(async (body: Request) => {
    requests.push(body);
    throw new Error("recorded");
  });
  return { getAnthropic: () => ({ messages: { parse: record, create: record }, beta: { files: { delete: vi.fn() } } }) };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("./om-source", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./om-source")>();
  return {
    ...orig,
    omSourceWithPages: vi.fn(async () => ({ om: orig.omFromBuffer(Buffer.from("%PDF-1.4\n")), pages: 12 })),
    omSourceFor: vi.fn(async () => orig.omFromBuffer(Buffer.from("%PDF-1.4\n"))),
  };
});

import { todayLine, todayWords } from "./today";
import { ANALYST_SYSTEM } from "./prompts";
import { omFromBuffer } from "./om-source";
import { readFirstSignal } from "./first-signal";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { scrutinizeComps } from "./comps";
import { checkMarket } from "./market";
import { reconcileModel } from "./reconcile";
import { synthesizeVerdict } from "./verdict";
import { askDealQuestion } from "./ask";
import { findPublicComps } from "./comps-search";
import { extractBov } from "./bov-extract";
import { extractDocFacts } from "./model-extract";
import { reconcileDocs } from "./model-reconcile";
import { extractRentRoll, extractT12 } from "./actuals";

const NOW = new Date("2027-03-04T23:30:00Z");
const LINE = todayLine(NOW);

describe("today's date, as a step is told it", () => {
  it("names the day in ISO and in words, read in UTC", () => {
    expect(todayWords(new Date("2027-01-02T00:00:00Z"))).toBe("2027-01-02 (January 2, 2027)");
    expect(todayWords(NOW)).toBe("2027-03-04 (March 4, 2027)");
    // The last minute of a day is still that day.
    expect(todayWords(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31 (December 31, 2026)");
    expect(LINE).toBe(
      `Today's date is 2027-03-04 (March 4, 2027). Read "recent", "current", "this year" and every date the documents state against it — a date before it has passed, and a lease, a loan or a period that ends before it has ended — never against a date your training suggests.`,
    );
  });

  it("is never in the system prompt every step sends, whose prefix the cache keys on", () => {
    expect(ANALYST_SYSTEM).not.toMatch(/today's date/i);
    expect(ANALYST_SYSTEM).not.toMatch(/\b(19|20)\d\d\b/);
  });
});

describe("every step hands the model today's date after the document", () => {
  const om = omFromBuffer(Buffer.from("%PDF-1.4\n"));
  beforeEach(() => {
    requests.length = 0;
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  /** The one request a step made: its last block is the date line, read
   *  off the faked clock; no block before it names the date; the document
   *  (where the step reads one) comes before it; the system prompt is the
   *  shared one, untouched. */
  function sentOnce(opts: { document: "pdf" | "text" | null; system?: boolean }) {
    expect(requests.length).toBe(1);
    const req = requests[0];
    if (opts.system !== false) expect(req.system).toBe(ANALYST_SYSTEM);
    const content = req.messages[req.messages.length - 1].content as Block[];
    expect(Array.isArray(content)).toBe(true);
    const last = content[content.length - 1];
    expect(last).toEqual({ type: "text", text: LINE });
    for (const b of content.slice(0, -1)) expect(JSON.stringify(b)).not.toContain("Today's date");
    if (opts.document === "pdf") {
      const doc = content.findIndex((b) => b.type === "document");
      expect(doc).toBeGreaterThanOrEqual(0);
      expect(doc).toBeLessThan(content.length - 1);
    }
    if (opts.document === "text") {
      const doc = content.findIndex((b) => b.type === "text" && (b.text ?? "").startsWith("Document contents"));
      expect(doc).toBeGreaterThanOrEqual(0);
      expect(doc).toBeLessThan(content.length - 1);
    }
  }

  it("the screen's steps that read the memorandum", async () => {
    for (const step of [
      () => readFirstSignal(om, "multifamily"),
      () => extractTerms(om, "multifamily"),
      () => challengeAssumptions(om, "multifamily", "The rent roll disagrees."),
      () => scrutinizeComps(om, "What is being sold: the building."),
      () => checkMarket(om, "office", "A stabilized office.", "Unemployment 3.4%"),
      () => reconcileModel(om, { kind: "text", text: "Exit cap 5.5%" }, null),
    ]) {
      requests.length = 0;
      await expect(step()).rejects.toThrow("recorded");
      sentOnce({ document: "pdf" });
    }
  });

  it("the verdict, which reads the steps' results rather than the memorandum", async () => {
    await expect(
      synthesizeVerdict({ extraction: null, challenges: null, comps: null, reconciliation: null, market: null }),
    ).rejects.toThrow("recorded");
    sentOnce({ document: null });
  });

  it("Ask, the BOV read and the public-web comp search", async () => {
    await expect(askDealQuestion(Buffer.from("%PDF-1.4\n"), "What is the NOI?", null, { omRead: "pdf" })).rejects.toThrow("recorded");
    sentOnce({ document: "pdf" });
    requests.length = 0;
    await expect(extractBov(om)).rejects.toThrow("recorded");
    sentOnce({ document: "pdf" });
    requests.length = 0;
    await expect(findPublicComps({ name: "Oakwood", address: "1 Main St, Dallas, TX", market: "Dallas", assetClass: "multifamily" })).rejects.toThrow("recorded");
    sentOnce({ document: null, system: false });
    // "Recent" is said to be judged against the date the line gives.
    const prompt = (requests[0].messages[0].content as Block[])[0].text ?? "";
    expect(prompt).toContain("recent as of today's date, which is stated at the end");
  });

  it("the model generator and the actuals reads", async () => {
    await expect(extractDocFacts({ name: "t12.xlsx", kind: "t12", parsed: { kind: "text", text: "NOI 1,000,000" } })).rejects.toThrow("recorded");
    sentOnce({ document: "text" });
    requests.length = 0;
    await expect(reconcileDocs([], "10-year Treasury 4.20% (Mar 3, 2027; FRED)")).rejects.toThrow("recorded");
    sentOnce({ document: null });
    for (const step of [() => extractRentRoll({ kind: "text", text: "Unit 1 $1,200" }), () => extractT12({ kind: "text", text: "Rent 1,000,000" })]) {
      requests.length = 0;
      await expect(step()).rejects.toThrow("recorded");
      sentOnce({ document: "text" });
    }
  });
});

describe("no Claude step is left without the date", () => {
  it("every module that calls the model hands it the line", () => {
    const dir = join(process.cwd(), "lib/anthropic");
    const callers = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => ({ f, src: readFileSync(join(dir, f), "utf8") }))
      .filter(({ src }) => /\.messages\.(parse|create|stream)\(/.test(src));
    expect(callers.length).toBeGreaterThan(10);
    for (const { f, src } of callers) {
      const calls = src.match(/\.messages\.(parse|create|stream)\(/g)!.length;
      const lines = src.match(/text: todayLine\(\)/g)?.length ?? 0;
      expect(lines, f).toBe(calls);
    }
  });
});

describe("the nightly steward and the intel job tell the model the day too", () => {
  const src = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the steward's two re-verification prompts end on the day the run reads", () => {
    const steward = src("scripts/steward.mjs");
    expect(steward).toContain('import { todayLine } from "../lib/anthropic/today.ts"');
    // Both prompts close on the line, after the reply's format.
    expect(steward.match(/\n\$\{todayLine\(today\)\}`\s*\n\s*\);/g)?.length).toBe(2);
    // A source for a period that has ended confirms that period, not today.
    expect(steward).toContain("a source for a period that has ended confirms that period's figure, not today's");
    expect(steward).toContain("stated for a period that has ended is \"changed\"");
  });

  it("the intel job's scoring prompt does too", () => {
    const intel = src("scripts/daily-intel.mjs");
    expect(intel).toContain('import { todayLine } from "../lib/anthropic/today.ts"');
    expect(intel).toMatch(/\n\$\{todayLine\(\)\}`;/);
  });

  it("the intel job's searches name the run's own year, never a typed one", () => {
    const intel = src("scripts/daily-intel.mjs");
    const watches = intel.slice(intel.indexOf("const WATCHES = ["), intel.indexOf("];", intel.indexOf("const WATCHES = [")));
    expect(watches).toContain('{ sector: "multifamily"');
    // A year typed into a query asked for that year's market after it ended.
    expect(watches.match(/\b(19|20)\d\d\b/g)).toBeNull();
    expect(watches).toContain("investor market ${RUN_YEAR}`");
    expect(intel).toContain("const RUN_YEAR = new Date().getUTCFullYear();");
  });
});
