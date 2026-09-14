/**
 * What a screen costs, measured rather than estimated.
 *
 * Every structured-output call reports four token meters back on its
 * response (uncached input, cache writes, cache reads, output). This ledger
 * collects them per run: `runAnalysis` opens one, `structured()` records into
 * whichever ledger is open on the async context, and the run writes the
 * ledger to its job row and one log line when it ends — so the cost of a
 * screen is a number on the operator's page, not arithmetic in a chat.
 *
 * The dollar figure is an estimate at list price from the table in
 * `models.ts` (the meters are the measurement; the prices are what was
 * published when the table was written). A model the table does not know
 * still has its tokens counted — its dollars are simply left blank.
 *
 * Pure apart from the async-context store: no I/O, no SDK import.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { CACHE_READ_FACTOR, CACHE_WRITE_FACTOR, PRICES } from "./models";

/** One model call's meters, as the response reported them. */
export interface CallUsage {
  /** what the call was, as the failure module names it ("Extraction", "The verdict") */
  what: string;
  /** the model that served it, as the response names it */
  model: string;
  /** uncached input tokens */
  input: number;
  /** tokens written to the prompt cache (billed at the write premium) */
  cacheWrite: number;
  /** tokens read back from the prompt cache (billed at a tenth) */
  cacheRead: number;
  output: number;
  /** wall-clock for the call, ms */
  ms: number;
}

export interface UsageLedger {
  calls: CallUsage[];
}

export interface UsageTotals {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

/** The ledger as it lands on the job row. */
export interface UsageSummary {
  calls: CallUsage[];
  totals: UsageTotals;
  /** list-price estimate in USD; null when any call's model is unpriced */
  usd: number | null;
  /** the models the price table does not know (their dollars are blank) */
  unpriced: string[];
  /** the whole run's wall-clock across its calls, ms */
  ms: number;
  /** when the ledger closed, ISO */
  at: string;
}

const store = new AsyncLocalStorage<UsageLedger>();

export const newLedger = (): UsageLedger => ({ calls: [] });

/** Run `fn` with `ledger` open: every structured call inside records into it. */
export function withUsageLedger<T>(ledger: UsageLedger, fn: () => Promise<T>): Promise<T> {
  return store.run(ledger, fn);
}

/** Record one call into the open ledger; a no-op when none is open (a call
 *  outside a screen — an Ask, a BOV read — costs the same but is not a
 *  screen's, so it is not counted as one). */
export function recordUsage(call: CallUsage): void {
  store.getStore()?.calls.push(call);
}

/** The shape a response carries, read defensively: a missing meter is 0. */
export function usageOfResponse(
  what: string,
  response: {
    model?: string | null;
    usage?: {
      input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
      output_tokens?: number | null;
    } | null;
  },
  ms: number,
): CallUsage | null {
  const u = response.usage;
  if (!u) return null;
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    what,
    model: response.model ?? "",
    input: n(u.input_tokens),
    cacheWrite: n(u.cache_creation_input_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    output: n(u.output_tokens),
    ms: Math.max(0, Math.round(ms)),
  };
}

/** The list price per million tokens for a model id, or null when unknown. */
export function priceFor(model: string): { input: number; output: number } | null {
  const id = model.trim().toLowerCase();
  if (!id) return null;
  for (const p of PRICES) if (id.startsWith(p.prefix)) return { input: p.input, output: p.output };
  return null;
}

/** One call's list-price cost in USD, or null when its model is unpriced. */
export function callCost(call: CallUsage): number | null {
  const p = priceFor(call.model);
  if (!p) return null;
  const perTok = 1 / 1_000_000;
  return (
    call.input * p.input * perTok +
    call.cacheWrite * p.input * CACHE_WRITE_FACTOR * perTok +
    call.cacheRead * p.input * CACHE_READ_FACTOR * perTok +
    call.output * p.output * perTok
  );
}

export function summarizeUsage(ledger: UsageLedger, at = new Date()): UsageSummary {
  const totals: UsageTotals = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const unpriced = new Set<string>();
  let usd = 0;
  let ms = 0;
  for (const c of ledger.calls) {
    totals.input += c.input;
    totals.cacheWrite += c.cacheWrite;
    totals.cacheRead += c.cacheRead;
    totals.output += c.output;
    ms += c.ms;
    const cost = callCost(c);
    if (cost == null) unpriced.add(c.model || "(unnamed model)");
    else usd += cost;
  }
  return {
    calls: ledger.calls.slice(),
    totals,
    usd: unpriced.size ? null : round2(usd),
    unpriced: [...unpriced],
    ms,
    at: at.toISOString(),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const fmt = (n: number) => n.toLocaleString("en-US");

/** The one log line a run writes when it ends. */
export function usageLogLine(dealId: string, s: UsageSummary): string {
  const dollars = s.usd != null ? `≈ $${s.usd.toFixed(2)} at list price` : `unpriced model: ${s.unpriced.join(", ")}`;
  return `[pipeline] screen usage for deal ${dealId}: ${s.calls.length} calls · in ${fmt(s.totals.input)} · cache write ${fmt(s.totals.cacheWrite)} · cache read ${fmt(s.totals.cacheRead)} · out ${fmt(s.totals.output)} · ${dollars}`;
}

/** The dollars of a summary split by the calls' names, in call order, for
 *  the operator's picture (null cost when a step's model is unpriced). */
export function costByStep(s: UsageSummary): { what: string; usd: number | null }[] {
  const order: string[] = [];
  const sum = new Map<string, number | null>();
  for (const c of s.calls) {
    if (!sum.has(c.what)) {
      order.push(c.what);
      sum.set(c.what, 0);
    }
    const cost = callCost(c);
    const prev = sum.get(c.what);
    sum.set(c.what, cost == null || prev == null ? null : prev + cost);
  }
  return order.map((what) => ({ what, usd: sum.get(what) == null ? null : round2(sum.get(what) as number) }));
}

/** The median of a list of dollar figures, or null when empty. */
export function medianUsd(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return round2(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2);
}
