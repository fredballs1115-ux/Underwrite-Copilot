import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf, downloadDealFile } from "@/lib/storage";
import { parseModelFile } from "@/lib/model-parse";
import { extractDocFacts } from "./model-extract";
import { computeDiscrepancies, type DocKind } from "@/lib/reconcile";
import type { DocFacts } from "@/lib/model/types";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

// Any of these alongside the OM is worth a reconciliation pass — including a
// loan term sheet (authoritative over an OM summary for debt terms).
const EXTRA_KINDS = new Set(["rent_roll", "t12", "financials", "loan_terms"]);

/**
 * Multi-document reconciliation (Feature 3). Extracts per-document facts from
 * the OM plus any rent roll / T-12 / financials on the deal, then runs the
 * DETERMINISTIC reconciliation engine (lib/reconcile) to store the deal's
 * discrepancies. No-op (clears any stale result) when there's nothing beyond
 * the OM to compare against. Best-effort: the caller wraps it so a failure
 * never sinks the screen.
 */
export async function runDocReconciliation(admin: Admin, dealId: string): Promise<void> {
  const { data: deal } = await admin
    .from("deals")
    .select("om_storage_path, recon_overrides")
    .eq("id", dealId)
    .single();

  const { data: docsData } = await admin
    .from("deal_documents")
    .select("id, kind, filename, storage_path")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });
  const docs = (docsData ?? []) as {
    kind: string;
    filename: string;
    storage_path: string;
  }[];

  // Reconciliation needs a source to compare the OM against.
  const hasExtra = docs.some((d) => EXTRA_KINDS.has(d.kind));
  if (!hasExtra) {
    await admin.from("deals").update({ discrepancies: null }).eq("id", dealId);
    return;
  }

  const allFacts: DocFacts[] = [];

  // The OM: prefer the primary om_storage_path; skip any duplicate om-kind doc.
  if (deal?.om_storage_path) {
    try {
      const buf = await downloadOmPdf(deal.om_storage_path as string);
      const parsed = await parseModelFile("offering-memorandum.pdf", buf);
      allFacts.push(await extractDocFacts({ name: "Offering Memorandum", kind: "om", parsed }));
    } catch {
      // OM unreadable — reconcile whatever else we can.
    }
  }
  for (const d of docs) {
    if (d.kind === "om") continue; // handled via om_storage_path
    try {
      const buf = await downloadDealFile(d.storage_path);
      const parsed = await parseModelFile(d.filename, buf);
      allFacts.push(await extractDocFacts({ name: d.filename, kind: d.kind, parsed }));
    } catch {
      // one bad document doesn't stop the rest
    }
  }

  if (allFacts.length < 2) {
    await admin.from("deals").update({ discrepancies: null }).eq("id", dealId);
    return;
  }

  const overrides = (deal?.recon_overrides as Record<string, DocKind> | null) ?? {};
  const result = computeDiscrepancies(allFacts, overrides);
  await admin
    .from("deals")
    .update({ discrepancies: result, updated_at: new Date().toISOString() })
    .eq("id", dealId);
}
