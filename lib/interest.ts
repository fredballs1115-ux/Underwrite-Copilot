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
// Where the memorandum states the loan the entity carries ("Entity loan
// balance"), the price grossed up is the EQUITY's whole, not the asset's:
// the entity's loan sits on top of it, and every surface that prints the
// whole names both figures (research pass 23: a 4.5% share at $1.8M beside
// a $56.5M loan read "$40.0M for the whole"). The loan is never added to
// the price here — what the model runs at is the owner's call. A stated 100%
// ("100% of the beneficial interests", a DST's, offered in units) is all of
// the entity's interests: its price is the whole's, nothing is grossed up,
// and it is said so — never as a percentage the memorandum does not state
// (research pass 28).
//
// A LEASEHOLD IS A WASTING ASSET. The buyer owns the building and a lease on
// the land; the ground rent comes ahead of the debt, and at expiry the
// building reverts. A capitalised NOI values a perpetuity that ends. Where
// the memorandum's own words name a master lease of the building, sublet to
// its tenants (a sandwich position), and no ground lease, the buyer owns
// neither the building nor the land, and is told so (research pass 28).
//
// A LEASED FEE'S INCOME IS THE GROUND RENT (#415). The buyer takes the land
// under a building someone else owns and becomes the ground lessor: the
// ground rent is the income — never an expense, and never the building's
// NOI, which belongs to its owner — the building's own income over that
// rent is the whole margin of safety, and when the lease ends the building
// reverts to the buyer. Read as fee simple with a ground lease, the same
// deal was told its income was an expense. Under a wireless tower, a
// billboard or a solar array — named so in the memorandum's own words —
// there is no building to revert: the land comes back, the tenant's
// equipment is its own as such leases usually provide, and such tenants
// often hold a right to end the lease early, which the extraction files as
// "Ground lease termination right" and every surface says as stated
// (research pass 23).
//
// A BLANK IS NULL. A share the OM does not state as a percentage is not
// guessed at; a balance it does not state is not derived.
//
// NOT EVERY SHARE IS AN ENTITY'S (research pass 37). A tenant in common holds
// an undivided share of the property itself — title to real estate, beside
// its co-owners, with no entity owning the property — so its sale, its loan
// and its exit are the real estate's, never an entity's waterfall. Beneficial
// interests in a Delaware statutory trust are a trust's: its trustee's
// limits, its master tenant, its load and its conversion are asked beside the
// share's own questions. Each is read off the interest's own words
// (`shareHoldingOf`); the gross-up is the same arithmetic as any share's.

import type { ExtractionResult, InterestKind } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { parsePrice } from "@/lib/criteria";
import { parsePageNumber } from "@/lib/facts";
import { compactUsd, parseUsd } from "@/lib/money";
import {
  endHasPassed,
  endIsAhead,
  fromToday,
  groundLeaseTermLine,
  groundLeaseTerminationOf,
  readGroundLeaseTerm,
  readMasterLeaseTerm,
  termEndLabel,
  type GroundLeaseTerm,
  type LeaseName,
} from "@/lib/ground-lease-term";
import { noteUnderWater, readNote, readNoteTerms, type NoteRead } from "@/lib/note-yield";
import { isPreferredEquity, POSITION_TRAPS, positionModelLine, positionTag, readPosition, type PositionRead } from "@/lib/position";

export type { InterestKind };

// A percentage is a share only where its own words say what it is a share
// OF. Any lone percentage had been read as the share, so "Preferred equity,
// 12% preferred return" read as a 12% stake and grossed a $15M price up to
// $125M. A return, a pref, a rate, a coupon, a yield, a cap, an IRR, a fee,
// a promote or an occupancy is never an ownership share, and the words
// naming one win over any share word beside them ("a 12% preferred equity
// interest" is withheld, not read). The fee simple and the leased fee are
// estates, not a fee or an occupancy.
const NOT_A_SHARE =
  /\breturns?\b|\bpref(?:s|erred|erence)?\b|\brates?\b|\bcoupons?\b|\byield|\bcaps?\b|\bcapped\b|\bcapitali[sz]ation\b|\birrs?\b|(?<!leased[\s-])\bfees?\b(?![\s-]+simple)|\bpromote[sd]?\b|\bcarr(?:y|ied)\b|\bprofits?\b|\boccup(?:ancy|ied)\b|\bleased\b(?![\s-]+fee)|\bvacan(?:t|cy)\b|\bhurdles?\b|\bearn|\bpa(?:y|ys|ying|id|yable)\b|\bdistribut|\baccru|\bdividends?\b|\bannual(?:ly)?\b|\bannum\b|\bcompound|\bcash[\s-]+on[\s-]+cash\b|\bltv\b|\bltc\b|\bloan[\s-]+to[\s-]+(?:value|cost)\b|\bdiscount|\bpremium|\bcommission|\bspread|\bmargin|\bcoverage\b|\bescalat|\bincrease|\bbumps?\b|\binterest[\s-]+(?:only|income|expense|reserve|payments?)\b|\bdefault\b/i;
// What an ownership share is called: an interest, a stake, ownership, a
// share, a tenancy in common, a membership or a partnership interest — or
// the entity it is a share of ("49% of the LLC").
const SHARE_WORDS =
  /\binterests?\b|\bstakes?\b|\bown(?:ed|er|ers|ership)\b|\bshares?\b|\bten(?:ant|ants|ancy)[\s-]+in[\s-]+common\b|\btic\b|\bmember(?:s|ships?)?\b|\bpartner(?:s|ships?)?\b|\bllcs?\b|\bentity\b|\b(?:joint[\s-]+)?ventures?\b|\bjv\b/i;
// A percentage OF a partner's, a member's, a manager's or a sponsor's interest
// is a share of a share, never the owning entity's share (research pass 37):
// "50% of the general partner interest", "of the GP's interest", "a co-GP
// stake", "a 25% interest in the managing member", "of the sponsor's
// interest", "of the promote", "of the carried interest". A partner's own
// stake in the partnership ("a 2% GP interest") is not one: no "of" or "in"
// puts it inside another holder's share.
const SHARE_OF_SHARE = new RegExp(
  String.raw`\b(?:of|in)\s+(?:the\s+|its\s+)?(?:(?:general\s+partner|gp|managing\s+member|managing\s+partner|manager|sponsor)(?:['’]s|s['’])?\b|(?:gp['’]?s?\s+)?promote\b|carried\s+interest\b)|\bco[\s-]?(?:gp|general\s+partner)s?\b`,
  "i",
);
// A percentage up to 100: a stated 100% of the interests is the whole entity
// (research pass 28), never a figure the reader cannot see.
const PCT_MENTION = /(?<![\d.])(\d{1,2}(?:\.\d+)?|100(?:\.0+)?)\s*(?:%|percent\b|per cent\b)/gi;
// Where a percentage's own words end: its clause's end, a sentence's, or a
// word that starts the next clause.
const CLAUSE_WORD = String.raw`\s(?:and|with|plus|while|which|whereas|but|at|or|versus|vs\.?|including|excluding|where|when)\s`;
const WORDS_AFTER_END = new RegExp(String.raw`[,;:)\]\n]|\.(?=\s|$)|${CLAUSE_WORD}`, "i");
// The words before it run back to its clause's start — never past a colon or
// an opening parenthesis, which put a label in front ("Ownership: 49%",
// "TIC interest (49%)").
const WORDS_BEFORE_START = new RegExp(String.raw`[,;\n]|\.(?=\s|$)|${CLAUSE_WORD}`, "gi");

/** What one percentage's own words say it is: "share", "of_share" (a share
 *  of a partner's, a member's, a manager's or a sponsor's interest — never
 *  the entity's), "not" (a return, a rate, an occupancy…), or null where they
 *  name none of them. */
function readShareWords(words: string): "share" | "of_share" | "not" | null {
  if (SHARE_OF_SHARE.test(words)) return "of_share";
  if (NOT_A_SHARE.test(words)) return "not";
  return SHARE_WORDS.test(words) ? "share" : null;
}

/** A field that is one percentage and nothing else ("49%", read off a
 *  table's "Interest offered" cell). */
const LONE_PCT = /^(\d{1,2}(?:\.\d+)?|100(?:\.0+)?)\s*(?:%|percent|per cent)$/i;

/** The lone percentage a field is, where it is one and over 0; null
 *  otherwise. */
function lonePct(t: string | null | undefined): number | null {
  const lone = (t ?? "").trim().match(LONE_PCT);
  const n = lone ? Number(lone[1]) : null;
  return n != null && n > 0 && n <= 100 ? n : null;
}

/** A partial interest's share, in percent, read off the OM's own words
 *  ("49% limited partnership interest", "a 90 percent stake", "Ownership
 *  interest: 49%"); null where no single percentage up to 100 is stated AS a
 *  share. A stated 100% ("100% of the beneficial interests", a DST's) is all
 *  of the entity's interests (`isWholeShare`): its price is the whole's, and
 *  nothing is grossed up (research pass 28 — it had read as no percentage at
 *  all). A percentage counts only where the words right after it — or,
 *  where those name nothing, the words right before it in its clause — name
 *  an ownership share and no return, rate or occupancy; a percentage among
 *  other words that name nothing is withheld, and so is a range ("49–51%").
 *  A percentage OF a partner's, a member's, a manager's or a sponsor's
 *  interest ("50% of the general partner interest", "a 25% interest in the
 *  managing member") is a share of a share and never the entity's (research
 *  pass 37: it had grossed a GP stake's $3.2M up to $6.4M for a building the
 *  memorandum values at $80.0M). A field that is ONE percentage and nothing
 *  else is the share, since the field is the share's. */
export function parseSharePct(text: string | null | undefined): number | null {
  const t = text ?? "";
  // The share field is filled only on a partial interest, so a field that
  // is nothing but one percentage IS the share: there are no words beside it
  // to be a return's or a rate's.
  if (LONE_PCT.test(t.trim())) return lonePct(t);
  return onePct(percentsReading(t, "share"));
}

/** The one percentage a share of a share is stated at — "50% of the general
 *  partner interest" is 50 — read as `parseSharePct` reads a share; null
 *  where none, or two different ones, are stated. */
export function shareOfSharePct(text: string | null | undefined): number | null {
  return onePct(percentsReading(text ?? "", "of_share"));
}

/** One distinct percentage among those read, a stated 100% counting only
 *  alone: "a 49% limited partnership interest in the entity that owns 100%
 *  of the fee simple interest" sells 49% (the audit of 2026-10-05 —
 *  admitting 100% had left it no share at all, and the model ran the whole
 *  building at the share's price); two different ones ("a 49% LP interest
 *  and a 2% GP interest") is not one, withheld rather than picked. */
function onePct(read: number[]): number | null {
  const valid = [...new Set(read)];
  const under = valid.filter((n) => n < 100);
  const shareOf = under.length > 0 ? under : valid;
  return shareOf.length === 1 ? shareOf[0] : null;
}

