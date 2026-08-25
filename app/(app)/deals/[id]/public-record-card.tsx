// Public-record parcel card (server component): the ingested assessor row
// nearest the deal's geocoded point (nearest_property RPC, migration 0030),
// with an address-prefix fallback for markets ingested without coordinates
// (Boston's roll). Assessment context lands where underwriting happens —
// assessed value, year built, SF, owner + absentee flag, last recorded sale —
// every row with provenance. Renders nothing when no parcel matches: an
// empty card would imply coverage the DB doesn't have.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import metrosSeed from "@/data/research/metros.json";
import { metroForAddress } from "@/lib/market-match";
import type { StructuredAddress } from "@/lib/address";

interface PropertyRow {
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

const money = (v: number | null) =>
  v === null ? "—" : `$${Math.round(v).toLocaleString("en-US")}`;

export async function PublicRecordCard({
  address,
  subject,
}: {
  address: StructuredAddress | null;
  subject: { lat: number; lng: number } | null;
}) {
  if (!address?.label) return null;
  const supabase = await createSupabaseServerClient();

  let row: PropertyRow | null = null;
  try {
    if (subject) {
      const { data } = await supabase.rpc("nearest_property", {
        in_lat: subject.lat,
        in_lng: subject.lng,
        in_radius_m: 120,
        in_limit: 1,
      });
      if (Array.isArray(data) && data.length > 0) row = data[0] as PropertyRow;
    }
    if (!row && address.street) {
      // Coordinate-less markets (Boston's roll): prefix-match the situs.
      const metro = metroForAddress(address);
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

  const facts: { label: string; value: string }[] = [
    { label: "Parcel", value: row.parcel_id },
    { label: "Assessed value", value: money(row.assessed_value) },
    { label: "Year built", value: row.year_built ? String(row.year_built) : "—" },
    {
      label: "Building SF",
      value: row.building_sf ? Math.round(row.building_sf).toLocaleString("en-US") : "—",
    },
    { label: "Class (source's own code)", value: row.land_use_raw ?? row.asset_class },
    {
      label: "Owner",
      value: row.owner_name
        ? `${row.owner_name}${row.owner_absentee === true ? " · absentee mailing" : row.owner_absentee === false ? " · owner-occupied-ish" : ""}`
        : "—",
    },
    ...(lastSale
      ? [{ label: "Last recorded sale", value: `${money(lastSale.price)} on ${lastSale.sale_date}` }]
      : []),
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
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
      <p className="mt-3 text-xs text-muted">
        Source:{" "}
        <a href={row.source_url} className="underline hover:text-brand" target="_blank" rel="noreferrer">
          {row.source_dataset}
        </a>{" "}
        · ingested {row.ingested_at.slice(0, 10)}
      </p>
    </section>
  );
}
