import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox, type BuyBoxCheck } from "@/lib/criteria";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildCapGrowthGrid, type CapGrowthGrid } from "@/lib/underwrite/report-grid";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";

export const runtime = "nodejs";

/**
 * The FULL screening report as a multi-page PDF: the one-page memo up front,
 * then a page per analysis. Mirrors the memo route's gates exactly — every
 * bounce lands back on the deal with a banner that explains itself.
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
    console.error(`report isPro check failed for deal ${id}:`, err);
    return Response.redirect(
      new URL(`/deals/${id}?error=exportfail`, req.url),
      302,
    );
  }
  if (!pro) {
    return Response.redirect(
      new URL(`/billing?upsell=report`, req.url),
      302,
    );
  }

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.redirect(
      new URL(`/deals/${id}?error=exportfail`, req.url),
      302,
    );
  }
  if (!data) return new Response("Not found", { status: 404 });

  const deal = data as DealRow;
  if (!deal.verdict) {
    return Response.redirect(
      new URL(`/deals/${id}?error=reportempty`, req.url),
      302,
    );
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let buyBoxChecks: BuyBoxCheck[] = [];
  try {
    const ownership = deal as unknown as {
      user_id: string;
      team_id: string | null;
    };
    const box = await getBuyBoxForDeal(ownership.user_id, ownership.team_id);
    if (box) {
      buyBoxChecks = evaluateBuyBox(
        deal.asset_class,
        (deal.extraction as ExtractionResult) ?? null,
        box,
      );
    }
  } catch {
    buyBoxChecks = [];
  }

  // Sensitivity heatmap (Feature 5): the same derived screening model as the
  // workbook/playground — actuals folded in — swept over exit cap × rent
  // growth. Best-effort: any failure (pre-0020 schema, degenerate extraction)
  // just omits the section, never sinks the report.
  let grid: CapGrowthGrid | null = null;
  try {
    const extraction = (deal.extraction as ExtractionResult | null) ?? null;
    if (extraction) {
      const [rrRes, t12Res] = await Promise.all([
        supabase
          .from("deal_rent_rolls")
          .select("as_of_date, summary")
          .eq("deal_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("deal_t12_statements")
          .select("period_end_date, summary")
          .eq("deal_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const derived = deriveUnderwriteInputs(extraction, deal.name, {
        rentRoll: rrRes.data?.summary
          ? {
              summary: rrRes.data.summary as RentRollSummary,
              asOf: (rrRes.data.as_of_date as string | null) ?? null,
            }
          : null,
        t12: t12Res.data?.summary
          ? {
              summary: t12Res.data.summary as T12Summary,
              periodEnd: (t12Res.data.period_end_date as string | null) ?? null,
            }
          : null,
      });
      grid = buildCapGrowthGrid(derived.inputs);
    }
  } catch (err) {
    console.error(`report heatmap build failed for ${id}:`, err);
    grid = null;
  }

  try {
    const input = buildReportData(deal, dateStr, buyBoxChecks, grid);
    const element = React.createElement(ReportDocument, {
      input,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);

    const safe =
      (deal.name || "deal")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "deal";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}-full-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("report render failed", err);
    return Response.redirect(
      new URL(`/deals/${id}?error=reportfail`, req.url),
      302,
    );
  }
}
