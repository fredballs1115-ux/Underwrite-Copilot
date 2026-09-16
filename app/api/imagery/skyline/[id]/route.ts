// GET /api/imagery/skyline/[id] — the photograph a covered market is known
// by, proxied from Wikimedia Commons.
//
// PUBLIC, like the overhead route beside it: the homepage is public and
// nothing here is sensitive. The `id` is looked up in a fixed table rather
// than trusted, so there is no user-controlled URL and no way to point this
// at an arbitrary host.
//
// WHY PROXY INSTEAD OF HOTLINKING. Three reasons, in order of weight:
// the content-security policy stays pinned to 'self' for page imagery;
// Commons is asked once per width per deploy instead of once per visitor,
// which is the courtesy their terms ask for; and a file that disappears
// answers 404 here, which is the signal `SkylinePhoto` needs to fall back
// to the overhead frame rather than paint a broken-image glyph.
//
// A market with no verified photograph 404s immediately without touching
// the network — that is the normal state for a market whose file has not
// been through live-verify's SKYLINE probe yet.

import { NextResponse } from "next/server";
import { SKYLINE_WIDTH, commonsUrl, skylineFor } from "@/lib/skyline";

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
 * share one runtime, and nothing outside this route reads this map.
 */
const MAX_ENTRIES = 16;
const MAX_BYTES = 400_000;
const memory = new Map<string, { body: ArrayBuffer; type: string }>();

function remember(key: string, body: ArrayBuffer, type: string) {
  if (body.byteLength > MAX_BYTES) return;
  // Re-inserting moves a key to the end, so the first key really is the
  // least recently stored.
  memory.delete(key);
  memory.set(key, { body, type });
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/** The headers a photograph is served with, whether cached or just fetched. */
function imageHeaders(type: string, credit: string): HeadersInit {
  return {
    "content-type": type,
    // The file is addressed by name and width, and a Commons file's content
    // does not change under its name, so this is genuinely immutable. Long
    // caching is also what keeps a free service from being asked the same
    // question by every visitor.
    "cache-control": "public, max-age=31536000, immutable",
    "x-imagery-source": credit,
  };
}

function clampWidth(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return SKYLINE_WIDTH.default;
  return Math.min(SKYLINE_WIDTH.max, Math.max(SKYLINE_WIDTH.min, Math.round(n)));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shot = skylineFor(id);
  // No verified photograph for this market — the caller falls back to the
  // overhead frame. Never a guess, never a placeholder.
  if (!shot) return new NextResponse(null, { status: 404 });

  const width = clampWidth(new URL(req.url).searchParams.get("w"));
  const credit = `Wikimedia Commons · ${shot.credit} · ${shot.license}`;

  const key = `${id}:${width}`;
  const hit = memory.get(key);
  if (hit) {
    // Re-insert so a photograph in demand stays; the gallery's eighteen
    // would otherwise evict each other on every pass.
    remember(key, hit.body, hit.type);
    return new NextResponse(hit.body, { headers: imageHeaders(hit.type, credit) });
  }

  let img: Response;
  try {
    img = await fetch(commonsUrl(shot.file, width), {
      headers: { "user-agent": UA, accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const type = img.headers.get("content-type") ?? "";
  // Commons answers 404 with an HTML error page, so content-type is the
  // real success test — the same lesson the USGS route learned from
  // ArcGIS answering 200 with a JSON error body.
  if (!img.ok || !type.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  // Read the body rather than streaming it through: the bytes have to be in
  // hand to be cached, and a market photograph is small enough that holding
  // one briefly costs less than fetching it again for the next reader.
  const body = await img.arrayBuffer();
  if (body.byteLength === 0) return new NextResponse(null, { status: 404 });
  remember(key, body, type);

  return new NextResponse(body, { headers: imageHeaders(type, credit) });
}
