import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildModelWorkbook } from "@/lib/model/excel-build";
import { getBrandingForDeal } from "@/lib/branding-server";
import type { ExportBranding } from "@/lib/excel-branding";
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
  if (!user) {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(`/deals/${id}`)}`, req.url),
      302,
    );
  }

  // The Excel model is a Pro deliverable — mirror the memo route's gate,
  // and explain the bounce on the deal page (a silent /billing redirect
  // reads as a mystery error).
  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch (err) {
    console.error(`model.xlsx isPro check failed for deal ${id}:`, err);
    return Response.redirect(
      new URL(`/deals/${id}?error=exportfail`, req.url),
      302,
    );
  }
  if (!pro) {
    return Response.redirect(
      new URL(`/billing?upsell=model`, req.url),
      302,
    );
  }

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.redirect(new URL(`/deals/${id}?error=exportfail`, req.url), 302);
  if (!data) return new Response("Not found", { status: 404 });

  const deal = data as DealRow;
  const model = deal.model as UnderwritingModel | null;
  // Only reachable by direct URL (the download button renders with a model
  // present) — bounce home with context instead of a bare-text 404.
  if (!model) {
    return Response.redirect(
      new URL(`/deals/${id}?error=modelempty`, req.url),
      302,
    );
  }

  // The document kinds the deal has, to drive the "inputs needed" sheet.
  const { data: docs } = await supabase
    .from("deal_documents")
    .select("kind")
    .eq("deal_id", id);
  const kinds = ((docs ?? []) as { kind: string }[]).map((d) => d.kind);

  // Firm branding (Feature 6) — best-effort, same shape as the PDF routes.
  let branding: ExportBranding | null = null;
  try {
    const ownership = deal as unknown as {
      user_id: string;
      team_id: string | null;
    };
    branding = await getBrandingForDeal(ownership.user_id, ownership.team_id);
  } catch {
    branding = null;
  }

  // Opened via a plain <a> — catch a build failure and bounce to the deal with
  // a friendly error rather than surfacing a raw 500 body in the browser.
  try {
    const buffer = await buildModelWorkbook(model, deal.name, kinds, branding);
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
  } catch (err) {
    console.error("model workbook build failed", err);
    return Response.redirect(new URL(`/deals/${id}?error=modelfail`, req.url), 302);
  }
}
