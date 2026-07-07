import { createSupabaseServerClient } from "@/lib/supabase/server";

// Feeds the ⌘K command palette: the caller's deals (RLS-scoped — own +
// team), newest first, trimmed to what the jump list renders.
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

  const deals = (data ?? []).map(
    (d: {
      id: string;
      name: string;
      market: unknown;
      verdict: unknown;
      stage: string | null;
    }) => ({
      id: d.id,
      name: d.name,
      market: typeof d.market === "string" ? d.market : "",
      call: (d.verdict as { verdict?: string } | null)?.verdict ?? null,
      stage: d.stage ?? "screening",
    }),
  );

  return Response.json({ deals });
}
