// Public-record comps: the PURE core. Provider configs (which government
// dataset, how to build the query, how to parse rows) plus normalization and
// stats. No I/O here — fetching lives in run.ts — so every query builder and
// parser is unit-testable against fixtures. (Universal module.)
//
// Provider reality, stated plainly: this build environment cannot reach the
// portals (egress-blocked), so PHILADELPHIA is wired from its long-stable,
// well-documented Carto SQL API, while the DC and MARYLAND entries are
// config-first — their endpoint/field guesses are validated in production by
// /api/comps/health, which returns the upstream service's own layer list /
// field errors so a wrong name is a one-line config fix, never a silent
// wrong number.

import { haversineKm, type LatLng } from "@/lib/geo";

export interface RecordComp {
  address: string;
  lat: number;
  lng: number;
  /** ISO yyyy-mm-dd */
  saleDate: string;
  price: number;
  sqft: number | null;
  /** provider's own classification string, verbatim */
  propertyType: string;
  distanceKm: number;
  sourceUrl: string;
}

export interface RecordCompsStats {
  count: number;
  medianPrice: number;
  medianPerSqft: number | null;
  low: number;
  high: number;
}

export type RecordCompsStatus =
  | "pending"
  | "ok"
  | "no_sales"
  | "no_provider"
  | "geocode_failed"
  | "provider_error";

export interface RecordCompsResult {
  status: RecordCompsStatus;
  providerId?: string;
  providerName?: string;
  datasetUrl?: string;
  subject?: { lat: number; lng: number; label: string };
  params?: { radiusKm: number; monthsBack: number; classFilter: string };
  comps: RecordComp[];
  stats?: RecordCompsStats;
  retrievedAt: string;
  error?: string;
  /** the honesty label rendered under the panel, verbatim */
  note: string;
}

export const HONESTY_NOTE =
  "Public records (recorded sales), not an appraisal or listing data — prices include non-arm's-length transfers the record can't distinguish; verify any comp you rely on.";

/** What the engine asks a provider for. */
export interface ProviderQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  monthsBack: number;
  /** deal asset class, lowercased ("multifamily", "retail", …, "" = any) */
  assetClass: string;
  /** ISO date used as "now" — passed in so builders are deterministic in tests */
  nowIso: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  datasetUrl: string;
  /** does this provider cover the deal's address? */
  matches: (a: { state: string; city: string; county: string }) => boolean;
  /** full request URL for the sales query */
  buildUrl: (q: ProviderQuery) => string;
  /** parse the provider's JSON into comps (distance filled by the engine) */
  parse: (json: unknown) => Omit<RecordComp, "distanceKm">[];
  /** probe URL for /api/comps/health — cheap, 1-row or metadata */
  healthUrl: string;
  /** true when endpoint/fields could not be verified from the build env */
  needsFieldVerification: boolean;
  /** short human region label ("Maryland (statewide)") — coverage copy derives from these */
  regionLabel: string;
  /** false = DISCOVERY MODE: the jurisdiction is claimed, the health probe
   *  resolves the real endpoint/fields from production, but providerFor
   *  skips it — deals there honestly read "no source wired yet" instead of
   *  firing a query known to be wrong. Flipping to true is the wiring step. */
  configured: boolean;
}

const monthsAgoIso = (nowIso: string, months: number): string => {
  const d = new Date(nowIso);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};

