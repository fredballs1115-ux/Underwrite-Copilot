// How the property is sold (#456) — at auction, by a court's receiver, out
// of a bankruptcy, or by the lender that took it back. Sold any way but the
// usual, the figure on the cover is not a price and the seller is not an
// owner.
//
// Pure — no I/O, no model call. The extraction states the sale
// (`ExtractionResult.sale`: the method, its terms and the condition the
// property is sold in, each as stated) and the rows "Starting bid",
// "Reserve price", "Buyer's premium", "Bid deadline" and "Stalking horse
// bid"; this reads them into what every surface says.
//
// Five rules.
//
// A STARTING BID IS NOT A PRICE. It is where the bidding opens; the price is
// whatever clears, and a cap struck on the starting bid is the ceiling of
// what the building yields. Where the memorandum states no asking price the
// model runs at the starting bid plus the premium — the floor of what a
// winner pays — and says so, where it had run at a placeholder.
//
// THE BUYER'S PREMIUM IS PART OF THE PRICE. A percentage on top of the
// winning bid, with any stated minimum, paid by the buyer: a $10M hammer
// at 5% is $10.5M. So the most a buyer can bid is the most the model pays
// all-in, backed out of the premium (`hammerFor`), never the all-in figure.
//
// A RESERVE IS THE SELLER'S. An undisclosed reserve means the starting bid
// may not buy the building; an absolute auction — no reserve — means it
// can. Neither is guessed at.
//
// A RECEIVER, A TRUSTEE OR A LENDER IS NOT AN OWNER. The seller never ran
// the building: it sells as-is, gives no representations, holds thin
// records, and a court's approval or an overbid can follow the winning
// bid. A short sale's seller IS the owner, but sells for less than its
// loan's balance, so its lender's approval decides the price and whether it
// closes at all.
//
// A BLANK IS NULL. A bid, a premium or a deadline the memorandum does not
// state is not assumed, and a negotiated sale says nothing here.

import type { ExtractionResult, SaleMethod } from "@/lib/anthropic/types";
import { parsePageNumber } from "@/lib/facts";
import { compactUsd, parseUsd } from "@/lib/money";
import { readStatedDate } from "@/lib/note-yield";
import { withArticle } from "@/lib/article";

export type { SaleMethod };

type MetricRow = { label: string; value: string; page?: string };

const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

// ── The rows ────────────────────────────────────────────────────────────

