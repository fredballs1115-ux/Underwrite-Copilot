import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadDealFile } from "@/lib/storage";
import { parseModelFile } from "@/lib/model-parse";
import { extractDocFacts } from "@/lib/anthropic/model-extract";
import { reconcileDocs } from "@/lib/anthropic/model-reconcile";
import { DOC_KIND_LABEL } from "@/lib/documents";
import { computeModel } from "./compute";
import type { DocFacts, UnderwritingModel } from "./types";

type JobPatch = {
  status?: string;
  step?: string | null;
  progress?: number;
  error?: string | null;
};

async function patchJob(dealId: string, patch: JobPatch): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("analysis_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("deal_id", dealId);
}

type DocRow = {
  id: string;
  kind: string;
  filename: string;
  storage_path: string;
};

/**
 * Generate a first-draft underwriting model from the deal's document set.
 * Runs in the background (after()), reusing the deal's job row so the existing
 * progress UI surfaces it. Three passes: extract facts per document → reconcile
 * conflicts by source authority → compute the cash flow and returns in code.
 */
export async function runModelGeneration(dealId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: docsData } = await admin
      .from("deal_documents")
      .select("id, kind, filename, storage_path")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: true });
    const docs = (docsData as DocRow[] | null) ?? [];
    if (docs.length === 0) {
      throw new Error(
        "Add at least one document (start with the OM and a rent roll) before generating a model.",
      );
    }

    await patchJob(dealId, {
      status: "running",
      step: "model",
      progress: 12,
      error: null,
    });

    // Pass 1 — extract facts from each document independently.
    const allFacts: DocFacts[] = [];
    const skipped: string[] = [];
    for (const d of docs) {
      try {
        const buffer = await downloadDealFile(d.storage_path);
        const parsed = await parseModelFile(d.filename, buffer);
        const facts = await extractDocFacts({
          name: d.filename,
          kind: d.kind,
          parsed,
        });
        allFacts.push(facts);
      } catch {
        skipped.push(d.filename);
      }
    }
    if (allFacts.length === 0) {
      throw new Error(
        "None of the uploaded documents could be read. Upload PDFs or Excel/CSV files.",
      );
    }

    // Pass 2 — reconcile across all sources.
    await patchJob(dealId, { status: "running", step: "model", progress: 62 });
    const recon = await reconcileDocs(allFacts);

    // Pass 3 — compute the cash flow and returns deterministically.
    const { cashFlow, returns } = computeModel(recon.inputs);

    const caveats = [...recon.caveats];
    if (skipped.length > 0) {
      caveats.push(
        `Could not read and incorporate: ${skipped.join(", ")}. Re-upload as PDF or Excel/CSV.`,
      );
    }

    const model: UnderwritingModel = {
      generatedFrom: docs.map(
        (d) => `${DOC_KIND_LABEL[d.kind] ?? "Document"}: ${d.filename}`,
      ),
      holdYears: recon.inputs.holdYears,
      metrics: recon.metrics,
      conflicts: recon.metrics.filter((m) => m.isConflict),
      inputs: recon.inputs,
      cashFlow,
      returns,
      summary: recon.summary,
      caveats,
    };

    await admin
      .from("deals")
      .update({ model, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    await patchJob(dealId, {
      status: "done",
      step: "model",
      progress: 100,
      error: null,
    });
  } catch (err) {
    await patchJob(dealId, {
      status: "error",
      error: err instanceof Error ? err.message : "Model generation failed.",
    });
  }
}
