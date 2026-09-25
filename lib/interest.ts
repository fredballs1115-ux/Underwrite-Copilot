// What is being sold (#414): the land and the building outright, a
// leasehold on a ground lease, a loan secured by the property, or a share
// of the owning entity.
//
// Pure — no I/O, no model call, and no import of lib/deal-strategy (which
// reads `interestOf` from here, so the price readers can hold a share's
// price against the whole). The extraction states the interest
// (`ExtractionResult.interest`); this reads it into what every surface says.
//
// Five rules, each one a way a screen goes wrong when it assumes the usual
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
// A LEASED FEE'S INCOME IS THE GROUND RENT (#415). The buyer takes the land
// under a building someone else owns and becomes the ground lessor: the
// ground rent is the income — never an expense, and never the building's
// NOI, which belongs to its owner — the building's own income over that
// rent is the whole margin of safety, and when the lease ends the building
// reverts to the buyer. Read as fee simple with a ground lease, the same
// deal was told its income was an expense.
//
// A BLANK IS NULL. A share the OM does not state as a percentage is not
// guessed at; a balance it does not state is not derived.

import type { ExtractionResult, InterestKind } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { parsePageNumber } from "@/lib/facts";
import { parseUsd } from "@/lib/money";
import { groundLeaseTermLine, readGroundLeaseTerm, type GroundLeaseTerm } from "@/lib/ground-lease-term";
import { readNote, readNoteTerms, type NoteRead } from "@/lib/note-yield";

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

/** What the price buys, as the pipeline row's tag — "49% share", "Note",
 *  "Leased fee" — and null for a fee simple (or an extraction saved before
 *  the interest was read), where the price is the building's and the row
 *  says nothing more. */
export function interestTag(ex: ExtractionResult | null | undefined): string | null {
  const { kind, sharePct } = interestOf(ex);
  switch (kind) {
    case "note":
      return "Note";
    case "partial_interest":
      return sharePct != null ? `${shareText(sharePct)} share` : "Share";
    case "leasehold":
      return "Leasehold";
    case "leased_fee":
      return "Leased fee";
    default:
      return null;
  }
}

