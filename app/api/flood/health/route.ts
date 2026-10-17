// GET /api/flood/health — whether FEMA's flood service and USGS's imagery
// answer from THIS deployment, and how fast (#472).
//
// The Flood view's picture is drawn from two federal services the sandbox
// that builds the site cannot reach, and whose cold answers the runner
// measured at 20–30 s. Only Render can say how they answer the site itself,
// so this route draws a small restyled frame of a public place and reports
// each step — the layer list, the legend held against the runner's copy the
// drawings fall back on, the overlay (and whether FEMA sent it at its own
// 30%), the aerial — and live-verify prints it after every deploy. Public:
// nothing here is a deal's; the answer is kept ten minutes a process.
//
// Which process answered, and how long it has been up, goes to the site's
// operators alone (OPERATOR_EMAILS, lib/operator-server; research pass 39):
// live-verify's read, made with no session, never printed it, and nobody
// else needs it.

import { NextResponse } from "next/server";
import { floodHealth } from "@/lib/flood-map";
import { getCurrentUser } from "@/lib/supabase/server";
import { isSiteOperator } from "@/lib/operator-server";

export const dynamic = "force-dynamic";

/** Whether the caller is one of the site's operators; a session that cannot
 *  be read is no operator's. */
async function operatorAsking(): Promise<boolean> {
  try {
    return isSiteOperator(await getCurrentUser());
  } catch {
    return false;
  }
}

export async function GET() {
  const [health, operator] = await Promise.all([floodHealth(), operatorAsking()]);
  return NextResponse.json(
    operator ? { ...health, process: { pid: process.pid, uptimeS: Math.round(process.uptime()) } } : health,
    { headers: { "cache-control": "no-store" } },
  );
}
