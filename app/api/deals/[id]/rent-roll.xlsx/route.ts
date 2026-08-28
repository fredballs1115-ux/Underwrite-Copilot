import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildRentRollWorkbook } from "@/lib/export/workbook";
import type { WorkbookInputs } from "@/lib/export/cashflow";
import { getRentRollImport, latestRentRollImport, listProfiles } from "@/lib/rentroll/store";
import { defaultProfileFor } from "@/lib/rentroll/profiles";
import { analyzeRentRoll } from "@/lib/rentroll/analytics";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import type { ExtractionResult } from "@/lib/anthropic/types";

export const runtime = "nodejs";

/**
 * The rent roll model (.xlsx) — four tabs of LIVE formulas (Phase 3).
 *
 * Everything the workbook needs comes from three places: the normalized rent
 * roll, the user's market leasing profile, and the deal's own underwriting
 * assumptions (price, debt, exit) so the export doesn't invent a deal the user
 * never entered. Where the deal hasn't been screened, documented screening
 * defaults stand in — and they're written into the Assumptions tab as blue
 * inputs, which is exactly where a user expects to correct them.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(`/deals/${id}/rent-roll`)}`, req.url),
      302,
    );
  }

  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch (err) {
    console.error(`rent-roll.xlsx isPro check failed for deal ${id}:`, err);
    return Response.redirect(new URL(`/deals/${id}/rent-roll?error=exportfail`, req.url), 302);
  }
  if (!pro) return Response.redirect(new URL(`/billing?upsell=rentroll`, req.url), 302);

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, name, asset_class, extraction")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.redirect(new URL(`/deals/${id}/rent-roll?error=exportfail`, req.url), 302);
  if (!deal) return new Response("Not found", { status: 404 });

  const importId = url.searchParams.get("import");
  const record = importId
    ? await getRentRollImport(supabase, importId)
    : await latestRentRollImport(supabase, id);
  if (!record || record.dealId !== id || record.leases.length === 0) {
    return Response.redirect(new URL(`/deals/${id}/rent-roll?error=notfound`, req.url), 302);
  }

  const assetClass = String(deal.asset_class ?? "office");
  const profiles = await listProfiles(supabase, user.id, assetClass);
  const profileId = url.searchParams.get("profile");
  const profile =
    profiles.find((p) => p.id === profileId) ?? profiles[0] ?? defaultProfileFor(assetClass);

  const asOf = record.asOfDate ?? new Date().toISOString().slice(0, 10);
  const analytics = analyzeRentRoll(record.leases, { asOf, nra: record.nra });
  const nra = record.nra && record.nra > 0 ? record.nra : analytics.totalSf || 1;

  // The deal's own assumptions when it's been screened; documented screening
  // defaults when it hasn't. Either way they land as editable blue inputs.
  const base = await currentDealAssumptions(
    supabase,
    id,
    deal.name as string,
    (deal.extraction as ExtractionResult | null) ?? null,
  );

  const inputs: WorkbookInputs = {
    dealName: (deal.name as string) || "Deal",
    asOf,
    nra,
    purchasePrice: base?.purchasePrice ?? 0,
    closingCostPct: base?.generalHoldPct ?? 0.01,
    otherIncomeAnnual: base?.otherRevenueAnnual ?? 0,
    vacancyPct: base?.vacancyPct ?? 0.05,
    // Per-SF opex from the deal's model where there is one; otherwise the
    // export ships a zero the user fills in rather than a fabricated number.
    opexPsf: base ? base.expenseLines.reduce((s, l) => s + l.annual, 0) / nra : 0,
    expenseGrowthPct: base?.expenseGrowthPct ?? 0.03,
    reimbursementPct: 0,
    mgmtFeePct: base?.mgmtFeePct ?? 0,
    reservesPsf: base?.reservesPsf ?? 0.2,
    capitalImprovementsYr1: base?.capitalImprovementsYr1 ?? 0,
    profile,
    absorptionSfPerMonth: analytics.vacantSf > 0 ? Math.round(analytics.vacantSf / 36) : 0,
    exitCapPct: base?.exitCapPct ?? 0.06,
    saleCostPct: base?.saleCostPct ?? 0.02,
    holdYears: 10,
    ltc: base?.ltc ?? 0.6,
    allInRatePct: base?.allInRatePct ?? 0.06,
    ioMonths: base?.ioMonths ?? 0,
    amortMonths: base?.amortMonths ?? 360,
    financingCostPct: base?.financingCostPct ?? 0.01,
  };

  try {
    const buffer = await buildRentRollWorkbook(record.leases, inputs);
    const safe =
      ((deal.name as string) || "deal")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "deal";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}-rent-roll-model.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("rent roll workbook build failed", err);
    return Response.redirect(new URL(`/deals/${id}/rent-roll?error=exportfail`, req.url), 302);
  }
}
