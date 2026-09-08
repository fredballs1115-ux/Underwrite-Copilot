import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import type { MemoData } from "@/lib/memo/memo-document";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { getBrandingForDeal, brandingLogoDataUri } from "@/lib/branding-server";
import { buyBoxCheckSource, evaluateBuyBox, type BuyBoxCheck } from "@/lib/criteria";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";
import { inferStrategy } from "@/lib/deal-strategy";
import { dealOverrideLines } from "@/lib/market/deal-checks";
import { staleAfterFailure } from "@/lib/screen-run";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData, type SensitivityData } from "@/lib/underwrite/report-grid";
import { buildPlanReport, type PlanReport } from "@/lib/plan-sensitivity";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { coverAerialFor } from "@/lib/memo/cover-aerial";
import type { DealVisualCache } from "@/lib/deal-location";

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
  // Same gate as the memo: a screen that failed before the verdict left
  // today's terms beside the previous screen's call — not one report.
  const { data: latestJob } = await supabase
    .from("analysis_jobs")
    .select("status, step")
    .eq("deal_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (staleAfterFailure(latestJob).has("verdict")) {
    return Response.redirect(
      new URL(`/deals/${id}?error=reportstale`, req.url),
      302,
    );
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let buyBoxChecks: BuyBoxCheck[] = [];
  // The buy-box target IRR anchors the sensitivity page's color scale, so
  // the grids grade against THIS buyer's hurdle, not a generic threshold.
  let hurdlePct: number | null = null;
  try {
    const ownership = deal as unknown as {
      user_id: string;
      team_id: string | null;
    };
    const box = await getBuyBoxForDeal(ownership.user_id, ownership.team_id);
    if (box) {
      // The deal page's own check source — first signal, structured address
      // and inferred kind folded in — so page and PDF make the same call.
      const extraction = (deal.extraction as ExtractionResult | null) ?? null;
      const firstSignal = (deal.first_signal as FirstSignal | null) ?? null;
      buyBoxChecks = evaluateBuyBox(
        deal.asset_class,
        buyBoxCheckSource(
          extraction,
          firstSignal,
          (deal.address as StructuredAddress | null) ?? null,
          inferStrategy(extraction, firstSignal).kind,
        ),
        box,
      );
      hurdlePct = box.minIrrPct ?? null;
    }
  } catch {
    buyBoxChecks = [];
  }

  // Sensitivity page (Feature 5): the same derived screening model as the
  // workbook/playground — actuals folded in — swept over exit cap × rent
  // growth and price × exit cap. Best-effort: any failure (pre-0020 schema,
  // degenerate extraction) just omits the section, never sinks the report.
  let sensitivity: SensitivityData | null = null;
  // The plan page (conversion / development / lease-up / value-add): yield on
  // total cost stressed, against the same derived model's exit cap.
  let plan: PlanReport | null = null;
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
      sensitivity = buildSensitivityData(derived.inputs, hurdlePct);
      plan = buildPlanReport(extraction, {
        pct: derived.inputs.exitCapPct,
        provenance: derived.sources.exitCapPct?.provenance ?? "assumption",
      });
    }
  } catch (err) {
    console.error(`report heatmap build failed for ${id}:`, err);
    sensitivity = null;
    plan = null;
  }

  // Custom firm branding (Feature 6) — best-effort, mirrors the memo route.
  let branding: MemoData["branding"] = null;
  try {
    const ownership = deal as unknown as {
      user_id: string;
      team_id: string | null;
    };
    const b = await getBrandingForDeal(ownership.user_id, ownership.team_id);
    if (b) {
      branding = {
        firmName: b.firmName ?? null,
        logoDataUri: await brandingLogoDataUri(b, {
          userId: ownership.user_id,
          teamId: ownership.team_id,
        }),
        footerText: b.footerText ?? null,
      };
    }
  } catch {
    branding = null;
  }

  try {
    // Page 1 is the memo, dismissed submarket checks included — the same
    // lines the standalone memo carries. Best-effort: never throws.
    const overrides = await dealOverrideLines(
      supabase,
      id,
      deal.name,
      (deal.extraction as ExtractionResult | null) ?? null,
    );
    // The cover aerial, as the standalone memo carries it (bounded; never
    // holds the report up).
    const cover = await coverAerialFor(
      supabase,
      id,
      (deal.address as StructuredAddress | null) ?? null,
      ((deal as unknown as { photo?: DealVisualCache | null }).photo ?? null),
    );
    const input = buildReportData(deal, dateStr, buyBoxChecks, sensitivity, branding, plan, overrides, cover);
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
