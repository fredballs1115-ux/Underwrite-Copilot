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
//   - on /comps the set lives in the page's address (`?out=`), each sale named
//     by its own identity (`saleKey`: its day, price and address), never by
//     its pin — the pull is fetched again on every load, its window counted
//     back from that day, so a pin number can name another sale by the time a
//     link is opened. A reload or a shared link leaves out the same sales
//     where they are still in the list; one that has left the window, and a
//     value nobody could have written (an old pin-number link included), is
//     dropped, never guessed at.

import type { RecordComp } from "./core";
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
 *  identity (`saleKey`) with its reason's code, "k3f9a2x-nc,0p7d1qa-wc". A
 *  deal's panel keeps the set for the visit only. */
export const SALES_OUT_PARAM = "out";

/** Sales left out, keyed by their place in the nearest-first list as it was
 *  read this load (the pin number less one). */
export type SalesOut = ReadonlyMap<number, LeaveOutReason>;

/** What `saleKey` reads of a sale. */
export type SaleIdentity = Pick<RecordComp, "saleDate" | "price" | "address">;

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

/** A key's length: 32 bits in base 36, padded. */
const KEY_LENGTH = 7;

/**
 * A sale's identity in a link: a short hash (FNV-1a, 32 bits, base 36, seven
 * characters) of its day, its whole-dollar price and its address (trimmed,
 * spaces collapsed, upper case) — what the record states of the sale, so the
 * same sale keys alike on every pull whatever its place in the list. Two rows
 * of one deed differ by their addresses; two rows stating all three alike
 * share a key, and a link names each such row once more (`readSalesOut`).
 */
export function saleKey(c: SaleIdentity): string {
  const text = `${(c.saleDate ?? "").slice(0, 10)}|${Math.round(Number(c.price) || 0)}|${(c.address ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(KEY_LENGTH, "0");
}

const TOKEN = new RegExp(`^([0-9a-z]{${KEY_LENGTH}})(?:-([a-z]{2}))?$`);

/**
 * The sales a link leaves out, held to the list it is read against: each
 * comma-separated token is a sale's identity (`saleKey`), with a reason's
 * code after a hyphen ("k3f9a2x-nc"); a key with no code reads as "Other",
 * since the link names no reason. Each token marks the first sale in the
 * list bearing its key that no earlier token marked, so two rows stating one
 * day, price and address are named once each. A key no sale in the list
 * bears (the sale has left the window), a code no reason carries, an old
 * pin-number token, or anything else is dropped. A repeated parameter reads
 * its first.
 */
export function readSalesOut(
  raw: string | ReadonlyArray<string> | null | undefined,
  comps: ReadonlyArray<SaleIdentity>,
): Map<number, LeaveOutReason> {
  const value = (Array.isArray(raw) ? raw[0] : raw) as string | null | undefined;
  const out = new Map<number, LeaveOutReason>();
  if (typeof value !== "string" || comps.length === 0) return out;
  const keys = comps.map(saleKey);
  for (const token of value.split(",")) {
    const m = TOKEN.exec(token.trim().toLowerCase());
    if (!m) continue;
    const reason = m[2] === undefined ? "other" : BY_CODE.get(m[2]);
    if (!reason) continue;
    const at = keys.findIndex((k, i) => k === m[1] && !out.has(i));
    if (at < 0) continue;
    out.set(at, reason);
  }
  return out;
}

/** The set as a link writes it, in pin order, each sale by its identity with
 *  its reason's code spelled: "k3f9a2x-nc,0p7d1qa-wc"; "" where nothing is
 *  left out. A place outside `comps` is dropped. */
export function writeSalesOut(out: SalesOut, comps: ReadonlyArray<SaleIdentity>): string {
  return [...out.entries()]
    .filter(([at, r]) => Number.isInteger(at) && at >= 0 && at < comps.length && CODE_OF.has(r))
    .sort((a, b) => a[0] - b[0])
    .map(([at, r]) => `${saleKey(comps[at])}-${CODE_OF.get(r)}`)
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

/** "4 of 6 sales kept"; "" where none is left out. The counts are of the
 *  list's rows, so where rows may be one deed across parcels (`rows`, read on
 *  the full list) they are said as rows — "4 of 6 rows kept" — as the $/SF
 *  caption says them, since the readout counts such a deed once. */
export function keptLine(kept: number, total: number, rows = false): string {
  if (kept >= total) return "";
  const noun = rows ? (total === 1 ? "row" : "rows") : total === 1 ? "sale" : "sales";
  return `${kept} of ${total} ${noun} kept`;
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