const STARTING_BID = /\b(?:starting|opening|minimum|suggested\s+opening)\s+bid\b/i;
// An auction's reserve, never a replacement or a capital reserve.
const RESERVE = /^(?:auction\s+|seller'?s?\s+)?reserve(?:\s+(?:price|bid|amount))?$/i;
const PREMIUM = /\bbuyer'?s\s+premium\b|\bbuyer\s+premium\b/i;
const DEADLINE = /\bbid(?:s|ding)?\s+(?:deadline|due|date|ends?|closes?)\b|\bauction\s+(?:date|ends?|closes?)\b|\bcall\s+for\s+offers\b/i;
const STALKING = /\bstalking[- ]horse\b/i;
// A stalking-horse row that says there is none, or says nothing: "None",
// "No stalking horse", "N/A", "Not applicable", "Not stated", "—". Any other
// words state one, priced or not ("$12,500,000", "In place — terms in the
// data room", "Not disclosed"). "TBD" is left out of this list on purpose:
// a stalking-horse process whose bid is not yet set is still one — higher
// bids can reopen the sale, so the letter of intent is refused on it.
const NO_STALKING = /^(?:none|no|nil|n\/?a|not\s+(?:applicable|stated))\b|^[-–—]?\.?$/i;
const NO_RESERVE = /\bno\s+reserve\b|\babsolute\b|\bwithout\s+reserve\b|\bnone\b/i;
const UNDISCLOSED = /\bundisclosed\b|\bnot\s+disclosed\b|\bconfidential\b|\bunpublished\b/i;

const METHOD_LABEL: Record<SaleMethod, string> = {
  negotiated: "A negotiated sale",
  auction: "An auction",
  receivership: "A receiver's sale",
  bankruptcy: "A bankruptcy sale",
  reo: "A lender's sale of a property it took back (REO)",
  short_sale: "A short sale",
  unknown: "The sale",
};

/** Every way a property can be said to be sold, in one list: the label
 *  record above holds every `SaleMethod` (the compiler sees to it), and the
 *  extraction's enum reads this list (lib/anthropic/extract), so the schema,
 *  the type and the reader cannot drift apart. */
export const SALE_METHODS = Object.keys(METHOD_LABEL) as [SaleMethod, ...SaleMethod[]];
const METHODS: readonly SaleMethod[] = SALE_METHODS;

const clean = (s: string | null | undefined) => (s ?? "").trim();
const pageIn = (page: string | undefined, pageCount: number | null) => {
  const n = parsePageNumber(page);
  return n != null && pageCount != null && n <= pageCount ? clean(page) : "";
};

/** A buyer's premium as stated: "5%", "5% of the winning bid, minimum
 *  $50,000". A percentage over 25 is not a premium. */
export function readPremium(text: string | null | undefined): { pct: number; min: number | null } | null {
  const t = clean(text).replace(/,/g, "");
  const p = t.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
  if (!p) return null;
  const pct = Number(p[1]);
  if (!(pct > 0 && pct <= 25)) return null;
  const m = t.match(/\b(?:min(?:imum)?|at\s+least|not\s+less\s+than)\b[^$\d]*\$?\s*(\d+(?:\.\d+)?)\s*(k|m|mm)?\b/i);
  const scale = m?.[2] ? (/^k$/i.test(m[2]) ? 1e3 : 1e6) : 1;
  const min = m ? Number(m[1]) * scale : null;
  return { pct, min: min != null && min > 0 ? min : null };
}

/** What a winning bid costs all-in: the bid plus the premium, the premium
 *  at least its stated minimum. */
export function allInFor(bid: number, premium: { pct: number; min: number | null } | null): number {
  if (!premium) return bid;
  return bid + Math.max((bid * premium.pct) / 100, premium.min ?? 0);
}

/** The hammer price an all-in ceiling allows: the inverse of `allInFor` —
 *  the percentage backed out, or the minimum premium where it binds. */
export function hammerFor(allIn: number, premium: { pct: number; min: number | null } | null): number {
  if (!premium) return allIn;
  const byPct = allIn / (1 + premium.pct / 100);
  const min = premium.min ?? 0;
  // The minimum binds where the percentage of the bid would be under it.
  return (byPct * premium.pct) / 100 >= min ? byPct : allIn - min;
}

/** The memorandum's stalking-horse row where it states one, priced or not;
 *  null where there is no row, or the row says there is none. */
function stalkingRowOf(rows: MetricRow[]): MetricRow | null {
  return rows.find((m) => STALKING.test(m.label) && !NO_STALKING.test(m.value.trim())) ?? null;
}

/** Whether the memorandum states a stalking-horse bid — priced or not, and
 *  whatever sale method it names: a sale that higher bids can reopen. The
 *  letter of intent is refused on it (lib/loi-terms); it had been refused
 *  only where the bid parsed as dollars. */
export function statesStalkingHorse(ex: ExtractionResult | null | undefined): boolean {
  if (!ex) return false;
  return stalkingRowOf((Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow)) != null;
}

/** An auction's own rows, for a key-terms block to lead with right after
 *  the price: the starting bid, the buyer's premium, the reserve, the bid
 *  deadline. */
export function saleTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter(isRow) as M[];
  // Trimmed, as `readSale` reads them: the reserve's pattern is anchored.
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label.trim()));
  return [pick(STARTING_BID), pick(PREMIUM), pick(RESERVE), pick(DEADLINE), pick(STALKING)].filter((m): m is M => m != null);
}

// ── The read ────────────────────────────────────────────────────────────

