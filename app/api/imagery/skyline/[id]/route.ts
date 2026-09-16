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
  if (!img.ok || !img.body || !type.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(img.body, {
    headers: {
      "content-type": type,
      // The file is addressed by name and width, and a Commons file's
      // content does not change under its name, so this is genuinely
      // immutable. Long caching is also what keeps a free service from
      // being asked the same question by every visitor.
      "cache-control": "public, max-age=31536000, immutable",
      "x-imagery-source": `Wikimedia Commons · ${shot.credit} · ${shot.license}`,
    },
  });
}
