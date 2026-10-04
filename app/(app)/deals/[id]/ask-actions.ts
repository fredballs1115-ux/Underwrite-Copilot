"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { downloadOmPdf } from "@/lib/storage";
import { askDealQuestion, dealContextFor } from "@/lib/anthropic/ask";
import { ScreenError } from "@/lib/anthropic/failure";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { parseDealQa } from "@/lib/deals";
import { locatedPage } from "@/lib/facts";
import { omFingerprint } from "@/lib/om-fingerprint";
import { answeredSiteFlags, type SiteFlagsResult } from "@/lib/site-flags/core";

export type AskState =
  | { error?: string; ok?: boolean; question?: string }
  | null;

// Each answer is a full OM read — cap the questions asked of each memorandum
// so one deal can't become an unbounded Claude bill. A reissued deck is a new
// document with its own pages, so its questions start again; the same bytes
// uploaded again are the same memorandum, and keep their count.
const MAX_QUESTIONS = 25;

/**
 * Ask-the-deal: one question, answered from the stored OM with page cites,
 * appended to the deal's Q&A thread. Runs inline (the analyst is waiting) —
 * a single Claude call over the whole deck. Returns useActionState-style state
 * so errors render next to the form instead of bouncing the page.
 */
export async function askDeal(
  _prev: AskState,
  formData: FormData,
): Promise<AskState> {
  const dealId = String(formData.get("dealId") ?? "");
  const question = String(formData.get("question") ?? "")
    .trim()
    .slice(0, 300);
  // Every error echoes the question back — React 19 resets the form after
  // any action, and a 300-char question is too expensive to retype.
  const keep = { question };
  if (!dealId)
    return { error: "Something went wrong — reload and try again.", ...keep };
  if (question.length < 5) {
    return { error: "Give the question a few more words.", ...keep };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { error: "You're signed out — sign in again to continue.", ...keep };

  let pro = false;
  try {
    pro = await isPro(supabase, user.id);
  } catch {
    // Infrastructure blip ≠ not entitled — never show a paying user an
    // upgrade nag for a lookup failure.
    return { error: "Couldn't check your plan just now — please try again.", ...keep };
  }
  if (!pro) {
    return {
      error: "Ask-the-deal is part of Pro — upgrade on the Billing page to use it.",
      ...keep,
    };
  }

  const { data: deal, error: readErr } = await supabase
    .from("deals")
    .select("id, om_storage_path, is_sample, qa, extraction, first_signal, site_flags, address")
    .eq("id", dealId)
    .maybeSingle();
  if (readErr) {
    return { error: "Couldn't load the deal just now — please try again.", ...keep };
  }
  if (!deal) return { error: "This deal is no longer available.", ...keep };
  if (deal.is_sample) {
    return {
      error:
        "The sample deal has no OM behind it — questions need a real uploaded memorandum.",
      ...keep,
    };
  }
  if (!deal.om_storage_path) {
    return {
      error: "Upload the OM first — answers come from the document itself.",
      ...keep,
    };
  }

  // The questions asked of the memorandum the deal holds now — a replaced
  // OM's marker on the thread is none, and an answer asked of an earlier
  // memorandum (lib/deals `parseDealQa`, the reading the thread is drawn
  // with) counted toward that deck's cap. It had counted toward this one's,
  // so a deal whose first deck used its 25 could ask nothing of the second.
  const asked = parseDealQa(deal.qa).filter((e) => !e.earlier);
  if (asked.length >= MAX_QUESTIONS) {
    return {
      error: `This memorandum reached its ${MAX_QUESTIONS}-question cap — the thread above should have it covered.`,
      // The typed question stays in the box, as on every other refusal.
      ...keep,
    };
  }

  try {
    const pdf = await downloadOmPdf(deal.om_storage_path as string, { kind: "deal", dealId });
    const extraction = (deal.extraction as ExtractionResult | null) ?? null;
    // What the screen's steps are told, read as the pipeline reads it: the
    // deal's kind with its first signal beside the extraction, so a deal the
    // signal calls a conversion is one here too (it read "Stabilized"), and
    // FEMA's zone where the lookup has answered for the address the deal
    // has now (lib/site-flags/core `answeredSiteFlags`).
    const flags = answeredSiteFlags(
      (deal.site_flags as SiteFlagsResult | null) ?? null,
      (deal.address as { label?: string } | null)?.label,
    );
    const context = dealContextFor(
      extraction,
      flags ? { flood: flags.flood } : null,
      (deal.first_signal as FirstSignal | null | undefined) ?? null,
    );
    const result = await askDealQuestion(pdf, question, context, {
      dealId,
      // How the screen read this memorandum, off the row already in hand:
      // a question reads the figures the screen read, with no second read
      // of the deal (null for a deal screened before the read was kept).
      omRead: extraction?.omRead ?? null,
    });
    const entry = {
      at: new Date().toISOString(),
      q: question,
      answer: result.answer,
      // A cited page is kept only where it falls inside the deck this answer
      // read — the extraction's absolute rule (lib/facts): a page the model
      // named past the memorandum's end, or one no length could validate,
      // is never shown as a citation.
      cites: result.cites.filter((c) => locatedPage(c.page, result.pages) != null).slice(0, 6),
      // The memorandum it was asked of, so a reissued deck never inherits
      // this answer's pages (lib/deals `parseDealQa`).
      om: omFingerprint(pdf),
      // Who asked, by user id: a team deal's thread names them.
      by: user.id,
    };
    // Atomic append (RPC, 0017) so two concurrent asks never overwrite each
    // other's paid answers; read-modify-write only as the pre-RPC fallback.
    const { error: rpcErr } = await supabase.rpc("append_deal_qa", {
      p_deal: dealId,
      p_entry: entry,
    });
    if (rpcErr) {
      // The thread as stored, never as parsed: the parse leaves out the
      // markers a replaced OM appended and adds what it reads, and the
      // database keeps every entry already there, in order (migration 0036).
      const stored: unknown[] = Array.isArray(deal.qa) ? deal.qa : [];
      const { error } = await supabase
        .from("deals")
        .update({ qa: [...stored, entry], updated_at: new Date().toISOString() })
        .eq("id", dealId);
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error(`ask-the-deal failed for ${dealId}:`, err);
    // A cut-off or declined answer names itself; anything else stays generic.
    return {
      error:
        err instanceof ScreenError
          ? `${err.message} Nothing was saved.`
          : "The answer didn’t come back — nothing was saved. Please try again.",
      ...keep,
    };
  }

  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}
