// A portfolio: one offering memorandum, several properties.
//
// Pure — no I/O, no model call. The extraction lists each property the OM
// offers (`ExtractionResult.properties`, each figure as the OM states it
// for THAT property, "" where it states none); this reads them into the
// shape every surface draws: each property's share of the whole, how
// concentrated the income is, the markets the portfolio spans, and whether
// the seller's allocation adds up to the ask.
//
// Four rules, each one a way a portfolio screen goes wrong.
//
// A SHARE IS MEASURED IN ONE UNIT FOR THE WHOLE SET. The properties' counts
// when every one states a count, else their areas when every one states an
// area — never a count for some and an area for others, since a share of a
// mixed total is no share of anything. With neither complete, no shares.
//
// THE INCOME SHARE NEEDS EVERY PROPERTY'S NOI. Four of five stated is not
// "the largest carries 40%": the fifth could be the largest. A partial set
// says how many stated one and draws no share.
//
// THE ALLOCATION IS THE SELLER'S. A price split across the properties is
// set for transfer taxes, financing and the buyer's own basis, not by an
// appraisal; its total against the ask is a check the OM should pass, and
// a per-property cap struck on it is the allocation's cap, said so.
//
// A MARKET IS WHERE THE PROPERTY IS, READ FROM ITS OWN ADDRESS — the same
// matcher the market check uses (a briefed market, a metro read without a
// brief, else the state), so the portfolio card, the deal context and the
// market check's header name the same places.

import type { ExtractionResult, PortfolioProperty } from "@/lib/anthropic/types";
import { parseCount, parsePct, parseSf } from "@/lib/criteria";
import { findPricedMetric, inferStrategy } from "@/lib/deal-strategy";
import { US_STATE_ABBREV } from "@/lib/address";
import { parsePageNumber } from "@/lib/facts";
import { marketForAddress } from "@/lib/market-match";
import { parseUsd } from "@/lib/money";

export type { PortfolioProperty };

export interface PortfolioAsset {
  name: string;
  address: string;
  /** the city and state read off the address, for a label ("Pittsburgh, PA") */
  place: string | null;
  /** the market the site reads for it — a briefed market, a metro read
   *  without a brief, or the state — or null with no readable state */
  market: { id: string; name: string } | null;
  count: number | null;
  area: number | null;
  noi: number | null;
  /** percent, 0–100 */
  occupancy: number | null;
  yearBuilt: number | null;
  allocated: number | null;
  /** allocated price per count, where both are stated */
  allocatedPerCount: number | null;
  /** NOI over the allocated price, in percent — the ALLOCATION's cap */
  allocationCapPct: number | null;
  /** the memorandum's page for this property, only where it parses AND falls
   *  inside the document's real page count (lib/facts' absolute rule — a
   *  citation is never invented); "" otherwise */
  page: string;
}

export interface PortfolioRead {
  assets: PortfolioAsset[];
  /** what the shares are measured in, or null when neither count nor area
   *  is stated for every property */
  shareBasis: "count" | "area" | null;
  /** each asset's share of the whole in `shareBasis`, percent; null entries
   *  never occur — the array is null when there is no basis */
  shares: number[] | null;
  /** each asset's share of the NOI, percent — only when EVERY asset states one */
  noiShares: number[] | null;
  /** how many assets state an NOI, for the partial case's sentence */
  noiStated: number;
  /** the asset carrying the most NOI where the income shares exist, else
   *  the most count or area */
  largest: { index: number; name: string; sharePct: number; of: "noi" | "count" | "area" } | null;
  /** properties per market, most first, in the order first met on ties */
  markets: Array<{ id: string; name: string; properties: number }>;
  /** how many assets have no readable market */
  unplaced: number;
  /** the allocations' total, only when every asset states one */
  allocationTotal: number | null;
  /** the whole portfolio's asking price, from the OM's headline rows */
  askingPrice: number | null;
  /** allocation total against the ask, percent (positive: allocations sum
   *  above the ask); null without both */
  allocationGapPct: number | null;
  /** the lowest stated occupancy, where two or more are stated */
  weakestOccupancy: { index: number; name: string; pct: number } | null;
}

