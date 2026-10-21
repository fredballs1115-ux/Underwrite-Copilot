// The lender's quote on file for a deal (lib/loan-quote), read the one way
// every surface that may read the deal's documents reads it: the memo, the
// report and the workbook routes (the reader's own client) and the screen's
// verdict (the worker's). The deal page reads its documents itself and calls
// `loanQuoteOf` on them. The shared screen never reads the sender's
// documents, so it never calls this. Never throws: a failed read is no quote.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loanQuoteOf, type LoanDocument, type LoanQuote } from "@/lib/loan-quote";
import type { UnderwritingModel } from "@/lib/model/types";

export async function readLoanQuote(supabase: SupabaseClient, deal: { id?: unknown; model?: unknown; is_sample?: unknown }): Promise<LoanQuote | null> {
  // The sample's documents are a fixture: no term sheet is ever on it.
  if (!deal.model || typeof deal.id !== "string" || deal.is_sample) return null;
  try {
    const { data } = await supabase.from("deal_documents").select("id, kind, filename, created_at").eq("deal_id", deal.id).eq("kind", "loan_terms");
    return loanQuoteOf(deal.model as UnderwritingModel, (data ?? []) as LoanDocument[]);
  } catch (err) {
    console.warn(`loan quote not read for ${deal.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
