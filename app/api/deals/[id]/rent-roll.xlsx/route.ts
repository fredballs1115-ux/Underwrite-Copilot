import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { buildRentRollWorkbook } from "@/lib/export/workbook";
import type { WorkbookInputs, WorkbookNotes } from "@/lib/export/cashflow";
import { getRentRollImport, latestRentRollImport, listProfiles } from "@/lib/rentroll/store";
import { openingProfile } from "@/lib/rentroll/profiles";
import { DEFAULT_LEASE_UP_MONTHS, analyzeRentRoll, defaultAbsorptionSfPerMonth } from "@/lib/rentroll/analytics";
import { shownAssetClass } from "@/lib/pipeline-slots";
import { currentDealModel } from "@/lib/bridge/deal-assumptions";
import type { ExtractionResult } from "@/lib/anthropic/types";

export const runtime = "nodejs";

/** The workbook's own hold: its Cash Flow tab is a ten-year model by design,
 *  so its loan is priced off the Treasury tenor nearest ten years — the rule
 *  that the caller reading the tenor asks for the hold its model runs on
 *  (lib/debt-index). It had borrowed the deal page's five-year pricing. */
const EXPORT_HOLD_YEARS = 10;

/** "Oct 1, 2026" */
const longDay = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The rent roll model (.xlsx) — four tabs of LIVE formulas (Phase 3).
 *
 * Everything the workbook needs comes from three places: the normalized rent
 * roll, the user's market leasing profile, and the deal's own underwriting
 * assumptions (price, debt, exit) so the export doesn't invent a deal the user
 * never entered. Where the deal hasn't been screened, documented screening
 * defaults stand in — and they're written into the Assumptions tab as blue
 * inputs, which is exactly where a user expects to correct them, each with a
 * note saying where it came from (`WorkbookNotes`).
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

  // The deal's one class (the analyst's, else the deck's) and the profile the
  // page opened on — the same rule, so the download prices what the page shows.
  const assetClass = shownAssetClass(
    (deal.asset_class as string | null) ?? null,
    (deal.extraction as ExtractionResult | null) ?? null,
  );
  const profiles = await listProfiles(supabase, user.id, assetClass);
  const profile = openingProfile(profiles, assetClass, url.searchParams.get("profile"));

  const asOf = record.asOfDate ?? new Date().toISOString().slice(0, 10);
  const analytics = analyzeRentRoll(record.leases, { asOf, nra: record.nra });
  const nra = record.nra && record.nra > 0 ? record.nra : analytics.totalSf || 1;

  // The deal's own assumptions when it's been screened; documented screening
  // defaults when it hasn't. Either way they land as editable blue inputs.
  // The deal's own model, derived as every other surface derives it
  // (lib/bridge/deal-assumptions), but seeded for this workbook's hold.
  const model = await currentDealModel(
    supabase,
    id,
    deal.name as string,
    (deal.extraction as ExtractionResult | null) ?? null,
    EXPORT_HOLD_YEARS * 12,
  );
  const base = model?.inputs ?? null;

  // What each seeded input stands on, said beside it on the Assumptions tab —
  // words only: the figures and every formula are the export's as before.
  const vacancySource = model?.sources.vacancyPct;
  const rateSeed = model?.meta.rateSeed ?? null;
  const notes: WorkbookNotes = {
    asOf: record.asOfDate
      ? `The rent roll's as-of date, ${longDay(asOf)}. Drives years-to-expiry.`
      : `Today, ${longDay(asOf)}, the day this file was made — the rent roll states no as-of date; enter it. Drives years-to-expiry.`,
    absorption:
      analytics.vacantSf > 0
        ? `A placeholder: the ${Math.round(analytics.vacantSf).toLocaleString("en-US")} SF vacant leased over ${DEFAULT_LEASE_UP_MONTHS} months — not the market's absorption; enter your own.`
        : "The roll lists no vacant space.",
    rate: rateSeed
      ? `${rateSeed.note}. The Treasury tenor is the one nearest this workbook's ${EXPORT_HOLD_YEARS}-year hold.`
      : model?.sources.allInRatePct?.note
        ? `${model.sources.allInRatePct.note}.`
        : "A flat screening default: the deal has no model yet — enter your all-in rate (index + spread).",
    vacancy: !model
      ? "A 5% screening default: the deal has no model yet. It comes off every year's revenue on top of the space the lease-up leaves empty — set your own."
      : vacancySource?.provenance === "extracted"
        ? `The deal model's vacancy (${vacancySource.note}). This export takes it off every year's revenue on top of leaving the vacant space out until the lease-up absorbs it, so at today's vacancy it counts the empty space twice — set the vacancy and credit loss you expect once leased.`
        : `The deal model's ${vacancySource?.note ?? "vacancy"}, taken off every year's revenue on top of the lease-up — set your own.`,
    reimbursement:
      "0%: this export assumes no tenant reimburses an operating expense. On net or base-year leases, enter the share they recover.",
  };

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
    absorptionSfPerMonth: defaultAbsorptionSfPerMonth(analytics.vacantSf),
    exitCapPct: base?.exitCapPct ?? 0.06,
    saleCostPct: base?.saleCostPct ?? 0.02,
    holdYears: EXPORT_HOLD_YEARS,
    ltc: base?.ltc ?? 0.6,
    allInRatePct: base?.allInRatePct ?? 0.06,
    ioMonths: base?.ioMonths ?? 0,
    amortMonths: base?.amortMonths ?? 360,
    financingCostPct: base?.financingCostPct ?? 0.01,
    notes,
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
