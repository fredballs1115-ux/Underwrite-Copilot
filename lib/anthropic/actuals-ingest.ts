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
  const { data: deal } = await admin
    .from("deals")
    .select("created_at")
    .eq("id", dealId)
    .single();

  const { data: docsData } = await admin
    .from("deal_documents")
    .select("id, kind, filename, storage_path")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });
  const docs = (docsData ?? []) as {
    id: string;
    kind: string;
    filename: string;
    storage_path: string;
  }[];

  const rentRollDoc = docs.find((d) => d.kind === "rent_roll");
  const t12Doc = docs.find((d) => d.kind === "t12");

  // Idempotent on re-screen: clear any prior actuals, then re-ingest fresh.
  await admin.from("deal_rent_rolls").delete().eq("deal_id", dealId);
  await admin.from("deal_t12_statements").delete().eq("deal_id", dealId);

  if (rentRollDoc) {
    try {
      const buf = await downloadDealFile(rentRollDoc.storage_path);
      const parsed = await parseModelFile(rentRollDoc.filename, buf);
      const extraction = await extractRentRoll(parsed);
      // The roll's own as-of date wins; else fall back to the screen date so
      // WALT/expiry still compute (the stored asOfDate makes the basis clear).
      const summary = consolidateRentRoll(
        extraction,
        (deal?.created_at as string) ?? undefined,
      );
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
  }

  if (t12Doc) {
    try {
      const buf = await downloadDealFile(t12Doc.storage_path);
      const parsed = await parseModelFile(t12Doc.filename, buf);
      const extraction = await extractT12(parsed);
      const summary = summarizeT12(extraction);
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
  }
}
