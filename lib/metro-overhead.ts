import "server-only";
import { usgsAerialUrl } from "@/lib/basemaps";
import { finishAerial } from "@/lib/aerial-finish";
import { frameZoom } from "@/lib/imagery-plan";
import { METRO_FRAME_METRES, metroView } from "@/lib/metro-imagery";

/**
 * How long the USGS export may take. It was 10 seconds, and on the evening
 * of 2026-09-29 (UTC) the export for Montgomery County ran past that on two
 * live-verify runs in a row, where it had answered the day before: the
 * route 404'd and the one market kept on an overhead ON PURPOSE showed no
 * picture at all (#449). A picture the browser then keeps for a year is
 * worth the wait.
 */
export const OVERHEAD_TIMEOUT_MS = 20_000;

/**
 * The last few overheads this process fetched, keyed by market and size —
 * the skyline fetch's rule (lib/skyline-fetch): a free federal service is
 * asked once per frame per process, not once per visitor, and a slow
 * evening at USGS costs only the frames nobody has asked for yet. Bounded
 * on count and on total bytes; oldest out first.
 */
const MAX_ENTRIES = 24;
const MAX_TOTAL_BYTES = 8_000_000;
const memory = new Map<string, { bytes: Buffer; type: string }>();
let heldBytes = 0;
/** One fetch per frame at a time: a second ask waits on the first. */
const pending = new Map<string, Promise<{ bytes: Buffer; type: string } | null>>();

function remember(key: string, got: { bytes: Buffer; type: string }) {
  const old = memory.get(key);
  if (old) {
    heldBytes -= old.bytes.byteLength;
    memory.delete(key);
  }
  memory.set(key, got);
  heldBytes += got.bytes.byteLength;
  while (memory.size > MAX_ENTRIES || heldBytes > MAX_TOTAL_BYTES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    heldBytes -= memory.get(oldest)!.bytes.byteLength;
    memory.delete(oldest);
  }
}

/** Forget every held overhead (tests). */
export function forgetOverheads(): void {
  memory.clear();
  pending.clear();
  heldBytes = 0;
}

/**
 * A covered market's business district from above — the USGS aerial the
 * public pages fall back to where a market has no photograph — for the
 * metro overhead route and the link preview's card (#436), one fetch for
 * both. Public domain, so it needs no credit beyond the line each surface
 * prints. Null for an unknown market or any failure, never a guess.
 */
export async function fetchMetroOverhead(
  id: string,
  width: number,
  height: number,
): Promise<{ bytes: Buffer; type: string } | null> {
  const view = metroView(id);
  if (!view) return null;
  const key = `${id}:${width}x${height}`;
  const hit = memory.get(key);
  if (hit) {
    // Re-inserted, so a frame in demand stays.
    remember(key, hit);
    return hit;
  }
  const running = pending.get(key);
  if (running) return running;

  const work = (async () => {
    const url = usgsAerialUrl({
      center: { lat: view.lat, lng: view.lng },
      zoom: frameZoom({
        widthPx: width,
        lat: view.lat,
        precision: "area",
        source: "aerial",
        frameMetres: METRO_FRAME_METRES,
      }),
      width,
      height,
    });

    let img: Response;
    try {
      img = await fetch(url, { signal: AbortSignal.timeout(OVERHEAD_TIMEOUT_MS) });
    } catch {
      return null;
    }
    const type = img.headers.get("content-type") ?? "";
    // The ArcGIS export endpoint answers 200 with a JSON error body when it
    // dislikes a request, so content-type is the real success test.
    if (!img.ok || !img.body || !type.startsWith("image/")) return null;

    // The same finish every building's overhead gets (#429); the plain export
    // where the finish fails.
    const raw = Buffer.from(await img.arrayBuffer());
    if (raw.byteLength === 0) return null;
    let got: { bytes: Buffer; type: string };
    try {
      got = { bytes: await finishAerial(raw), type: "image/jpeg" };
    } catch {
      got = { bytes: raw, type };
    }
    remember(key, got);
    return got;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