/** A concentration the challenger and the card name outright: one asset
 *  carrying this share of the whole or more. */
export const CONCENTRATION_PCT = 40;
/** An allocation total this far off the ask (either way) is a discrepancy
 *  to put to the broker, not rounding. */
export const ALLOCATION_TOLERANCE_PCT = 1;

const STATE_CODES = new Set(Object.values(US_STATE_ABBREV));

/**
 * The city and state out of a free-text address the way an OM prints it —
 * "1200 Liberty Ave, Pittsburgh, PA 15222", "Pittsburgh, Pennsylvania",
 * "88 Main Street Cleveland OH 44114". Only what the text states: a string
 * with no recognisable state gives nothing, never a guess.
 */
export function placeOf(address: string): { city: string | null; state: string } | null {
  const text = address.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  // The state is in the last part (with or without a zip), or the last part
  // IS the zip and the state sits in the one before it.
  const stateIn = (part: string): { state: string; rest: string } | null => {
    const s = part.replace(/\b\d{5}(?:-\d{4})?\b/, "").trim();
    if (!s) return null;
    // A two-letter code counts only in capitals: "Oak Ct" is a street, not
    // Connecticut, and "Main St" is not a state at all.
    if (/^[A-Z]{2}$/.test(s) && STATE_CODES.has(s)) return { state: s, rest: "" };
    const full = US_STATE_ABBREV[s.toLowerCase()];
    if (full) return { state: full, rest: "" };
    // "Cleveland OH" or "Street Cleveland OH" — a trailing capital code.
    const m = /^(.*?)\s+([A-Z]{2})$/.exec(s);
    if (m && STATE_CODES.has(m[2])) return { state: m[2], rest: m[1].trim() };
    // A trailing full state name after a city in the same part.
    for (const [name, c] of Object.entries(US_STATE_ABBREV)) {
      if (s.toLowerCase().endsWith(` ${name}`)) return { state: c, rest: s.slice(0, s.length - name.length).trim() };
    }
    return null;
  };
  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 2); i--) {
    const hit = stateIn(parts[i]);
    if (!hit) continue;
    // The city: the rest of the state's own part, else the part before it.
    // A rest that is a whole street line ("88 Main Street Cleveland") keeps
    // only its last word, which is all the text states about the city there.
    let city = hit.rest || (i > 0 ? parts[i - 1] : "");
    if (hit.rest && /\d/.test(hit.rest)) city = hit.rest.split(" ").at(-1) ?? "";
    if (!hit.rest && i > 0 && /^\d/.test(city) && parts.length === 2) city = "";
    return { city: city.trim() || null, state: hit.state };
  }
  return null;
}

const num = (raw: string | undefined): string => (raw ?? "").trim();

function yearOf(raw: string): number | null {
  const m = /\b(1[89]\d{2}|20\d{2})\b/.exec(raw);
  return m ? Number(m[1]) : null;
}

/** Read the properties an extraction lists. Null for a single-property OM
 *  — under two properties there is no portfolio to read. */
