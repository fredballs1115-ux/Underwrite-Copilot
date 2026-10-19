import { createHash } from "node:crypto";
import { renderSampleOm } from "@/lib/sample-om";
import { SAMPLE_OM_VERSION } from "@/lib/sample-om-link";

export const runtime = "nodejs";

// The sample's fictional memorandum is pure fixture and the same bytes on
// every build (lib/sample-om), so it is written once per process and served
// from memory: this is a public, unauthenticated route. The promise is kept
// (not the buffer) so concurrent first requests share one render; a failed
// render clears the slot so the next request tries again.
let cached: Promise<{ pdf: Buffer; etag: string }> | null = null;

function sampleOm(): Promise<{ pdf: Buffer; etag: string }> {
  if (cached) return cached;
  const next = renderSampleOm().then((pdf) => ({
    pdf,
    etag: `"${createHash("sha256").update(pdf).digest("hex").slice(0, 32)}"`,
  }));
  cached = next;
  next.catch(() => {
    if (cached === next) cached = null;
  });
  return next;
}

/**
 * The sample deal's fictional offering memorandum, opened by every page
 * chip on /demo and the homepage's walkthrough (`SAMPLE_OM_HREF#page=N`).
 * Served inline, so a browser opens it at the chip's page. A URL naming the
 * current version is cached for a year, immutable; any other is revalidated
 * against the ETag, so an old link still gets the current file.
 */
export async function GET(request: Request) {
  let om: { pdf: Buffer; etag: string };
  try {
    om = await sampleOm();
  } catch (err) {
    console.error("sample memorandum render failed", err);
    return new Response("The sample memorandum could not be drawn just now.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const current = new URL(request.url).searchParams.get("v") === SAMPLE_OM_VERSION;
  const headers = {
    ETag: om.etag,
    "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, no-cache",
  };
  const asked = request.headers.get("if-none-match");
  if (asked && asked.split(",").some((t) => t.trim().replace(/^W\//, "") === om.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(om.pdf), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="sample-offering-memorandum-fictional.pdf"',
      "Content-Length": String(om.pdf.length),
    },
  });
}
