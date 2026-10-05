// A forward purchase or a build-to-suit (research pass 28, round 2).
//
// The screen read a forward purchase as a development: the buyer was handed
// the construction loan's interest reserve and carry, the model's capital
// note told them to "enter the construction / renovation cost" on a price
// that is all-in at delivery, and the pipeline row's yield slot stood empty.
// A forward purchase is a contract to buy a building when it is finished:
// the developer funds the works, the buyer pays the price at delivery, and
// what the buyer holds before then is a deposit and a date.
//
// PURE. Six rules:
//   1. THE PRICE IS PAID AT DELIVERY. The developer funds the works; the
//      buyer's cost is the price, never the price plus the developer's
//      budget.
//   2. THE YIELD IS STRUCK AT DELIVERY. The delivery cap as stated, else the
//      stated stabilized NOI over the price — said at delivery, never as a
//      going-in cap on a building that stands.
//   3. THE CLOCK IS THE RISK. Delivery against the outside date; a delivery
//      stated as a quarter, a month or a year alone is read on its LAST day
//      (a later delivery is the side that does not flatter: rent starts
//      later, the deposit waits longer).
//   4. THE DEPOSIT IS AT RISK, NOT THE BUILD. Before delivery the buyer's
//      exposure is the deposit and its terms, as stated.
//   5. THE LEASE STARTS AT COMMENCEMENT. A build-to-suit's lease runs from
//      delivery (lib/single-tenant counts it so); a community leases up
//      after it, and a stabilized NOI is the leased community's.
//   6. A BLANK IS NULL.

import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  buildingPriceOf,
  findPriceMetric,
  inferStrategy,
  noiFigures,
  priceRowIsLand,
  type DealStrategy,
} from "@/lib/deal-strategy";
import { findGoingInCap, parsePct, parsePrice, screenYearOf } from "@/lib/criteria";
import { parseUsd } from "@/lib/money";
import { readStatedDate } from "@/lib/note-yield";
import { withArticle } from "@/lib/article";

type MetricRow = { label: string; value: string; page?: string };

const rowOf = (metrics: readonly MetricRow[], re: RegExp, not?: RegExp) =>
  metrics.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** The words that name a purchase at completion. A build-to-suit counts
 *  only beside a price for the whole asset (`isForwardPurchase`): a site
 *  sold for a build-to-suit is the buyer's own development. */
const FORWARD_WORDS =
  /\bforward[- ](?:purchase|sale|commitment|takeout|take[- ]out)\b|\bpurchased?\s+(?:at|upon|on)\s+(?:the\s+)?(?:completion|delivery|substantial completion|certificate of occupancy|issuance of (?:the\s+)?(?:certificate of occupancy|c\.?\s?o\.?))\b|\btake[- ]?out (?:commitment|purchase|buyer)\b/i;
const BTS_WORDS = /\bbuild[- ]to[- ]suit\b|\bbts\b/i;
const BTR_WORDS = /\bbuild[- ]to[- ]rent\b|\bbtr\b|\bsingle[- ]family rental\b|\brental homes?\b/i;

/** "Delivery date", "Substantial completion", "Estimated delivery",
 *  "Certificate of occupancy" — never a construction start. */
export const DELIVERY_ROW =
  /^\s*(?:(?:estimated|scheduled|anticipated|expected|projected|target(?:ed)?)\s+)?(?:delivery|substantial completion|completion|certificate of occupancy|c\.?\s?o\.?)(?:\s+date)?\s*$/i;
