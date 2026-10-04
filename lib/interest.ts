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
// the price here — what the model runs at is the owner's call.
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

import type { ExtractionResult, InterestKind } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { parsePageNumber } from "@/lib/facts";
import { parseUsd } from "@/lib/money";
import {
  endHasPassed,
  endIsAhead,
  fromToday,
  groundLeaseTermLine,
  groundLeaseTerminationOf,
  readGroundLeaseTerm,
  termEndLabel,
  type GroundLeaseTerm,
} from "@/lib/ground-lease-term";
import { readNote, readNoteTerms, type NoteRead } from "@/lib/note-yield";

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
const PCT_MENTION = /(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/gi;
// Where a percentage's own words end: its clause's end, a sentence's, or a
// word that starts the next clause.
const CLAUSE_WORD = String.raw`\s(?:and|with|plus|while|which|whereas|but|at|or|versus|vs\.?|including|excluding|where|when)\s`;
const WORDS_AFTER_END = new RegExp(String.raw`[,;:)\]\n]|\.(?=\s|$)|${CLAUSE_WORD}`, "i");
// The words before it run back to its clause's start — never past a colon or
// an opening parenthesis, which put a label in front ("Ownership: 49%",
// "TIC interest (49%)").
const WORDS_BEFORE_START = new RegExp(String.raw`[,;\n]|\.(?=\s|$)|${CLAUSE_WORD}`, "gi");

/** What one percentage's own words say it is: "share", "not" (a return, a
 *  rate, an occupancy…), or null where they name neither. */
function readShareWords(words: string): "share" | "not" | null {
  if (NOT_A_SHARE.test(words)) return "not";
  return SHARE_WORDS.test(words) ? "share" : null;
}

/** A partial interest's share, in percent, read off the OM's own words
 *  ("49% limited partnership interest", "a 90 percent stake", "Ownership
 *  interest: 49%"); null where no single percentage under 100 is stated AS a
 *  share. A percentage counts only where the words right after it — or,
 *  where those name nothing, the words right before it in its clause — name
 *  an ownership share and no return, rate or occupancy; a percentage among
 *  other words that name nothing is withheld, and so is a range ("49–51%").
 *  A field that is ONE percentage and nothing else is the share, since the
 *  field is the share's. */
export function parseSharePct(text: string | null | undefined): number | null {
  const t = text ?? "";
  // The share field is filled only on a partial interest, so a field that
  // is nothing but one percentage ("49%", read off a table's "Interest
  // offered" cell) IS the share: there are no words beside it to be a
  // return's or a rate's.
  const lone = t.trim().match(/^(\d{1,2}(?:\.\d+)?)\s*(?:%|percent|per cent)$/i);
  if (lone) {
    const n = Number(lone[1]);
    return n > 0 && n < 100 ? n : null;
  }
  const hits = [...t.matchAll(PCT_MENTION)].map((m, i, all) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // Up to the next percentage, and the point where this one's clause ends
    // inside that stretch (-1: it runs to the next percentage).
    const upTo = i + 1 < all.length ? (all[i + 1].index ?? t.length) : t.length;
    const tail = t.slice(end, upTo);
    return { n: Number(m[1]), start, end, tail, cut: tail.search(WORDS_AFTER_END) };
  });
  const shares = hits.flatMap((h, i) => {
    if (!Number.isFinite(h.n) || !(h.n > 0) || !(h.n < 100)) return [];
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
    return (readShareWords(after) ?? readShareWords(before)) === "share" ? [h.n] : [];
  });
  const valid = [...new Set(shares)];
  // Two different shares ("a 49% LP interest and a 2% GP interest") is not
  // one share: withheld rather than picked.
  return valid.length === 1 ? valid[0] : null;
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
  const kind = ex?.interest?.kind ?? "fee_simple";
  const share = kind === "partial_interest";
  return {
    kind,
    sharePct: share ? parseSharePct(ex?.interest?.share) : null,
    entityLoan: share ? statedEntityLoan(ex) : null,
  };
}

// The loan the owning entity carries, from the row the extraction is asked
// to label "Entity loan balance" — never a loan the buyer takes, one offered
// for assumption or a share's slice of the balance.
const ENTITY_LOAN_ROW = /^\s*entity(?:[- ]level)?\s+(?:loan|debt|mortgage)(?:\s+(?:balance|amount|outstanding))?\s*(?:\([^)]*\))?\s*$/i;

/** The balance the entity-loan row states, whatever is being sold. */
function statedEntityLoan(ex: ExtractionResult | null | undefined): number | null {
  const row = (ex?.metrics ?? []).find((m) => m && typeof m.label === "string" && ENTITY_LOAN_ROW.test(m.label));
  if (!row || typeof row.value !== "string" || /%|percent/i.test(row.value)) return null;
  const n = parseUsd(row.value);
  return n != null && n > 0 ? n : null;
}

/** The unpaid balance of the loan the owning entity carries, as the
 *  memorandum states it, on a partial interest — the debt that sits on top
 *  of the equity a share's price grosses up to. Null on every other
 *  interest, and where no such row is stated: a blank is null. */
