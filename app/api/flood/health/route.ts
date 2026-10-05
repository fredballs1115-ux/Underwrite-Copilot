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

import { NextResponse } from "next/server";
import { floodHealth } from "@/lib/flood-map";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await floodHealth();
  return NextResponse.json(
    { ...health, process: { pid: process.pid, uptimeS: Math.round(process.uptime()) } },
    { headers: { "cache-control": "no-store" } },
  );
}