const num = (v: unknown): number | null => {
  // null/undefined/"" must stay null — Number(null) is 0, and a 0,0 lat/lng
  // is a real coordinate, not an absence.
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[,$]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ── Philadelphia — OPA properties via the Carto SQL API ─────────────────────
// Long-documented public endpoint; fields per the city's carto-api-explorer:
// location, unit, sale_date, sale_price, total_livable_area,
// category_code_description, parcel_number, lat, lng.
const philadelphia: ProviderConfig = {
  id: "philly_opa",
  name: "Philadelphia OPA (Carto SQL API)",
  datasetUrl: "https://opendataphilly.org/datasets/philadelphia-properties-and-assessment-history/",
  matches: (a) => a.state.toUpperCase() === "PA" && /philadelphia/i.test(a.city || a.county),
  buildUrl: (q) => {
    const meters = Math.round(q.radiusKm * 1000);
    const since = monthsAgoIso(q.nowIso, q.monthsBack);
    const classWhere = q.assetClass.includes("multifamily")
      ? " AND (category_code_description ILIKE '%MULTI%' OR category_code_description ILIKE '%MIXED%')"
      : "";
    const sql =
      "SELECT location, unit, sale_date, sale_price, total_livable_area, " +
      "category_code_description, parcel_number, lat, lng " +
      "FROM opa_properties_public " +
      `WHERE sale_price > 10000 AND sale_date >= '${since}' ` +
      "AND lat IS NOT NULL " +
      `AND ST_DWithin(the_geom::geography, ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography, ${meters})` +
      classWhere +
      " ORDER BY sale_date DESC LIMIT 80";
    return `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`;
  },
  parse: (json) => {
    const rows = (json as { rows?: unknown[] })?.rows ?? [];
    const out: Omit<RecordComp, "distanceKm">[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const price = num(r.sale_price);
      const lat = num(r.lat);
      const lng = num(r.lng);
      const date = str(r.sale_date).slice(0, 10);
      if (!price || lat === null || lng === null || !date) continue;
      const unit = str(r.unit);
      out.push({
        address: [str(r.location), unit && `#${unit}`].filter(Boolean).join(" "),
        lat,
        lng,
        saleDate: date,
        price,
        sqft: num(r.total_livable_area),
        propertyType: str(r.category_code_description) || "unknown",
        sourceUrl: `https://property.phila.gov/?p=${encodeURIComponent(str(r.parcel_number))}`,
      });
    }
    return out;
  },
  healthUrl:
    "https://phl.carto.com/api/v2/sql?q=" +
    encodeURIComponent("SELECT sale_date, sale_price, lat, lng FROM opa_properties_public LIMIT 1"),
  needsFieldVerification: false,
  configured: true,
  regionLabel: "Philadelphia",
};

// ── Washington, DC — ITS Public Extract via ArcGIS FeatureServer ────────────
// Endpoint/layer index UNVERIFIED from the build env (proxy-blocked). The
// health probe fetches the service root (?f=json), whose layer list names the
// correct index — fixing this config is a one-line edit. Field names below
// follow the published ITS Public Extract schema (PREMISEADD, SALEDATE,
// SALEPRICE, USECODE, LATITUDE/LONGITUDE).
const DC_SERVICE_ROOT =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer";
const dc: ProviderConfig = {
  id: "dc_its",
  name: "DC Integrated Tax System Public Extract (Open Data DC)",
  datasetUrl: "https://opendata.dc.gov/datasets/integrated-tax-system-public-extract-property-sales",
  matches: (a) => a.state.toUpperCase() === "DC",
  buildUrl: (q) => {
    const meters = Math.round(q.radiusKm * 1000);
    const since = monthsAgoIso(q.nowIso, q.monthsBack);
    const params = new URLSearchParams({
      f: "json",
      where: `SALEPRICE > 10000 AND SALEDATE >= DATE '${since}'`,
      geometry: `${q.lng},${q.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: String(meters),
      units: "esriSRUnit_Meter",
      outFields: "PREMISEADD,SALEDATE,SALEPRICE,USECODE,LANDAREA,LATITUDE,LONGITUDE,SSL",
      outSR: "4326",
      resultRecordCount: "80",
      orderByFields: "SALEDATE DESC",
      returnGeometry: "true",
    });
    return `${DC_SERVICE_ROOT}/53/query?${params.toString()}`;
  },
  parse: (json) => {
    const feats = (json as { features?: unknown[] })?.features ?? [];
    const out: Omit<RecordComp, "distanceKm">[] = [];
    for (const f of feats as { attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }[]) {
      const a = f.attributes ?? {};
      const price = num(a.SALEPRICE);
      const lat = num(a.LATITUDE) ?? num(f.geometry?.y);
      const lng = num(a.LONGITUDE) ?? num(f.geometry?.x);
      const dateMs = num(a.SALEDATE);
      if (!price || lat === null || lng === null || dateMs === null) continue;
      out.push({
        address: str(a.PREMISEADD) || str(a.SSL) || "unknown address",
        lat,
        lng,
        saleDate: new Date(dateMs).toISOString().slice(0, 10),
        price,
        // LANDAREA is LAND square feet, not building area — presenting it as
        // $/SF would be a materially wrong pricing signal. Null until a real
        // improvement-area field is confirmed via the health check.
        sqft: null,
        propertyType: `usecode ${str(a.USECODE) || "?"}`,
        sourceUrl: `https://opendata.dc.gov/datasets/integrated-tax-system-public-extract-property-sales`,
      });
    }
    return out;
  },
  healthUrl: `${DC_SERVICE_ROOT}?f=json`,
  needsFieldVerification: true,
  configured: true,
  regionLabel: "Washington DC",
};