/** Every percentage up to 100 in the text whose own words read as `want`
 *  (`readShareWords`): the words right after it, or where those name
 *  nothing, the words right before it in its clause. A range is none. */
function percentsReading(t: string, want: "share" | "of_share"): number[] {
  const hits = [...t.matchAll(PCT_MENTION)].map((m, i, all) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // Up to the next percentage, and the point where this one's clause ends
    // inside that stretch (-1: it runs to the next percentage).
    const upTo = i + 1 < all.length ? (all[i + 1].index ?? t.length) : t.length;
    const tail = t.slice(end, upTo);
    return { n: Number(m[1]), start, end, tail, cut: tail.search(WORDS_AFTER_END) };
  });
  return hits.flatMap((h, i) => {
    if (!Number.isFinite(h.n) || !(h.n > 0) || !(h.n <= 100)) return [];
    // A range is no one share.
    if (/\d\s*%?\s*(?:[-–—]|\bto)\s*$/i.test(t.slice(0, h.start)) || /^\s*(?:[-–—]|to\b)\s*\d/i.test(t.slice(h.end))) return [];
    const after = h.cut >= 0 ? h.tail.slice(0, h.cut) : h.tail;
    // The words before it are the ones after the previous percentage's own
    // clause ended — never that percentage's words ("a 90% stake (10%
    // retained by the sponsor)" is one share, not two).
    const prev = i > 0 ? hits[i - 1] : null;
    const lead = !prev ? t.slice(0, h.start) : prev.cut >= 0 ? prev.tail.slice(prev.cut) : "";
    const clauseStart = [...lead.matchAll(WORDS_BEFORE_START)].at(-1);
    const before = clauseStart ? lead.slice((clauseStart.index ?? 0) + clauseStart[0].length) : lead;
    return (readShareWords(after) ?? readShareWords(before)) === want ? [h.n] : [];
  });
}

/** A share stated as 100% — all of the owning entity's interests, like a
 *  DST's beneficial interests offered in units or an LLC's membership
 *  interests sold whole (research pass 28). Its price is the whole's, so
 *  nothing is grossed up, and every surface that says a share's gross-up
 *  says all of the entity's interests instead; a share under 100% reads as
 *  before. */
export function isWholeShare(sharePct: number | null | undefined): boolean {
  return sharePct != null && sharePct >= 100;
}

// Interests offered in units, by the memorandum's own words: "offered in
// $100,000 units", "units of beneficial interest", a minimum investment —
// never a building's units ("a DST owning 240 units").
const IN_UNITS =
  /\b(?:offered|sold|issued|available|marketed)\s+in\s+(?:\$[\d.,]+\s*(?:[km]\b)?\s*)?(?:investment\s+)?units\b|\bunits\s+of\s+(?:beneficial\s+)?interests?\b|\bminimum\s+(?:investment|purchase|subscription)\b/i;

/** The interest's kind as every reader takes it: a preferred equity position
 *  is its own kind, and so is a share the extraction filed before that kind
 *  was asked whose rows say a position (lib/position `isPreferredEquity`):
 *  its price buys a rate and a redemption, never a slice of the building. An
 *  extraction saved before the interest was read is fee simple. */
function interestKindOf(ex: ExtractionResult | null | undefined): InterestKind {
  return isPreferredEquity(ex) ? "preferred_equity" : (ex?.interest?.kind ?? "fee_simple");
}

// A tenancy in common by the interest's own words: tenant(s) in common, a
// tenancy in common, TIC, an undivided interest, a co-tenancy interest or
// agreement, co-owners "as co-tenants" — never a retail lease's co-tenancy
// clause or a center's co-tenants, which are an anchor's and other tenants',
// no co-ownership.
const TIC_WORDS =
  /\bten(?:ant|ants|ancy|ancies)[\s-]+in[\s-]+common\b|\btics?\b|\bundivided\b|\bco[\s-]?tenancy[\s-]+(?:interests?|agreements?|ownership)\b|\bas\s+co[\s-]?tenants\b/i;
// A Delaware statutory trust's beneficial interests, by their own words.
const DST_WORDS = /\bdelaware\s+statutory\s+trusts?\b|\bdsts?\b|\bbeneficial\s+interests\b/i;

/** What a partial interest's share is a share OF where it is not the owning
 *  entity's, by the interest's own words (its share as stated and its
 *  sentence): an undivided interest in the property held as a tenant in
 *  common ("tic") — title to real estate beside its co-owners, no entity's
 *  share at all — beneficial interests in a Delaware statutory trust
 *  ("dst"), a trust's, or a share of the general partner's interest
 *  ("gp_stake"), a share of a share whose economics are the general
 *  partner's capital and promote. */
export type ShareHolding = "tic" | "dst" | "gp_stake";

/** The words a share of the general partner's interest is read off: the
 *  share as stated, where it names a share of a share; else, where the share
 *  as stated names no ownership share of its own (a lone figure, or
 *  nothing), the first clause of the interest's sentence, which says what is
 *  sold — never a later clause about what the sponsor keeps ("a 90% LP
 *  interest; the sponsor retains the GP interest" sells the LP's). */
function gpStakeWords(ex: ExtractionResult | null | undefined): string | null {
  const share = ex?.interest?.share ?? "";
  if (SHARE_OF_SHARE.test(share)) return share;
  if (SHARE_WORDS.test(share)) return null;
  const first = (ex?.interest?.summary ?? "").split(/[;\n]|\.(?=\s|$)/)[0] ?? "";
  return SHARE_OF_SHARE.test(first) ? first : null;
}

/** The share's holding (`ShareHolding`) on a partial interest; null for a
 *  share of the owning entity as such, and on every other interest. A share
 *  of a share is read first, then a trust named in the words, whatever else
 *  they say. */
export function shareHoldingOf(ex: ExtractionResult | null | undefined): ShareHolding | null {
  if (interestKindOf(ex) !== "partial_interest") return null;
  if (gpStakeWords(ex) != null) return "gp_stake";
  const words = [ex?.interest?.share, ex?.interest?.summary].filter((w): w is string => typeof w === "string").join(" \n ");
  if (DST_WORDS.test(words)) return "dst";
  if (TIC_WORDS.test(words)) return "tic";
  return null;
}

/** A share of the general partner's interest (research pass 37): a share
 *  of a share — of the general partner's, the managing member's, the
 *  sponsor's interest, a co-GP stake or a slice of the promote — never a
 *  share of the owning entity, and grossed up to nothing. */
export function isGpStake(ex: ExtractionResult | null | undefined): boolean {
  return shareHoldingOf(ex) === "gp_stake";
}

/** A GP stake's own percentage, as stated ("50% of the general partner
 *  interest" is 50): of the general partner's interest, never the entity's.
 *  The share as stated is read first — a lone figure there is the stake's —
 *  then the sentence's first clause; null where none is stated. */
export function gpStakePctOf(ex: ExtractionResult | null | undefined): number | null {
  if (!isGpStake(ex)) return null;
  const share = ex?.interest?.share ?? "";
  return shareOfSharePct(share) ?? lonePct(share) ?? shareOfSharePct(gpStakeWords(ex));
}

/** An undivided interest in the property held as a tenant in common: title
 *  to real estate beside its co-owners, never a share of an entity. */
export function isTenancyInCommon(ex: ExtractionResult | null | undefined): boolean {
  return shareHoldingOf(ex) === "tic";
}

/** Beneficial interests in a Delaware statutory trust. */
export function isDst(ex: ExtractionResult | null | undefined): boolean {
  return shareHoldingOf(ex) === "dst";
}

/** The stated loan beside a share's grossed-up price, named for whose it is:
 *  the entity's — or, on an undivided interest held as a tenant in common,
 *  where no entity owns the property, the property's (research pass 37).
 *  "stated" reads "the entity's stated $56.5M loan" / "the stated $9.0M loan
 *  on the property"; "short" reads "the entity's $56.5M loan" / "the
 *  property's $9.0M loan". `amount` is the caller's money text. */
export function entityLoanWords(ex: ExtractionResult | null | undefined, amount: string, form: "stated" | "short" = "stated"): string {
  const tic = isTenancyInCommon(ex);
  if (form === "short") return tic ? `the property's ${amount} loan` : `the entity's ${amount} loan`;
  return tic ? `the stated ${amount} loan on the property` : `the entity's stated ${amount} loan`;
}

/** The minimum the price readers need: the kind; a partial interest's share
 *  where one percentage is stated as the share (`parseSharePct`); and the
 *  loan its entity carries where the memorandum states one (`entityLoanOf`)
 *  — beside it, the share's price grosses up to the equity's whole, not the
 *  building's price, so no reader divides it as the building's
 *  (lib/deal-strategy `buildingPriceOf`, lib/comp-detail `subjectBasis`).
 *  An extraction saved before the interest was read is fee simple. */
export function interestOf(ex: ExtractionResult | null | undefined): {
  kind: InterestKind;
  sharePct: number | null;
  entityLoan: number | null;
} {
  const kind = interestKindOf(ex);
  const share = kind === "partial_interest";
  return {
    kind,
    // A share of the general partner's interest is a share of a share: no
    // percentage of the entity is stated, so nothing is grossed up and no
    // building's price is read off it — even a lone figure in the share's
    // field, which is the stake's (research pass 37).
    sharePct: share && !isGpStake(ex) ? parseSharePct(ex?.interest?.share) : null,
    entityLoan: share ? statedEntityLoan(ex) : null,
  };
}

// The loan the owning entity carries, from the row the extraction is asked
// to label "Entity loan balance" — never a loan the buyer takes, one offered
// for assumption or a share's slice of the balance.
const ENTITY_LOAN_ROW = /^\s*entity(?:[- ]level)?\s+(?:loan|debt|mortgage)(?:\s+(?:balance|amount|outstanding))?\s*(?:\([^)]*\))?\s*$/i;
// The construction loan the owning entity has committed, from the row the
// extraction is asked to label "Entity construction loan" (research pass 37:
// a development joint venture's equity commitment sits under it, as a share
// of a drawn balance's equity does).
const ENTITY_CONSTRUCTION_LOAN_ROW =
  /^\s*entity(?:[- ]level)?\s+construction\s+(?:loan|debt|financing)(?:\s+(?:balance|amount|commitment|committed|outstanding))?\s*(?:\([^)]*\))?\s*$/i;

/** The loan the entity-loan rows state, whatever is being sold: the drawn
 *  balance where one is stated, else the construction loan committed. */
function statedEntityLoan(ex: ExtractionResult | null | undefined): number | null {
  const rows = ex?.metrics ?? [];
  for (const re of [ENTITY_LOAN_ROW, ENTITY_CONSTRUCTION_LOAN_ROW]) {
    const row = rows.find((m) => m && typeof m.label === "string" && re.test(m.label));
    if (!row || typeof row.value !== "string" || /%|percent/i.test(row.value)) continue;
    const n = parseUsd(row.value);
    if (n != null && n > 0) return n;
  }
  return null;
}

