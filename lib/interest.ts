// What is being sold (#414): the land and the building outright, a
// leasehold on a ground lease, a loan secured by the property, or a share
// of the owning entity.
//
// Pure — no I/O, no model call, and no import of lib/deal-strategy (which
// reads `interestOf` from here, so the price readers can hold a share's
// price against the whole). The extraction states the interest
// (`ExtractionResult.interest`); this reads it into what every surface says.
//
// Four rules, each one a way a screen goes wrong when it assumes the usual
// case.
//
// A NOTE'S PRICE IS A LOAN'S. The buyer steps into the lender's position:
// the return is the note's coupon and the discount to its balance, and — if
// the borrower defaults — what the collateral fetches after foreclosure.
// The collateral's NOI over the note's price is a cap rate nobody earns, so
// nothing here sets one against the other, and every surface says the
// property model is the collateral's, not the note's return.
//
// A SHARE'S PRICE IS FOR THE SHARE. $20M for a 49% interest is $40.8M for
// the whole asset; the whole building's NOI over $20M reads as a 20% cap and
// a misread. The share is read off the OM's own words ("49% limited
// partnership interest") and the whole is the price over it — said as the
// share's price grossed up, never as a value, since control, the promote and
// the exit rights make a minority share worth less than its pro-rata slice.
//
// A LEASEHOLD IS A WASTING ASSET. The buyer owns the building and a lease on
// the land; the ground rent comes ahead of the debt, and at expiry the
// building reverts. A capitalised NOI values a perpetuity that ends.
//
// A BLANK IS NULL. A share the OM does not state as a percentage is not
// guessed at; a balance it does not state is not derived.

import type { ExtractionResult, InterestKind } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { parsePageNumber } from "@/lib/facts";
import { parseUsd } from "@/lib/money";

export type { InterestKind };

/** A partial interest's share, in percent, read off the OM's own words
 *  ("49% limited partnership interest", "a 90 percent stake"); null where
 *  no single percentage under 100 is stated. */
