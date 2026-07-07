import { createSupabaseServerClient } from "@/lib/supabase/server";

// Feeds the ⌘K command palette: the caller's deals (RLS-scoped — own +
// team), newest first, trimmed to what the jump list renders. Search text
// also carries the property address and document filenames so the palette
// works as a global search, not just a name matcher.
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ deals: [] }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("deals")
    .select("id, name, market:extraction->>market, verdict, stage")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ deals: [] }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    name: string;
    market: unknown;
    verdict: unknown;
    stage: string | null;
  }[];
  const ids = rows.map((d) => d.id);

  // Address is best-effort: the column arrived in migration 0011 and the
  // palette must not go dark on a database that hasn't run it yet.
  const addressById = new Map<string, string>();
  if (ids.length) {
    const { data: addrs } = await supabase
      .from("deals")
      .select("id, address")
      .in("id", ids);
    for (const a of (addrs ?? []) as { id: string; address: unknown }[]) {
      const label = (a.address as { label?: string } | null)?.label;
      if (label) addressById.set(a.id, label);
    }
  }

  // Uploaded document filenames, so "rent roll" or a filename finds the deal.
  const docsById = new Map<string, string[]>();
  if (ids.length) {
    const { data: docs } = await supabase
      .from("deal_documents")
      .select("deal_id, filename")
      .in("deal_id", ids);
    for (const doc of (docs ?? []) as { deal_id: string; filename: string }[]) {
      const list = docsById.get(doc.deal_id) ?? [];
      if (doc.filename) list.push(doc.filename);
      docsById.set(doc.deal_id, list);
    }
  }

  const deals = rows.map((d) => ({
    id: d.id,
    name: d.name,
    market: typeof d.market === "string" ? d.market : "",
    address: addressById.get(d.id) ?? "",
    docs: (docsById.get(d.id) ?? []).join(" "),
    call: (d.verdict as { verdict?: string } | null)?.verdict ?? null,
    stage: d.stage ?? "screening",
  }));

  return Response.json({ deals });
}