/** The loan the owning entity carries, as the memorandum states it, on a
 *  partial interest — its unpaid balance ("Entity loan balance"), else the
 *  construction loan it has committed ("Entity construction loan") — the
 *  debt that sits on top of the equity a share's price grosses up to. Null
 *  on every other interest, and where no such row is stated: a blank is
 *  null. */
export function entityLoanOf(ex: ExtractionResult | null | undefined): number | null {
  return interestOf(ex).entityLoan;
}

// The plan's total row — the whole project's cost, the price inside it — in
// lib/deal-strategy's own words (its TOTAL_ROW, and the rates, reserves and
// annual figures its BUDGET_EXCLUDE refuses), read here because that module
// reads this one; a test holds the two readers to each other.
const PROJECT_COST_ROW = /total (project|development) (cost|budget)s?|total capitali[sz]ation|all[- ]?in (cost|basis|budget)/i;
const NOT_A_PROJECT_COST = /\bper\b|\/|psf|unit|(?<!interest[\s-])reserve|annual|\byr\b|year/i;

/** The whole project's cost the memorandum states — the total row the
 *  plan's cost is read from, a range at its top — or null. */
export function statedProjectCostOf(ex: ExtractionResult | null | undefined): number | null {
  const row = (ex?.metrics ?? []).find((m) => m && typeof m.label === "string" && PROJECT_COST_ROW.test(m.label) && !NOT_A_PROJECT_COST.test(m.label));
  const n = row && typeof row.value === "string" ? parsePrice(row.value) : null;
  return n != null && n > 0 ? n : null;
}

/** The stated total project cost where it sits above the figure a share's
 *  price grosses up to (research pass 37): that figure is then the equity's
 *  whole, never the whole — a development joint venture's equity commitment
 *  grossed up is its equity, with the construction debt above it. Null where
 *  none is stated, or it sits at or under the figure. */
export function projectCostAboveOf(ex: ExtractionResult | null | undefined, grossedUp: number | null): number | null {
  if (grossedUp == null || !(grossedUp > 0)) return null;
  const cost = statedProjectCostOf(ex);
  return cost != null && cost > grossedUp * 1.005 ? cost : null;
}

/** `projectCostAboveOf` where it is the one thing that says a share's
 *  grossed-up figure is the equity's whole: a share of the owning entity
 *  under 100% beside no stated entity loan (whose words already say so) —
 *  never a tenancy in common or a share of a share. Every reader that names
 *  the grossed-up figure asks this one (the interest's own lines, the
 *  model's price note, the plan, the plausibility check). */
export function shareProjectCostOf(ex: ExtractionResult | null | undefined, grossedUp: number | null): number | null {
  const { kind, sharePct, entityLoan } = interestOf(ex);
  if (kind !== "partial_interest" || sharePct == null || isWholeShare(sharePct) || entityLoan != null) return null;
  const holding = shareHoldingOf(ex);
  if (holding === "tic" || holding === "gp_stake") return null;
  return projectCostAboveOf(ex, grossedUp);
}

// A master lease of the building from its owner, sublet to its tenants — a
// sandwich position — by the memorandum's own words: a master leasehold, the
// master lessee, a sandwich lease, a leasehold held under a master lease or
// a master lease of the building. A seller's master lease of vacant suites
// (a rent guarantee) is none of these.
const MASTER_LEASE =
  /\bmaster[\s-]+leasehold\b|\bmaster[\s-]+lessee\b|\bsandwich[\s-]+(?:leases?|leasehold|position|interest)\b|\b(?:under|pursuant\s+to|through|via)\s+(?:an?|the|its)\s+master[\s-]+lease\b|\bmaster[\s-]+lease\s+(?:of|on|covering)\s+(?:the\s+)?(?:entire\s+|whole\s+)?(?:building|property|premises|improvements)\b/i;
const NAMES_GROUND_LEASE = /\bground[\s-]+lease/i;

/** Whether a leasehold is a master lease of the building, sublet to its
 *  tenants (research pass 28), by the interest's own words — its sentence
 *  and its lease as stated: a master or sandwich lease named, and no ground
 *  lease. A plain leasehold, and anything but a leasehold, is not. */
export function isMasterLeasehold(ex: ExtractionResult | null | undefined): boolean {
  const it = ex?.interest;
  if (it?.kind !== "leasehold") return false;
  const words = [it.summary, it.groundLease].filter((w): w is string => typeof w === "string").join(" \n ");
  return MASTER_LEASE.test(words) && !NAMES_GROUND_LEASE.test(words);
}

/**
 * The lease a leasehold's value runs out with, and its term on a day: a
 * master leasehold's own master lease (research pass 28, round 9: the
 * position ends with it, and a ground lease's rows are never read for it),
 * else the ground lease's. Null where the memorandum states no end for it.
 * Every reader of a leasehold's term reads it here — the tag, the panel,
 * the exit on the term.
 */
export function leaseholdTermOf(
  ex: ExtractionResult | null | undefined,
  asOf: Date = new Date(),
): { term: GroundLeaseTerm | null; lease: LeaseName } {
  return isMasterLeasehold(ex)
    ? { term: readMasterLeaseTerm(ex, asOf), lease: "master lease" }
    : { term: readGroundLeaseTerm(ex, asOf), lease: "ground lease" };
}

/** What a ground lease's tenant puts on the land, where the memorandum's
 *  own words name it: in a sentence ("a wireless tower") and its gear as
 *  the subject of one ("the tower and its equipment"). */
export interface EquipmentUse {
  what: string;
  gear: string;
}

// What a ground lease is FOR, by the gear's own name. A tower only with a
// word that makes it one — an office tower is a building — and an antenna,
// a carrier or "wireless" only beside a site or a tower: a carrier's
// antennas sit on rooftops as often as on a tower, and an antenna licence a
// building's owner keeps is the building's (the reader took "rooftop
// antenna licenses are retained by the ground lessee" for a tower). A sign
// and a solar array by their own names, and panels only as an array's or a
// ground-mounted system's: rooftop panels are the building's.
const TOWER = String.raw`\b(?:cell(?:ular)?|wireless|telecom(?:munications?)?|communications?|radio|broadcast|transmission|antenna|monopole|self[- ]support(?:ing)?|guyed|lattice|stealth)[\s-]+towers?\b|\bmonopoles?\b|\b(?:cell|antenna)[\s-]+sites?\b|\b(?:telecom(?:munications?)?|wireless)[\s-]+(?:sites?|ground\s+leases?)\b`;
const BILLBOARD = String.raw`\bbillboards?\b|\boutdoor[\s-]+advertising\b|\badvertising\s+(?:signs?|structures?|displays?)\b`;
const SOLAR = String.raw`\bsolar[\s-]+(?:panel[\s-]+)?(?:arrays?|farms?|installations?|projects?|facilit(?:y|ies)|plants?|leases?|energy|power|generation)\b|\bground[\s-]+mounted[\s-]+(?:solar|photovoltaic|pv)(?:[\s-]+panels?)?\b|\bphotovoltaic\b|\bpv\s+(?:arrays?|systems?|facilit(?:y|ies)|projects?)\b`;

const EQUIPMENT_USES: readonly (EquipmentUse & { re: RegExp })[] = [
  { re: new RegExp(TOWER, "i"), what: "a wireless tower", gear: "the tower and its equipment" },
  { re: new RegExp(BILLBOARD, "i"), what: "a billboard", gear: "the sign and its structure" },
  { re: new RegExp(SOLAR, "i"), what: "a solar array", gear: "the panels and their equipment" },
];

// Any of the gear, and a list of it ("billboards, cell towers or solar
// arrays").
const GEAR = String.raw`(?:${TOWER}|${BILLBOARD}|${SOLAR})`;
const GEAR_LIST = String.raw`${GEAR}(?:\s*(?:,|\band\b|\bor\b|\bnor\b|\/)\s*(?:(?:any|a|an|the|other|new)\s+)*${GEAR})*`;
// A lease that forbids the gear is no lease for it — "the lease prohibits
// billboards and cell towers on the site", "no billboards … may be
// erected", "may not erect a cell tower", "billboards are prohibited" —
// struck before anything is read, the way lib/site-reports strikes "no
// RECs". Only the words of a denial and of putting the gear up stand
// between the denial and the gear, so "may not sublet the cell tower" is
// still a tower's lease.
const DENIED_BEFORE = new RegExp(
  String.raw`\b(?:no|not|never|nor|without|prohibit(?:s|ed|ing)?|forbid(?:s|den|ding)?|bars?|barred|barring|preclude(?:s|d)?|exclud(?:e|es|ed|ing))\b(?:\s+(?:any|a|an|the|all|other|new|further|additional|future|erection|construction|installation|placement|siting|use|of|to|erect|install|build|place|construct|permit|allow|be))*\s+${GEAR_LIST}`,
  "gi",
);
const DENIED_AFTER = new RegExp(
  String.raw`${GEAR_LIST}\s*,?\s*(?:(?:is|are|will\s+be|shall\s+be|may\s+be|be|being)\s+)?(?:not\s+(?:permitted|allowed)|prohibited|forbidden|barred|excluded|precluded|disallowed)\b`,
  "gi",
);
// Gear on a building is the building's, never the ground lease's use:
// "rooftop solar array", "roof-mounted cell sites", "a solar array on the
// roof".
const ON_A_BUILDING_BEFORE = new RegExp(
  String.raw`\b(?:roof[\s-]?tops?|roofs?|roof[\s-]+mounted|rooftop[\s-]+mounted|building[\s-]+mounted|wall[\s-]+mounted|fa[cç]ade[\s-]+mounted|penthouse)(?:\s+[\w-]+){0,2}?\s+${GEAR}`,
  "gi",
);
const ON_A_BUILDING_AFTER = new RegExp(
  String.raw`${GEAR}(?:\s+[\w-]+){0,3}?\s+(?:on|atop|on\s+top\s+of|mounted\s+on|across)\s+(?:the\s+|its\s+|a\s+|each\s+)?(?:building'?s?\s+)?(?:roofs?|roof[\s-]?tops?|buildings?|structure|fa[cç]ade|penthouse|parking\s+(?:deck|garage|structure))\b`,
  "gi",
);

/**
 * The equipment a ground lease's tenant puts on the land — a wireless
 * tower, a billboard, a solar array — where the memorandum's own words name
 * it: the interest's sentence, the ground lease as stated and the class.
 * Never the deal's name, which is a brand ("Solar Gardens Apartments" is a
 * building). Null where they name none, which is a building's ground lease
 * as before. Its equipment is the tenant's, so the land comes back at the
 * lease's end and no building reverts (research pass 23).
 */
