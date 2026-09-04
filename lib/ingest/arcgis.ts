// Shared ArcGIS FeatureServer/MapServer helpers for the bulk ingest
// pipelines — the Esri-flavored sibling of socrata.ts. One home so a
// timeout/paging fix lands everywhere at once. (Node-side only — imported by
// scripts/ingest/*.ts, never by app code.)

export interface ArcgisFeature {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: unknown };
  centroid?: { x?: number; y?: number };
}

interface QueryResponse {
  features?: ArcgisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code?: number; message?: string; details?: string[] };
}

/** One /query call. Throws with the service's own error message — an ArcGIS
 *  error arrives as HTTP 200 + an `error` body, so status checks alone lie. */
export async function arcgisQuery(
  layerUrl: string,
  params: Record<string, string>
): Promise<QueryResponse> {
  const qs = new URLSearchParams({ f: "json", ...params }).toString();
  const res = await fetch(`${layerUrl}/query?${qs}`, {
    headers: { accept: "application/json", "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    throw new Error(`ArcGIS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as QueryResponse;
  if (body.error) {
    throw new Error(
      `ArcGIS error ${body.error.code ?? "?"}: ${body.error.message ?? "unknown"} ${(body.error.details ?? []).join("; ")}`.slice(0, 400)
    );
  }
  return body;
}

/** Page through a layer by ascending OBJECTID (the portable ArcGIS paging
 *  method — resultOffset caps out on many servers). `where` narrows the scan;
 *  `pageSize` should stay at or under the layer's maxRecordCount. */
export async function* arcgisPages(
  layerUrl: string,
  opts: {
    where?: string;
    outFields: string;
    pageSize?: number;
    objectIdField?: string;
    returnCentroid?: boolean;
    maxRows?: number;
  }
): AsyncGenerator<ArcgisFeature[]> {
  const oid = opts.objectIdField ?? "OBJECTID";
  const page = opts.pageSize ?? 1000;
  const max = opts.maxRows ?? Number.MAX_SAFE_INTEGER;
  let after = -1;
  let seen = 0;
  for (;;) {
    const where = [`${oid} > ${after}`, opts.where].filter(Boolean).join(" AND ");
    const body = await arcgisQuery(layerUrl, {
      where,
      outFields: `${oid},${opts.outFields}`,
      orderByFields: oid,
      resultRecordCount: String(page),
      outSR: "4326",
      returnGeometry: "false",
      ...(opts.returnCentroid ? { returnCentroid: "true" } : {}),
    });
    const feats = body.features ?? [];
    if (feats.length === 0) return;
    const last = feats[feats.length - 1].attributes[oid];
    if (typeof last !== "number") {
      throw new Error(`ArcGIS paging: ${oid} missing/non-numeric in response — check objectIdField`);
    }
    after = last;
    seen += feats.length;
    yield feats;
    if (seen >= max || feats.length < page) return;
  }
}

/** Field-name resolver for a feature's attributes: same LOUD-failure contract
 *  as socrata.resolveFields — never ingest nulls because a field was renamed. */
export function resolveAttrs(
  sample: Record<string, unknown>,
  wanted: Record<string, string[]>
): Record<string, string> {
  const keys = Object.keys(sample);
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, candidates] of Object.entries(wanted)) {
    const hit = candidates.find((c) => keys.includes(c));
    if (hit) out[name] = hit;
    else missing.push(`${name} (tried ${candidates.join("/")})`);
  }
  if (missing.length) {
    throw new Error(
      `layer fields not found: ${missing.join("; ")} — available: ${keys.join(", ")}`
    );
  }
  return out;
}

/** Esri dates are epoch-millis numbers; some layers carry ISO strings. Null
 *  never becomes 1970-01-01. */
export function arcgisDateIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const s = v.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return null;
}