export function parseSharePct(text: string | null | undefined): number | null {
  const t = (text ?? "").replace(/,/g, "");
  const hits = [...t.matchAll(/(\d{1,2}(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/gi)].map((m) => Number(m[1]));
  const valid = [...new Set(hits.filter((n) => Number.isFinite(n) && n > 0 && n < 100))];
  // Two different percentages ("a 49% LP interest and a 2% GP interest") is
  // not one share: withheld rather than picked.
  return valid.length === 1 ? valid[0] : null;
}

/** The minimum the price readers need: the kind, and a partial interest's
 *  share where one percentage is stated. An extraction saved before the
 *  interest was read is fee simple. */
export function interestOf(ex: ExtractionResult | null | undefined): { kind: InterestKind; sharePct: number | null } {
  const kind = ex?.interest?.kind ?? "fee_simple";
  return { kind, sharePct: kind === "partial_interest" ? parseSharePct(ex?.interest?.share) : null };
}

/** What the price buys, in words. */
export const INTEREST_LABEL: Record<InterestKind, string> = {
  fee_simple: "Fee simple",
  leasehold: "Leasehold on a ground lease",
  note: "A loan secured by the property",
  partial_interest: "A share of the owning entity",
  unknown: "Not stated",
};

export interface InterestRead {
  kind: InterestKind;
  label: string;
  /** the OM's own sentence, "" where it states none */
  summary: string;
  /** cited only where it parses and falls inside the memorandum */
  page: string;
  /** a partial interest's share, percent */
  sharePct: number | null;
  /** the price the OM asks for what is being sold */
  askingPrice: number | null;
  /** a partial interest: the asking price over the share */
  impliedWhole: number | null;
  /** a note: the unpaid principal balance the OM states */
  balance: number | null;
  /** a note: the price's discount to the balance, percent (negative: a
   *  premium) */
  discountPct: number | null;
  /** the ground lease as stated ("" if none) — on a leasehold, or a
   *  fee-simple deal with a ground lease under part of the site */
  groundLease: string;
  /** a note's terms as stated ("" if none) */
  loan: string;
  /** the one sentence every surface leads with */
  headline: string;
  /** what the property model on this deal is and is not, for the surfaces
   *  that draw one — null where it is simply the buyer's model */
  modelCaveat: string | null;
}

// Rounded on the tenths, never a float's toFixed.
const money = (n: number) =>
  n >= 1e8
    ? `$${Math.round(n / 1e6)}M`
    : n >= 1e6
      ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M`
      : n >= 1e3
        ? `$${Math.round(n / 1e3)}k`
        : `$${Math.round(n)}`;
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
// A share as the OM would write it: "49%", "33.3%".
const shareText = (n: number) => `${one(n).replace(/\.0$/, "")}%`;
// "an 18.0% discount to", "a 4.0% premium over" — the figure decides the
// article (lib/article).
const discountPhrase = (pct: number) =>
  pct >= 0 ? `${withArticle(`${one(pct)}%`)} discount to` : `${withArticle(`${one(-pct)}%`)} premium over`;

/** A note's balance, from the row the extraction is asked to label it. */
function balanceOf(ex: ExtractionResult): number | null {
  const row = (ex.metrics ?? []).find((m) => /unpaid principal|\bupb\b|outstanding (loan |note )?balance|(loan|note) balance/i.test(m.label));
  return row ? parseUsd(row.value) : null;
}

/**
 * Read the interest into what every surface says. Null for a plain fee
 * simple (or an extraction saved before the interest was read) with nothing
 * to say — the usual case needs no banner; a fee simple with a ground lease
 * under part of the site has something to say, and says it.
 *
 * `askingPrice` is the caller's: the shared price reader lives in
 * lib/deal-strategy, which reads this module.
 */
export function readInterest(ex: ExtractionResult | null | undefined, askingPrice: number | null): InterestRead | null {
  const it = ex?.interest;
  if (!ex || !it) return null;
  const kind = it.kind;
  const groundLease = (it.groundLease ?? "").trim();
  if ((kind === "fee_simple" || kind === "unknown") && !groundLease) return null;
  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(it.page);
  const page = n != null && pageCount != null && n <= pageCount ? it.page.trim() : "";
  const sharePct = kind === "partial_interest" ? parseSharePct(it.share) : null;
  const price = askingPrice != null && askingPrice > 0 ? askingPrice : null;
  const impliedWhole = sharePct != null && price != null ? price / (sharePct / 100) : null;
  const balance = kind === "note" ? balanceOf(ex) : null;
  const discountPct = balance != null && balance > 0 && price != null ? ((balance - price) / balance) * 100 : null;
  const loan = (it.loan ?? "").trim();

  let headline: string;
  let modelCaveat: string | null = null;
  switch (kind) {
    case "note":
      headline =
        "This memorandum sells a LOAN secured by the property, not the property: the buyer steps into the lender's position, and the return is the note's coupon and its discount to the balance — or, on a default, what the collateral fetches after foreclosure.";
      if (discountPct != null && price != null && balance != null) {
        headline += ` The ${money(price)} price is ${discountPhrase(discountPct)} the ${money(balance)} unpaid balance.`;
      }
      modelCaveat =
        "The screening model underwrites the collateral as if it were bought outright at the note's price. That is not the note's return, and its cap rate and IRR are not figures this buyer earns.";
      break;
    case "partial_interest":
      headline =
        sharePct != null && price != null && impliedWhole != null
          ? `This memorandum sells ${withArticle(shareText(sharePct))} share of the owning entity, not the whole asset: ${money(price)} for the share is ${money(impliedWhole)} for the whole, grossed up — the whole building's income is set against that, and a minority share is worth less than its slice once control, the promote and the exit rights are priced.`
          : "This memorandum sells a share of the owning entity, not the whole asset, and states no single percentage for it — the whole building's income cannot be set against the share's price until the share is known.";
      modelCaveat =
        sharePct != null && impliedWhole != null
          ? `The screening model runs the whole asset at the ${money(impliedWhole)} the share's price implies; the share earns its ${shareText(sharePct)} of those cash flows only before the waterfall's promote and the sponsor's fees.`
          : "The screening model runs the whole asset at the share's price, which it cannot gross up without a stated percentage — its returns are not the share's.";
      break;
    case "leasehold":
      headline =
        "This memorandum sells a LEASEHOLD: the building and a lease on the land, not the land. The ground rent comes ahead of the debt, and at the lease's end the building reverts — a capitalised NOI values a perpetuity that ends.";
      modelCaveat =
        "The screening model capitalises the exit like a fee-simple building. On a leasehold the value at exit is what the term left will bear — run the ground lease calculator on the stated term.";
      break;
    default:
      headline = "Part of the site sits on a ground lease: the ground rent is an expense ahead of the debt, and its term and resets decide what that part is worth.";
  }
  return {
    kind,
    label: INTEREST_LABEL[kind],
    summary: (it.summary ?? "").trim(),
    page,
    sharePct,
    askingPrice: price,
    impliedWhole,
    balance,
    discountPct,
    groundLease,
    loan,
    headline,
    modelCaveat,
  };
}