export function groundLeaseEquipment(ex: ExtractionResult | null | undefined): EquipmentUse | null {
  if (!ex) return null;
  const words = [ex.interest?.summary, ex.interest?.groundLease, ex.assetClass]
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .join(" \n ")
    // A denial of the gear and gear on a building are struck first: what is
    // left names what the ground lease is for, or nothing.
    .replace(DENIED_BEFORE, " ")
    .replace(DENIED_AFTER, " ")
    .replace(ON_A_BUILDING_BEFORE, " ")
    .replace(ON_A_BUILDING_AFTER, " ");
  const hit = EQUIPMENT_USES.find((u) => u.re.test(words));
  return hit ? { what: hit.what, gear: hit.gear } : null;
}

/** What the price buys, as the pipeline row's tag — "49% share", "Note",
 *  "Leased fee" — and null for a fee simple (or an extraction saved before
 *  the interest was read), where the price is the building's and the row
 *  says nothing more. Either side of a ground lease carries the years to
 *  its end where the memorandum states it (#422): "Leasehold, 45 yrs left"
 *  (whole years, down — a leasehold is never credited with a year it does
 *  not have), "Leased fee, reverts in 45 yrs" — and under a tower, a
 *  billboard or a solar array, where no building reverts, "Leased fee,
 *  lease ends in 22 yrs". */
export function interestTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const { kind, sharePct } = interestOf(ex);
  // Ahead by the DAY: inside its last month the whole months count none,
  // and the tag had dropped the term as if it had ended.
  const term = kind === "leasehold" || kind === "leased_fee" ? leaseholdTermOf(ex, asOf).term : null;
  const left = term && endIsAhead(term) ? term.yearsLeft : null;
  const yrs = left != null ? (left < 1 ? "under 1 yr" : `${Math.floor(left)} ${Math.floor(left) === 1 ? "yr" : "yrs"}`) : null;
  // A term the memorandum states as a count of years, counted here from
  // today though its own date is earlier, or one that already counts its
  // extension options, is at most that long: "up to", as the sentence says
  // the term may be shorter (lib/ground-lease-term) and as the single
  // tenant's tag says a ceiling.
  const atMost = !!term && left != null && left >= 1 && (term.from === "remaining" || term.includesOptions);
  const span = yrs ? `${atMost ? "up to " : ""}${yrs}` : null;
  switch (kind) {
    case "note":
      return "Note";
    case "preferred_equity":
      // "Pref equity, 12% to Jun 2029" — its rate and its redemption.
      return positionTag(readPosition(ex, null, asOf)) ?? "Pref equity";
    case "partial_interest":
      // An undivided interest held as a tenant in common is the real
      // estate's, never an entity's share; a share of the general partner's
      // interest is a share of a share, its percentage the stake's (research
      // pass 37).
      if (isTenancyInCommon(ex)) return sharePct != null ? `TIC ${shareText(sharePct)}` : "TIC";
      if (isGpStake(ex)) {
        const stake = gpStakePctOf(ex);
        return stake != null ? `GP stake ${shareText(stake)}` : "GP stake";
      }
      // A stated 100% buys all of the entity's interests, never "100% share".
      return sharePct != null ? (isWholeShare(sharePct) ? "All entity interests" : `${shareText(sharePct)} share`) : "Share";
    case "leasehold":
      // A master lease of the building, sublet (research pass 28): the
      // position is the lease, and its years are the master lease's.
      if (isMasterLeasehold(ex)) return span ? `Master lease, ${span} left` : "Master lease";
      return span ? `Leasehold, ${span} left` : "Leasehold";
    case "leased_fee":
      // At most that long, the land comes back WITHIN it.
      return yrs
        ? groundLeaseEquipment(ex)
          ? `Leased fee, lease ends ${atMost ? "within" : "in"} ${yrs}`
          : `Leased fee, reverts ${atMost ? "within" : "in"} ${yrs}`
        : "Leased fee";
    default:
      return null;
  }
}

/** The deal type as the header names it, said whose strategy it is where
 *  the price does not buy the building: a note's "Stabilized" describes the
 *  collateral that secures the loan, a leased fee's the building someone
 *  else owns on the land — or, under a wireless tower, a billboard or a
 *  solar array, the lessee's equipment, read off the lease's own words
 *  (`groundLeaseEquipment`, never the deal's name), since no building
 *  stands there. Elsewhere the label as it stands. */
export function dealTypeLabel(strategyLabel: string, ex: ExtractionResult | null | undefined): string {
  const { kind } = interestOf(ex);
  return dealTypeLabelFor(strategyLabel, kind, kind === "leased_fee" ? groundLeaseEquipment(ex) : null);
}

/** The same label from the interest's kind — and, on a leased fee, the
 *  equipment the reader found — for a surface that holds those rather than
 *  the extraction (the workbook's cover). */
export function dealTypeLabelFor(
  strategyLabel: string,
  kind: InterestKind | null | undefined,
  equipment: EquipmentUse | null = null,
): string {
  switch (kind) {
    case "note":
      return `${strategyLabel} (the collateral)`;
    case "preferred_equity":
      // The strategy is the property's the entity owns, not the position's.
      return `${strategyLabel} (the entity's property)`;
    case "leased_fee":
      // "(the lessee's wireless tower)": the equipment without its article
      // (research pass 23 left the header naming a building there).
      return equipment
        ? `${strategyLabel} (the lessee's ${equipment.what.replace(/^an?\s+/, "")})`
        : `${strategyLabel} (the leaseholder's building)`;
    default:
      return strategyLabel;
  }
}

/** What the price buys, in words. */
export const INTEREST_LABEL: Record<InterestKind, string> = {
  fee_simple: "Fee simple",
  leasehold: "Leasehold on a ground lease",
  leased_fee: "The leased fee — the land under a ground lease",
  note: "A loan secured by the property",
  partial_interest: "A share of the owning entity",
  preferred_equity: "A preferred equity position in the owning entity",
  unknown: "Not stated",
};

/** A master leasehold's own words (`isMasterLeasehold`): a lease of the
 *  building, sublet to its tenants — never a leasehold on a ground lease,
 *  which the panel's heading, the context line and the report had called it
 *  (the audit of 2026-10-05). */
export const MASTER_LEASE_LABEL = "Master lease of the building, sublet";

/** A tenancy in common's own words (`isTenancyInCommon`): title to an
 *  undivided share of the property, never "a share of the owning entity",
 *  which every surface had called it (research pass 37). */
export const TIC_LABEL = "An undivided interest in the property, as a tenant in common";

/** A share of a share's own words (`isGpStake`): never "a share of the
 *  owning entity" (research pass 37). */
export const GP_STAKE_LABEL = "A share of the general partner's interest";

export interface InterestRead {
  kind: InterestKind;
  label: string;
  /** the OM's own sentence, "" where it states none */
  summary: string;
  /** cited only where it parses and falls inside the memorandum */
  page: string;
  /** a partial interest's share, percent — 100 where the memorandum states
   *  all of the entity's interests (`isWholeShare`) */
  sharePct: number | null;
  /** a partial interest whose own words say its interests are offered in
   *  units (a DST's "$100,000 units") */
  inUnits: boolean;
  /** what a partial interest's share is a share OF where it is not the
   *  owning entity's (`shareHoldingOf`): an undivided interest held as a
   *  tenant in common, a Delaware statutory trust's beneficial interests, or
   *  a share of the general partner's interest; null otherwise */
  holding: ShareHolding | null;
  /** a share of the general partner's interest: its own percentage of that
   *  interest, as stated (`gpStakePctOf`) — never the entity's; null
   *  otherwise */
  stakePct: number | null;
  /** a share's price grossed up beside a stated total project cost above it
   *  (`projectCostAboveOf`): the grossed-up figure is then the equity's
   *  whole, never the whole; null otherwise, and beside a stated entity
   *  loan, whose words already say so */
  projectCost: number | null;
  /** the price the OM asks for what is being sold */
  askingPrice: number | null;
  /** a partial interest: the asking price over the share — the equity's
   *  whole where the entity carries a loan (`entityLoan`) */
  impliedWhole: number | null;
  /** a partial interest: the loan the owning entity carries, as stated
   *  (`entityLoanOf`) — it sits on top of `impliedWhole`, never inside it */
  entityLoan: number | null;
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
  /** a preferred equity position, read as a position (lib/position): its
   *  terms, its yield to redemption at the price, its cash and accrual, and
   *  where its first and last dollar sit over the stated value — null on
   *  every other interest */
  position: PositionRead | null;
  /** the ground lease as stated ("" if none) — on a leasehold, or a
   *  fee-simple deal with a ground lease on part of the site; on a master
   *  leasehold (`masterLease`), the master lease as stated */
  groundLease: string;
  /** a leasehold the memorandum's own words name a master lease of the
   *  building, sublet to its tenants, and no ground lease
   *  (`isMasterLeasehold`) */
  masterLease: boolean;
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
  /** the lead's sentences, one a line — the panel says the first and folds
   *  the rest */
  leadSentences: string[];
  /** what the property model on this deal is and is not, for the surfaces
   *  that draw one — null where it is simply the buyer's model */
  modelCaveat: string | null;
  /** when the ground lease ends, as the memorandum states it (#421,
   *  lib/ground-lease-term) — null where no ground lease is involved or its
   *  end is not stated */
  term: GroundLeaseTerm | null;
  /** that term in one sentence ("" where there is none) */
  termLine: string;
  /** what the ground lease's tenant puts on the land where the memorandum
   *  names it — a wireless tower, a billboard, a solar array — whose
   *  equipment is the tenant's, so no building reverts (`groundLeaseEquipment`);
   *  null on a building's ground lease and where no ground lease is involved */
  equipment: EquipmentUse | null;
  /** a right to end the ground lease early, exactly as stated ("" if none) */
  terminationRight: string;
}

// Rounded on the tenths, never a float's toFixed (lib/money `compactUsd`).
const money = (n: number) => compactUsd(n, { wholeMillionsFrom: 1e8 });
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
/** When a note inside its last month comes due: "this month" for a maturity
 *  stated as a month alone, else "today" on its day, "in under a month"
 *  before it. */