export interface SaleRead {
  method: SaleMethod;
  label: string;
  terms: string;
  condition: string;
  page: string;
  startingBid: number | null;
  startingBidPage: string;
  reserve: { kind: "none" | "undisclosed" | "amount" | "stated"; amount: number | null; stated: string } | null;
  premium: { pct: number; min: number | null } | null;
  premiumStated: string;
  /** the starting bid plus the premium: the floor of what a winner pays */
  floorAllIn: number | null;
  deadline: { ends: string; stated: string; daysLeft: number } | null;
  stalkingHorse: number | null;
  /** the stalking-horse row's words as stated, priced or not ("" where the
   *  memorandum states none) */
  stalkingHorseStated: string;
  /** who sells, the bid, the premium, the reserve and the deadline, in the
   *  reader's sentences, one a line — the panel leads with the first and
   *  folds the rest */
  sentences: string[];
  /** those sentences as one paragraph */
  headline: string;
}

/** The read's figures, before its sentences are written from them. */
type SaleFacts = Omit<SaleRead, "headline" | "sentences">;

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) => compactUsd(n, { millions: 2, trim: true, thousandsFrom: Infinity });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/**
 * How the property is sold, on a day. Null on a negotiated sale, and on a
 * memorandum that states no method and none of an auction's figures.
 */
