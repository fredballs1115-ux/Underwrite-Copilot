// One deal's row in the meeting workbook (lib/pipeline-workbook), read
// through the readers every other surface uses. Pure: the deal row and what
// the route read beside it — the buy box, the latest job, the deadline, the
// teammate's name — come in, so a test reads a row as the route builds it.
import type { ExtractionResult } from "@/lib/anthropic/types";
import { buyBoxCheckSource, evaluateBuyBox, findGoingInCap, type BuyBox } from "@/lib/criteria";
import { findPriceMetric, inferStrategy, planSummary } from "@/lib/deal-strategy";
import { interestTag } from "@/lib/interest";
import { assumableTag } from "@/lib/assumable-debt";
import { affordableTag } from "@/lib/affordable";
import { singleTenantTag } from "@/lib/single-tenant";
import { hotelTag } from "@/lib/hotel-deal";
import { saleTag } from "@/lib/sale-terms";
import { rosterTag } from "@/lib/tenant-roster";
import { valueAddTag } from "@/lib/value-add";
import { taxAbatementTag } from "@/lib/tax-abatement";
import { sellerFinancingTag } from "@/lib/seller-financing";
import { siteReportsTag } from "@/lib/site-reports";
import { studentHousingTag } from "@/lib/student-housing";
import { manufacturedHousingTag } from "@/lib/manufactured-housing";
import { selfStorageTag } from "@/lib/self-storage";
import { verdictBehind, type JobLike } from "@/lib/screen-run";
import { shownAssetClass } from "@/lib/pipeline-slots";
import type { PipelineExportRow } from "@/lib/pipeline-workbook";

/** The deal columns the workbook's row reads. */
export interface ExportDeal {
  name: string;
  asset_class: string;
  created_at: string;
  verdict: unknown;
  extraction: unknown;
  stage: string | null;
}

/** What the route read beside the deal. */
export interface ExportRowContext {
  /** the buy box of the deal's owning scope (its team's, else its owner's) */
  box: BuyBox | null;
  /** the deal's latest job (lib/screen-run) */
  job: JobLike | null | undefined;
  offersDue: string | null;
  /** the teammate who added the deal, where it is not the reader's own */
  addedBy: string | null;
}

export function pipelineExportRow(d: ExportDeal, ctx: ExportRowContext): PipelineExportRow {
  const extraction = d.extraction as ExtractionResult | null;
  const metrics = extraction?.metrics ?? [];
  // The deal's kind first. A plan deal (value-add, lease-up, conversion,
  // development) has no going-in cap — its stabilized figure is the
  // finished project's, judged on yield on total cost — and a development's
  // price is its land cost when the OM states no asking price.
  const strategy = inferStrategy(extraction ? { ...extraction, metrics } : null);
  const plan = planSummary(extraction ? { ...extraction, metrics } : null, strategy);
  const box = ctx.box;
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
    // The deal's one class, as every surface shows it: the analyst's where
    // they filed one, the deck's where they left "Auto" — never a dash for a
    // deal the extraction has read.
    assetClass: shownAssetClass(d.asset_class, extraction),
    market: extraction?.market ?? "",
    dealType: strategy.kind === "unknown" ? null : strategy.label,
    planDeal: plan != null,
    price: findPriceMetric(metrics, strategy.kind)?.value ?? null,
    interest: interestTag(extraction),
    debt: assumableTag(extraction),
    affordable: affordableTag(extraction),
    tenancy: singleTenantTag(extraction),
    hotel: hotelTag(extraction),
    sale: saleTag(extraction),
    roster: rosterTag(extraction),
    valueAdd: valueAddTag(extraction),
    abatement: taxAbatementTag(extraction),
    sellerNote: sellerFinancingTag(extraction),
    reports: siteReportsTag(extraction),
    student: studentHousingTag(extraction),
    mh: manufacturedHousingTag(extraction),
    storage: selfStorageTag(extraction),
    cap: plan ? null : (findGoingInCap(metrics)?.value ?? null),
    yieldOnCost: plan?.yieldOnCost != null ? `${(plan.yieldOnCost * 100).toFixed(1)}%` : null,
    fit,
    verdict: (d.verdict as { verdict?: string } | null)?.verdict ?? null,
    verdictBehind: verdictBehind(ctx.job),
    offersDue: ctx.offersDue,
    createdAt: d.created_at,
    addedBy: ctx.addedBy,
  };
}
