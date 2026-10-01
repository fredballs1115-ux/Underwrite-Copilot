import "server-only";
import sharp from "sharp";
import { commonsUrl, skylineFor, skylineWidth } from "@/lib/skyline";
import { RunGate } from "@/lib/anthropic/run-gate";

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
/** One fetch per photograph at a time: a second ask waits on the first. */
const pending = new Map<string, Promise<{ body: ArrayBuffer; type: string } | null>>();

/**
 * How many photographs this process asks Commons for at once, and how long
 * an ask waits for a turn (the security review of 2026-09-30). The route is
 * public, and each fetch is a download and a sharp pass: four at once lets a
 * cold process's gallery of eighteen fill in a few rounds, and asks Commons —
 * which answers an un-paced sweep with 429s — a few at a time. An ask that
 * finds no turn in time is a failure, kept by nobody.
 */
export const COMMONS_IN_FLIGHT = 4;
const COMMONS_TURN_WAIT_MS = 30_000;
const turns = new RunGate(() => COMMONS_IN_FLIGHT);

/** Forget every held photograph (tests). */
export function forgetSkylinePhotos(): void {
  memory.clear();
  pending.clear();
  heldBytes = 0;
}

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
 * The quality a Commons JPEG is encoded again at (#451) — the deal
 * photographs' own (lib/deal-picture). Commons renders a thumbnail at an
 * archive's quality: Washington's 1600px frame came back at 616 KB. Encoded
 * again with mozjpeg, real photographs from the contact sheets came out at
 * 53 to 57% of their bytes with nothing an eye can find, which is what
 * makes a 2400px band for a dense laptop screen affordable.
 */
export const SKYLINE_QUALITY = 82;

/**
 * A photograph as it is served: a JPEG encoded again, upright, in sRGB and
 * without its metadata, and no wider than the width it was asked for;
 * anything else, or a JPEG that will not re-encode, as Commons sent it.
 * Commons snaps a thumbnail's width up to sizes of its own (the contact
 * sheets asked for 640px and every copy came back 960px), so a copy wider
 * than asked is brought down to the width the srcset promised — never
 * enlarged. One at the width asked is kept as sent where encoding again
 * would come out larger.
 */
export async function lighten(
  body: ArrayBuffer,
  type: string,
  width?: number,
): Promise<{ body: ArrayBuffer; type: string }> {
  if (!/^image\/jpe?g\b/i.test(type)) return { body, type };
  try {
    const input = sharp(Buffer.from(body), { failOn: "none", limitInputPixels: 80_000_000 });
    // The width it will be shown at: an EXIF turn of a quarter (5–8) stands
    // the stored picture on its side, so its stored height is its width.
    const meta = await input.metadata();
    const sent = ((meta.orientation ?? 1) >= 5 ? meta.height : meta.width) ?? 0;
    const narrower = width != null && width > 0 && sent > width;
    let pipeline = input.rotate();
    if (narrower) pipeline = pipeline.resize({ width, withoutEnlargement: true });
    const out = await pipeline.jpeg({ quality: SKYLINE_QUALITY, mozjpeg: true }).toBuffer();
    if (out.byteLength === 0) return { body, type };
    if (!narrower && out.byteLength >= body.byteLength) return { body, type };
    return { body: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer, type: "image/jpeg" };
  } catch {
    return { body, type };
  }
}

/**
 * The market's photograph at `width` — snapped to a width the route serves
 * (`skylineWidth`), so no caller widens what this process fetches and holds
 * — from this process's copy or from Commons; null for a market with no
 * verified file, or any failure — never a guess. Commons answers a missing
 * file with an HTML page, so the content-type is the real success test.
 */
export async function fetchSkylinePhoto(
  id: string,
  askedWidth: number,
): Promise<{ body: ArrayBuffer; type: string } | null> {
  const shot = skylineFor(id);
  if (!shot) return null;

  const width = skylineWidth(askedWidth);
  const key = `${id}:${width}`;
  const hit = memory.get(key);
  if (hit) {
    // Re-insert so a photograph in demand stays; the gallery's eighteen
    // would otherwise evict each other on every pass.
    remember(key, hit.body, hit.type);
    return hit;
  }
  const running = pending.get(key);
  if (running) return running;

  const work = (async (): Promise<{ body: ArrayBuffer; type: string } | null> => {
    const release = await turns.acquireWithin(COMMONS_TURN_WAIT_MS);
    if (!release) return null;
    try {
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
      const raw = await img.arrayBuffer();
      if (raw.byteLength === 0) return null;
      const light = await lighten(raw, type, width);
      remember(key, light.body, light.type);
      return light;
    } finally {
      release();
    }
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