// ── Maryland (statewide) — SDAT assessments via Socrata ─────────────────────
// Dataset id ed4q-f8tm confirmed; COLUMN NAMES unverified from the build env
// (the fields-reference PDF is proxy-blocked). A wrong column makes Socrata
// return a named error — /api/comps/health surfaces it verbatim.
const md: ProviderConfig = {
  id: "md_sdat",
  name: "Maryland SDAT Real Property (Socrata)",
  datasetUrl: "https://opendata.maryland.gov/d/ed4q-f8tm",
  matches: (a) => a.state.toUpperCase() === "MD",
  buildUrl: (q) => {
    const meters = Math.round(q.radiusKm * 1000);
    const since = monthsAgoIso(q.nowIso, q.monthsBack).replace(/-/g, "");
    const where =
      `within_circle(mdp_location, ${q.lat}, ${q.lng}, ${meters})` +
      ` AND sales_segment_1_consideration > 10000` +
      ` AND sales_segment_1_transfer_date >= '${since}'`;
    const params = new URLSearchParams({
      $select:
        "premise_address_line_1, premise_address_city, sales_segment_1_transfer_date, " +
        "sales_segment_1_consideration, land_use_code, mdp_latitude, mdp_longitude, account_id",
      $where: where,
      $order: "sales_segment_1_transfer_date DESC",
      $limit: "80",
    });
    return `https://opendata.maryland.gov/resource/ed4q-f8tm.json?${params.toString()}`;
  },
  parse: (json) => {
    const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
    const out: Omit<RecordComp, "distanceKm">[] = [];
    for (const r of rows) {
      const price = num(r.sales_segment_1_consideration);
      const lat = num(r.mdp_latitude);
      const lng = num(r.mdp_longitude);
      const rawDate = str(r.sales_segment_1_transfer_date);
      const date =
        rawDate.length === 8
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : rawDate.slice(0, 10);
      if (!price || lat === null || lng === null || !date) continue;
      out.push({
        address: [str(r.premise_address_line_1), str(r.premise_address_city)]
          .filter(Boolean)
          .join(", "),
        lat,
        lng,
        saleDate: date,
        price,
        sqft: null,
        propertyType: `land use ${str(r.land_use_code) || "?"}`,
        sourceUrl: "https://opendata.maryland.gov/d/ed4q-f8tm",
      });
    }
    return out;
  },
  healthUrl:
    "https://opendata.maryland.gov/resource/ed4q-f8tm.json?" +
    new URLSearchParams({
      $select:
        "premise_address_line_1, sales_segment_1_transfer_date, sales_segment_1_consideration, mdp_latitude, mdp_longitude",
      $limit: "1",
    }).toString(),
  needsFieldVerification: true,
  configured: true,
  regionLabel: "Maryland (statewide)",
};

// ── New Jersey (statewide) — Parcels + MOD-IV composite via ArcGIS ──────────
// Current service URL confirmed via NJGIN's retired-services notice (the
// pre-March-2026 URL was replaced): Parcels_Composite_NJ_WM. MOD-IV joins
// tax-assessor attributes onto every parcel; the sale-related COLUMN NAMES
// are unverified from the build env — the health probe fetches layer 0's
// schema so the real names land in /api/comps/health. Polygon layer, so the
// query asks for centroids.
const NJ_LAYER =
  "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0";
