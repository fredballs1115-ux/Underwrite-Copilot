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
import { headerSafe, skylineFor, skylineWidth } from "@/lib/skyline";
import { fetchSkylinePhoto } from "@/lib/skyline-fetch";

// The fetch from Commons and this process's bounded copy of each photograph
// live in lib/skyline-fetch (#436), shared with the link preview's card, so
// a market's picture is asked of Commons once per width per process
// whichever surface wanted it.

/** The headers a photograph is served with, whether cached or just fetched. */
function imageHeaders(type: string, credit: string): HeadersInit {
  return {
    "content-type": type,
    // The file is addressed by name and width, and a Commons file's content
    // does not change under its name, so this is genuinely immutable. Long
    // caching is also what keeps a free service from being asked the same
    // question by every visitor.
    "cache-control": "public, max-age=31536000, immutable",
    // headerSafe, not the raw credit: a header value is a ByteString and
    // `new Headers()` THROWS above U+00FF rather than dropping the
    // character. Philadelphia's photographer is credited as 颐园居, so this
    // line threw, and a throw here is a 500 — which CityPhoto's onError
    // treats exactly like the 404, so the market quietly served the
    // overhead instead of its skyline. See headerSafe in lib/skyline.ts.
    "x-imagery-source": headerSafe(credit),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // A metro area's key carries a colon ("cbsa:39300", #472) and arrives
  // percent-encoded from lib/market-picture; decoded here whether or not the
  // framework has, since no key contains a "%" of its own.
  const { id: raw } = await params;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // a malformed escape is no key in the table
  }
  const shot = skylineFor(id);
  // No verified photograph for this market — the caller falls back to the
  // overhead frame. Never a guess, never a placeholder.
  if (!shot) return new NextResponse(null, { status: 404 });

  // Only the widths the site's own pages ask for are served (SKYLINE_WIDTHS);
  // any other is snapped to the nearest rather than refused, so a public
  // route cannot be made to fetch and encode a new file per request, and a
  // missing width is the default rather than the smallest (skylineWidth).
  const width = skylineWidth(new URL(req.url).searchParams.get("w"));
  const credit = `Wikimedia Commons · ${shot.credit} · ${shot.license}`;

  const photo = await fetchSkylinePhoto(id, width);
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(photo.body, { headers: imageHeaders(photo.type, credit) });
}
