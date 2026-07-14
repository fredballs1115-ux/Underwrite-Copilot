import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadDealFile } from "@/lib/storage";
import { parseModelFile } from "@/lib/model-parse";
import { extractRentRoll, extractT12 } from "./actuals";
import { consolidateRentRoll, summarizeT12 } from "@/lib/actuals/analyze";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Property actuals ingestion (Feature 1). For the deal's rent roll and T-12
 * documents, extract the STRUCTURED rows/lines (LLM), consolidate them
 * DETERMINISTICALLY (lib/actuals/analyze), and store both on the deal so the
 * PROPERTY ACTUALS card and the model can read them. Idempotent (clears prior
 * rows first). Best-effort: the caller wraps it so a failure never sinks the
 * screen, and each document is isolated so one bad file doesn't stop the other.
 */
export async function runActualsIngestion(admin: Admin, dealId: string): Promise<void> {
  // NEWEST document of each kind wins — a corrected roll uploaded later must
  // replace the original, not be ignored.
  const { data: docsData } = await admin
    .from("deal_documents")
    .select("id, kind, filename, storage_path")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  const docs = (docsData ?? []) as {
    id: string;
    kind: string;
    filename: string;
    storage_path: string;
  }[];

  const rentRollDoc = docs.find((d) => d.kind === "rent_roll");
  const t12Doc = docs.find((d) => d.kind === "t12");

  // WALT/expiry need a reference date when the roll doesn't state one — the
  // actual ingest (screen) date, stored on the summary so the basis is visible.
  const screenDate = new Date().toISOString().slice(0, 10);

  if (rentRollDoc) {
    try {
      const buf = await downloadDealFile(rentRollDoc.storage_path);
      const parsed = await parseModelFile(rentRollDoc.filename, buf);
      const extraction = await extractRentRoll(parsed);
      const summary = {
        ...consolidateRentRoll(extraction, screenDate),
        asOfUsed: extraction.asOfDate || screenDate,
      };
      // Replace-on-success: the delete happens only once a fresh extraction is
      // in hand, so a transient failure never wipes previously-good actuals.
      await admin.from("deal_rent_rolls").delete().eq("deal_id", dealId);
      await admin.from("deal_rent_rolls").insert({
        deal_id: dealId,
        source_document_id: rentRollDoc.id,
        as_of_date: extraction.asOfDate || null,
        extraction,
        summary,
      });
    } catch (err) {
      console.error(`actuals: rent roll ingest failed for ${dealId}:`, err);
    }
  } else {
    // No rent roll on the deal (e.g. the document was removed) — clear.
    await admin.from("deal_rent_rolls").delete().eq("deal_id", dealId);
  }

  if (t12Doc) {
    try {
      const buf = await downloadDealFile(t12Doc.storage_path);
      const parsed = await parseModelFile(t12Doc.filename, buf);
      const extraction = await extractT12(parsed);
      const summary = summarizeT12(extraction);
      await admin.from("deal_t12_statements").delete().eq("deal_id", dealId);
      await admin.from("deal_t12_statements").insert({
        deal_id: dealId,
        source_document_id: t12Doc.id,
        period_end_date: extraction.periodEndDate || null,
        extraction,
        summary,
      });
    } catch (err) {
      console.error(`actuals: t12 ingest failed for ${dealId}:`, err);
    }
  } else {
    await admin.from("deal_t12_statements").delete().eq("deal_id", dealId);
  }
}