export function readSale(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): SaleRead | null {
  const s = ex?.sale;
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow);
  const bidRow = rows.find((m) => STARTING_BID.test(m.label)) ?? null;
  const reserveRow = rows.find((m) => RESERVE.test(m.label.trim())) ?? null;
  const premiumRow = rows.find((m) => PREMIUM.test(m.label)) ?? null;
  const deadlineRow = rows.find((m) => DEADLINE.test(m.label)) ?? null;
  const stalkingRow = stalkingRowOf(rows);
  const stated = METHODS.includes(s?.method as SaleMethod) ? (s!.method as SaleMethod) : "unknown";
  // An auction's figures say it is one, whatever the method field says.
  const method: SaleMethod = stated === "unknown" && (bidRow || premiumRow) ? "auction" : stated;
  if (method === "negotiated" || (method === "unknown" && !stalkingRow)) return null;

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const startingBid = bidRow ? parseUsd(bidRow.value) : null;
  const premiumStated = clean(premiumRow?.value);
  const premium = readPremium(premiumStated);
  let reserve: SaleRead["reserve"] = null;
  if (reserveRow) {
    const v = clean(reserveRow.value);
    const amount = parseUsd(v);
    reserve = NO_RESERVE.test(v)
      ? { kind: "none", amount: null, stated: v }
      : UNDISCLOSED.test(v)
        ? { kind: "undisclosed", amount: null, stated: v }
        : amount != null
          ? { kind: "amount", amount, stated: v }
          : { kind: "stated", amount: null, stated: v };
  }
  // A deadline is a day (lib/offering's rule): a month alone ("June 2027")
  // stays in the key terms as stated and is never counted down to a day the
  // memorandum did not name — it had read "Bids are due Jun 30, 2027".
  const deadlineRead = deadlineRow ? readStatedDate(deadlineRow.value, 2000, 2199, "first") : null;
  const deadlineIso = deadlineRead && !deadlineRead.month ? deadlineRead.iso : null;
  const read: SaleFacts = {
    method,
    label: METHOD_LABEL[method],
    terms: clean(s?.terms),
    condition: clean(s?.condition),
    page: pageIn(s?.page, pageCount),
    startingBid,
    startingBidPage: pageIn(bidRow?.page, pageCount),
    reserve,
    premium,
    premiumStated,
    floorAllIn: startingBid != null ? allInFor(startingBid, premium) : null,
    deadline: deadlineIso
      ? {
          ends: deadlineIso,
          stated: clean(deadlineRow!.value),
          daysLeft: Math.round((Date.parse(`${deadlineIso}T00:00:00Z`) - Date.parse(`${isoOf(asOf)}T00:00:00Z`)) / 86_400_000),
        }
      : null,
    stalkingHorse: stalkingRow ? parseUsd(stalkingRow.value) : null,
    stalkingHorseStated: clean(stalkingRow?.value),
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

// ── Saying it ───────────────────────────────────────────────────────────

function auctionSentences(r: SaleFacts): string[] {
  const out: string[] = [];
  if (r.startingBid != null) {
    out.push(
      `The property is sold at auction: bidding opens at ${money(r.startingBid)}, which is where the price starts, not what it is — a cap struck on it is the ceiling of what the building yields.`,
    );
  } else {
    out.push("The property is sold at auction, and the memorandum states no starting bid: there is no price to read until the bidding sets one.");
  }
  if (r.premium) {
    const min = r.premium.min != null ? `, at least ${money(r.premium.min)}` : "";
    out.push(
      r.floorAllIn != null && r.startingBid != null
        ? `The buyer pays ${withArticle(`${r.premium.pct}%`)} premium on top of the winning bid${min}: ${money(r.startingBid)} at the hammer is ${money(r.floorAllIn)} all-in.`
        : `The buyer pays ${withArticle(`${r.premium.pct}%`)} premium on top of the winning bid${min}.`,
    );
  } else if (r.premiumStated) {
    out.push(`The buyer's premium as stated: ${r.premiumStated.replace(/[.;,\s]+$/, "")}.`);
  } else {
    out.push("The memorandum states no buyer's premium — ask the auction house for its terms before bidding, since a premium is paid on top of the hammer.");
  }
  if (r.reserve) {
    out.push(
      r.reserve.kind === "none"
        ? "It is sold without reserve, as stated: the highest bid buys it."
        : r.reserve.kind === "undisclosed"
          ? "The reserve is undisclosed: the seller may refuse any bid under it, so the starting bid need not buy the building."
          : r.reserve.kind === "amount" && r.reserve.amount != null
            ? `The reserve is ${money(r.reserve.amount)}, as stated: no bid under it buys the building.`
            : `The reserve as stated: ${r.reserve.stated.replace(/[.;,\s]+$/, "")}.`,
    );
  }
  return out;
}

const SELLER_SENTENCE: Partial<Record<SaleMethod, string>> = {
  receivership:
    "A court-appointed receiver is selling it: the seller never ran the building, sells it as-is with no representations, and holds only the records it inherited — and the sale can need the court's approval after the winning offer.",
  bankruptcy:
    "It is sold out of a bankruptcy: the court approves the sale, a stalking-horse bid can set the floor, and higher bids can reopen it until the court rules.",
  reo: "The lender that took it back is selling it: it never ran the building either, sells as-is, and discloses only what it knows.",
  // A short sale (research pass 23): the owner sells, for less than its
  // loan's balance, so the lender must consent — said as what the sale is,
  // with what to ask, and never a rule of law.
  short_sale:
    "It is a short sale: the owner is selling for less than its loan's balance, so its lender must approve the sale — the price the lender will take, and when it decides, are the lender's, and the seller cannot promise to close.",
};

function sentencesOf(r: SaleFacts): string[] {
  const parts: string[] = [];
  if (r.method === "auction") parts.push(...auctionSentences(r));
  else if (SELLER_SENTENCE[r.method]) parts.push(SELLER_SENTENCE[r.method]!);
  if (r.method !== "auction" && (r.startingBid != null || r.premium)) parts.push(...auctionSentences(r).slice(0, 2));
  if (r.stalkingHorse != null) parts.push(`A stalking-horse bid of ${money(r.stalkingHorse)} is stated: that is the floor every other bid starts over.`);
  else if (r.stalkingHorseStated) {
    parts.push(`A stalking-horse bid is stated (${r.stalkingHorseStated.replace(/[.;,\s]+$/, "")}): it sets the floor every other bid starts over.`);
  }
  if (r.deadline) {
    parts.push(
      r.deadline.daysLeft > 0
        ? `Bids are due ${dayLabel(r.deadline.ends)}, ${r.deadline.daysLeft} ${r.deadline.daysLeft === 1 ? "day" : "days"} from today.`
        : r.deadline.daysLeft === 0
          ? `Bids are due today, ${dayLabel(r.deadline.ends)}.`
          : `The stated bid deadline, ${dayLabel(r.deadline.ends)}, has passed.`,
    );
  }
  if (r.condition) parts.push(`Sold as stated: ${r.condition.replace(/[.;,\s]+$/, "")}.`);
  return parts;
}

/**
 * The most a buyer can bid: the model's all-in ceiling at the buyer's
 * hurdle, backed out of the premium. Null without a ceiling.
 */
export function ceilingBidLine(r: SaleRead, maxAllIn: number | null, hurdlePct: number, unbounded = false): string {
  if (maxAllIn == null || !(maxAllIn > 0)) return "";
  // The solver's search stops at twice the price it started from: past it,
  // the ceiling is the bidding's to find, not a figure the model can name.
  if (unbounded) return `The model still clears ${withArticle(`${hurdlePct}%`)} levered IRR at ${money(maxAllIn)} all-in, twice the opening floor — at this hurdle the bidding, not the model, sets the ceiling.`;
  const hammer = hammerFor(maxAllIn, r.premium);
  const premium = r.premium ? ` — a hammer price of ${money(hammer)} with the ${r.premium.pct}% premium on top` : "";
  const vs =
    r.startingBid != null
      ? hammer >= r.startingBid
        ? `, ${money(hammer - r.startingBid)} over the starting bid`
        : `, under the ${money(r.startingBid)} starting bid, so the model does not bid at all`
      : "";
  return `At ${withArticle(`${hurdlePct}%`)} levered IRR the model pays at most ${money(maxAllIn)} all-in${premium}${vs}.`;
}

/** The pipeline row's tag: "Auction, 5% premium", "Auction",
 *  "Receivership sale", "Bankruptcy sale", "Bank-owned (REO)", "Short
 *  sale". */
export function saleTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readSale(ex, asOf);
  if (!r) return null;
  switch (r.method) {
    case "auction":
      return r.premium ? `Auction, ${r.premium.pct}% premium` : "Auction";
    case "receivership":
      return "Receivership sale";
    case "bankruptcy":
      return "Bankruptcy sale";
    case "reo":
      return "Bank-owned (REO)";
    case "short_sale":
      return "Short sale";
    default:
      return null;
  }
}

