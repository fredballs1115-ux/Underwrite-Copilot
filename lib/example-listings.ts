import multifamilySeed from "@/data/research/multifamily.json";
import { placeOf } from "@/lib/address";
import { marketStates, metroForAddress } from "@/lib/market-match";

/**
 * The example properties a market brief shows from the multifamily research
 * file — listings the research saw on the portals and MLS, each said with
 * the day it was seen and the source the file names, and each shown only on
 * the market it is in.
 *
 * The research pass of 2026-10-01 found the block printing "… Bright MLS
 * #VAPW2118338 … — reconfirm live before acting" with neither the file's
 * date nor its source, and printing the DMV core's one listing — a duplex in
 * Dumfries, Virginia — on the District's, Prince George's and Montgomery
 * County's pages alike, because the file files it under "DMV core (DC / PG
 * County MD / NoVA)". Whether listing and portal material stays on the site
 * is the owner's question; this says what each listing is and where.
 *
 * Pure.
 */
export interface ExampleListing {
  address: string;
  price: number | null;
  metric: string;
  note: string;
  /** the source as the file states it */
  source: string;
  /** the day the research saw the listing, as the file states it (ISO) */
  asOf: string | null;
  status: string;
}

/** The research block a market's brief reads examples from (its `metro`
 *  starts with this): the four DMV briefs share the DMV core's. */
const EXAMPLE_BLOCK: Record<string, string> = {
  dc: "DMV core",
  pg_county: "DMV core",
  montgomery_county: "DMV core",
  nova: "DMV core",
  philadelphia: "Philadelphia",
  baltimore: "Baltimore",
};

type RawExample = {
  address?: unknown;
  price?: unknown;
  metric?: unknown;
  note?: unknown;
  source?: unknown;
  as_of?: unknown;
  status?: unknown;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Whether a listing's address is in a market: where the matchers place the
 * address, that market; where they cannot (Dumfries is a town the matchers
 * do not name), its state — but only where no other market of the same
 * research block lies in that state, so an unplaced Maryland listing is
 * shown on neither Maryland county rather than guessed onto one.
 */
export function listingIn(address: string, marketId: string, blockMarkets: readonly string[]): boolean {
  const placed = metroForAddress({ label: address });
  if (placed) return placed.id === marketId;
  const state = placeOf(address)?.state ?? null;
  if (!state || !marketStates(marketId).includes(state)) return false;
  return blockMarkets.filter((id) => id !== marketId).every((id) => !marketStates(id).includes(state));
}

/** A market's example listings: its research block's, each one in the market. */
export function examplesFor(marketId: string): ExampleListing[] {
  const wanted = EXAMPLE_BLOCK[marketId];
  if (!wanted) return [];
  const block = (multifamilySeed.top_east_coast_metros ?? []).find((m) =>
    m.metro.toLowerCase().startsWith(wanted.toLowerCase()),
  );
  const raw = ((block as { example_properties?: RawExample[] } | undefined)?.example_properties ?? []) as RawExample[];
  const blockMarkets = Object.keys(EXAMPLE_BLOCK).filter((id) => EXAMPLE_BLOCK[id] === wanted);
  return raw
    .map((e) => ({
      address: str(e.address),
      price: typeof e.price === "number" && Number.isFinite(e.price) ? e.price : null,
      metric: str(e.metric),
      note: str(e.note),
      source: str(e.source),
      asOf: /^\d{4}-\d{2}-\d{2}$/.test(str(e.as_of)) ? str(e.as_of) : null,
      status: str(e.status) || "sourced",
    }))
    .filter((e) => e.address && listingIn(e.address, marketId, blockMarkets));
}
