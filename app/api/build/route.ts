import { NextResponse } from "next/server";

// The sha of the RUNNING server, never cached anywhere. The root layout's
// self-heal script compares this against the sha baked into the HTML the
// browser is showing; a mismatch means that copy predates the current
// deploy (e.g. a year-long stale-while-revalidate grant from builds before
// the freshness fix, or a restored mobile tab) and triggers ONE reload.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { sha: (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || null },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