/** The sale in one line, for the memo under its title, the workbook's
 *  cover and the report: "Sold at auction: bidding opens at $2.5M; a 5%
 *  buyer's premium ($2.63M all-in at the opening bid); reserve
 *  undisclosed; bids due Oct 15, 2026". */
export function saleShortLine(r: SaleRead): string {
  const head: Record<SaleMethod, string> = {
    auction: "Sold at auction",
    receivership: "Sold by a court-appointed receiver, as-is",
    bankruptcy: "Sold out of a bankruptcy, subject to the court",
    reo: "Sold by the lender that took it back (REO), as-is",
    short_sale: "A short sale, subject to the lender's approval",
    negotiated: "",
    unknown: "Sold on the terms stated",
  };
  const parts: string[] = [];
  if (r.startingBid != null) parts.push(`bidding opens at ${money(r.startingBid)}`);
  if (r.premium) {
    parts.push(
      `${withArticle(`${r.premium.pct}%`)} buyer's premium${r.floorAllIn != null && r.startingBid != null ? ` (${money(r.floorAllIn)} all-in at the opening bid)` : ""}`,
    );
  }
  if (r.reserve) parts.push(r.reserve.kind === "none" ? "no reserve" : r.reserve.kind === "undisclosed" ? "reserve undisclosed" : `reserve ${r.reserve.stated}`);
  if (r.stalkingHorse != null) parts.push(`${withArticle(money(r.stalkingHorse))} stalking-horse bid`);
  else if (r.stalkingHorseStated) parts.push("a stalking-horse bid");
  if (r.deadline && r.deadline.daysLeft >= 0) parts.push(`bids due ${dayLabel(r.deadline.ends)}`);
  return parts.length ? `${head[r.method]}: ${parts.join("; ")}` : head[r.method];
}