const dueWhen = (n: NoteRead) => (n.thisMonth ? "this month" : n.daysLeft === 0 ? "today" : "in under a month");
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
  // Due inside its last month, its day not yet gone by: no whole month of
  // payments is left to solve a yield over, and the note is not past due.
  if (n.monthsLeft === 0 && due) {
    return `It comes due ${dueWhen(n)}, at its ${due} maturity — too short a run for a yield to maturity to state.`;
  }
  if (n.ytmPct != null && due) {
    if (n.terms.status === "non_performing") {
      return `If it paid to its ${due} maturity it would yield ${pctText(n.ytmPct)} (${n.paymentBasis}) — it is not paying, so what it earns turns on the time and cost of taking the property.`;
    }
    // Under water — the balance (or, behind a senior loan, the two
    // together) over the collateral's stated value: the contract yield
    // assumes a repayment the collateral does not cover (research pass 38),
    // so it is said as what it assumes, never as what the note earns.
    if (noteUnderWater(n) && n.terms.balance != null && n.terms.collateralValue != null) {
      const senior = n.terms.subordinate && n.terms.seniorBalance != null ? `, behind the senior loan's ${money(n.terms.seniorBalance)},` : "";
      return `${n.terms.status === "performing" ? "Held" : "Paid as agreed"} to its ${due} maturity it would yield ${pctText(n.ytmPct)} on the price (${n.paymentBasis}) — a contract yield that assumes the ${money(n.terms.balance)} balance is repaid in full, which the collateral's stated ${money(n.terms.collateralValue)}${senior} does not cover: what the note fetches is a foreclosure's question.`;
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
    // A maturity stated, its payments run, and still no yield solves: the
    // price and the balance are too far apart for one (research pass 38 —
    // a $75 price for a $20M note read "states no maturity" beside its own
    // stated March 2028 maturity).
    if (due) {
      return `A year's interest is ${pctText(n.currentYieldPct)} of the price; no yield to its ${due} maturity solves on the ${money(n.price)} price against the ${money(n.terms.balance ?? n.price)} balance — the two are too far apart for one, so the price or the balance was most likely misread.`;
    }
    return `A year's interest is ${pctText(n.currentYieldPct)} of the price; the memorandum states no maturity, so there is no yield to maturity to give.`;
  }
  return "";
}

/** The note's cushion (#416): the loan-to-value at the balance and at the
 *  price, over the value the OM states for the collateral — "" where it
 *  states none. On a note behind other debt (a mezzanine loan, a junior
 *  lien, a B-note) the cushion sits on top of the senior loan's balance:
 *  where the memorandum states it ("Senior loan balance", research pass 28)
 *  the sentence reads the stack off it, and where the screen read none it
 *  withholds the loan-to-value and says why — never that the memorandum
 *  states none, which its own words may (C4: "behind a $52M senior
 *  mortgage" was printed beside "which the memorandum does not state").
 *  Every surface that prints the cushion — the headline the deal context
 *  and the challenger read, the panel, the report's note terms — prints
 *  this sentence. */
export function noteCollateralSentence(n: NoteRead | null): string {
  if (!n || n.terms.collateralValue == null) return "";
  // Named beside other debt with no order stated: said as that, never as a
  // senior loan the words do not place ahead of it (the audit of
  // 2026-10-01).
  if (n.terms.position === "unclear") {
    return `The collateral's stated ${money(n.terms.collateralValue)} is not set against this note alone: the memorandum names other debt on the property without saying which loan comes first, so a loan-to-value at this note's last dollar cannot be read from it.`;
  }
  if (n.terms.subordinate) {
    const senior = n.terms.seniorBalance;
    if (senior != null && n.seniorLtvPct != null && n.stackAtBalancePct != null && n.stackAtPricePct != null) {
      return `The collateral's stated ${money(n.terms.collateralValue)}, with the senior loan's stated ${money(senior)} ahead of this note, puts the senior loan at ${Math.round(n.seniorLtvPct)}% of its value, the senior loan and the balance at ${Math.round(n.stackAtBalancePct)}%, and the senior loan and the price at ${Math.round(n.stackAtPricePct)}%.`;
    }
    return `The collateral's stated ${money(n.terms.collateralValue)} is not set against this note alone: it sits behind a senior loan, and its loan-to-value at its last dollar needs that loan's balance, which the screen did not read as a figure of its own.`;
  }
  if (n.ltvAtBalancePct == null || n.ltvAtPricePct == null) return "";
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
  if (n.monthsLeft === 0 && n.terms.maturity) {
    return n.thisMonth
      ? `Due this month, at its ${monthYear(n.terms.maturity)} maturity.`
      : n.daysLeft === 0
        ? `Due today, at its ${monthYear(n.terms.maturity)} maturity.`
        : `Under a month to its ${monthYear(n.terms.maturity)} maturity.`;
  }
  if (!n.terms.maturity && n.currentYieldPct != null) {
    return "The memorandum states no maturity, so there is no yield to maturity to give.";
  }
  return "";
}

