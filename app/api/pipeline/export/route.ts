import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxCheckSource, evaluateBuyBox, findGoingInCap } from "@/lib/criteria";
import { findPriceMetric, inferStrategy, planSummary } from "@/lib/deal-strategy";
import { getTeam } from "@/lib/teams";
import { getActiveBranding } from "@/lib/branding-server";
import {
  buildPipelineWorkbook,
  type PipelineExportRow,
} from "@/lib/pipeline-workbook";
import type { ExtractionResult } from "@/lib/anthropic/types";

// exceljs needs the Node runtime.
export const runtime = "nodejs";

/**
 * The whole pipeline as a meeting-ready .xlsx — stage-grouped with verdict
 * and buy-box markers plus a summary sheet. RLS scopes the query to the
 * caller's own + shared team deals; the sample deal stays out of a real
 * meeting artifact.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // This link navigates the whole tab — a raw 401 body strands the user.
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent("/deals")}`, req.url),
      302,
    );
  }

  const [{ data, error }, team] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, name, asset_class, created_at, verdict, extraction, user_id, team_id, stage, is_sample",
      )
      .order("created_at", { ascending: false }),
    getTeam(supabase, user.id).catch(() => null),
  ]);
  if (error) return Response.redirect(new URL("/deals?error=exportfail", req.url), 302);

  type Row = {
    id: string;
    name: string;
    asset_class: string;
    created_at: string;
    verdict: unknown;
    extraction: unknown;
    user_id: string;
    team_id: string | null;
    stage: string | null;
    is_sample: boolean | null;
  };
  const rows = ((data ?? []) as Row[]).filter((d) => !d.is_sample);

  // Deadlines, teammate names, and both buy boxes are mutually independent —
  // one parallel batch instead of four sequential round trips.
  const mateIds = Array.from(
    new Set(
      rows.filter((d) => d.team_id && d.user_id !== user.id).map((d) => d.user_id),
    ),
  );
  const [{ data: dueRows }, { data: mates }, personalBox, teamBox] =
    await Promise.all([
      rows.length
        ? supabase
            .from("deals")
            .select("id, offers_due")
            .in(
              "id",
              rows.map((d) => d.id),
            )
        : Promise.resolve({ data: [] as { id: string; offers_due: string | null }[] }),
      mateIds.length
        ? supabase.from("profiles").select("id, email, full_name").in("id", mateIds)
        : Promise.resolve({
            data: [] as { id: string; email: string | null; full_name: string | null }[],
          }),
      getBuyBoxForDeal(user.id, null).catch(() => null),
      team ? getBuyBoxForDeal("", team.id).catch(() => null) : Promise.resolve(null),
    ]);
  // Offers-due dates are best-effort (column arrived in migration 0013).
  const dueById = new Map<string, string>();
  for (const r of (dueRows ?? []) as { id: string; offers_due: string | null }[]) {
    if (r.offers_due) dueById.set(r.id, r.offers_due);
  }
  const nameById = new Map<string, string>();
  for (const m of (mates ?? []) as {
    id: string;
    email: string | null;
    full_name: string | null;
  }[]) {
    nameById.set(m.id, m.full_name || m.email || "Teammate");
  }

  const exportRows: PipelineExportRow[] = rows.map((d) => {
    const extraction = d.extraction as ExtractionResult | null;
    const metrics = extraction?.metrics ?? [];
    // The deal's kind first. A plan deal (value-add, lease-up, conversion,
    // development) has no going-in cap — its stabilized figure is the
    // finished project's, judged on yield on total cost — and a development's
    // price is its land cost when the OM states no asking price.
    const strategy = inferStrategy(extraction ? { ...extraction, metrics } : null);
    const plan = planSummary(extraction ? { ...extraction, metrics } : null, strategy);
    const box = d.team_id ? teamBox : personalBox;
    let fit: PipelineExportRow["fit"] = null;
    if (box && extraction) {
      // The inferred kind rides along, as on the pipeline page, so the fit
      // column judges the land cost this row prints as a development's price.
      const source = buyBoxCheckSource(extraction, null, null, strategy.kind);
      const checks = source ? evaluateBuyBox(d.asset_class, source, box) : [];
      fit = checks.some((c) => c.status === "miss")
        ? "outside"
        : checks.some((c) => c.status === "near")
          ? "near"
          : checks.some((c) => c.status === "pass")
            ? "fits"
            : null;
    }
    return {
      name: d.name,
      stage: d.stage ?? "screening",
      assetClass: d.asset_class,
      market: extraction?.market ?? "",
      dealType: strategy.kind === "unknown" ? null : strategy.label,
      planDeal: plan != null,
      price: findPriceMetric(metrics, strategy.kind)?.value ?? null,
      cap: plan ? null : (findGoingInCap(metrics)?.value ?? null),
      yieldOnCost:
        plan?.yieldOnCost != null ? `${(plan.yieldOnCost * 100).toFixed(1)}%` : null,
      fit,
      verdict: (d.verdict as { verdict?: string } | null)?.verdict ?? null,
      offersDue: dueById.get(d.id) ?? null,
      createdAt: d.created_at,
      addedBy:
        d.team_id && d.user_id !== user.id
          ? (nameById.get(d.user_id) ?? "Teammate")
          : null,
    };
  });

  // Firm branding (Feature 6) — the caller's own identity (this is an
  // account-level export, not a deal-level one). Best-effort.
  let branding = null;
  try {
    branding = (await getActiveBranding(supabase, user.id)).branding;
  } catch {
    branding = null;
  }

  const now = new Date();
  const buffer = await buildPipelineWorkbook(exportRows, now, branding);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pipeline-${now.toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