/** The sale as the steps that read the memorandum after the extraction see
 *  it (lib/deal-context). */
export function saleContextLine(r: SaleRead): string {
  const extra = r.terms ? [`The sale's terms as stated: ${r.terms.replace(/[.;,\s]+$/, "")}.`] : [];
  return `How it is sold: ${[r.headline, ...extra].join(" ")}${r.page ? ` (${r.page})` : ""}`;
}

/** The sale's traps by name, for the assumption review. */
export function saleNote(r: SaleRead): string {
  const traps: string[] = [];
  if (r.method === "auction") {
    traps.push(
      "(a) THE STARTING BID IS NOT THE PRICE — never read a cap, a price per unit or a return struck on it as the deal's: they are the ceiling of what the building yields, and the clearing price is what the model must be run at",
    );
    traps.push(
      r.premium
        ? `(b) THE BUYER'S PREMIUM — ${r.premium.pct}% on top of the hammer${r.premium.min != null ? `, at least ${money(r.premium.min)}` : ""}: every bid is that much more all-in, and the ceiling bid is the all-in ceiling backed out of it`
        : "(b) THE BUYER'S PREMIUM — none stated: ask, since a premium is paid on top of the hammer",
    );
    traps.push("(c) THE TIMELINE — the deposit, the closing period and whether the sale carries any diligence or financing contingency: an auction usually carries neither, so the diligence happens before the bid");
    traps.push(
      r.reserve?.kind === "undisclosed"
        ? "(d) THE RESERVE — undisclosed: the seller can refuse any bid under it, so the starting bid is not an offer to sell at that figure"
        : "(d) THE RESERVE — ask whether one exists and whether the seller may bid against the buyers",
    );
  } else if (r.method === "short_sale") {
    // The owner sells, but its lender decides (research pass 23): each a
    // question to put, never a rule of law.
    traps.push(
      "(a) THE LENDER'S CONSENT AND ITS TIMING — ask whether the lender has approved this sale in writing, and how long its review takes: a contract signed before it is an offer the seller cannot promise to honour",
    );
    traps.push(
      "(b) THE PRICE THE LENDER APPROVES — the lender, not the seller, decides what it will take: ask what it has approved, and whether a reappraisal or a higher offer can move it after the contract is signed",
    );
    traps.push(
      "(c) THE SELLER CANNOT PROMISE TO CLOSE — every date in the contract waits on the lender: weigh the deposit, the diligence spend and any rate lock against a sale that may not happen",
    );
  } else {
    traps.push("(a) THE SELLER NEVER RAN IT — the figures are the receiver's, the trustee's or the lender's reconstruction: rebuild the rent roll and the T-12 from source, and price the deferred maintenance an absent owner leaves");
    traps.push("(b) AS-IS — no representations or warranties survive the closing: the diligence is the buyer's alone, before the bid");
    traps.push(
      r.method === "bankruptcy"
        ? "(c) THE COURT — the stalking horse, its break-up fee, the overbid increment and the approval hearing decide whether the winning bid holds"
        : r.method === "receivership"
          ? "(c) THE COURT — the receiver's sale can need the court's approval, and a higher offer can reopen it"
          : "(c) THE LENDER'S TERMS — a lender's contract is its own form: read its limits on disclosure, its deposit and its remedies",
    );
    // How a lender came to own it decides what came with the title — asked,
    // never assumed (research pass 23).
    if (r.method === "reo") {
      traps.push(
        "(d) HOW THE LENDER TOOK TITLE — ask whether it came by a foreclosure or by a deed in lieu: a deed in lieu typically leaves junior liens in place, so check the title commitment for what survives",
      );
    }
  }
  return `${saleContextLine(r)}\n\nSALE TRAPS, checked by name against the facts above: ${traps.join("; ")}.`;
}
