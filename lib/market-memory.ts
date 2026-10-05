// Deal memory (Feature 6): the buyer's OWN past screens, turned into a private
// market read. "You've screened 4 other North Dallas multifamily deals — going
// in caps ran 4.9–5.5%, basis $180–240k/unit." No external comp data, no
// embeddings, no fabrication: every figure is one this account already
// extracted, aggregated with plain deterministic arithmetic.
//
// Own-account only. The caller passes deals the user CREATED (never a
// teammate's, never another account's); this module just shapes and groups
// them. Pure + unit-tested.

import {
  buildingSfFromMetrics,
  findGoingInCap,
  findMetric,
  parseMoney,
  parsePct,
  parsePrice,
  METRIC_FIND,
  screenYearOf,
} from "@/lib/criteria";
import {
  buildingPriceOf,
  findPriceMetric,
  inferStrategy,
  isOutdoorStorageYard,
  planSummary,
  statedBasisIsBuildings,
  unitCountFromMetrics,
  unitCountRow,
} from "@/lib/deal-strategy";
import { interestOf } from "@/lib/interest";
import { assetWords, countNoun, dealClassKey, perSuffix } from "@/lib/asset-words";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";

export interface MarketComp {
  dealId: string;
  name: string;
  /** market as extracted, e.g. "North Dallas, TX" */
  market: string;
  /** normalized grouping key for the market */
  marketKey: string;
  /** normalized asset class */
  assetClass: string;
  screenedAt: string;
  /** verdict call if the screen finished */
  call: string | null;
  capPct: number | null;
  /** $/unit (multifamily) or $/SF (other), numeric, when derivable — on a
   *  plan deal the finished project's TOTAL COST over the planned units,
   *  never the shell's or the site's price (see `allIn`) */
  perUnit: number | null;
  perUnitBasis: "unit" | "sf" | null;
  /** what one of it is called on a unit basis — the count row's own noun
   *  ("key", "pad", "room"), else the class's (lib/asset-words
   *  `countNoun`); null on a per-SF basis or with no basis */
  perUnitNoun: string | null;
  /** the basis is total cost, not the price — a plan deal's figure */
  allIn: boolean;
}

export interface Stat {
  min: number;
  median: number;
  max: number;
}
/** A group's basis range: one basis and, on a unit basis, one noun for the
 *  whole group — the members' own where they all agree, the class's where
 *  they do not — so a range is never "$180k/key–$240k/room". */
export type BasisStat = Stat & { basis: "unit" | "sf"; noun?: string | null };
export interface MarketGroup {
  assetClass: string;
  /** a representative display market for the group */
  market: string;
  marketKey: string;
  count: number;
  cap: Stat | null;
  perUnit: BasisStat | null;
  calls: { pass: number; caution: number; pass_on: number };
  dealIds: string[];
}

interface MetricLike {
  label: string;
  value: string;
}
interface DealRowLike {
  id: string;
  name: string | null;
  asset_class: string | null;
  created_at: string;
  is_sample: boolean | null;
  verdict: unknown;
  extraction: unknown;
  /** the screen's first signal (FirstSignal), read with the extraction for
   *  the deal's kind, as its own page reads it; absent on a row the caller
   *  did not select it for */
  first_signal?: unknown;
}

/** A class handed in by a caller, as the key the comps are grouped under
 *  (lib/asset-words `dealClassKey`): "MULTIFAMILY", "multifamily" and a
 *  deck's "Garden-style multifamily" are one group. */
const classKeyOf = (assetClass: string): string => dealClassKey(assetClass, null);

/** Normalize a market string for grouping — lowercases, drops punctuation, and
 *  collapses whitespace, so "Dallas, TX" and "Dallas TX" group together.
 *  Deliberately literal beyond that (no metro guessing): "North Dallas TX" and
 *  "Dallas TX" stay distinct rather than inventing a shared metro. */