// What the screening model does on a leased fee (lib/underwrite/inputs): it
// reads no ground rent — the rent is filed under a label no NOI reader takes
// — and runs the year-1 NOI a building's model reads. Research pass 34: this
// had said the model ran the ground rent as its NOI, and it does not.
const LEASED_FEE_MODEL =
  "The screening model reads no ground rent as its income: its year-1 NOI is the one a building's model reads — an NOI the T-12 or the memorandum states, else the price times the stated going-in cap, else an assumed 6% of the price — run with a building's growth, vacancy and expense assumptions.";

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
  const kind = interestOf(ex).kind;
  const groundLease = (it.groundLease ?? "").trim();
  const groundRent = groundRentOf(ex);
  const incomeBeforeGroundRent = incomeBeforeGroundRentOf(ex);
  if ((kind === "fee_simple" || kind === "unknown") && !groundLease && groundRent == null) return null;
  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(it.page);
  const page = n != null && pageCount != null && n <= pageCount ? it.page.trim() : "";
  const sharePct = interestOf(ex).sharePct;
  const holding = shareHoldingOf(ex);
  const inUnits = kind === "partial_interest" && IN_UNITS.test(`${it.share ?? ""} \n ${it.summary ?? ""}`);
  const price = askingPrice != null && askingPrice > 0 ? askingPrice : null;
  const impliedWhole = sharePct != null && price != null ? price / (sharePct / 100) : null;
  const entityLoan = kind === "partial_interest" ? entityLoanOf(ex) : null;
  // A share's price grossed up beside a stated total project cost above it is
  // the equity's whole, never the whole (research pass 37) — said where no
  // entity loan already says so. A GP stake's own percentage, as stated.
  const projectCost = shareProjectCostOf(ex, impliedWhole);
  const stakePct = holding === "gp_stake" ? gpStakePctOf(ex) : null;
  const noteTerms = kind === "note" ? readNoteTerms(ex) : null;
  const position = kind === "preferred_equity" ? readPosition(ex, price, asOf) : null;
  const balance = noteTerms?.balance ?? null;
  const note = noteTerms ? readNote(noteTerms, askingPrice != null && askingPrice > 0 ? askingPrice : null, asOf) : null;
  const discountPct = balance != null && balance > 0 && price != null ? ((balance - price) / balance) * 100 : null;
  const loan = (it.loan ?? "").trim();
  const groundRentCoverage =
    groundRent != null && incomeBeforeGroundRent != null ? incomeBeforeGroundRent / groundRent : null;
  // When the ground lease ends (#421): on either side of it, and on a fee
  // simple with one under part of the site — only as the memorandum states.
  // A master leasehold's is its master lease's (research pass 28, round 9).
  const leaseTerm = leaseholdTermOf(ex, asOf);
  const term = kind === "leasehold" || kind === "leased_fee" || groundLease ? leaseTerm.term : null;
  // A ground lease's equipment and its termination right, wherever a ground
  // lease is involved — only as the memorandum's own words state them.
  const groundLeased = kind === "leasehold" || kind === "leased_fee" || !!groundLease || groundRent != null;
  const equipment = groundLeased ? groundLeaseEquipment(ex) : null;
  const terminationRight = groundLeased ? (groundLeaseTerminationOf(ex) ?? "") : "";
  // A master lease of the building, sublet to its tenants (research pass
  // 28): its rent is the master lease's, never a ground rent.
  const masterLease = isMasterLeasehold(ex);
  // "the building's $6.0M of income covers the $1.2M ground rent 5.0×" —
  // two stated figures, one division.
  const coverageClause =
    groundRentCoverage != null && groundRent != null && incomeBeforeGroundRent != null
      ? `the building's ${money(incomeBeforeGroundRent)} of income before the ${masterLease ? "master" : "ground"} rent covers the ${money(groundRent)} rent ${times(groundRentCoverage)}`
      : null;

  // The lead, a sentence a line: the panel says the first and folds the
  // rest; every other surface reads them as one paragraph.
  const lead: string[] = [];
  let modelCaveat: string | null = null;
  switch (kind) {
    case "note":
      lead.push(
        "This memorandum sells a LOAN secured by the property, not the property: the buyer steps into the lender's position, and the return is the note's coupon and its discount to the balance — or, on a default, what the collateral fetches after foreclosure.",
      );
      if (discountPct != null && price != null && balance != null) {
        lead.push(`The ${money(price)} price is ${discountPhrase(discountPct)} the ${money(balance)} unpaid balance.`);
      }
      modelCaveat =
        "The screening model underwrites the collateral as if it were bought outright at the note's price. That is not the note's return, and its cap rate and IRR are not figures this buyer earns.";
      break;
    case "preferred_equity":
      lead.push(
        "This memorandum sells a PREFERRED EQUITY position in the owning entity, not the property: capital behind the mortgage and ahead of the common equity, paid a fixed preferred return until the sponsor redeems it — its return is its rate and its redemption, never a slice of the building's cash flows.",
      );
      modelCaveat =
        positionModelLine(position) ??
        "The property model runs the whole building at the position's price; that is not this position's return, which is its rate and its redemption.";
      break;
    case "partial_interest":
      if (holding === "gp_stake") {
        // A share of the general partner's interest (research pass 37): a
        // share of a share, whose economics are the general partner's
        // capital and promote — no figure grosses its price up to the
        // building's, so no basis, cap or price finding is struck on it.
        lead.push(
          "This memorandum sells a share of the general partner's interest, not a share of the owning entity: its economics are the general partner's own capital and its promote, as stated, and the property model is not its return.",
        );
        if (price != null) {
          lead.push(
            stakePct != null
              ? `The memorandum's ${money(price)} buys ${shareText(stakePct)} of the general partner's interest, as stated: no figure grosses that up to the building's price, so no basis or cap is struck on it.`
              : `No figure grosses the memorandum's ${money(price)} up to the building's price, so no basis or cap is struck on it.`,
          );
        }
        if (entityLoan != null) lead.push(`The memorandum states the entity carries ${withArticle(money(entityLoan))} loan.`);
        modelCaveat =
          "A share of the general partner's interest is a share of a share: the screening model runs the whole building's cash flows at its price, so its cap and returns are not the stake's, which earns the general partner's capital share and its promote as the waterfall states.";
        break;
      }
      if (holding === "tic") {
        // An undivided interest held as a tenant in common (research pass
        // 37): title to a share of the property itself, beside its
        // co-owners — no entity owns the property. The gross-up is a
        // share's; a loan the memorandum states is the property's.
        const pct = sharePct != null ? shareText(sharePct) : null;
        const head = `This memorandum sells ${
          pct ? `an undivided ${pct} of the property itself` : "an undivided interest in the property itself"
        }, held as a tenant in common beside its co-owners — title to real estate, not a share of an entity`;
        if (pct == null) {
          lead.push(`${head} — and states no single percentage for it: the whole building's income cannot be set against the interest's price until its share is known.`);
          if (entityLoan != null) lead.push(`The memorandum states ${withArticle(money(entityLoan))} loan on the property.`);
          modelCaveat = "The screening model runs the whole asset at the interest's price, which it cannot gross up without a stated percentage — its returns are not the interest's.";
          break;
        }
        if (price == null || impliedWhole == null) {
          lead.push(`${head}.`);
          modelCaveat = `The screening model runs the whole asset; the interest earns its ${pct} of the cash flows before any fee the co-owners' agreement pays its manager.`;
          break;
        }
        if (isWholeShare(sharePct)) {
          lead.push(`${head}: its ${money(price)} price is the whole's, nothing grossed up.`);
        } else if (entityLoan != null) {
          lead.push(
            `${head}: ${money(price)} for the interest is ${money(impliedWhole)} grossed up — the equity's whole, not the asset's, since the stated ${money(entityLoan)} loan on the property sits on top of it, and the screen sets the whole building's income against the ${money(impliedWhole)} alone.`,
          );
        } else {
          lead.push(
            `${head}: ${money(price)} for the interest is ${money(impliedWhole)} for the whole, grossed up.`,
            `The screen sets the whole building's income against the ${money(impliedWhole)}.`,
          );
        }
        modelCaveat =
          entityLoan != null
            ? `The screening model runs the whole asset at the ${money(impliedWhole)} the interest's price implies — the equity's whole: the stated ${money(entityLoan)} loan on the property sits on top of it, and the model neither adds it to the price nor carries it, sizing a new loan of its own on the ${money(impliedWhole)} instead. The interest earns its ${pct} of the cash flows before any fee the co-owners' agreement pays its manager.`
            : `The screening model runs the whole asset at the ${money(impliedWhole)} the interest's price implies; the interest earns its ${pct} of those cash flows before any fee the co-owners' agreement pays its manager.`;
        break;
      }
      if (isWholeShare(sharePct)) {
        // All of the entity's interests (research pass 28): the price is the
        // whole's, with nothing to gross up — said so, never as a share or as
        // a percentage the memorandum does not state. Beside the entity's
        // stated loan it is the equity's whole, and the loan sits on top.
        const units = inUnits ? ", offered in units" : "";
        const priced = price != null ? `its ${money(price)} price` : "its price";
        lead.push(
          entityLoan != null
            ? `This memorandum sells all of the owning entity's interests — 100% as stated${units} — so ${priced} is the equity's whole, with nothing to gross up, not the asset's: the entity's stated ${money(entityLoan)} loan sits on top of it${price != null ? `, and the screen sets the whole building's income against the ${money(price)} alone` : ""}.`
            : `This memorandum sells all of the owning entity's interests — 100% as stated${units} — so ${priced} is the whole's, with nothing to gross up${price != null ? ", and the whole building's income is set against it" : ""}.`,
        );
        const at = price != null ? `the ${money(price)} price` : "the price";
        modelCaveat =
          entityLoan != null
            ? `The screening model runs the whole asset at ${at} for all of the entity's interests — the equity's whole: the entity's stated ${money(entityLoan)} loan sits on top of it, and the model neither adds it to the price nor carries it, sizing a new loan of its own on it instead.`
            : `The screening model runs the whole asset at ${at}, which buys all of the entity's interests, so nothing is grossed up; what the interests earn is the entity's cash flow after its own costs and fees, which the model does not carry.`;
        break;
      }
      if (sharePct != null && price != null && impliedWhole != null && entityLoan != null) {
        // The entity's loan stated beside the share: the price grossed up is
        // the equity's whole, and the loan sits on top of it. Both figures
        // are named; the loan is never added in here.
        lead.push(
          `This memorandum sells ${withArticle(shareText(sharePct))} share of the owning entity, not the whole asset: ${money(price)} for the share is ${money(impliedWhole)} grossed up — the equity's whole, not the asset's, since the entity's stated ${money(entityLoan)} loan sits on top of it, and the screen sets the whole building's income against the ${money(impliedWhole)} alone.`,
          "A minority share is worth less than its slice once control, the promote and the exit rights are priced.",
        );
        modelCaveat = `The screening model runs the whole asset at the ${money(impliedWhole)} the share's price implies — the equity's whole: the entity's stated ${money(entityLoan)} loan sits on top of it, and the model neither adds it to the price nor carries it, sizing a new loan of its own on the ${money(impliedWhole)} instead. The share earns its ${shareText(sharePct)} of the cash flows only before the waterfall's promote and the sponsor's fees.`;
        break;
      }
      if (sharePct != null && price != null && impliedWhole != null && projectCost != null) {
        // A stated total project cost above the figure the share's price
        // grosses up to (research pass 37: a development joint venture's
        // "$31.5M LP equity commitment" for 90% read "$35.0M for the whole"
        // beside a $95.0M project): that figure is the equity's whole, the
        // project's cost above it — both named, nothing added.
        lead.push(
          `This memorandum sells ${withArticle(shareText(sharePct))} share of the owning entity, not the whole asset: ${money(price)} for the share is ${money(impliedWhole)} grossed up — the equity's whole, not the project's, since the memorandum's stated ${money(projectCost)} total project cost sits above it, and the screen sets the whole building's income against the ${money(impliedWhole)} alone.`,
          "A minority share is worth less than its slice once control, the promote and the exit rights are priced.",
        );
        modelCaveat = `The screening model runs the whole asset at the ${money(impliedWhole)} the share's price implies — the equity's whole, with the memorandum's stated ${money(projectCost)} total project cost above it. The share earns its ${shareText(sharePct)} of the cash flows only before the waterfall's promote and the sponsor's fees.`;
        break;
      }
      lead.push(
        sharePct != null && price != null && impliedWhole != null
          ? `This memorandum sells ${withArticle(shareText(sharePct))} share of the owning entity, not the whole asset: ${money(price)} for the share is ${money(impliedWhole)} for the whole, grossed up — the whole building's income is set against that, and a minority share is worth less than its slice once control, the promote and the exit rights are priced.`
          : "This memorandum sells a share of the owning entity, not the whole asset, and states no single percentage for it — the whole building's income cannot be set against the share's price until the share is known.",
      );
      if (entityLoan != null) lead.push(`The memorandum states the entity carries ${withArticle(money(entityLoan))} loan.`);
      modelCaveat =
        sharePct != null && impliedWhole != null
          ? `The screening model runs the whole asset at the ${money(impliedWhole)} the share's price implies; the share earns its ${shareText(sharePct)} of those cash flows only before the waterfall's promote and the sponsor's fees.`
          : "The screening model runs the whole asset at the share's price, which it cannot gross up without a stated percentage — its returns are not the share's.";
      break;
    case "leasehold":
      lead.push(
        ...(masterLease
          ? // A sandwich position (research pass 28): the buyer leases the
            // building from its owner and sublets it — it owns neither the
            // building nor the land, and the position ends with the lease.
            [
              "This memorandum sells a LEASEHOLD: a master lease of the building, sublet to its tenants — not the building, and not the land.",
              "The master rent is owed whatever the subtenants pay, and when the master lease ends the position ends with it — a capitalised NOI values a perpetuity that ends.",
            ]
          : [
              "This memorandum sells a LEASEHOLD: the building and a lease on the land, not the land.",
              "The ground rent comes ahead of the debt, and at the lease's end the building reverts — a capitalised NOI values a perpetuity that ends.",
            ]),
      );
      if (coverageClause) lead.push(`Here ${coverageClause}.`);
      modelCaveat = masterLease
        ? "The screening model capitalises the exit like a fee-simple building. On a master lease the position ends with the lease, so the value at exit is what the term left will bear — run the ground lease calculator on the stated term, with the master rent as its rent."
        : "The screening model capitalises the exit like a fee-simple building. On a leasehold the value at exit is what the term left will bear — run the ground lease calculator on the stated term.";
      break;
    case "leased_fee":
      if (equipment) {
        // Under a tower, a sign or an array no building reverts: the land
        // comes back, and the equipment is the tenant's. Said as what the
        // memorandum names and what to read in the lease, never as law.
        lead.push(
          `This memorandum sells a LEASED FEE: the land under ${equipment.what} someone else owns, with its ground lease.`,
          `The buyer collects the ground rent — the income here, not an expense — and when the lease ends the land comes back, not a building: ${equipment.gear} are the tenant's own, as such leases usually provide, so read the lease for what the tenant must remove and restore at its end.`,
        );
        // A stated right is said below, as stated; with none stated, ask.
        if (!terminationRight) lead.push("Such tenants often hold a right to end the lease early: read the lease for one before trusting its term.");
        modelCaveat = `${LEASED_FEE_MODEL} A ground rent grows by its lease's own schedule and resets, has no vacancy while the lease stands, and ends with the land coming back, not a building — the tenant's equipment is its own; run the ground lease calculator's leased-fee side on the stated terms.`;
        break;
      }
      lead.push(
        "This memorandum sells a LEASED FEE: the land under a building someone else owns, with its ground lease.",
        "The buyer collects the ground rent — the income here, not an expense and never the building's NOI — and when the lease ends the building reverts to the buyer.",
        `The rent is safe while the building's own income covers it${coverageClause ? `, and ${coverageClause}` : ""}.`,
      );
      modelCaveat = `${LEASED_FEE_MODEL} A ground rent grows by its lease's own schedule and resets, has no vacancy while the lease stands, and ends in the reversion of the land and the building — run the ground lease calculator's leased-fee side on the stated terms.`;
      break;
    default:
      // Either side of the lease: an owner that pays a ground rent under
      // part of its site, or one that collects it (a pad let on a ground
      // lease, common on a retail center) — the lease as stated says which,
      // and the sentence must not guess (#415).
      lead.push(
        "Part of the site is under a ground lease.",
        "Whether this owner pays the ground rent (an expense ahead of the debt) or collects it (a pad let on a ground lease), the lease's term and resets decide what that part is worth — the lease as stated says which.",
      );
  }
  // A right to end the ground lease early, on either side of it — said as
  // the memorandum states it, never read for a date or a term.
  if (terminationRight) {
    lead.push(
      `The memorandum states a right to end the ground lease early: ${terminationRight} — read who holds it, from when and on what notice before trusting the term.`,
    );
  }
  const headline = lead.join(" ");
  return {
    kind,
    // All of the entity's interests is no share of it (research pass 28),
    // a master lease of the building is no ground lease, and an undivided
    // interest held as a tenant in common is no entity's (research pass 37).
    label:
      holding === "tic"
        ? TIC_LABEL
        : holding === "gp_stake"
          ? GP_STAKE_LABEL
          : isWholeShare(sharePct)
            ? "All of the owning entity's interests"
            : masterLease
              ? MASTER_LEASE_LABEL
              : INTEREST_LABEL[kind],
    summary: (it.summary ?? "").trim(),
    page,
    sharePct,
    inUnits,
    holding,
    stakePct,
    projectCost,
    askingPrice: price,
    impliedWhole,
    entityLoan,
    balance,
    discountPct,
    note,
    position,
    groundLease,
    masterLease,
    loan,
    groundRent,
    incomeBeforeGroundRent,
    groundRentCoverage,
    // A note's figures follow the lead (#416): what it earns, then its
    // cushion — the panel draws both and says the lead alone.
    // A position's read follows its lead the same way: its yield to
    // redemption, its cash and accrual, its stack (lib/position).
    headline: [headline, noteYieldSentence(note), noteCollateralSentence(note), ...(position?.sentences ?? [])].filter(Boolean).join(" "),
    lead: headline,
    leadSentences: lead,
    modelCaveat,
    term,
    termLine: term ? groundLeaseTermLine(term, leaseTerm.lease) : "",
    equipment,
    terminationRight,
  };
}