export function readPortfolio(ex: ExtractionResult | null | undefined): PortfolioRead | null {
  const props = (ex?.properties ?? []).filter((p) => num(p.name) || num(p.address));
  if (props.length < 2) return null;
  const pageCount = typeof ex?.totalPages === "number" && Number.isFinite(ex.totalPages) && ex.totalPages > 0 ? ex.totalPages : null;
  const cited = (raw: string): string => {
    const n = parsePageNumber(raw);
    return n != null && pageCount != null && n <= pageCount ? raw : "";
  };

  const assets: PortfolioAsset[] = props.map((p) => {
    const place = placeOf(num(p.address));
    const market = place ? marketForAddress({ city: place.city, state: place.state }) : null;
    const count = parseCount(num(p.count));
    const area = parseSf(num(p.area));
    // An NOI or an allocation can be small for a small building; the floor
    // that protects a purchase price from a typo would swallow it.
    const noi = parseUsd(num(p.noi), 1_000);
    const allocated = parseUsd(num(p.allocatedPrice));
    const occupancy = parsePct(num(p.occupancy));
    return {
      name: num(p.name) || num(p.address),
      address: num(p.address),
      place: place ? [place.city, place.state].filter(Boolean).join(", ") : null,
      market: market ? { id: market.id, name: market.name } : null,
      count,
      area,
      noi,
      occupancy: occupancy != null && occupancy >= 0 && occupancy <= 100 ? occupancy : null,
      yearBuilt: yearOf(num(p.yearBuilt)),
      allocated,
      allocatedPerCount: allocated != null && count != null && count > 0 ? allocated / count : null,
      allocationCapPct: allocated != null && noi != null && allocated > 0 ? (noi / allocated) * 100 : null,
      page: cited(num(p.page)),
    };
  });

  const every = <K extends keyof PortfolioAsset>(k: K) => assets.every((a) => typeof a[k] === "number" && (a[k] as number) > 0);
  const shareBasis: PortfolioRead["shareBasis"] = every("count") ? "count" : every("area") ? "area" : null;
  const sharesOf = (vals: number[]) => {
    const total = vals.reduce((s, v) => s + v, 0);
    return total > 0 ? vals.map((v) => (v / total) * 100) : null;
  };
  const shares = shareBasis ? sharesOf(assets.map((a) => a[shareBasis] as number)) : null;
  const noiStated = assets.filter((a) => a.noi != null).length;
  const noiShares = noiStated === assets.length ? sharesOf(assets.map((a) => a.noi as number)) : null;

  const top = (vals: number[] | null) => {
    if (!vals) return null;
    let index = 0;
    vals.forEach((v, i) => {
      if (v > vals[index]) index = i;
    });
    return index;
  };
  let largest: PortfolioRead["largest"] = null;
  const byNoi = top(noiShares);
  if (byNoi != null && noiShares) {
    largest = { index: byNoi, name: assets[byNoi].name, sharePct: noiShares[byNoi], of: "noi" };
  } else {
    const byShare = top(shares);
    if (byShare != null && shares && shareBasis) {
      largest = { index: byShare, name: assets[byShare].name, sharePct: shares[byShare], of: shareBasis };
    }
  }

  const markets: PortfolioRead["markets"] = [];
  for (const a of assets) {
    if (!a.market) continue;
    const hit = markets.find((m) => m.id === a.market!.id);
    if (hit) hit.properties += 1;
    else markets.push({ id: a.market.id, name: a.market.name, properties: 1 });
  }
  // Most properties first; a stable sort keeps first-met order on ties.
  markets.sort((x, y) => y.properties - x.properties);

  const allocationTotal = assets.every((a) => a.allocated != null)
    ? assets.reduce((s, a) => s + (a.allocated as number), 0)
    : null;
  const metrics = ex?.metrics ?? [];
  const priceRow = findPricedMetric(metrics, inferStrategy(ex ?? null).kind);
  const askingPrice = priceRow ? parseUsd(priceRow.value) : null;
  const allocationGapPct =
    allocationTotal != null && askingPrice != null && askingPrice > 0
      ? ((allocationTotal - askingPrice) / askingPrice) * 100
      : null;

  const occ = assets.map((a, index) => ({ index, name: a.name, pct: a.occupancy })).filter((o): o is { index: number; name: string; pct: number } => o.pct != null);
  const weakestOccupancy = occ.length >= 2 ? occ.reduce((lo, o) => (o.pct < lo.pct ? o : lo)) : null;

  return {
    assets,
    shareBasis,
    shares,
    noiShares,
    noiStated,
    largest,
    markets,
    unplaced: assets.filter((a) => !a.market).length,
    allocationTotal,
    askingPrice,
    allocationGapPct,
    weakestOccupancy,
  };
}

const pct0 = (n: number) => `${Math.round(n)}%`;
/** One decimal, rounded on the tenths rather than by toFixed on the float. */
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
/** A portfolio's money, the one format every surface prints it in. Rounded
 *  on integer tenths, not by toFixed on a float ((2.05).toFixed(1) is
 *  "2.0"); a hundred million and up to the million. */
