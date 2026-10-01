import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedSupplementUrl } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/deals/[id]/om — the deal's offering memorandum, signed at the
 * moment it is opened and handed over as a 302 to the signed URL. The deal
 * page's OM link and every "p. N" source chip point here (`lib/om-link`)
 * instead of at a signed URL minted when the page rendered, which expired an
 * hour later and sent a reader who had left the page open to an error.
 *
 * A chip asks for `/api/deals/<id>/om#page=14`. The browser never sends the
 * fragment, and the Location below carries none of its own — so the browser
 * keeps the request's fragment across the redirect (the HTTP rule for a
 * Location with no fragment) and the PDF opens at page 14.
 *
 * Read under the reader's own session, as the other deal routes are: a deal
 * row-level security does not show this reader is a bare 404, as is a deal
 * with no memorandum, and the object is signed only through the storage
 * layer's scoped primitive, which refuses a path that is not this deal's own
 * OM.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(`/deals/${id}`)}`, req.url), 302);
  }

  // RLS scopes this: a deal the caller cannot read simply is not returned.
  const { data } = await supabase.from("deals").select("id, om_storage_path").eq("id", id).maybeSingle();
  const omPath = (data as { om_storage_path?: string | null } | null)?.om_storage_path ?? null;
  if (!data || !omPath) return new Response("Not found", { status: 404 });

  const signed = await signedSupplementUrl(omPath, { kind: "deal", dealId: id, only: ["om"] });
  if (!signed) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 302,
    // A signed URL is a bearer token for the file: never cached.
    headers: { location: signed, "cache-control": "private, no-store" },
  });
}