export function normalizeMarketKey(market: string): string {
  return market
    .toLowerCase()
    .replace(/[.,;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Numeric basis for one deal, in ONE unit PER ASSET CLASS so a group's range
 *  is never a mix of $/unit and $/SF: multifamily is $/unit (a direct per-unit
 *  metric, else price ÷ units); every other class is $/SF (price ÷ SF). Returns
 *  null when nothing parses. Class-consistent by construction — the branch on
 *  asset class comes FIRST, so a stray "per unit" metric on an office deal
 *  can't flip it to a unit basis. */
function deriveBasis(
  metrics: MetricLike[],
  assetClass: string,
  price: number | null,
  /** the price is a plan deal's total cost: skip the OM's own per-unit
   *  line, which is the shell's price over the units, not the basis */
  allIn = false,
  /** the OM's own per-unit line may be read — false where the price is not
   *  for the building bought outright (a share, a note, a leased fee), whose
   *  per-unit line is on a basis the row never says */
  statedLine = true,
  /** the price over the building's feet is a basis — false for an
   *  outdoor-storage yard, which trades by the usable acre, so a yard's shop
   *  building never puts a per-SF figure into the memory */
  perSfBasis = true,
): { value: number; basis: "unit" | "sf" } | null {
  // The class says the basis (lib/asset-words): apartments, hotels, parks,
  // student beds and garages trade per unit, key, pad, bed or space — one
  // "unit" track, whatever the noun; office, industrial, retail, storage and
  // the rest per SF; land per acre, which this memory has no track for.
  const basis = assetWords(assetClass).basis;
  if (basis === "acre") return null;
  if (basis === "unit") {
    const direct = allIn || !statedLine ? null : findMetric(metrics, METRIC_FIND.perUnit.inc, METRIC_FIND.perUnit.exc);
    if (direct) {
      const n = parseMoney(direct.value);
      if (n != null && n > 0) return { value: n, basis: "unit" };
    }
    if (price == null) return null;
    // The shared count reader: "312 units" parses, a "Unit mix" row ahead
    // of "Units" never shadows it — and "212 keys" counts the same way.
    const n = unitCountFromMetrics(metrics);
    if (n != null && n > 0) return { value: price / n, basis: "unit" };
    return null;
  }
  // Priced per SF — never per unit, whatever stray per-unit row the OM has.
  if (price == null || !perSfBasis) return null;
  // The shared size reader: the building, never the land or a unit.
  const n = buildingSfFromMetrics(metrics);
  if (n != null && n > 0) return { value: price / n, basis: "sf" };
  return null;
}

/** Turn the account's own screened deals into market comps. Skips the sample,
 *  and any deal whose extraction yielded neither a cap nor a basis. */
export function buildComps(rows: DealRowLike[]): MarketComp[] {
  const comps: MarketComp[] = [];
  for (const row of rows) {
    if (row.is_sample) continue;
    const extraction = row.extraction as {
      assetClass?: string;
      market?: string;
      metrics?: MetricLike[];
    } | null;
    const metrics = extraction?.metrics;
    if (!Array.isArray(metrics) || metrics.length === 0) continue;

    // The deal's one class, filed by its words (lib/asset-words
    // `dealClassKey`): a deck's "Garden-style multifamily" groups with the
    // account's other multifamily screens, where the raw words had made a
    // group of their own.
    const assetClass = dealClassKey(row.asset_class, extraction);
    if (!assetClass) continue;

    // The deal's kind first, as the comp memory and the analytics read it —
    // and as the deal's own page does, with the first signal, whose take
    // can name a plan the rows do not. A plan deal (value-add, lease-up,
    // conversion, development) is judged on its yield on total cost — its
    // stabilized cap or yield on cost is the finished project's — and its
    // basis is total cost over the planned units, never a shell's or a
    // site's price over apartments not built yet.
    const ext = { ...extraction, metrics } as ExtractionResult;
    const strategy = inferStrategy(ext, (row.first_signal as FirstSignal | null | undefined) ?? null);
    const plan = planSummary(ext, strategy);

    // The shared going-in reader on an operating asset only: a plan deal's
    // stabilized / pro forma cap never averages into what the account
    // "usually sees" in a market — and neither does a note's (the
    // collateral's, on a price that is a loan's) or a leased fee's (a
    // ground rent's cap, a different market entirely), #415.
    const interestKind = interestOf(ext).kind;
    const cap = plan || interestKind === "note" || interestKind === "leased_fee" ? null : findGoingInCap(metrics);
    const rawCap = cap ? parsePct(cap.value) : null;
    // Drop physically implausible caps (a mis-extraction like -5% or 300%) —
    // not fabrication, just refusing to average garbage into the market read.
    const capPct = rawCap != null && rawCap > 0 && rawCap <= 25 ? rawCap : null;

    // The shared price reader: on a development with no ask, the land cost —
    // and the price the building's figures describe (#415): a share's
    // grossed up to the whole, none for a note or a leased fee.
    const priceMetric = findPriceMetric(metrics, strategy.kind, screenYearOf(ext));
    const price = buildingPriceOf(ext, priceMetric ? parsePrice(priceMetric.value) : null);
    // An outdoor-storage yard trades by the acre: its price over the shop
    // building on it is never pooled as a market's per-SF basis.
    const perSfBasis = !isOutdoorStorageYard(extraction?.assetClass) && !isOutdoorStorageYard(row.asset_class);
    const basis = plan
      ? plan.totalCost != null
        ? deriveBasis(metrics, assetClass, plan.totalCost, true, true, perSfBasis)
        : null
      : deriveBasis(metrics, assetClass, price, false, statedBasisIsBuildings(ext), perSfBasis);

    // Nothing usable → not a comp (never pad the memory with empty rows).
    if (capPct == null && !basis) continue;

    const market = extraction?.market ?? "";
    comps.push({
      dealId: row.id,
      name: row.name ?? "Untitled deal",
      market,
      marketKey: normalizeMarketKey(market),
      assetClass,
      screenedAt: row.created_at,
      call: (row.verdict as { verdict?: string } | null)?.verdict ?? null,
      capPct,
      perUnit: basis ? basis.value : null,
      perUnitBasis: basis ? basis.basis : null,
      // The memorandum's own noun wins where it counted in one ("212
      // keys", "Pads"); the class's stands in for a bare count.
      perUnitNoun:
        basis?.basis === "unit" ? countNoun(unitCountRow(metrics)?.label, assetClass).replace(/s$/, "") : null,
      allIn: plan != null && basis != null,
    });
  }
  return comps;
}

/** Deterministic median (mean of the two middles for an even count). */
export function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function statOf(nums: number[]): Stat | null {
  if (!nums.length) return null;
  return { min: Math.min(...nums), median: median(nums), max: Math.max(...nums) };
}

/** Aggregate comps into per-(asset class × market) groups, most-screened
 *  first. Cap and basis stats are computed only over the comps that actually
 *  carried that figure. */
export function summarizeMarkets(comps: MarketComp[]): MarketGroup[] {
  const groups = new Map<string, MarketComp[]>();
  for (const c of comps) {
    const key = `${c.assetClass}|${c.marketKey}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }

  const out: MarketGroup[] = [];
  for (const members of groups.values()) {
    out.push(groupStat(members));
  }
  // Most screens first; ties alphabetical by market then class for stability.
  out.sort(
    (a, b) =>
      b.count - a.count ||
      a.market.localeCompare(b.market) ||
      a.assetClass.localeCompare(b.assetClass),
  );
  return out;
}

/** The one noun a group's unit-basis range wears. A group is one class
 *  (it is keyed by it), so its basis is one; its members' memoranda may
 *  still name the count differently — a hotel's "Keys" beside another's
 *  "Guest rooms" — and a range never mixes them: every member's own noun
 *  where they agree, else the class's. */
function groupNoun(assetClass: string, withBasis: readonly MarketComp[]): string {
  const own = new Set(withBasis.map((c) => c.perUnitNoun).filter((n): n is string => !!n));
  if (own.size === 1) return [...own][0];
  return assetWords(assetClass).noun?.one ?? "unit";
}

/** Whether /market opens on the covered markets. A signed-in reader with no
 *  screen on file and no submarket of their own came for the markets — the
 *  pipeline's "Browse the covered markets →" lands here — and found two
 *  empty states and an open form above them, the markets below the fold;
 *  for that reader the explorer leads. A memory that failed to load says
 *  nothing about the reader, and keeps the usual order. */
export function explorerLeads(r: {
  signedIn: boolean;
  memoryFailed: boolean;
  groups: number;
  submarkets: number;
}): boolean {
  return r.signedIn && !r.memoryFailed && r.groups === 0 && r.submarkets === 0;
}

/** How many markets the groups span. A group is one market × one asset
 *  class, so three classes screened in Dallas are three groups and one
 *  market — /market's "N screens across M markets" counted the groups. */
export function marketsIn(groups: readonly Pick<MarketGroup, "marketKey">[]): number {
  return new Set(groups.map((g) => g.marketKey)).size;
}

function groupStat(members: MarketComp[]): MarketGroup {
  const caps = members.map((c) => c.capPct).filter((n): n is number => n != null);
  // Basis is consistent within an asset class; take the members that carry it.
  const withBasis = members.filter((c) => c.perUnit != null && c.perUnitBasis);
  const basisVals = withBasis.map((c) => c.perUnit!);
  const perUnitStat = statOf(basisVals);
  const basis = withBasis[0]?.perUnitBasis ?? null;
  const calls = { pass: 0, caution: 0, pass_on: 0 };
  for (const c of members) {
    if (c.call && c.call in calls) calls[c.call as keyof typeof calls]++;
  }
  // Representative display market: the longest-labeled member (most specific).
  const market =
    members.reduce((best, c) => (c.market.length > best.length ? c.market : best), "") ||
    "Unspecified market";
  return {
    assetClass: members[0].assetClass,
    market,
    marketKey: members[0].marketKey,
    count: members.length,
    cap: statOf(caps),
    perUnit:
      perUnitStat && basis
        ? {
            ...perUnitStat,
            basis,
            noun: basis === "unit" ? groupNoun(members[0].assetClass, withBasis) : null,
          }
        : null,
    calls,
    dealIds: members.map((c) => c.dealId),
  };
}

/** One of the account's own deals, read light: its class and market out of
 *  the extraction (`extraction->>assetClass`, `extraction->>market`) and
 *  none of the rest, so the deal page can find every screen of the same
 *  class × market without loading every extraction the account holds. */
export interface MemoryKeyRow {
  id: string;
  asset_class: string | null;
  is_sample: boolean | null;
  /** `extraction->>market` */
  market: string | null;
  /** `extraction->>assetClass` */
  ext_class: string | null;
}

/** The ids of the account's other deals in one deal's (asset class ×
 *  market) group — grouped as `buildComps` and `marketMemoryFor` group
 *  them, the sample never — whose full rows the strip then reads. The
 *  deal page used to take them from the forty newest deals the reader
 *  could see, which a teammate's deals filled, so the strip undercounted
 *  the reader's own screens. */
export function memoryCandidates(
  rows: readonly MemoryKeyRow[],
  dealId: string,
  assetClass: string,
  market: string,
): string[] {
  const cls = classKeyOf(assetClass);
  const key = normalizeMarketKey(market);
  if (!cls || !key) return [];
  return rows
    .filter(
      (r) =>
        r.id !== dealId &&
        !r.is_sample &&
        dealClassKey(r.asset_class, { assetClass: r.ext_class }) === cls &&
        normalizeMarketKey(r.market ?? "") === key,
    )
    .map((r) => r.id);
}

/** The group matching one deal's (asset class × market), excluding that deal —
 *  the "across your past screens" strip for the deal page. Null when there's no
 *  comparable prior screen. */
export function marketMemoryFor(
  comps: MarketComp[],
  dealId: string,
  assetClass: string,
  market: string,
): MarketGroup | null {
  const cls = classKeyOf(assetClass);
  const key = normalizeMarketKey(market);
  if (!cls || !key) return null;
  const members = comps.filter(
    (c) => c.dealId !== dealId && c.assetClass === cls && c.marketKey === key,
  );
  if (!members.length) return null;
  return groupStat(members);
}

// ---- Display helpers (pure formatting) ------------------------------------

/** "$274k/unit", "$200k/key", "$60k/pad", "$212/SF" — a unit basis wears the
 *  noun it was counted in (lib/asset-words), never "unit" for a hotel's keys. */
export const fmtBasis = (dollars: number, basis: "unit" | "sf", noun: string | null = "unit") =>
  basis === "unit"
    ? dollars >= 1e3
      ? `$${Math.round(dollars / 1e3)}k/${noun ?? "unit"}`
      : `$${Math.round(dollars)}/${noun ?? "unit"}`
    : `$${Math.round(dollars)}/SF`;

/** "Basis / key", "Basis / SF": the group's own noun where it carries a
 *  basis, else the class's (lib/asset-words `perSuffix` — "/acre" on land,
 *  which the memory has no figure for). */
export function basisLabel(g: Pick<MarketGroup, "assetClass" | "perUnit">): string {
  const suffix = g.perUnit
    ? g.perUnit.basis === "sf"
      ? "/SF"
      : `/${g.perUnit.noun ?? "unit"}`
    : perSuffix(assetWords(g.assetClass));
  return `Basis / ${suffix.slice(1)}`;
}

/** "4.9–5.5%" or "5.2%" when the ends coincide. */
export function fmtCapRange(s: Stat): string {
  const lo = s.min.toFixed(1);
  const hi = s.max.toFixed(1);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
}

export function fmtBasisRange(s: BasisStat): string {
  const noun = s.noun ?? "unit";
  if (s.min === s.max) return fmtBasis(s.min, s.basis, noun);
  // Share the "/key" or "/SF" suffix across the range.
  if (s.basis === "unit") {
    const lo = s.min >= 1e3 ? `$${Math.round(s.min / 1e3)}` : `$${Math.round(s.min)}`;
    const hi = s.max >= 1e3 ? `${Math.round(s.max / 1e3)}k` : `${Math.round(s.max)}`;
    return `${lo}–${hi}/${noun}`;
  }
  return `$${Math.round(s.min)}–${Math.round(s.max)}/SF`;
}