export const portfolioMoney = (n: number) =>
  n >= 1e8
    ? `$${Math.round(n / 1e6)}M`
    : n >= 1e6
      ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M`
      : n >= 1e3
        ? `$${Math.round(n / 1e3)}k`
        : `$${Math.round(n)}`;
const money = portfolioMoney;

type Noun = { one: string; many: string };

/** What the shares are measured in, in words — the class's own plural noun
 *  for a count ("units", "keys", "pads"), "SF" for an area; null with no
 *  shares. */
export function shareBasisWord(p: PortfolioRead, noun: Noun): string | null {
  return p.shareBasis === "area" ? "SF" : p.shareBasis === "count" ? noun.many : null;
}

/**
 * The facts a buyer should see before pricing any of it: one property
 * carrying the income, an income split the memorandum does not state, an
 * allocation that does or does not add up to the ask, a property whose
 * address names no state. One list, so the deal page's card, the report's
 * portfolio page and the shared screen say the same sentences.
 */
export function portfolioFacts(p: PortfolioRead): string[] {
  const facts: string[] = [];
  if (p.largest?.of === "noi" && p.largest.sharePct >= CONCENTRATION_PCT) {
    facts.push(`${p.largest.name} carries ${pct0(p.largest.sharePct)} of the stated NOI — the portfolio's income rides on one property.`);
  }
  if (!p.noiShares && p.noiStated > 0) {
    facts.push(`${p.noiStated} of the ${p.assets.length} properties state an NOI of their own, so the income's split is not drawn.`);
  } else if (p.noiStated === 0) {
    facts.push("No property states an NOI of its own — the memorandum prices the portfolio on its total alone.");
  }
  if (p.allocationGapPct != null) {
    facts.push(
      Math.abs(p.allocationGapPct) > ALLOCATION_TOLERANCE_PCT
        ? `The allocated prices sum to ${money(p.allocationTotal as number)} against the ${money(p.askingPrice as number)} ask (${p.allocationGapPct > 0 ? "+" : ""}${one(p.allocationGapPct)}%) — the memorandum does not add up.`
        : `The allocated prices sum to the ${money(p.askingPrice as number)} ask. An allocation is the seller's split, not a value.`,
    );
  }
  if (p.unplaced > 0) {
    facts.push(
      `${p.unplaced === 1 ? "One property's address names" : `${p.unplaced} properties' addresses name`} no state, so no market is read for ${p.unplaced === 1 ? "it" : "them"}.`,
    );
  }
  return facts;
}

/**
 * One property's line: its shares of the whole where the set has them, then
 * each figure the memorandum states for it — never one it does not. The
 * card, the report and the shared screen print it; the workbook carries the
 * same figures as cells.
 */
export function propertyFigures(p: PortfolioRead, i: number, noun: Noun): string[] {
  const a = p.assets[i];
  if (!a) return [];
  const basis = shareBasisWord(p, noun);
  return [
    p.shares && basis ? `${pct0(p.shares[i])} of the ${basis}` : null,
    p.noiShares ? `${pct0(p.noiShares[i])} of the NOI` : null,
    a.count != null ? `${a.count.toLocaleString("en-US")} ${a.count === 1 ? noun.one : noun.many}` : null,
    a.area != null ? `${a.area.toLocaleString("en-US")} SF` : null,
    a.occupancy != null ? `${a.occupancy}% occupied` : null,
    a.yearBuilt != null ? `built ${a.yearBuilt}` : null,
    a.noi != null ? `NOI ${money(a.noi)}` : null,
    a.allocated != null
      ? `allocated ${money(a.allocated)}${a.allocatedPerCount != null ? ` (${money(a.allocatedPerCount)} per ${noun.one})` : ""}${
          a.allocationCapPct != null ? `, a ${one(a.allocationCapPct)}% cap on the allocation` : ""
        }`
      : null,
  ].filter((x): x is string => !!x);
}