/** What the price buys, in words. */
export const INTEREST_LABEL: Record<InterestKind, string> = {
  fee_simple: "Fee simple",
  leasehold: "Leasehold on a ground lease",
  leased_fee: "The leased fee — the land under a ground lease",
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
  /** a note, underwritten as a note (#416): its yield to maturity at the
   *  price, current yield, cents on the dollar and loan-to-value, from the
   *  terms the OM states (lib/note-yield) — null on every other interest,
   *  or where the OM states no balance */
  note: NoteRead | null;
  /** the ground lease as stated ("" if none) — on a leasehold, or a
   *  fee-simple deal with a ground lease on part of the site */
  groundLease: string;
  /** a note's terms as stated ("" if none) */
  loan: string;
  /** the annual ground rent the OM states (a leasehold pays it, a leased
   *  fee collects it); null where none is stated */
  groundRent: number | null;
  /** the building's operating income before the ground rent, as stated —
   *  what pays the rent; null where none is stated */
  incomeBeforeGroundRent: number | null;
  /** that income over the ground rent — the lessor's margin of safety and
   *  the leasehold lender's first test; null unless both are stated */
  groundRentCoverage: number | null;
  /** the one sentence every surface leads with */
  headline: string;
  /** the headline without a note's figures (#416) — what the panel says
   *  above the figures it draws; the headline itself on every other
   *  interest */
  lead: string;
  /** what the property model on this deal is and is not, for the surfaces
   *  that draw one — null where it is simply the buyer's model */
  modelCaveat: string | null;
  /** when the ground lease ends, as the memorandum states it (#421,
   *  lib/ground-lease-term) — null where no ground lease is involved or its
   *  end is not stated */
  term: GroundLeaseTerm | null;
  /** that term in one sentence ("" where there is none) */
  termLine: string;
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
// A coverage ratio: "5.0×".
const times = (n: number) => `${one(n)}×`;
// A share as the OM would write it: "49%", "33.3%".
const shareText = (n: number) => `${one(n).replace(/\.0$/, "")}%`;
// "an 18.0% discount to", "a 4.0% premium over" — the figure decides the
// article (lib/article).
const discountPhrase = (pct: number) =>
  pct >= 0 ? `${withArticle(`${one(pct)}%`)} discount to` : `${withArticle(`${one(-pct)}%`)} premium over`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2028" from an ISO date. */
const monthYear = (isoDate: string) => {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const pctText = (n: number) => `${one(n)}%`;

/**
 * What the note earns, in a sentence (#416) — only where its terms are
 * stated: the yield to maturity on the price with how the payments were
 * run and the current yield beside it; a note the OM does not call
 * performing said as paid as agreed; a non-performing note's contract yield
 * said as what it would earn if it paid; a matured one's none. "" when
 * there is nothing to add.
 */
export function noteYieldSentence(n: NoteRead | null): string {
  if (!n) return "";
  const due = n.terms.maturity ? monthYear(n.terms.maturity) : null;
  if (n.matured && due) {
    return `It is past its ${due} maturity — a matured loan still outstanding is in default or extended, and there is no contract yield to state.`;
  }
  if (n.ytmPct != null && due) {
    if (n.terms.status === "non_performing") {
      return `If it paid to its ${due} maturity it would yield ${pctText(n.ytmPct)} (${n.paymentBasis}) — it is not paying, so what it earns turns on the time and cost of taking the property.`;
    }
    // Under the balance the yield runs past the coupon's cash on the price,
    // the difference the discount accreting; over it, the premium is lost
    // at maturity — and a premium larger than the interest left to collect
    // is a loss, said as one. Compared on the tenths the page prints, so a
    // note at par says neither.
    const [ytm10, cy10] = [Math.round(n.ytmPct * 10), n.currentYieldPct != null ? Math.round(n.currentYieldPct * 10) : null];
    const premium = n.price - (n.terms.balance ?? n.price);
    const current =
      n.currentYieldPct == null || cy10 == null || ytm10 === cy10
        ? ""
        : ytm10 > cy10
          ? `: ${pctText(n.currentYieldPct)} of current yield on the price, the rest the discount accreting`
          : ytm10 < 0 && premium > 0
            ? `: the ${money(premium)} premium over the balance is more than the interest left to collect`
            : `: under its ${pctText(n.currentYieldPct)} of current yield, the premium over the balance lost at maturity`;
    return n.terms.status === "performing"
      ? `Held to its ${due} maturity it yields ${pctText(n.ytmPct)} on the price (${n.paymentBasis})${current}.`
      : `Paid as agreed to its ${due} maturity it yields ${pctText(n.ytmPct)} on the price (${n.paymentBasis})${current} — the memorandum does not say whether it is performing.`;
  }
  if (n.currentYieldPct != null) {
    return `A year's interest is ${pctText(n.currentYieldPct)} of the price; the memorandum states no maturity, so there is no yield to maturity to give.`;
  }
  return "";
}

/** The note's cushion (#416): the loan-to-value at the balance and at the
 *  price, over the value the OM states for the collateral — "" where it
 *  states none. */
export function noteCollateralSentence(n: NoteRead | null): string {
  if (!n || n.ltvAtBalancePct == null || n.ltvAtPricePct == null || n.terms.collateralValue == null) return "";
  return `The collateral's stated ${money(n.terms.collateralValue)} puts the balance at ${Math.round(n.ltvAtBalancePct)}% of its value and the price at ${Math.round(n.ltvAtPricePct)}%.`;
}

/**
 * The small print under the note's figures (#416): how long the note runs
 * and how its payments were run, or why there is no yield to maturity —
 * "" where neither applies.
 */
export function noteCaption(n: NoteRead | null): string {
  if (!n) return "";
  if (n.monthsLeft != null && n.terms.maturity && n.paymentBasis) {
    return `${n.monthsLeft} ${n.monthsLeft === 1 ? "month" : "months"} to its ${monthYear(n.terms.maturity)} maturity, ${n.paymentBasis}.`;
  }
  if (!n.terms.maturity && n.currentYieldPct != null) {
    return "The memorandum states no maturity, so there is no yield to maturity to give.";
  }
  return "";
}

// A rent per foot, a monthly figure, a coverage ratio, a bump or a reset is
// not the year's ground rent.
const NOT_ANNUAL_RENT = /\bper\b|\/|psf|month|\bmo\b|coverage|ratio|escalat|bump|increase|reset|%|percent|yield|cap|\bterm\b|expir|option/i;

/** The annual ground rent, from the row the extraction is asked to label
 *  "Ground rent"; null where none is stated. */
export function groundRentOf(ex: ExtractionResult | null | undefined): number | null {
  const row = (ex?.metrics ?? []).find((m) => /^\s*(annual\s+|current\s+|in[- ]place\s+)?ground (lease )?rent\b/i.test(m.label) && !NOT_ANNUAL_RENT.test(m.label));
  const n = row ? parseUsd(row.value) : null;
  return n != null && n > 0 ? n : null;
}

/** The building's operating income before the ground rent — the row the
 *  extraction is asked to label "Income before ground rent", never an NOI
 *  label, so no NOI reader takes the building's income for the deal's. */
export function incomeBeforeGroundRentOf(ex: ExtractionResult | null | undefined): number | null {
  const row = (ex?.metrics ?? []).find((m) => /income before (the )?ground rent|leasehold operating income/i.test(m.label) && !NOT_ANNUAL_RENT.test(m.label));
  const n = row ? parseUsd(row.value) : null;
  return n != null && n > 0 ? n : null;
}

/**
 * Read the interest into what every surface says. Null for a plain fee
 * simple (or an extraction saved before the interest was read) with nothing
 * to say — the usual case needs no banner; a fee simple with a ground lease
 * on part of the site has something to say, and says it.
 *
 * `askingPrice` is the caller's: the shared price reader lives in
 * lib/deal-strategy, which reads this module.
 */
export function readInterest(
  ex: ExtractionResult | null | undefined,
  askingPrice: number | null,
  /** the day the note's yield is read on (#416) — today unless a test says */
  asOf: Date = new Date(),
): InterestRead | null {
  const it = ex?.interest;
  if (!ex || !it) return null;
  const kind = it.kind;
  const groundLease = (it.groundLease ?? "").trim();
  const groundRent = groundRentOf(ex);
  const incomeBeforeGroundRent = incomeBeforeGroundRentOf(ex);
  if ((kind === "fee_simple" || kind === "unknown") && !groundLease && groundRent == null) return null;
  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(it.page);
  const page = n != null && pageCount != null && n <= pageCount ? it.page.trim() : "";
  const sharePct = kind === "partial_interest" ? parseSharePct(it.share) : null;
  const price = askingPrice != null && askingPrice > 0 ? askingPrice : null;
  const impliedWhole = sharePct != null && price != null ? price / (sharePct / 100) : null;
  const noteTerms = kind === "note" ? readNoteTerms(ex) : null;
  const balance = noteTerms?.balance ?? null;
  const note = noteTerms ? readNote(noteTerms, askingPrice != null && askingPrice > 0 ? askingPrice : null, asOf) : null;
  const discountPct = balance != null && balance > 0 && price != null ? ((balance - price) / balance) * 100 : null;
  const loan = (it.loan ?? "").trim();
  const groundRentCoverage =
    groundRent != null && incomeBeforeGroundRent != null ? incomeBeforeGroundRent / groundRent : null;
  // When the ground lease ends (#421): on either side of it, and on a fee
  // simple with one under part of the site — only as the memorandum states.
  const term =
    kind === "leasehold" || kind === "leased_fee" || groundLease ? readGroundLeaseTerm(ex, asOf) : null;
  // "the building's $6.0M of income covers the $1.2M ground rent 5.0×" —
  // two stated figures, one division.
  const coverageClause =
    groundRentCoverage != null && groundRent != null && incomeBeforeGroundRent != null
      ? `the building's ${money(incomeBeforeGroundRent)} of income before the ground rent covers the ${money(groundRent)} rent ${times(groundRentCoverage)}`
      : null;

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
      if (coverageClause) headline += ` Here ${coverageClause}.`;
      modelCaveat =
        "The screening model capitalises the exit like a fee-simple building. On a leasehold the value at exit is what the term left will bear — run the ground lease calculator on the stated term.";
      break;
    case "leased_fee":
      headline = `This memorandum sells a LEASED FEE: the land under a building someone else owns, with its ground lease. The buyer collects the ground rent — the income here, not an expense and never the building's NOI — and when the lease ends the building reverts to the buyer. The rent is safe while the building's own income covers it${
        coverageClause ? `, and ${coverageClause}` : ""
      }.`;
      modelCaveat =
        "The screening model runs the ground rent as a building's NOI, with a building's growth, vacancy and expense assumptions. A ground rent grows by its lease's own schedule and resets, has no vacancy while the lease stands, and ends in the reversion of the land and the building — run the ground lease calculator's leased-fee side on the stated terms.";
      break;
    default:
      // Either side of the lease: an owner that pays a ground rent under
      // part of its site, or one that collects it (a pad let on a ground
      // lease, common on a retail center) — the lease as stated says which,
      // and the sentence must not guess (#415).
      headline =
        "Part of the site is under a ground lease. Whether this owner pays the ground rent (an expense ahead of the debt) or collects it (a pad let on a ground lease), the lease's term and resets decide what that part is worth — the lease as stated says which.";
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
    note,
    groundLease,
    loan,
    groundRent,
    incomeBeforeGroundRent,
    groundRentCoverage,
    // A note's figures follow the lead (#416): what it earns, then its
    // cushion — the panel draws both and says the lead alone.
    headline: [headline, noteYieldSentence(note), noteCollateralSentence(note)].filter(Boolean).join(" "),
    lead: headline,
    modelCaveat,
    term,
    termLine: term ? groundLeaseTermLine(term) : "",
  };
}

/** The deal context's line: what is being sold, for every step that reads
 *  the OM after the extraction. */
export function interestContextLine(r: InterestRead): string {
  const facts = [
    r.groundLease ? `The ground lease as stated: ${r.groundLease}.` : "",
    r.termLine ? `${r.termLine}.` : "",
    r.loan ? `The loan as stated: ${r.loan}.` : "",
  ]
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
    leased_fee:
      "LEASED-FEE TRAPS, checked by name where the OM gives the inputs: (a) THE RENT IS THE INCOME — the ground rent with its bumps and resets, never the building's NOI, which belongs to the building's owner; (b) COVERAGE — the building's income over the ground rent is the whole margin of safety, and a thin one is a tenant that stops paying first; (c) SUBORDINATION — a subordinated ground lease has pledged the land to the leasehold's lender, so a default can cost the buyer the land itself, where an unsubordinated rent sits ahead of that mortgage; (d) THE RESETS — a rent reset to a share of then-current land value is where the growth lives, and a lease on fixed bumps alone has none; (e) THE REVERSION — the years until the building reverts to the buyer, and what it will be worth then; (f) PURCHASE OPTIONS — a tenant's option to buy the land caps the reversion.",
    fee_simple:
      "GROUND-LEASE TRAP, checked by name: part of the site is under a ground lease — say which side this owner is on: paying the rent (an expense ahead of the debt, whose term and resets can reprice that part) or collecting it (the ground tenant's credit, and the reversion of its improvements at the lease's end).",
    unknown:
      "GROUND-LEASE TRAP, checked by name: part of the site is under a ground lease — say which side this owner is on: paying the rent (an expense ahead of the debt, whose term and resets can reprice that part) or collecting it (the ground tenant's credit, and the reversion of its improvements at the lease's end).",
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
    case "note": {
      // What it earns, in a clause (#416): to maturity where it pays, "not
      // paying" or "past its maturity" where the contract yield is not the
      // buyer's.
      const n = r.note;
      const earns = !n
        ? ""
        : n.matured
          ? ", past its maturity"
          : n.terms.status === "non_performing"
            ? ", and not paying"
            : n.ytmPct != null && n.terms.maturity
              ? `, ${pctText(n.ytmPct)} to its ${monthYear(n.terms.maturity)} maturity${n.terms.status === "performing" ? "" : " if paid as agreed"}`
              : "";
      return `A loan secured by the property, not the property${
        r.discountPct != null && r.askingPrice != null && r.balance != null
          ? ` — the ${money(r.askingPrice)} price is ${discountPhrase(r.discountPct)} the ${money(r.balance)} balance${earns}`
          : earns
      }`;
    }
    case "partial_interest":
      return r.sharePct != null && r.askingPrice != null && r.impliedWhole != null
        ? `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the whole`
        : "A share of the owning entity, its percentage not stated";
    case "leasehold":
      return "A leasehold — the building and a lease on the land, not the land";
    case "leased_fee":
      return `The leased fee — the land under a building someone else owns, and its ground rent${
        r.groundRentCoverage != null ? `, covered ${times(r.groundRentCoverage)} by the building's income` : ""
      }`;
    default:
      return "Fee simple, with a ground lease on part of the site";
  }
}