/** The deal context's line: what is being sold, for every step that reads
 *  the OM after the extraction. */
export function interestContextLine(r: InterestRead): string {
  // The memorandum's own words end a sentence of their own: a period they
  // carry is not doubled ("…$2,000,000 per year..").
  const asStated = (s: string) => `${s.replace(/\.+\s*$/, "")}.`;
  const facts = [
    r.groundLease ? `The ${r.masterLease ? "master" : "ground"} lease as stated: ${asStated(r.groundLease)}` : "",
    r.termLine ? `${r.termLine}.` : "",
    r.loan ? `The loan as stated: ${asStated(r.loan)}` : "",
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
    preferred_equity: POSITION_TRAPS,
    note:
      "NOTE TRAPS, checked by name where the OM gives the inputs: (a) THE COLLATERAL IS NOT THE RETURN — the property's cap rate and IRR belong to its owner; underwrite the note's yield on the price paid; (b) THE DISCOUNT IS THE RETURN — on a performing note, the coupon on the price plus the discount accreting to maturity; ask for the payment history; (c) DEFAULT AND FORECLOSURE — a non-performing note is a bet on the time and cost to take the property, which runs by the state's process (judicial or not) and the borrower's resistance; (d) THE DOCUMENTS — guarantees, reserves, the loan agreement's defaults and any intercreditor or participation terms; (e) THE COLLATERAL'S VALUE — the loan-to-value on today's value, not the origination appraisal.",
    partial_interest: `PARTIAL-INTEREST TRAPS, checked by name where the OM gives the inputs: ${
      isWholeShare(r.sharePct)
        ? // All of the entity's interests: nothing to gross up (research
          // pass 28).
          `(a) THE PRICE IS FOR ALL OF THE ENTITY'S INTERESTS — hold the whole asset's income against the price itself, with nothing to gross up${
            r.entityLoan != null
              ? `, and read that price as the equity's whole, not the asset's: the entity's stated ${money(r.entityLoan)} loan sits on top of it`
              : ""
          }`
        : `(a) THE PRICE IS FOR A SHARE — hold the whole asset's income against the price grossed up by the share, never against the share's price${
            r.entityLoan != null
              ? `, and read that grossed-up figure as the equity's whole, not the asset's: the entity's stated ${money(r.entityLoan)} loan sits on top of it`
              : r.projectCost != null
                ? `, and read that grossed-up figure as the equity's whole, not the project's: the memorandum's stated ${money(r.projectCost)} total project cost sits above it`
                : ""
          }`
    }; (b) CONTROL — who decides a sale, a refinance and a budget, and what a minority holder can block; (c) THE WATERFALL — the share's economics after the sponsor's promote and fees, not its pro-rata slice; (d) EXIT RIGHTS — buy-sell, right of first refusal, drag and tag, and how a minority share is ever sold; (e) CAPITAL CALLS — what happens to a holder who does not fund one.`,
    leasehold:
      "LEASEHOLD TRAPS, checked by name where the OM gives the inputs: (a) THE TERM LEFT — against the loan's term (a lender wants years of margin) and the hold; (b) THE RESETS — a rent struck at a share of then-current land value is an uncapped repricing; (c) SUBORDINATION — an unsubordinated ground rent outranks the mortgage, and a default ends the lease, the building and the loan together; (d) COVERAGE — the building's income before the ground rent over the ground rent, the lender's first test; (e) THE REVERSION — at expiry the building goes to the landowner, so the exit is worth what the remaining term will bear.",
    leased_fee:
      "LEASED-FEE TRAPS, checked by name where the OM gives the inputs: (a) THE RENT IS THE INCOME — the ground rent with its bumps and resets, never the building's NOI, which belongs to the building's owner; (b) COVERAGE — the building's income over the ground rent is the whole margin of safety, and a thin one is a tenant that stops paying first; (c) SUBORDINATION — a subordinated ground lease has pledged the land to the leasehold's lender, so a default can cost the buyer the land itself, where an unsubordinated rent sits ahead of that mortgage; (d) THE RESETS — a rent reset to a share of then-current land value is where the growth lives, and a lease on fixed bumps alone has none; (e) THE REVERSION — the years until the building reverts to the buyer, and what it will be worth then; (f) PURCHASE OPTIONS — a tenant's option to buy the land caps the reversion.",
    fee_simple:
      "GROUND-LEASE TRAP, checked by name: part of the site is under a ground lease — say which side this owner is on: paying the rent (an expense ahead of the debt, whose term and resets can reprice that part) or collecting it (the ground tenant's credit, and the reversion of its improvements at the lease's end).",
    unknown:
      "GROUND-LEASE TRAP, checked by name: part of the site is under a ground lease — say which side this owner is on: paying the rent (an expense ahead of the debt, whose term and resets can reprice that part) or collecting it (the ground tenant's credit, and the reversion of its improvements at the lease's end).",
  };
  // Under a wireless tower, a billboard or a solar array no building
  // reverts (research pass 23): the land comes back, the equipment is the
  // tenant's, and such tenants often hold a right to end the lease early.
  // Each said as what to read in the lease, never as law.
  const eq = r.equipment;
  const termination = r.terminationRight
    ? `as stated: ${r.terminationRight}`
    : "such tenants often hold one, and the memorandum states none";
  if (eq) {
    traps.leased_fee = `LEASED-FEE TRAPS, checked by name where the OM gives the inputs: (a) THE RENT IS THE INCOME — the ground rent with its bumps and resets; (b) THE TENANT'S CREDIT — no building's income stands behind this rent, only the tenant's credit and its need for the site; (c) SUBORDINATION — a subordinated ground lease has pledged the land to the tenant's lender, so a default can cost the buyer the land itself, where an unsubordinated rent sits ahead of that loan; (d) THE RESETS — a rent reset to a share of then-current land value is where the growth lives, and a lease on fixed bumps alone has none; (e) THE LAND COMES BACK, NOT A BUILDING — ${eq.gear} are the tenant's own, as such leases usually provide: read what the lease makes it remove and restore at its end, and what the land is worth then; (f) PURCHASE OPTIONS — a tenant's option to buy the land caps what comes back; (g) A TERMINATION RIGHT — ${termination}: read who may end the lease early, from when and on what notice, before trusting the term.`;
    const collecting = `collecting it (the ground tenant's credit, any right it holds to end the lease early, and what it must remove at the end — ${eq.gear} are its own, as such leases usually provide)`;
    traps.fee_simple = traps.fee_simple.replace(/collecting it \([^)]*\)/, collecting);
    traps.unknown = traps.unknown.replace(/collecting it \([^)]*\)/, collecting);
  }
  // A right to end the ground lease early, stated on any other ground
  // lease, is named by its own words.
  const terminationTrap =
    r.terminationRight && !(eq && r.kind === "leased_fee")
      ? ` A TERMINATION RIGHT — as stated: ${r.terminationRight}: read who may end the ground lease early, from when and on what notice, before trusting the term.`
      : "";
  // A master lease of the building, sublet (a sandwich position), is no
  // ground lease: its traps are the master lease's, in place of the ground
  // lease's resets on land value and a building reverting to the landowner.
  if (r.masterLease) traps.leasehold = MASTER_LEASE_TRAPS;
  // An undivided interest held as a tenant in common is title to the real
  // estate, never an entity's share: its traps are the co-owners', in place
  // of a joint venture's waterfall and capital calls, and the two shared
  // traps read for real property transferred (research pass 37). A Delaware
  // statutory trust's beneficial interests are asked their own questions
  // beside a share's.
  if (r.holding === "tic") traps.partial_interest = ticTraps(r.entityLoan);
  if (r.holding === "dst") traps.partial_interest = `${traps.partial_interest} ${DST_TRAPS}`;
  // A share of the general partner's interest is a share of a share: its
  // traps are the general partner's — its promote, its capital, its fees,
  // its guarantees, its control — in place of a share's gross-up and
  // waterfall (research pass 37).
  if (r.holding === "gp_stake") traps.partial_interest = GP_STAKE_TRAPS;
  const shared = r.holding === "tic" ? SHARED_TRAPS_TIC : SHARED_TRAPS_READ[r.kind];
  return `${interestContextLine(r)} ${traps[r.kind]}${terminationTrap}${shared ? ` ${shared}` : ""}`;
}

/**
 * A tenancy in common's traps (research pass 37), asked as questions — what
 * the co-owners' agreement, the loan and the exit say is the memorandum's and
 * the documents' to answer, never a rule written here. The loan is named by
 * its stated balance where the memorandum gives one.
 */
function ticTraps(loan: number | null): string {
  const theLoan =
    loan != null
      ? `ask whether the co-owners are co-borrowers on the stated ${money(loan)} loan on the property, and whether its lender has consented to this transfer`
      : "ask whether the property carries a loan, whether the co-owners are its co-borrowers, and whether its lender has consented to this transfer";
  return `TENANCY-IN-COMMON TRAPS, asked by name where the OM gives the inputs: (a) UNANIMITY — ask what the TIC agreement makes every co-owner approve: a sale, a lease, a refinancing, the manager; (b) PARTITION — ask whether each co-owner keeps a right to partition the property, and whether it has been waived to the lender; (c) THE LOAN — ${theLoan}; (d) THE MANAGER AND ITS FEES — ask who manages the property under the TIC agreement, and what it is paid; (e) THE EXIT — ask whether the co-owners hold a right of first refusal on this interest, and whether the agreement carries a buy-sell.`;
}

/**
 * A share of the general partner's interest's traps (research pass 37):
 * questions, each answered by the partnership's and the general partner's
 * own agreements as stated — never a figure or a rule written here.
 */
const GP_STAKE_TRAPS =
  "GP-STAKE TRAPS, asked by name where the OM gives the inputs: (a) THE PROMOTE IS THE RETURN — it is paid only past the investors' preferred return, as the waterfall states: ask for each hurdle and the general partner's share above it; (b) THE GP'S CAPITAL AND ITS CALLS — ask what capital the general partner has put in and must still put in, and what this stake owes on a call; (c) THE FEES IT SHARES — ask which of the general partner's fees this stake shares, as stated; (d) THE GUARANTEES IT SHARES — ask which guarantees the general partner has given — non-recourse carve-outs, completion — and whether this stake shares them; (e) CONTROL AND REMOVAL — ask who controls the general partner, and on what terms the investors may remove it.";

