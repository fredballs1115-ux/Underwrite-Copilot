// Render's deploy health check. Deliberately dependency-free: no Supabase,
// no auth, no middleware (the proxy matcher excludes /api) — a deploy must
// go green when the PROCESS is healthy, not flap on a third-party hiccup
// during the check window. Anything real still fails loudly at request time.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