const nj: ProviderConfig = {
  id: "nj_modiv",
  name: "New Jersey Parcels + MOD-IV (NJGIN, statewide)",
  datasetUrl:
    "https://njogis-newjersey.opendata.arcgis.com/datasets/newjersey::parcels-and-mod-iv-composite-of-nj-web-mercator-3857/about",
  matches: (a) => a.state.toUpperCase() === "NJ",
  buildUrl: (q) => {
    const meters = Math.round(q.radiusKm * 1000);
    const since = monthsAgoIso(q.nowIso, q.monthsBack);
    const params = new URLSearchParams({
      f: "json",
      where: `SALE_PRICE > 10000 AND DEED_DATE >= DATE '${since}'`,
      geometry: `${q.lng},${q.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: String(meters),
      units: "esriSRUnit_Meter",
      outFields: "PROP_LOC,MUN_NAME,SALE_PRICE,DEED_DATE,PROP_CLASS,PAMS_PIN",
      outSR: "4326",
      resultRecordCount: "80",
      returnGeometry: "false",
      returnCentroid: "true",
    });
    return `${NJ_LAYER}/query?${params.toString()}`;
  },
  parse: (json) => {
    const feats = (json as { features?: unknown[] })?.features ?? [];
    const out: Omit<RecordComp, "distanceKm">[] = [];
    for (const f of feats as {
      attributes?: Record<string, unknown>;
      centroid?: { x?: number; y?: number };
      geometry?: { x?: number; y?: number };
    }[]) {
      const a = f.attributes ?? {};
      const price = num(a.SALE_PRICE);
      const lat = num(f.centroid?.y) ?? num(f.geometry?.y);
      const lng = num(f.centroid?.x) ?? num(f.geometry?.x);
      const dateMs = num(a.DEED_DATE);
      const date =
        dateMs !== null
          ? new Date(dateMs).toISOString().slice(0, 10)
          : str(a.DEED_DATE).slice(0, 10);
      if (!price || lat === null || lng === null || !date) continue;
      out.push({
        address: [str(a.PROP_LOC), str(a.MUN_NAME)].filter(Boolean).join(", "),
        lat,
        lng,
        saleDate: date,
        price,
        sqft: null,
        propertyType: `class ${str(a.PROP_CLASS) || "?"}`,
        sourceUrl:
          "https://njogis-newjersey.opendata.arcgis.com/datasets/newjersey::parcels-and-mod-iv-composite-of-nj-web-mercator-3857/about",
      });
    }
    return out;
  },
  healthUrl: `${NJ_LAYER}?f=json`,
  needsFieldVerification: true,
  configured: true,
  regionLabel: "New Jersey (statewide)",
};

// ── DISCOVERY-MODE providers ────────────────────────────────────────────────
// Jurisdictions with real open sales data whose exact REST endpoints could
// not be resolved through this build environment's proxy. Their health probes
// hit the portals' own metadata APIs, which return the FeatureServer URL and
// field list — the wiring step is then mechanical: fill the query builder,
// flip configured to true. Until then providerFor skips them and deals there
// read "no source wired yet".
const discovery = (
  id: string,
  name: string,
  regionLabel: string,
  datasetUrl: string,
  matches: ProviderConfig["matches"],
  healthUrl: string
): ProviderConfig => ({
  id,
  name,
  regionLabel,
  datasetUrl,
  matches,
  buildUrl: () => {
    throw new Error(`${id}: discovery mode — endpoint not yet configured`);
  },
  parse: () => [],
  healthUrl,
  needsFieldVerification: true,
  configured: false,
});

const fairfax = discovery(
  "va_fairfax",
  "Fairfax County VA — Tax Administration sales (discovery)",
  "Fairfax County VA",
  "https://data-fairfaxcountygis.opendata.arcgis.com/datasets/Fairfaxcountygis::tax-administrations-real-estate-sales-data/about",
  (a) => a.state.toUpperCase() === "VA" && /fairfax/i.test(a.county || a.city),
  // Hub v3 dataset API returns the backing FeatureServer URL + field list.
  "https://data-fairfaxcountygis.opendata.arcgis.com/api/v3/datasets/764b1798c0434003a862e2734ba2b705_1"
);
const arlington = discovery(
  "va_arlington",
  "Arlington County VA — property sales (discovery)",
  "Arlington County VA",
  "https://gisdata-arlgis.opendata.arcgis.com/",
  (a) => a.state.toUpperCase() === "VA" && /arlington/i.test(a.county || a.city),
  "https://gis.arlingtonva.us/arcgis/rest/services?f=json"
);
const allegheny = discovery(
  "pa_allegheny",
  "Allegheny County PA (Pittsburgh) — WPRDC sales (discovery)",
  "Pittsburgh / Allegheny County PA",
  "https://data.wprdc.org/dataset/real-estate-sales",
  (a) => a.state.toUpperCase() === "PA" && /allegheny|pittsburgh/i.test(a.county || a.city),
  // CKAN datastore_search with limit 0 returns the resource's field schema.
  "https://data.wprdc.org/api/3/action/datastore_search?resource_id=5bbe6c55-bce6-4edb-9d04-68edeb6bf7b1&limit=1"
);
const newCastle = discovery(
  "de_new_castle",
  "New Castle County DE — parcel sales (discovery)",
  "New Castle County DE",
  "https://apps-nccde.hub.arcgis.com/",
  (a) => a.state.toUpperCase() === "DE" && /new castle|wilmington|newark/i.test(a.county || a.city),
  "https://gis.nccde.org/agsserver/rest/services?f=json"
);
// Registry round (docs/data-sources, 2026-08-25): both portals search-
// confirmed; the exact sales layer resolves via the hub/catalog probe in
// production, same protocol as the entries above.
const miamiDade = discovery(
  "fl_miami_dade",
  "Miami-Dade County FL — open-data parcels/sales (discovery)",
  "Miami-Dade County FL",
  "https://gis-mdc.opendata.arcgis.com/",
  (a) => a.state.toUpperCase() === "FL" && /miami|dade/i.test(a.county || a.city),
  "https://gis-mdc.opendata.arcgis.com/api/search/definition/?f=json"
);
const richmondVa = discovery(
  "va_richmond",
  "Richmond VA — city assessor open data (discovery)",
  "Richmond VA (city)",
  "https://richmond-geo-hub-cor.hub.arcgis.com/",
  (a) => a.state.toUpperCase() === "VA" && /richmond/i.test(a.city || a.county),
  "https://data.richmondgov.com/api/catalog/v1?limit=1"
);

export const PROVIDERS: ProviderConfig[] = [
  philadelphia,
  dc,
  md,
  nj,
  fairfax,
  arlington,
  allegheny,
  newCastle,
  miamiDade,
  richmondVa,
];

/** Human-readable coverage, derived from the configs so copy can't drift. */
export const COVERAGE_LIVE = PROVIDERS.filter((p) => p.configured);
export const COVERAGE_DISCOVERY = PROVIDERS.filter((p) => !p.configured);
const liveLabels = COVERAGE_LIVE.map((p) => p.regionLabel);
export const COVERAGE_SUMMARY =
  liveLabels.length > 1
    ? `${liveLabels.slice(0, -1).join(", ")}, and ${liveLabels[liveLabels.length - 1]}`
    : (liveLabels[0] ?? "no jurisdictions yet");

export function providerFor(a: {
  state: string;
  city: string;
  county: string;
}): ProviderConfig | null {
  return PROVIDERS.find((p) => p.configured && p.matches(a)) ?? null;
}

/** Attach distances, drop out-of-radius rows (providers over-fetch), dedupe
 *  by address+date, sort nearest-first. */
export function finalizeComps(
  raw: Omit<RecordComp, "distanceKm">[],
  subject: LatLng,
  radiusKm: number
): RecordComp[] {
  const seen = new Set<string>();
  const out: RecordComp[] = [];
  for (const c of raw) {
    const key = `${c.address.toLowerCase()}|${c.saleDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distanceKm = haversineKm(subject, { lat: c.lat, lng: c.lng });
    if (distanceKm > radiusKm * 1.05) continue; // small tolerance for provider rounding
    out.push({ ...c, distanceKm });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function compStats(comps: RecordComp[]): RecordCompsStats | undefined {
  if (comps.length === 0) return undefined;
  const prices = comps.map((c) => c.price);
  const perSqft = comps
    .filter((c) => c.sqft && c.sqft > 200)
    .map((c) => c.price / (c.sqft as number));
  return {
    count: comps.length,
    medianPrice: Math.round(median(prices)),
    medianPerSqft: perSqft.length >= 3 ? Math.round(median(perSqft)) : null,
    low: Math.min(...prices),
    high: Math.max(...prices),
  };
}