export const OUTSIDE_ROW = /^\s*outside\s+(?:closing\s+)?date\s*$/i;
export const RENT_COMMENCEMENT_ROW = /^\s*rent\s+commencement(?:\s+date)?\s*$/i;
/** The buyer's deposit, never a tenant's security deposit. */
export const DEPOSIT_ROW = /^\s*(?:(?:initial|earnest money|good[- ]faith|purchase|buyer'?s)\s+)?deposits?\b/i;
const NOT_BUYERS_DEPOSIT = /security|tenant|utility/i;
export const DELIVERY_CAP_ROW = /^\s*(?:delivery\s+cap(?:\s+rate)?|cap\s+rate\s+(?:at|on)\s+delivery)\s*$/i;
export const PRICE_ADJUSTMENT_ROW = /^\s*price\s+adjustment\b/i;
export const DEVELOPER_ROW = /^\s*developer\s*$/i;
export const GUARANTY_ROW = /^\s*completion\s+guarant(?:y|ee)\s*$/i;

/** The rows the extraction files for a forward purchase, in the order a
 *  key-terms block leads with them after the price — each only where the
 *  memorandum states it. */
export function forwardTermRows<M extends MetricRow>(metrics: ReadonlyArray<M>): M[] {
  return [
    rowOf(metrics, DELIVERY_ROW),
    rowOf(metrics, OUTSIDE_ROW),
    rowOf(metrics, DEPOSIT_ROW, NOT_BUYERS_DEPOSIT),
    rowOf(metrics, DELIVERY_CAP_ROW),
    rowOf(metrics, RENT_COMMENCEMENT_ROW),
  ].filter((m): m is M => m != null) as M[];
}

/** Every word the memorandum gave the screen, for the purchase's words. */
function wordsOf(ex: ExtractionResult): string {
  return [
    ex.dealName ?? "",
    ex.buyerNotes ?? "",
    ex.strategy?.summary ?? "",
    ex.strategy?.timeline ?? "",
    ...(ex.metrics ?? []).flatMap((m) => [m.label, m.value]),
  ].join(" \n ");
}

/**
 * Whether the deal is a purchase at completion: a development (or a
 * conversion delivered with its works) whose memorandum's words say the
 * buyer pays at completion, or a build-to-suit priced as the whole asset.
 */
export function isForwardPurchase(
  ex: ExtractionResult | null | undefined,
  strategy: DealStrategy = inferStrategy(ex ?? null),
): boolean {
  if (!ex) return false;
  if (strategy.kind !== "development" && strategy.kind !== "conversion") return false;
  const words = wordsOf(ex);
  if (FORWARD_WORDS.test(words)) return true;
  if (!BTS_WORDS.test(words)) return false;
  const priceRow = findPriceMetric(ex.metrics ?? [], strategy.kind, screenYearOf(ex));
  return priceRow != null && !priceRowIsLand(priceRow);
}

// ── Dates read on their last day ─────────────────────────────────────────

export interface DeliveryDate {
  /** the day read: a quarter's, a month's or a year's last */
  iso: string;
  /** what the memorandum wrote */
  text: string;
  precision: "day" | "month" | "quarter" | "year";
}

const lastDayOf = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const isoOf = (y: number, mo: number, d: number) =>
  `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** A date as written, read on its LAST day where it names a quarter, a
 *  month or a year alone. Null for words with no date in them ("upon
 *  completion", "TBD"). */
export function readDeliveryDate(text: string | null | undefined, asOf: Date): DeliveryDate | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const minYear = asOf.getUTCFullYear() - 10;
  const maxYear = asOf.getUTCFullYear() + 15;
  const q = s.match(/\b(?:q([1-4])|([1-4])q)\s*[-'’]?\s*(\d{4})\b/i) ?? s.match(/\b(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(\d{4})\b/i);
  if (q) {
    const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
    const quarter = q.length === 4 ? Number(q[1] ?? q[2]) : words[q[1].toLowerCase()];
    const y = Number(q.length === 4 ? q[3] : q[2]);
    if (y < minYear || y > maxYear) return null;
    const mo = quarter * 3;
    return { iso: isoOf(y, mo, lastDayOf(y, mo)), text: s, precision: "quarter" };
  }
  const stated = readStatedDate(s, minYear, maxYear, "last");
  if (stated) return { iso: stated.iso, text: s, precision: stated.month ? "month" : "day" };
  const year = s.match(/^\s*(?:(?:late|end of|ye|year[- ]end)\s+)?(\d{4})\s*$/i);
  if (year) {
    const y = Number(year[1]);
    return y >= minYear && y <= maxYear ? { iso: isoOf(y, 12, 31), text: s, precision: "year" } : null;
  }
  return null;
}

/** "Jun 30, 2028" — a date as a page says it. */
function dayText(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(at)
    ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : iso;
}

/** What a delivery is said as: the memorandum's words, with the day they
 *  are read as where they name no day. */
export function deliveryText(d: DeliveryDate): string {
  return d.precision === "day" ? dayText(d.iso) : `${d.text} (read as ${dayText(d.iso)})`;
}

function monthsBetweenIso(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1);
}

// ── The read ─────────────────────────────────────────────────────────────

export interface ForwardRead {
  /** a single tenant's build-to-suit, a rental community, or another */
  kind: "bts" | "btr" | "forward";
  /** the price paid at delivery — the building's (`buildingPriceOf`) */
  price: number | null;
  delivery: DeliveryDate | null;
  /** the delivery row's words where no date is read from them */
  deliveryWords: string | null;
  outside: DeliveryDate | null;
  /** months from delivery to the outside date; negative where the outside
   *  date is earlier, which the memorandum's two dates cannot both mean */
  slackMonths: number | null;
  /** months from the day read to delivery; null once delivery has passed */
  monthsToDelivery: number | null;
  deliveryPassed: boolean;
  rentCommencement: string | null;
  deposit: { text: string; amount: number | null; sharePct: number | null } | null;
  /** the yield at delivery, a percent: the stated delivery cap (or the
   *  memorandum's plain cap on the price — a forward purchase has no
   *  standing building, so its cap is struck at delivery), else the NOI at
   *  delivery over the price */
  deliveryYieldPct: number | null;
  yieldFrom: "stated_cap" | "noi_over_price" | null;
  /** the NOI the memorandum states at delivery: the stabilized figure, or on
   *  a build-to-suit the lease's first year (its rent starts at delivery) */
  deliveryNoi: { value: number; label: string } | null;
  developer: string | null;
  guaranty: string | null;
  priceAdjustment: string | null;
  headline: string;
}

/** "$48.0M", "$3.96M", "$950k": two places under $10M, where a model's NOI
 *  and the memorandum's sit a few percent apart. */
const money = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e7) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return a >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
};
const pctText = (n: number) => `${n.toFixed(2)}%`;

/**
 * A forward purchase's read: the price at delivery, the clock to it and to
 * the outside date, the deposit, and the yield at delivery — each only as
 * stated. Null unless the deal is a purchase at completion
 * (`isForwardPurchase`).
 */
export function readForwardPurchase(
  ex: ExtractionResult | null | undefined,
  asOf: Date = new Date(),
  strategy: DealStrategy = inferStrategy(ex ?? null),
): ForwardRead | null {
  if (!ex || !isForwardPurchase(ex, strategy)) return null;
  const metrics = (ex.metrics ?? []) as MetricRow[];
  const words = wordsOf(ex);
  const priceRow = findPriceMetric(metrics, strategy.kind, screenYearOf(ex));
  const stated = priceRow ? parsePrice(priceRow.value) : null;
  const price = buildingPriceOf(ex, stated != null && stated > 0 ? stated : null);

  const deliveryRow = rowOf(metrics, DELIVERY_ROW);
  const delivery = deliveryRow ? readDeliveryDate(deliveryRow.value, asOf) : null;
  const outsideRow = rowOf(metrics, OUTSIDE_ROW);
  const outside = outsideRow ? readDeliveryDate(outsideRow.value, asOf) : null;
  const todayIso = asOf.toISOString().slice(0, 10);
  const deliveryPassed = delivery != null && delivery.iso < todayIso;
  const slackMonths = delivery && outside ? monthsBetweenIso(delivery.iso, outside.iso) : null;
  const monthsToDelivery = delivery && !deliveryPassed ? Math.max(0, monthsBetweenIso(todayIso, delivery.iso)) : null;

  const depositRow = rowOf(metrics, DEPOSIT_ROW, NOT_BUYERS_DEPOSIT);
  const depositAmount = depositRow ? parseUsd(depositRow.value) : null;
  const depositPctStated = depositRow ? parsePct(depositRow.value) : null;
  const deposit = depositRow
    ? {
        text: depositRow.value.trim(),
        amount: depositAmount != null && depositAmount > 100 ? depositAmount : null,
        sharePct:
          depositPctStated != null && depositPctStated > 0 && depositPctStated < 50
            ? depositPctStated
            : depositAmount != null && depositAmount > 100 && price != null && price > 0
              ? (depositAmount / price) * 100
              : null,
      }
    : null;

  const kind: ForwardRead["kind"] = BTS_WORDS.test(words) ? "bts" : BTR_WORDS.test(words) ? "btr" : "forward";
  const capRow = rowOf(metrics, DELIVERY_CAP_ROW) ?? findGoingInCap(metrics);
  const capRead = capRow ? parsePct(capRow.value) : null;
  const capStated = capRead != null && capRead > 0.5 && capRead < 20 ? capRead : null;
  const nois = noiFigures(metrics);
  const atDelivery = nois.find((f) => f.kind === "stabilized") ?? (kind === "bts" ? (nois.find((f) => f.kind === "year1") ?? null) : null);
  const fromNoi = atDelivery && price != null && price > 0 ? (atDelivery.value / price) * 100 : null;
  const deliveryYieldPct = capStated ?? (fromNoi != null && fromNoi > 0.5 && fromNoi < 20 ? fromNoi : null);
  const yieldFrom: ForwardRead["yieldFrom"] = capStated != null ? "stated_cap" : deliveryYieldPct != null ? "noi_over_price" : null;
  const asStated = (re: RegExp) => rowOf(metrics, re)?.value.trim() || null;

  const parts: string[] = [];
  const what = kind === "bts" ? "A build-to-suit bought at delivery" : "A forward purchase";
  const at = delivery ? `at delivery, ${deliveryText(delivery)}` : deliveryRow ? `at delivery (${deliveryRow.value.trim()})` : "at delivery";
  parts.push(
    `${what}: the buyer pays ${price != null ? money(price) : "the price"} ${at}, and the developer funds the works — the price is the buyer's whole cost, never the price plus the developer's budget.`,
  );
  if (deliveryPassed && delivery) parts.push(`The stated delivery, ${deliveryText(delivery)}, has passed; whether the building was delivered is the memorandum's to say.`);
  if (deliveryYieldPct != null) {
    parts.push(
      yieldFrom === "stated_cap"
        ? `It is struck at ${withArticle(`${pctText(deliveryYieldPct)} cap`)} at delivery, as stated.`
        : `The NOI the memorandum states at delivery, ${money(atDelivery!.value)}, is ${pctText(deliveryYieldPct)} of the price.`,
    );
  }
  if (outside) {
    parts.push(
      slackMonths != null && slackMonths < 0
        ? `The outside date, ${deliveryText(outside)}, is before the stated delivery: the two cannot both hold, and which governs is the contract's.`
        : slackMonths != null
          ? `The outside date is ${deliveryText(outside)}, ${slackMonths} ${slackMonths === 1 ? "month" : "months"} after delivery.`
          : `The outside date is ${deliveryText(outside)}.`,
    );
  }
  if (deposit) {
    parts.push(
      `The deposit as stated: ${deposit.text}${deposit.sharePct != null && depositPctStated == null ? ` (${Math.round(deposit.sharePct * 10) / 10}% of the price)` : ""} — the buyer's exposure before delivery.`,
    );
  }
  const rentCommencement = asStated(RENT_COMMENCEMENT_ROW);
  if (rentCommencement) parts.push(`Rent commences as stated: ${rentCommencement.replace(/\.$/, "")}.`);

  return {
    kind,
    price,
    delivery,
    deliveryWords: deliveryRow && !delivery ? deliveryRow.value.trim() : null,
    outside,
    slackMonths,
    monthsToDelivery,
    deliveryPassed,
    rentCommencement,
    deposit,
    deliveryYieldPct,
    yieldFrom,
    deliveryNoi: atDelivery ? { value: atDelivery.value, label: atDelivery.label } : null,
    developer: asStated(DEVELOPER_ROW),
    guaranty: asStated(GUARANTY_ROW),
    priceAdjustment: asStated(PRICE_ADJUSTMENT_ROW),
    headline: parts.join(" "),
  };
}

// ── What each surface says ───────────────────────────────────────────────

/** The pipeline row's tag: "Forward, delivers Q2 2028", "Forward, 5.50% at
 *  delivery". Null where the deal is no forward purchase. */
export function forwardTag(r: ForwardRead | null): string | null {
  if (!r) return null;
  const word = r.kind === "bts" ? "Build-to-suit" : "Forward";
  if (r.deliveryYieldPct != null) return `${word}, ${pctText(r.deliveryYieldPct)} at delivery`;
  if (r.delivery && !r.deliveryPassed) return `${word}, delivers ${r.delivery.text}`;
  return `${word} purchase`;
}

/** The read in one line, for the memo, the workbook's cover and the shared
 *  screen. */
export function forwardShortLine(r: ForwardRead): string {
  const bits = [`${r.price != null ? money(r.price) : "the price"} paid at delivery${r.delivery ? ` (${r.delivery.text})` : ""}, the works the developer's`];
  if (r.deliveryYieldPct != null) bits.push(`${pctText(r.deliveryYieldPct)} at delivery${r.yieldFrom === "noi_over_price" ? " on the stated NOI" : ""}`);
  if (r.outside) bits.push(`outside date ${deliveryText(r.outside)}`);
  if (r.deposit) bits.push(`deposit ${r.deposit.amount != null ? money(r.deposit.amount) : r.deposit.text}`);
  return `${r.kind === "bts" ? "Build-to-suit" : "Forward purchase"}: ${bits.join("; ")}`;
}

/** The deal context's line, for every step that reads the OM after the
 *  extraction. */
export function forwardContextLine(r: ForwardRead): string {
  const facts = [
    r.developer ? `Developer as stated: ${r.developer.replace(/\.$/, "")}.` : "",
    r.guaranty ? `Completion guaranty as stated: ${r.guaranty.replace(/\.$/, "")}.` : "",
    r.priceAdjustment ? `Price adjustment as stated: ${r.priceAdjustment.replace(/\.$/, "")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `Forward purchase: ${r.headline}${facts ? ` ${facts}` : ""}`;
}

/**
 * The model's read (`meta.forward`): it runs the price as paid at closing,
 * with income from its first year — on a forward purchase that day is
 * delivery — and its year-one NOI beside the memorandum's at delivery. The
 * model is unchanged; anchoring it on the delivery NOI is the owner's call.
 */
export function forwardModelLine(
  r: ForwardRead | null,
  model: { noi1: number | null; noiAssumed: boolean; price: number | null } | null,
): string | null {
  if (!r) return null;
  const when = r.delivery ? `delivery, ${r.delivery.text}` : "delivery";
  const deposit = r.deposit ? ", and the deposit paid at signing sits outside its cash flows" : "";
  let noi = "";
  if (model?.noi1 != null && r.deliveryNoi != null) {
    const stated = r.deliveryNoi.value;
    const gap = model.noi1 - stated;
    const rel = Math.abs(gap) < 0.005 * stated ? "the same as" : gap > 0 ? "above" : "below";
    const assumed =
      model.noiAssumed && model.price != null && model.price > 0 ? `an assumed ${pctText((model.noi1 / model.price) * 100)} of the price, ` : "";
    noi = ` Its year-one NOI is ${assumed}${money(model.noi1)}, ${rel} the ${money(stated)} the memorandum states at delivery.`;
  }
  return `The model runs the price as paid at closing with income from its first year: on a forward purchase that day is ${when}${deposit}.${noi}`;
}

const TRAPS =
  "FORWARD-PURCHASE TRAPS, checked by name where the OM gives the inputs: (a) COMPLETION — what the contract calls complete (substantial or final completion, the certificate of occupancy, the tenant's acceptance) and who certifies it; (b) THE OUTSIDE DATE AND THE DEPOSIT — what happens to the deposit if delivery runs past the outside date, and how the deposit is secured; (c) THE PRICE MECHANISM — a fixed price, or a cap on the rent at completion: who bears a change in rent, cap rates or interest rates between signing and closing; (d) THE LEASE AT DELIVERY — on a build-to-suit, rent commencement, free rent and the punch list; on a community, the lease-up the buyer inherits and any rent guarantee or master lease, as stated; (e) THE DEVELOPER — its balance sheet, its lender's lien released at closing, and the warranties assigned to the buyer; (f) THE BUYER'S FINANCING — struck at the rates of the closing day, not today's.";

/** The purchase's traps, for the challenger — in place of the construction
 *  paragraph a development gets: the facts first, then the traps by name. */
export function forwardNote(r: ForwardRead): string {
  return `${forwardContextLine(r)} ${TRAPS}`;
}