export function entityLoanOf(ex: ExtractionResult | null | undefined): number | null {
  return interestOf(ex).entityLoan;
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
  const term = kind === "leasehold" || kind === "leased_fee" ? readGroundLeaseTerm(ex, asOf) : null;
  const left = term && endIsAhead(term) ? term.yearsLeft : null;
  const yrs = left != null ? (left < 1 ? "under 1 yr" : `${Math.floor(left)} ${Math.floor(left) === 1 ? "yr" : "yrs"}`) : null;
  switch (kind) {
    case "note":
      return "Note";
    case "partial_interest":
      return sharePct != null ? `${shareText(sharePct)} share` : "Share";
    case "leasehold":
      return yrs ? `Leasehold, ${yrs} left` : "Leasehold";
    case "leased_fee":
      return yrs ? (groundLeaseEquipment(ex) ? `Leased fee, lease ends in ${yrs}` : `Leased fee, reverts in ${yrs}`) : "Leased fee";
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
 *  states none. On a note behind other debt (a mezzanine loan, a junior
 *  lien, a B-note) the loan-to-value is withheld and the sentence says why:
 *  at its last dollar it needs the senior loan's balance, which the
 *  memorandum does not state. Every surface that prints the cushion — the
 *  headline the deal context and the challenger read, the panel, the
 *  report's note terms — prints this sentence. */
export function noteCollateralSentence(n: NoteRead | null): string {
  if (!n || n.terms.collateralValue == null) return "";
  // Named beside other debt with no order stated: said as that, never as a
  // senior loan the words do not place ahead of it (the audit of
  // 2026-10-01).
  if (n.terms.position === "unclear") {
    return `The collateral's stated ${money(n.terms.collateralValue)} is not set against this note alone: the memorandum names other debt on the property without saying which loan comes first, so a loan-to-value at this note's last dollar cannot be read from it.`;
  }
  if (n.terms.subordinate) {
    return `The collateral's stated ${money(n.terms.collateralValue)} is not set against this note alone: it sits behind a senior loan, and its loan-to-value at its last dollar needs that loan's balance, which the memorandum does not state.`;
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
  const entityLoan = kind === "partial_interest" ? entityLoanOf(ex) : null;
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
  // A ground lease's equipment and its termination right, wherever a ground
  // lease is involved — only as the memorandum's own words state them.
  const groundLeased = kind === "leasehold" || kind === "leased_fee" || !!groundLease || groundRent != null;
  const equipment = groundLeased ? groundLeaseEquipment(ex) : null;
  const terminationRight = groundLeased ? (groundLeaseTerminationOf(ex) ?? "") : "";
  // "the building's $6.0M of income covers the $1.2M ground rent 5.0×" —
  // two stated figures, one division.
  const coverageClause =
    groundRentCoverage != null && groundRent != null && incomeBeforeGroundRent != null
      ? `the building's ${money(incomeBeforeGroundRent)} of income before the ground rent covers the ${money(groundRent)} rent ${times(groundRentCoverage)}`
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
    case "partial_interest":
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
        "This memorandum sells a LEASEHOLD: the building and a lease on the land, not the land.",
        "The ground rent comes ahead of the debt, and at the lease's end the building reverts — a capitalised NOI values a perpetuity that ends.",
      );
      if (coverageClause) lead.push(`Here ${coverageClause}.`);
      modelCaveat =
        "The screening model capitalises the exit like a fee-simple building. On a leasehold the value at exit is what the term left will bear — run the ground lease calculator on the stated term.";
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
        modelCaveat =
          "The screening model runs the ground rent as a building's NOI, with a building's growth, vacancy and expense assumptions. A ground rent grows by its lease's own schedule and resets, has no vacancy while the lease stands, and ends with the land coming back, not a building — the tenant's equipment is its own; run the ground lease calculator's leased-fee side on the stated terms.";
        break;
      }
      lead.push(
        "This memorandum sells a LEASED FEE: the land under a building someone else owns, with its ground lease.",
        "The buyer collects the ground rent — the income here, not an expense and never the building's NOI — and when the lease ends the building reverts to the buyer.",
        `The rent is safe while the building's own income covers it${coverageClause ? `, and ${coverageClause}` : ""}.`,
      );
      modelCaveat =
        "The screening model runs the ground rent as a building's NOI, with a building's growth, vacancy and expense assumptions. A ground rent grows by its lease's own schedule and resets, has no vacancy while the lease stands, and ends in the reversion of the land and the building — run the ground lease calculator's leased-fee side on the stated terms.";
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
    label: INTEREST_LABEL[kind],
    summary: (it.summary ?? "").trim(),
    page,
    sharePct,
    askingPrice: price,
    impliedWhole,
    entityLoan,
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
    leadSentences: lead,
    modelCaveat,
    term,
    termLine: term ? groundLeaseTermLine(term) : "",
    equipment,
    terminationRight,
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
      `PARTIAL-INTEREST TRAPS, checked by name where the OM gives the inputs: (a) THE PRICE IS FOR A SHARE — hold the whole asset's income against the price grossed up by the share, never against the share's price${
        r.entityLoan != null
          ? `, and read that grossed-up figure as the equity's whole, not the asset's: the entity's stated ${money(r.entityLoan)} loan sits on top of it`
          : ""
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
  const shared = SHARED_TRAPS_READ[r.kind];
  return `${interestContextLine(r)} ${traps[r.kind]}${terminationTrap}${shared ? ` ${shared}` : ""}`;
}

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
        ? r.entityLoan != null
          ? `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the equity's whole; the entity's stated ${money(r.entityLoan)} loan sits on top of it`
          : `${withArticle(shareText(r.sharePct), true)} share of the owning entity — ${money(r.askingPrice)} for the share is ${money(r.impliedWhole)} for the whole`
        : "A share of the owning entity, its percentage not stated";
    case "leasehold":
      return `A leasehold — the building and a lease on the land, not the land${termClause(r.term, "the lease ends")}${terminationClause(r)}`;
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
