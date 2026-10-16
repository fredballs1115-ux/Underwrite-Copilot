/**
 * Whether a deal's downloads (the IC memo, the full report, the underwrite
 * workbook) are open to its reader, or behind Pro. Pure, no imports, so the
 * three routes, the deal page and its client view read one rule.
 *
 * The public pages promise the sample's files free ("Free for the sample;
 * Pro on a deal of your own", app/sample-hero `SAMPLE_DOWNLOAD_NOTE`), and
 * the signed-in reader's own copy of the sample must keep that promise. The
 * sample's row is the reader's own (row-level security), so nothing crosses
 * accounts. It is open only while it is still the sample as seeded: a deal
 * flagged a sample that carries a memorandum is no longer the sample's
 * fixture (the app refuses an OM on the sample; one written by hand would
 * make the flag a way round Pro), and stays behind Pro like any other deal.
 */
export interface ExportGateDeal {
  /** deals.is_sample */
  isSample: boolean;
  /** a memorandum is stored on the deal (deals.om_storage_path) */
  hasOm: boolean;
}

/** The sample as seeded: its downloads are free. */
export function sampleExportsFree(deal: ExportGateDeal | null | undefined): boolean {
  return !!deal && deal.isSample === true && !deal.hasOm;
}

/** A deal row's own fields, read the one way the routes read them. */
export function exportGateDealOf(
  row: { is_sample?: boolean | null; om_storage_path?: string | null } | null | undefined,
): ExportGateDeal | null {
  if (!row) return null;
  return { isSample: row.is_sample === true, hasOm: !!row.om_storage_path };
}

/** "open" — serve the file; "upsell" — send a free reader to /billing. */
export function exportGate(pro: boolean, deal: ExportGateDeal | null | undefined): "open" | "upsell" {
  return pro || sampleExportsFree(deal) ? "open" : "upsell";
}
