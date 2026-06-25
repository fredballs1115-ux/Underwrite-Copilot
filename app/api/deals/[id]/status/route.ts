import { type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Returns the current analysis-job state for a deal. RLS makes sure a user can
// only ever read jobs for their own deals.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { status: "none", step: null, progress: 0, error: "unauthorized" },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("analysis_jobs")
    .select("status, step, progress, error")
    .eq("deal_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json(
      { status: "none", step: null, progress: 0, error: error.message },
      { status: 500 },
    );
  }

  return Response.json(
    data ?? { status: "none", step: null, progress: 0, error: null },
  );
}
