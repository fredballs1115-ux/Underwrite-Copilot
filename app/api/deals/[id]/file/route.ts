import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedSupplementUrl } from "@/lib/storage";
import { dealFileKind, supplementListed } from "@/lib/deal-file-link";

export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * GET /api/deals/[id]/file?p=<path> — one of the deal's own files, signed at
 * the moment it is opened and handed over as a 302 to the signed URL: a file
 * added with a note (deals.supplements) or a source document (deal_documents,
 * a BOV among them). The deal page's attachment links and the valuations
 * page's BOV citations point here (`lib/deal-file-link`) instead of at a
 * signed URL minted when the page rendered, which expired an hour later and
 * sent a reader who had left the page open to an error. The OM has a route
 * of its own (`/api/deals/[id]/om`).
 *
 * Read under the reader's own session, as the other deal routes are: a deal
 * row-level security does not show this reader is a bare 404. So is a path
 * that is not one of this deal's own supplements or documents by its shape,
 * and one of the right shape that the deal's own records do not list — the
 * supplement's file entry, or the deal's deal_documents row — so a caller
 * cannot have an arbitrary object signed. The object is signed only through
 * the storage layer's scoped primitive, narrowed to the kind the path is.
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

  const path = new URL(req.url).searchParams.get("p") ?? "";
  const kind = dealFileKind(id, path);
  if (!kind) return notFound();

  // RLS scopes this: a deal the caller cannot read simply is not returned.
  const { data: deal } = await supabase.from("deals").select("id, supplements").eq("id", id).maybeSingle();
  if (!deal) return notFound();

  let listed: boolean;
  if (kind === "supplement") {
    listed = supplementListed((deal as { supplements?: unknown }).supplements, path);
  } else {
    const { data: doc } = await supabase
      .from("deal_documents")
      .select("id")
      .eq("deal_id", id)
      .eq("storage_path", path)
      .limit(1)
      .maybeSingle();
    listed = !!doc;
  }
  if (!listed) return notFound();

  const signed = await signedSupplementUrl(path, { kind: "deal", dealId: id, only: [kind] });
  if (!signed) return notFound();
  return new Response(null, {
    status: 302,
    // A signed URL is a bearer token for the file: never cached.
    headers: { location: signed, "cache-control": "private, no-store" },
  });
}
