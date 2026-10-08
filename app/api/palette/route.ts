import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PALETTE_LIMIT, nameSearchPattern, topMatches, type PaletteMatch } from "@/lib/palette-search";
import { readAll, readByIds } from "@/lib/read-all";
import { listJobStatus, type JobLike } from "@/lib/screen-run";

// Feeds the ⌘K command palette: the caller's deals (RLS-scoped — own +
// team), newest first, trimmed to what the jump list renders. With no query
// it lists the most recently updated; with one (`?q=`) it searches every
// deal the caller can see by its name, its address and its documents' file
// names (lib/palette-search), so a deal updated long ago is still found, and
// answers how many matched (`total`) beside the fifty it lists. Search text
// also carries the property address and document filenames so the palette's
// own filter works over what it holds, not just a name matcher.
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ deals: [] }, { status: 401 });
  }

  const pattern = nameSearchPattern(new URL(request.url).searchParams.get("q"));
  const COLS = "id, name, market:extraction->>market, verdict, stage, updated_at";
  type Row = { id: string; name: string; market: unknown; verdict: unknown; stage: string | null; updated_at: string | null };

  let rows: Row[];
  // How many deals a typed query matched in all, where it is stated.
  let total: number | null = null;
  if (!pattern) {
    const { data, error } = await supabase.from("deals").select(COLS).order("updated_at", { ascending: false }).limit(PALETTE_LIMIT);
    if (error) return Response.json({ deals: [] }, { status: 500 });
    rows = (data ?? []) as Row[];
  } else {
    // Every deal whose name, address or a document's file name holds the
    // text — each match read light (its id and when it was updated), a page
    // at a time, so the palette lists the most recently updated fifty and
    // says how many matched in all. A failed read is an error, never "no
    // matches".
    const failed = { yes: false };
    const fail = () => {
      failed.yes = true;
    };
    const dealsWhere = (column: string) =>
      readAll<PaletteMatch>(
        (from, to) =>
          supabase
            .from("deals")
            .select("id, updated_at")
            .ilike(column, pattern)
            .order("updated_at", { ascending: false })
            .order("id")
            .range(from, to),
        fail,
      );
    const [byName, byAddress, docRows] = await Promise.all([
      dealsWhere("name"),
      dealsWhere("address->>label"),
      readAll<{ id: string; deal_id: string }>(
        (from, to) => supabase.from("deal_documents").select("id, deal_id").ilike("filename", pattern).order("id").range(from, to),
        fail,
      ),
    ]);
    // A deal found by a document alone, read for when it was updated.
    const known = new Set([...(byName ?? []), ...(byAddress ?? [])].map((m) => m.id));
    const docOnly = [...new Set((docRows ?? []).map((d) => d.deal_id))].filter((id) => !known.has(id));
    const byDoc = await readByIds<PaletteMatch>(
      docOnly,
      (chunk) => supabase.from("deals").select("id, updated_at").in("id", chunk),
      fail,
    );
    if (failed.yes || !byName || !byAddress || !byDoc) return Response.json({ deals: [] }, { status: 500 });
    const top = topMatches([byName, byAddress, byDoc]);
    total = top.total;
    const full = await readByIds<Row>(top.ids, (chunk) => supabase.from("deals").select(COLS).in("id", chunk));
    if (!full) return Response.json({ deals: [] }, { status: 500 });
    const order = new Map(top.ids.map((id, i) => [id, i]));
    rows = full.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
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

  // Each deal's latest run, as the pipeline page reads it (lib/screen-run):
  // a call a re-screen is replacing, or one a stalled or failed run left
  // behind, is drawn as the run, never as the current call. Best-effort: a
  // failed read leaves the calls as they are on file.
  const jobByDeal = new Map<string, JobLike>();
  if (ids.length) {
    const { data: jobs } = await supabase
      .from("analysis_jobs")
      .select("deal_id, status, step, updated_at, created_at")
      .in("deal_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.max(100, ids.length * 3));
    for (const j of (jobs ?? []) as ({ deal_id: string } & JobLike)[]) {
      if (j?.deal_id && !jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j);
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

  const deals = rows.map((d) => {
    const call = (d.verdict as { verdict?: string } | null)?.verdict ?? null;
    return {
      id: d.id,
      name: d.name,
      market: typeof d.market === "string" ? d.market : "",
      address: addressById.get(d.id) ?? "",
      docs: (docsById.get(d.id) ?? []).join(" "),
      call,
      // The pipeline card's own read of the run (lib/screen-run).
      run: listJobStatus(jobByDeal.get(d.id), !!call),
      stage: d.stage ?? "screening",
    };
  });

  return Response.json(total == null ? { deals } : { deals, total });
}
