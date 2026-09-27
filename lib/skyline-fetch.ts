import "server-only";
import { commonsUrl, skylineFor } from "@/lib/skyline";

// A covered market's photograph, fetched from Wikimedia Commons and held in
// this process: one copy of the fetch for the skyline route that pages draw
// through and for the link preview's card (#436), so a market's picture is
// asked of Commons once per width per process whichever surface wanted it.

/** Commons asks that automated readers say who they are. */
const UA =
  "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com; commercial real estate deal screening)";

/**
 * The last few photographs this process fetched, keyed by market and width.
 *
 * The coverage gallery puts eighteen of these on one page. Without a cache
 * every visitor whose browser has not got them yet costs eighteen requests
 * to a free service that asks, reasonably, to be used considerately — and
 * costs the reader a round trip through us to Commons for each one. Bounded
 * hard on both axes: at most `MAX_ENTRIES` photographs, and only ones small
 * enough that holding them cannot crowd a small instance. Oldest out first.
 *
 * Module-level state is safe here in a way it was NOT for the news layer:
 * that had to be shared with `instrumentation.ts`, which Next compiles into
 * its own module runtime, so it had to live on `globalThis`. Route handlers
 * share one runtime, and nothing outside them reads this map.
 */
const MAX_ENTRIES = 24;
/**
 * Bounded on TOTAL bytes, not just per entry.
 *
 * A count alone is not a memory bound when the entries differ by an order
 * of magnitude: the deploy probe measures these at 1600px and they run from
 * 260 KB (Jersey City) to 1011 KB (Atlanta), so sixteen entries could be
 * four megabytes or sixteen. The per-entry ceiling keeps one pathological
 * file from filling the cache by itself; the total is what actually protects
 * a small instance's heap.
 */
const MAX_BYTES = 1_400_000;
const MAX_TOTAL_BYTES = 8_000_000;
const memory = new Map<string, { body: ArrayBuffer; type: string }>();
let heldBytes = 0;

function forget(key: string) {
  const gone = memory.get(key);
  if (!gone) return;
  heldBytes -= gone.body.byteLength;
  memory.delete(key);
}

function remember(key: string, body: ArrayBuffer, type: string) {
  if (body.byteLength > MAX_BYTES) return;
  // Re-inserting moves a key to the end, so the first key really is the
  // least recently stored.
  forget(key);
  memory.set(key, { body, type });
  heldBytes += body.byteLength;
  while (memory.size > MAX_ENTRIES || heldBytes > MAX_TOTAL_BYTES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    forget(oldest);
  }
}

/**
 * The market's photograph at `width`, from this process's copy or from
 * Commons; null for a market with no verified file, or any failure — never
 * a guess. Commons answers a missing file with an HTML page, so the
 * content-type is the real success test.
 */
export async function fetchSkylinePhoto(
  id: string,
  width: number,
): Promise<{ body: ArrayBuffer; type: string } | null> {
  const shot = skylineFor(id);
  if (!shot) return null;

  const key = `${id}:${width}`;
  const hit = memory.get(key);
  if (hit) {
    // Re-insert so a photograph in demand stays; the gallery's eighteen
    // would otherwise evict each other on every pass.
    remember(key, hit.body, hit.type);
    return hit;
  }

  let img: Response;
  try {
    img = await fetch(commonsUrl(shot.file, width), {
      headers: { "user-agent": UA, accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return null;
  }
  const type = img.headers.get("content-type") ?? "";
  if (!img.ok || !type.startsWith("image/")) return null;

  // Read the body rather than streaming it through: the bytes have to be in
  // hand to be cached, and a market photograph is small enough that holding
  // one briefly costs less than fetching it again for the next reader.
  const body = await img.arrayBuffer();
  if (body.byteLength === 0) return null;
  remember(key, body, type);
  return { body, type };
}
