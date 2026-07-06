import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildModelWorkbook } from "@/lib/model/excel-build";
import type { DealRow } from "@/lib/deals";
import type { UnderwritingModel } from "@/lib/model/types";

export const runtime = "nodejs";

/** Stream the generated first-draft model as a styled .xlsx download. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // The Excel model is a Pro deliverable — mirror the memo route's gate.
  if (!(await isPro(supabase, user.id))) {
    return Response.redirect(new URL("/billing", req.url), 302);
  }

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return new Response("Not found", { status: 404 });

  const deal = data as DealRow;
  const model = deal.model as UnderwritingModel | null;
  if (!model) return new Response("No model generated yet", { status: 404 });

  // The document kinds the deal has, to drive the "inputs needed" sheet.
  const { data: docs } = await supabase
    .from("deal_documents")
    .select("kind")
    .eq("deal_id", id);
  const kinds = ((docs ?? []) as { kind: string }[]).map((d) => d.kind);

  const buffer = await buildModelWorkbook(model, deal.name, kinds);
  const safe =
    (deal.name || "deal")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "deal";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}-model-draft.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
