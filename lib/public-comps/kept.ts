// The sales an analyst leaves out of the readout, the way an appraiser's grid
// does: a recorded sale judged not comparable, of the wrong class, possibly
// one deed across parcels, or out for another reason. Pure — no I/O, no
// React — so the reading of a link and every recomputation are tested.
//
// Three rules:
//   - a sale left out is never deleted: it stays in the list, dimmed, with
//     its reason, and in the CSV with its reason in a column of its own;
//   - the readout's figures — the count, the medians, the range, the price
//     track, the $/SF bars — are recomputed through the SAME functions on the
//     kept set (core `compStats`, picture `priceTrack` and `perSfBars`), so
//     the floors (MEDIAN_FLOOR, CONFIDENT_FLOOR) apply to the kept count;
//   - on /comps the set lives in the page's address (`?out=`), so a shared
//     link shows the same set; a value nobody could have written is dropped,
//     never guessed at.

import type { PerSfBars, PriceTrack } from "./picture";

export type LeaveOutReason = "not_comparable" | "wrong_class" | "shared_deed" | "other";

/** The reasons offered, in the order the control lists them: the label the
 *  row says and the code a link carries. */
export const LEAVE_OUT_REASONS: ReadonlyArray<{ key: LeaveOutReason; label: string; code: string }> = [
  { key: "not_comparable", label: "Not comparable", code: "nc" },
  { key: "wrong_class", label: "Wrong class", code: "wc" },
  { key: "shared_deed", label: "Possible shared deed", code: "sd" },
  { key: "other", label: "Other", code: "ot" },
];

/** The /comps page's query parameter holding the sales left out: each one's
 *  pin number with its reason's code, "3nc,7wc". A deal's panel keeps the
 *  set for the visit only. */
export const SALES_OUT_PARAM = "out";

/** Sales left out, keyed by their place in the nearest-first list (the pin
 *  number less one). */
export type SalesOut = ReadonlyMap<number, LeaveOutReason>;

const BY_CODE = new Map(LEAVE_OUT_REASONS.map((r) => [r.code, r.key]));
const CODE_OF = new Map(LEAVE_OUT_REASONS.map((r) => [r.key, r.code]));
const LABEL_OF = new Map(LEAVE_OUT_REASONS.map((r) => [r.key, r.label]));

/** The label a row says for a reason: "Not comparable". */
export function leaveOutLabel(reason: LeaveOutReason): string {
  return LABEL_OF.get(reason) ?? "Other";
}

/** Whether a value is one of the reasons offered. */
export function isLeaveOutReason(v: unknown): v is LeaveOutReason {
  return typeof v === "string" && CODE_OF.has(v as LeaveOutReason);
}

const TOKEN = /^(\d{1,4})([a-z]{2})?$/;

/**
 * The sales a link leaves out, held to the list it is read against: each
 * comma-separated token is a pin number from 1 to `total`, with a reason's
 * code after it ("3nc"); a pin with no code reads as "Other", since the link
 * names no reason. A pin outside the list, a code no reason carries, or
 * anything else is dropped; a pin named twice keeps its first reason. A
 * repeated parameter reads its first.
 */
export function readSalesOut(raw: string | ReadonlyArray<string> | null | undefined, total: number): Map<number, LeaveOutReason> {
  const value = (Array.isArray(raw) ? raw[0] : raw) as string | null | undefined;
  const out = new Map<number, LeaveOutReason>();
  if (typeof value !== "string" || !(total > 0)) return out;
  for (const token of value.split(",")) {
    const m = TOKEN.exec(token.trim().toLowerCase());
    if (!m) continue;
    const pin = Number(m[1]);
    if (!Number.isInteger(pin) || pin < 1 || pin > total) continue;
    const reason = m[2] === undefined ? "other" : BY_CODE.get(m[2]);
    if (!reason || out.has(pin - 1)) continue;
    out.set(pin - 1, reason);
  }
  return out;
}

/** The set as a link writes it, pin order, every reason's code spelled:
 *  "3nc,7wc"; "" where nothing is left out. */
export function writeSalesOut(out: SalesOut): string {
  return [...out.entries()]
    .filter(([at, r]) => Number.isInteger(at) && at >= 0 && CODE_OF.has(r))
    .sort((a, b) => a[0] - b[0])
    .map(([at, r]) => `${at + 1}${CODE_OF.get(r)}`)
    .join(",");
}

/** The set with one sale kept again (`reason` null) or left out for a
 *  reason — a new map, the old one untouched. */
export function withSaleOut(out: SalesOut, at: number, reason: LeaveOutReason | null): Map<number, LeaveOutReason> {
  const next = new Map(out);
  if (reason === null) next.delete(at);
  else next.set(at, reason);
  return next;
}

/** The kept sales in the list's own order, and each one's place in the full
 *  nearest-first list (`at`), so a figure drawn on the kept set can be put
 *  back on its pin. */
export function keptSales<T>(comps: ReadonlyArray<T>, out: SalesOut): { comps: T[]; at: number[] } {
  const at = comps.map((_, i) => i).filter((i) => !out.has(i));
  return { comps: at.map((i) => comps[i]), at };
}

/** "4 of 6 sales kept"; "" where none is left out. */
export function keptLine(kept: number, total: number): string {
  if (kept >= total) return "";
  return `${kept} of ${total} ${total === 1 ? "sale" : "sales"} kept`;
}

/** What was left out, counted by reason in the control's order: "not
 *  comparable (2), wrong class (1)"; "" where none is. */
export function leftOutPhrase(out: SalesOut): string {
  const counts = new Map<LeaveOutReason, number>();
  for (const r of out.values()) counts.set(r, (counts.get(r) ?? 0) + 1);
  return LEAVE_OUT_REASONS.filter((r) => counts.has(r.key))
    .map((r) => `${r.label.toLowerCase()} (${counts.get(r.key)})`)
    .join(", ");
}

/** The $/SF bars drawn on the kept set, put back on the full list: a sale
 *  left out draws no bar. Null stays null. */
export function barsOnList(bars: PerSfBars | null, at: ReadonlyArray<number>, total: number): PerSfBars | null {
  if (!bars) return null;
  const shares: (number | null)[] = Array.from({ length: total }, () => null);
  at.forEach((i, k) => {
    shares[i] = bars.shares[k] ?? null;
  });
  return { ...bars, shares };
}

/** The price track drawn on the kept set, each dot carrying its own pin
 *  number again (priceTrack numbers the set it is given). */
export function trackOnList(track: PriceTrack | null, at: ReadonlyArray<number>): PriceTrack | null {
  if (!track) return null;
  return { ...track, dots: track.dots.map((d) => ({ ...d, n: (at[d.n - 1] ?? d.n - 1) + 1 })) };
}
