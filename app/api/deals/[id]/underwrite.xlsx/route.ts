import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";

export const runtime = "nodejs";

/**
 * The institutional acquisition-template model (.xlsx). Built live from the
 * deal's extracted terms — every Deal Summary / Cash Flow number is an Excel
 * formula, so changing the exit cap recalculates levered IRR. Pro deliverable,
 * mirroring the memo/model gates so every bounce explains itself on the deal.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(`/deals/${id}`)}`, req.url),
      302,
    );
  }

  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch (err) {
    console.error(`underwrite.xlsx isPro check failed for deal ${id}:`, err);
    return Response.redirect(new URL(`/deals/${id}?error=exportfail`, req.url), 302);
  }
  if (!pro) {
    return Response.redirect(new URL(`/billing?upsell=underwrite`, req.url), 302);
  }

  const { data, error } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (error) return Response.redirect(new URL(`/deals/${id}?error=exportfail`, req.url), 302);
  if (!data) return new Response("Not found", { status: 404 });

  const deal = data as DealRow;
  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  // The model needs the OM's terms — only reachable by direct URL before the
  // screen has extracted anything, so bounce home with context.
  if (!extraction) {
    return Response.redirect(new URL(`/deals/${id}?error=underwriteempty`, req.url), 302);
  }

  try {
    const model = deriveUnderwriteInputs(extraction, deal.name);
    const buffer = await buildUnderwriteWorkbook(model);
    const safe =
      (deal.name || "deal").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() ||
      "deal";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}-underwrite-copilot.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("underwrite workbook build failed", err);
    return Response.redirect(new URL(`/deals/${id}?error=underwritefail`, req.url), 302);
  }
}