/** The deal context's line: what is being sold, for every step that reads
 *  the OM after the extraction. */
export function interestContextLine(r: InterestRead): string {
  const facts = [r.groundLease ? `The ground lease as stated: ${r.groundLease}.` : "", r.loan ? `The loan as stated: ${r.loan}.` : ""]
    .filter(Boolean)
    .join(" ");
  return `What is being sold: ${r.label.toLowerCase()}. ${r.headline}${facts ? ` ${facts}` : ""}`;
}

/**
 * The traps of the interest, for the challenger — appended to its notes
 * like the portfolio's. The facts first, then the traps by name.
 */
export function interestNote(r: InterestRead): string {
  const traps: Record<InterestKind, string> = {
    note:
      "NOTE TRAPS, checked by name where the OM gives the inputs: (a) THE COLLATERAL IS NOT THE RETURN — the property's cap rate and IRR belong to its owner; underwrite the note's yield on the price paid; (b) THE DISCOUNT IS THE RETURN — on a performing note, the coupon on the price plus the discount accreting to maturity; ask for the payment history; (c) DEFAULT AND FORECLOSURE — a non-performing note is a bet on the time and cost to take the property, which runs by the state's process (judicial or not) and the borrower's resistance; (d) THE DOCUMENTS — guarantees, reserves, the loan agreement's defaults and any intercreditor or participation terms; (e) THE COLLATERAL'S VALUE — the loan-to-value on today's value, not the origination appraisal.",
    partial_interest:
      "PARTIAL-INTEREST TRAPS, checked by name where the OM gives the inputs: (a) THE PRICE IS FOR A SHARE — hold the whole asset's income against the price grossed up by the share, never against the share's price; (b) CONTROL — who decides a sale, a refinance and a budget, and what a minority holder can block; (c) THE WATERFALL — the share's economics after the sponsor's promote and fees, not its pro-rata slice; (d) EXIT RIGHTS — buy-sell, right of first refusal, drag and tag, and how a minority share is ever sold; (e) CAPITAL CALLS — what happens to a holder who does not fund one.",
    leasehold:
      "LEASEHOLD TRAPS, checked by name where the OM gives the inputs: (a) THE TERM LEFT — against the loan's term (a lender wants years of margin) and the hold; (b) THE RESETS — a rent struck at a share of then-current land value is an uncapped repricing; (c) SUBORDINATION — an unsubordinated ground rent outranks the mortgage, and a default ends the lease, the building and the loan together; (d) COVERAGE — the NOI over the ground rent, the lender's first test; (e) THE REVERSION — at expiry the building goes to the landowner, so the exit is worth what the remaining term will bear.",
    fee_simple:
      "GROUND-LEASE TRAP, checked by name: part of the site sits on a ground lease — its rent is an expense ahead of the debt, and its term and resets decide what that part of the property is worth.",
    unknown:
      "GROUND-LEASE TRAP, checked by name: part of the site sits on a ground lease — its rent is an expense ahead of the debt, and its term and resets decide what that part of the property is worth.",
  };
  return `${interestContextLine(r)} ${traps[r.kind]}`;
}

/**
 * The interest in one line, for the documents with no room for the panel —
 * the memo's header, the workbook's cover: what the price buys, and the one
 * figure that says what it means where the memorandum states it.
 */
export function interestShortLine(r: InterestRead): string {
  switch (r.kind) {
    case "note":
      return `A loan secured by the property, not the property${
        r.discountPct != null && r.askingPrice != null && r.balance != null
          ? ` — the ${money(r.askingPrice)} price is ${discountPhrase(r.discountPct)} the ${money(r.balance)} balance`
          : ""
      }`;
    case "partial_interest":
      return r.sharePct != null && r.askingPrice != null && r.impliedWhole != null
        ? `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the whole`
        : "A share of the owning entity, its percentage not stated";
    case "leasehold":
      return "A leasehold — the building and a lease on the land, not the land";
    default:
      return "Fee simple, with a ground lease under part of the site";
  }
}