/** "3 markets — Pittsburgh PA (2), Cleveland OH (2) and Ohio (1)". */
export function marketsPhrase(p: PortfolioRead): string {
  if (p.markets.length === 0) return "no market the addresses name";
  const list = p.markets.map((m) => `${m.name} (${m.properties})`);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return `${p.markets.length} ${p.markets.length === 1 ? "market" : "markets"} — ${joined}`;
}

/** The deal context's line: what the portfolio is, for every step that
 *  reads the OM after the extraction. */
export function portfolioContextLine(p: PortfolioRead): string {
  const parts = [`Portfolio: ${p.assets.length} properties across ${marketsPhrase(p)}`];
  if (p.largest) {
    parts.push(
      `the largest by ${p.largest.of === "noi" ? "NOI" : p.largest.of} is ${p.largest.name} at ${pct0(p.largest.sharePct)} of the whole`,
    );
  }
  return `${parts.join("; ")}. A figure stated for the whole is the portfolio's, not any one property's; hold a comp or a per-unit norm against the property it describes.`;
}

/** The portfolio traps and what the extraction established, for the
 *  challenger — appended to its instruction like the reconciliation's
 *  notes. Only facts the extraction states, then the traps by name. */
export function portfolioNote(p: PortfolioRead): string {
  const facts: string[] = [`This OM offers a portfolio of ${p.assets.length} properties across ${marketsPhrase(p)}.`];
  if (p.noiShares && p.largest?.of === "noi" && p.largest.sharePct >= CONCENTRATION_PCT) {
    facts.push(`${p.largest.name} carries ${pct0(p.largest.sharePct)} of the portfolio's stated NOI.`);
  } else if (!p.noiShares && p.noiStated > 0) {
    facts.push(`Only ${p.noiStated} of the ${p.assets.length} properties state an NOI of their own, so the income's concentration cannot be read — ask for each property's T-12.`);
  } else if (p.noiStated === 0) {
    facts.push("No property states an NOI of its own — ask for each property's T-12 before pricing any of them.");
  }
  if (p.allocationGapPct != null && Math.abs(p.allocationGapPct) > ALLOCATION_TOLERANCE_PCT) {
    facts.push(
      `The allocated prices sum to ${money(p.allocationTotal as number)} against the ${money(p.askingPrice as number)} ask (${p.allocationGapPct > 0 ? "+" : ""}${one(p.allocationGapPct)}%) — the OM does not add up; put it to the broker.`,
    );
  }
  if (p.weakestOccupancy && p.weakestOccupancy.pct < 90) {
    facts.push(`The weakest stated occupancy is ${p.weakestOccupancy.name} at ${p.weakestOccupancy.pct}%.`);
  }
  const traps =
    "PORTFOLIO TRAPS, checked by name where the OM gives the inputs: (a) THE ALLOCATION IS THE SELLER'S — a price split across the properties is set for transfer taxes and financing, not by value; price each property on its own income and compare; (b) CONCENTRATION — the property that carries the income carries the deal, and a blended cap or occupancy hides the rest; (c) THE BUNDLED WEAK ASSET — a portfolio sells what would not sell alone; price the portfolio without its weakest property and ask whether the seller would; (d) ONE LOAN OR MANY — cross-collateralized debt, release prices and whether a single property can be sold or refinanced on its own; (e) MARKETS DIFFER — one growth rate across several markets is an average of different bets, and each market's figures belong to its own properties.";
  return `${facts.join(" ")} ${traps}`;
}

/** What the market check's header needs from a portfolio: null unless the
 *  properties span more than one market, since a portfolio in one market is
 *  read whole by that market's figures. */
export function portfolioFor(
  ex: ExtractionResult | null | undefined,
  marketId: string,
): { properties: number; here: number; markets: string } | null {
  const p = readPortfolio(ex);
  if (!p || p.markets.length < 2) return null;
  return {
    properties: p.assets.length,
    here: p.markets.find((m) => m.id === marketId)?.properties ?? 0,
    markets: marketsPhrase(p),
  };
}
