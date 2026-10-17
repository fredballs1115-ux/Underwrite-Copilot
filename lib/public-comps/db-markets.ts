// The markets the property database holds recorded sales for (migration
// 0028's `recorded_sales.market`), as the research file names them: each
// briefed metro with an `ingest_market` is one the ingest scripts
// (scripts/ingest) write under that key. Whether the table HOLDS rows for one
// is a read (lib/public-comps/run, lib/research-read), never this list: a
// market on it with nothing ingested yet is no coverage.
//
// Pure, server-side only by use: it reads the research file, which no client
// module may reach (lib/client-bundle-tables.test.ts).

import metrosSeed from "@/data/research/metros.json";
import { metroForAddress, type AddressLike } from "@/lib/market-match";

export interface DbMarket {
  /** the briefed metro's id ("nyc") */
  metroId: string;
  /** the metro's name as the research file writes it ("New York City") */
  name: string;
  /** the key the ingest writes under (`recorded_sales.market`) */
  ingestMarket: string;
}

export const DB_MARKETS: readonly DbMarket[] = (
  metrosSeed.metros as { id: string; name: string; ingest_market?: string }[]
)
  .filter((m) => typeof m.ingest_market === "string" && m.ingest_market.trim())
  .map((m) => ({ metroId: m.id, name: m.name, ingestMarket: m.ingest_market as string }));

/** The database market an address lies in, through the briefed metro the
 *  address matchers place it in, or null. */
export function dbMarketForAddress(address: AddressLike): DbMarket | null {
  const metro = metroForAddress(address);
  return metro ? (DB_MARKETS.find((m) => m.metroId === metro.id) ?? null) : null;
}

/** "Philadelphia PA, New York City, and Boston" — the names a list of
 *  markets is said by, or "" for none. */
export function marketNames(markets: readonly Pick<DbMarket, "name">[]): string {
  const names = markets.map((m) => m.name);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
