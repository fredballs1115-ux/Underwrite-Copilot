// The workbook's "OM Facts" tab (research pass 17, item 13): every figure
// the screen read out of the memorandum, as stated, with the page it was
// read on and whether the screen flagged it — the parsed data in the
// analyst's own workbook, beside the model built from it. Pure, no I/O:
// the route hands in the deal's stored extraction.
//
// Its rules:
//   - a figure is as the memorandum states it — the label and the value are
//     the extraction's own words, never re-read or reformatted;
//   - a page is printed only where it parses AND falls inside the
//     memorandum's real length (lib/facts `locatedPage`, the absolute rule);
//     anything else is "source not located", never a page;
//   - a flag says what the screen's flag means. The extraction stores no
//     reason a figure at a time — it flags only figures that are
//     forward-looking or seller-controlled and drive returns (the extraction
//     prompt's rule) — so the reason is that rule, with the figure's basis
//     where the extraction read one, never a reason it did not give;
//   - no figures, no tab.
import { locatedPage } from "@/lib/facts";
import type { ExtractionResult } from "@/lib/anthropic/types";

export interface OmFactRow {
  label: string;
  /** the value as the memorandum states it */
  value: string;
  /** the page, only where it parses and falls within the memorandum's length */
  page: number | null;
  /** "In place", "Pro forma", or null where the extraction read no basis */
  basis: "In place" | "Pro forma" | null;
  flagged: boolean;
  /** why the screen flagged it, on a flagged figure; null otherwise */
  reason: string | null;
}

export interface OmFacts {
  rows: OmFactRow[];
  /** the memorandum's length the pages were held to; null where unknown */
  totalPages: number | null;
  /** how many of the rows the screen flagged */
  flaggedCount: number;
}

/** What a page that does not pass the rule reads in the tab. */
export const SOURCE_NOT_LOCATED = "source not located";

/** The flag's meaning, as the extraction's rule sets it. */
export const FLAG_RULE =
  "The screen flags only figures that are forward-looking or seller-controlled and drive the returns — the ones most worth checking against the source.";

function reasonFor(basis: OmFactRow["basis"]): string {
  return basis === "Pro forma"
    ? "A pro forma figure, the seller's forward number — check it against the source"
    : "Forward-looking or seller-controlled — check it against the source";
}

/** The memorandum's figures for the tab, or null where it read none. */
export function readOmFacts(ex: Pick<ExtractionResult, "metrics" | "totalPages"> | null | undefined): OmFacts | null {
  const metrics = (ex?.metrics ?? []).filter((m) => m && (m.label ?? "").trim() !== "" && (m.value ?? "").trim() !== "");
  if (metrics.length === 0) return null;
  const totalPages = ex?.totalPages && ex.totalPages > 0 ? ex.totalPages : null;
  const rows = metrics.map((m): OmFactRow => {
    const basis = m.basis === "in_place" ? "In place" : m.basis === "pro_forma" ? "Pro forma" : null;
    const flagged = !!m.flagged;
    return {
      label: m.label.trim(),
      value: m.value.trim(),
      page: locatedPage(m.page, totalPages),
      basis,
      flagged,
      reason: flagged ? reasonFor(basis) : null,
    };
  });
  return { rows, totalPages, flaggedCount: rows.filter((r) => r.flagged).length };
}
