// Shared CKAN datastore helpers for bulk ingest pipelines (Boston's Analyze
// Boston, WPRDC, and other CKAN portals). Sibling of socrata.ts / arcgis.ts.
// (Node-side only — imported by scripts/ingest/*.ts, never by app code.)

interface DatastoreResponse {
  success?: boolean;
  error?: unknown;
  result?: {
    records?: Record<string, unknown>[];
    fields?: { id: string; type: string }[];
    total?: number;
  };
}

/** One datastore_search call. CKAN reports failures as success:false with an
 *  error object — surface it verbatim. */
export async function ckanSearch(
  portalBase: string,
  resourceId: string,
  params: Record<string, string> = {}
): Promise<NonNullable<DatastoreResponse["result"]>> {
  const qs = new URLSearchParams({ resource_id: resourceId, ...params }).toString();
  const res = await fetch(`${portalBase}/api/3/action/datastore_search?${qs}`, {
    headers: { accept: "application/json", "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    throw new Error(`CKAN HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as DatastoreResponse;
  if (!body.success || !body.result) {
    throw new Error(`CKAN error: ${JSON.stringify(body.error ?? body).slice(0, 400)}`);
  }
  return body.result;
}

/** Page through a datastore resource by offset. CKAN offset paging is stable
 *  for the yearly-roll style resources we ingest (no mid-scan inserts). */
export async function* ckanPages(
  portalBase: string,
  resourceId: string,
  opts: { pageSize?: number; maxRows?: number; filters?: Record<string, unknown> } = {}
): AsyncGenerator<Record<string, unknown>[]> {
  const page = opts.pageSize ?? 5000;
  const max = opts.maxRows ?? Number.MAX_SAFE_INTEGER;
  let offset = 0;
  for (;;) {
    const result = await ckanSearch(portalBase, resourceId, {
      limit: String(page),
      offset: String(offset),
      ...(opts.filters ? { filters: JSON.stringify(opts.filters) } : {}),
    });
    const rows = result.records ?? [];
    if (rows.length === 0) return;
    yield rows;
    offset += rows.length;
    if (offset >= max || rows.length < page) return;
  }
}
