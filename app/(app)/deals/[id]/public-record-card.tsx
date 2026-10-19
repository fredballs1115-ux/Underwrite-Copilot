// Public-record parcel card (server component): the ingested assessor row
// nearest the deal's geocoded point (nearest_property RPC, migration 0030),
// with an address-prefix fallback for markets ingested without coordinates
// (Boston's roll). Assessment context lands where underwriting happens —
// assessed value, year built, SF, owner + where the record mails, last recorded sale —
// every row with provenance. Renders nothing when no parcel matches: an
// empty card would imply coverage the DB doesn't have.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import metrosSeed from "@/data/research/metros.json";
import { metroForAddress } from "@/lib/market-match";
import type { StructuredAddress } from "@/lib/address";
import { NEAREST_PARCEL } from "@/lib/public-record-asks";
import { SAMPLE_PUBLIC_RECORD_LINE } from "@/lib/public-record-subject";
import { rollYear } from "@/lib/ingest/boston-roll";
import { datedLong } from "@/lib/debt-index";
import { dayOf } from "@/lib/utc-day";

export interface PropertyRow {
  market: string;
  parcel_id: string;
  address: string | null;
  land_use_raw: string | null;
  asset_class: string;
  building_sf: number | null;
  year_built: number | null;
  assessed_value: number | null;
  owner_name: string | null;
  owner_absentee: boolean | null;
  source_dataset: string;
  source_url: string;
  ingested_at: string;
}

/** In the card's place on the sample deal: one line saying why there is no
 *  parcel — never a real neighbour's parcel and owner as the fictional
 *  building's record. */
export function SamplePublicRecord() {
  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-qa="public-record-sample">
      <h2 className="text-sm font-semibold">Public record (assessor)</h2>
      <p className="mt-1 text-xs text-muted">{SAMPLE_PUBLIC_RECORD_LINE}</p>
    </section>
  );
}

const money = (v: number | null) =>
  v === null ? "—" : `$${Math.round(v).toLocaleString("en-US")}`;

export async function PublicRecordCard({
  address,
  subject,
  market,
  sample = false,
}: {
  address: StructuredAddress | null;
  /** the point to look a parcel up at (lib/public-record-subject): the
   *  building's own, never a street's or an area's centre */
  subject: { lat: number; lng: number } | null;
  /** the briefed market the page placed the deal in (lib/market-county's
   *  `placeDeal(...).briefed`, which drops an address word naming a place
   *  in another county's metro area); the address matchers otherwise */
  market?: { id: string } | null;
  /** the sample deal: its building is fictional, so no parcel is looked up
   *  and the card says why in its place */
  sample?: boolean;
}) {
  if (sample) return <SamplePublicRecord />;
  if (!address?.label) return null;
  const supabase = await createSupabaseServerClient();

  let row: PropertyRow | null = null;
  try {
    if (subject) {
      const { data } = await supabase.rpc("nearest_property", {
        in_lat: subject.lat,
        in_lng: subject.lng,
        in_radius_m: NEAREST_PARCEL.radiusM,
        in_limit: NEAREST_PARCEL.limit,
      });
      if (Array.isArray(data) && data.length > 0) row = data[0] as PropertyRow;
    }
    if (!row && address.street) {
      // Coordinate-less markets (Boston's roll): prefix-match the situs.
      const metro = market !== undefined ? market : metroForAddress(address);
      const ingestMarket = metro
        ? ((metrosSeed.metros.find((m) => m.id === metro.id) as { ingest_market?: string } | undefined)
            ?.ingest_market ?? null)
        : null;
      if (ingestMarket) {
        const { data } = await supabase
          .from("properties")
          .select(
            "market, parcel_id, address, land_use_raw, asset_class, building_sf, year_built, assessed_value, owner_name, owner_absentee, source_dataset, source_url, ingested_at"
          )
          .eq("market", ingestMarket)
          .ilike("address", `${address.street.trim()}%`)
          .limit(1);
        if (Array.isArray(data) && data.length > 0) row = data[0] as PropertyRow;
      }
    }
  } catch {
    row = null; // table/RPC absent (migration not run) — render nothing, honestly
  }
  if (!row) return null;

  let lastSale: { sale_date: string; price: number; source_url: string } | null = null;
  try {
    const { data } = await supabase
      .from("recorded_sales")
      .select("sale_date, price, source_url")
      .eq("market", row.market)
      .eq("parcel_id", row.parcel_id)
      .order("sale_date", { ascending: false })
      .limit(1);
    if (Array.isArray(data) && data.length > 0) {
      lastSale = data[0] as { sale_date: string; price: number; source_url: string };
    }
  } catch {
    lastSale = null;
  }

  return <PublicRecordView row={row} lastSale={lastSale} />;
}

/** What the record says of the owner's mailing address against the parcel's
 *  own: only that, never who lives in or uses the building (the record
 *  carries a mailing address, not an occupancy). */
export function ownerMailingWords(absentee: boolean | null): string | null {
  if (absentee === true) return "mails elsewhere";
  if (absentee === false) return "mails to the property";
  return null;
}

/** The assessed value's label, with the roll's fiscal year where the source
 *  names one (Boston's resources are named for theirs, lib/ingest/boston-roll);
 *  no other source states a year, so none is said. */
export function assessedLabel(sourceDataset: string): string {
  const year = rollYear(sourceDataset);
  return year ? `Assessed value (FY${year} roll)` : "Assessed value";
}

export const ASSESSED_CAVEAT =
  "An assessed value is the assessor's figure for the tax roll, not a market value or a price.";

/** The card's markup on a row already read: pure, so a test draws it. */
export function PublicRecordView({
  row,
  lastSale,
}: {
  row: PropertyRow;
  lastSale: { sale_date: string; price: number; source_url: string } | null;
}) {
  const mailing = ownerMailingWords(row.owner_absentee);
  const ingested = dayOf(row.ingested_at);
  const facts: { label: string; value: string }[] = [
    { label: "Parcel", value: row.parcel_id },
    { label: assessedLabel(row.source_dataset), value: money(row.assessed_value) },
    { label: "Year built", value: row.year_built ? String(row.year_built) : "—" },
    {
      label: "Building SF",
      value: row.building_sf ? Math.round(row.building_sf).toLocaleString("en-US") : "—",
    },
    { label: "Class (source's own code)", value: row.land_use_raw ?? row.asset_class },
    {
      label: "Owner",
      value: row.owner_name ? `${row.owner_name}${mailing ? ` · ${mailing}` : ""}` : "—",
    },
    ...(lastSale
      ? [{ label: "Last recorded sale", value: `${money(lastSale.price)} on ${datedLong(lastSale.sale_date)}` }]
      : []),
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-qa="public-record">
      <h2 className="text-sm font-semibold">Public record (assessor)</h2>
      <p className="mt-1 text-xs text-muted">
        Nearest ingested parcel{row.address ? ` — ${row.address}` : ""}. Match is
        by location/address, not title — confirm the parcel before relying on it.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="text-sm">{f.value}</dd>
          </div>
        ))}
      </dl>
      {row.assessed_value !== null ? <p className="mt-2 text-xs text-muted">{ASSESSED_CAVEAT}</p> : null}
      <p className="mt-3 text-xs text-muted">
        Source:{" "}
        <a href={row.source_url} className="underline hover:text-brand" target="_blank" rel="noreferrer">
          {row.source_dataset}
        </a>
        {ingested ? ` · ingested ${ingested}` : null}
      </p>
    </section>
  );
}