/**
 * A Delaware statutory trust's traps (research pass 37), beside a share's:
 * questions, each answered by the trust agreement and the memorandum as
 * stated — never a rule written here.
 */
const DST_TRAPS =
  "DELAWARE STATUTORY TRUST TRAPS, asked by name where the OM gives the inputs: (a) WHAT THE TRUSTEE MAY NOT DO — ask for the trust agreement's limits on the trustee — on new capital, on refinancing, on new or renegotiated leases — as stated; (b) THE MASTER TENANT — ask whether the property is master leased and whether the master tenant is the sponsor's affiliate, and where it is master leased, read what the investors earn as the master lease rent, not the property's NOI, each as stated; (c) THE LOAD — ask for the offering costs and fees between the investor's cheque and the property, as stated; (d) THE SPRINGING LLC — ask whether the trust agreement provides for converting the trust to a limited liability company, and when that applies, as stated.";

/**
 * The two shared traps read for an undivided interest held as a tenant in
 * common (research pass 37): the sale transfers real property, so whether
 * it reassesses or carries a transfer tax on the share is the
 * jurisdiction's rule to say, never assumed; and the policy is the
 * co-owners'.
 */
const SHARED_TRAPS_TIC =
  "THE TWO SHARED TRAPS, read for an undivided interest held as a tenant in common in place of the tax reset and the legacy insurance premium as the instruction above words them: the sale transfers real property — an undivided share of the title, not an interest in an entity — so whether it reassesses the property or this share of it, and whether it carries a transfer tax on the share, is the jurisdiction's rule to say, never assumed either way. The insurance is the co-owners' policy on the whole building, so the trap reads as that policy's next renewal and the share of its premium the TIC agreement puts on this interest, not a new owner's quote.";

/**
 * A master leasehold's traps — the substance of lib/sandwich-lease's own
 * list, written here because that module reads this one (`isMasterLeasehold`,
 * `leaseholdTermOf`), so importing it back would close a cycle.
 */
const MASTER_LEASE_TRAPS =
  "MASTER-LEASE TRAPS, checked by name where the OM gives the inputs: (a) THE TERM AND THE OPTIONS — the master lease's end and its options, and their rent, against the subleases' own ends; (b) THE SPREAD AND WHO PAYS FIRST — the master rent is owed whatever the subtenants pay, its increases against the subleases', and the subtenants' credit; (c) THE FEE OWNER'S LENDER — whether the master lease sits behind the fee owner's mortgage, and whether a non-disturbance agreement keeps it standing through a foreclosure; (d) CONSENT TO ASSIGN AND SUBLET — what the master lease requires of the owner's consent to this sale and to new subleases; (e) THE END — what the master lease requires handed back, and what the subtenants' leases say when it ends.";

/**
 * The two traps the challenger's base instruction gives every property — the
 * tax line reset on the sale, and insurance at the seller's legacy premium
 * instead of a new owner's quote — read for an interest they do not fit as
 * written (research pass 18). Each says only what holds in general and
 * leaves to the documents, or the jurisdiction, what varies: a note's sale
 * transfers no property; whether a share's sale resets the assessment is the
 * jurisdiction's change-of-ownership rule; a leased fee's owner rarely
 * carries either line, and the ground lease decides. Appended to the
 * interest's note, after the document like the rest of the challenger's
 * notes. A fee simple and a leasehold keep the traps as written.
 */
const SHARED_TRAPS_READ: Partial<Record<InterestKind, string>> = {
  preferred_equity:
    "THE TWO SHARED TRAPS, read for a preferred equity position in place of the tax reset and the legacy insurance premium as the instruction above words them: the owning entity keeps the property and its own policy, so this buyer takes neither line as a new owner would. Read both as the entity's: whether its taxes are paid and its insurance in force, which reach the position through the sponsor's capacity to pay and the property's value — and whether an investment in the entity resets the assessment is the jurisdiction's change-of-ownership rule to say, never assumed either way.",
  note:
    "THE TWO SHARED TRAPS, read for a note in place of the tax reset and the legacy insurance premium as the instruction above words them: a note's sale transfers no property — the borrower still owns the collateral — so neither the tax reset on a sale nor a new owner's insurance quote applies to this buyer. Read both as the borrower's: whether the collateral's taxes are paid and its insurance in force, which reach the note through the borrower's capacity to pay and the collateral's value. Should the buyer take the property in a foreclosure, its taxes and insurance become the buyer's from then, and whether that transfer resets the assessment is the jurisdiction's rule to say.",
  partial_interest:
    "THE TWO SHARED TRAPS, read for a share in place of the tax reset and the legacy insurance premium as the instruction above words them: the owning entity keeps the property, so whether this sale resets the tax assessment depends on the jurisdiction's change-of-ownership rule for a transfer of an interest in the entity that owns it — say which rule applies where the OM gives the facts, and never assume a reset or its absence. The insurance stays the entity's own policy, so the trap reads as its next renewal, not a new owner's quote.",
  leased_fee:
    "THE TWO SHARED TRAPS, read for a leased fee in place of the tax reset and the legacy insurance premium as the instruction above words them: the owner of the land under a ground lease rarely carries either line — the ground lease decides who pays the property's taxes and insures the building — so read both through the lease as stated. Where the lease puts them on the leaseholder, a reassessment or a repriced policy reaches this buyer only as a thinner cover of the ground rent; where it leaves either with the landowner, that line is this buyer's.",
};

/** "; the lease ends Dec 2071, 45.3 years from today" — the term's end in a
 *  clause for the short line (#422), where the memorandum states it and it
 *  has not passed. */
function termClause(t: GroundLeaseTerm | null, what: string): string {
  if (!t || endHasPassed(t)) return "";
  return `; ${what} ${t.from === "year" ? "in " : t.from === "remaining" ? "about " : ""}${termEndLabel(t)}, ${fromToday(t)}`;
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
            : n.monthsLeft === 0
              ? `, due ${dueWhen(n)}`
              : // Under water, no contract yield is said as the note's
                // (research pass 38).
                noteUnderWater(n) && n.ytmPct != null && n.terms.maturity
                ? `, under water — its contract yield to its ${monthYear(n.terms.maturity)} maturity assumes a repayment the collateral's stated value does not cover`
                : n.ytmPct != null && n.terms.maturity
                  ? `, ${pctText(n.ytmPct)} to its ${monthYear(n.terms.maturity)} maturity${n.terms.status === "performing" ? "" : " if paid as agreed"}`
                  : "";
      return `A loan secured by the property, not the property${
        r.discountPct != null && r.askingPrice != null && r.balance != null
          ? ` — the ${money(r.askingPrice)} price is ${discountPhrase(r.discountPct)} the ${money(r.balance)} balance${earns}`
          : earns
      }`;
    }
    case "preferred_equity": {
      // Its yield to redemption in a clause, or that the date has gone by.
      const p = r.position;
      const earns = !p
        ? ""
        : p.redeemedPast
          ? ", past its redemption date"
          : p.yieldPct != null && p.terms.redemption && p.price != null
            ? `, ${pctText(p.yieldPct)} to its ${monthYear(p.terms.redemption)} redemption at the ${money(p.price)} price`
            : "";
      return `A preferred equity position in the owning entity, not the property${earns}`;
    }
    case "partial_interest":
      // An undivided interest held as a tenant in common: the real
      // estate's, never an entity's share (research pass 37).
      if (r.holding === "tic") {
        const head =
          r.sharePct != null
            ? `An undivided ${shareText(r.sharePct)} interest in the property, held as a tenant in common`
            : "An undivided interest in the property, held as a tenant in common";
        if (r.sharePct == null) return `${head}, its percentage not stated`;
        if (r.askingPrice == null || r.impliedWhole == null) return head;
        if (isWholeShare(r.sharePct)) return `${head} — ${money(r.askingPrice)} for the whole, nothing grossed up`;
        return r.entityLoan != null
          ? `${head} — ${money(r.askingPrice)} for the interest is ${money(r.impliedWhole)} for the equity's whole; the stated ${money(r.entityLoan)} loan on the property sits on top of it`
          : `${head} — ${money(r.askingPrice)} for the interest is ${money(r.impliedWhole)} for the whole`;
      }
      // A share of the general partner's interest: a share of a share, its
      // percentage the stake's and nothing grossed up (research pass 37).
      if (r.holding === "gp_stake") {
        return r.stakePct != null && r.askingPrice != null
          ? `${shareText(r.stakePct)} of the general partner's interest for ${money(r.askingPrice)}, as stated — a share of a share, not of the owning entity`
          : "A share of the general partner's interest — a share of a share, not of the owning entity";
      }
      // All of the entity's interests: the price is the whole's (research
      // pass 28).
      if (isWholeShare(r.sharePct)) {
        const all = `All of the owning entity's interests${r.inUnits ? ", offered in units" : ""}`;
        return r.askingPrice == null
          ? all
          : r.entityLoan != null
            ? `${all} — ${money(r.askingPrice)} for the equity's whole; the entity's stated ${money(r.entityLoan)} loan sits on top of it`
            : `${all} — ${money(r.askingPrice)} for the whole, nothing grossed up`;
      }
      return r.sharePct != null && r.askingPrice != null && r.impliedWhole != null
        ? r.entityLoan != null
          ? `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the equity's whole; the entity's stated ${money(r.entityLoan)} loan sits on top of it`
          : r.projectCost != null
            ? `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the equity's whole; the stated ${money(r.projectCost)} total project cost sits above it`
            : `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the whole`
        : "A share of the owning entity, its percentage not stated";
    case "leasehold":
      return `A leasehold — ${
        // A sandwich position is a lease of the building, never the building
        // (research pass 28).
        r.masterLease ? "a master lease of the building, sublet to its tenants, not the building or the land" : "the building and a lease on the land, not the land"
      }${termClause(r.term, "the lease ends")}${terminationClause(r)}`;
    case "leased_fee":
      // Under a tower, a sign or an array the land comes back, not a building.
      return r.equipment
        ? `The leased fee — the land under ${r.equipment.what} someone else owns, and its ground rent${termClause(r.term, "the lease ends")}${terminationClause(r)}`
        : `The leased fee — the land under a building someone else owns, and its ground rent${
            r.groundRentCoverage != null ? `, covered ${times(r.groundRentCoverage)} by the building's income` : ""
          }${termClause(r.term, "the building reverts")}${terminationClause(r)}`;
    default:
      return `Fee simple, with a ground lease on part of the site${terminationClause(r)}`;
  }
}

/** "; the ground lease states a right to end it early" — where it does. */
function terminationClause(r: InterestRead): string {
  return r.terminationRight ? "; the ground lease states a right to end it early" : "";
}
