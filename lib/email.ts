import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { screenStoppedEmail, analysisReadyEmail } from "@/lib/email-template";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import type { ExtractionResult, FirstSignal, VerdictResult } from "@/lib/anthropic/types";
import type { DealVisualCache } from "@/lib/deal-location";
import { ensureDealPicture, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import { emailPictureUrl } from "@/lib/email-picture";
import { appUrl } from "@/lib/app-url";
import { emailEnabled, occasionKey, sendEmail } from "@/lib/email-send";

/**
 * The screen emails — the screen-complete one and the screen-stopped one —
 * best-effort by design: nothing here can ever crash the analysis pipeline.
 * The sending itself, and its setup (a key, and a sender a customer receives
 * mail from), is lib/email-send's, re-exported here so every caller keeps
 * its one import.
 */
export {
  SEND_TIMEOUT_MS,
  emailEnabled,
  emailSetup,
  occasionKey,
  sendEmail,
  senderDomain,
  type EmailSetup,
  type SendOptions,
} from "@/lib/email-send";

const VERDICT_EMAIL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: "#1b7a5e" },
  caution: { label: "Caution", color: "#a05a1c" },
  pass_on: { label: "No-go", color: "#b23a30" },
};

/** The screen-complete email's buy-box line where the box itself could not
 *  be read: said as the read's failure, never as a fact about the deal. */
export const BUY_BOX_NOT_READ = "couldn't be read just now — open the deal to see it";

/**
 * One email per completed analysis: deal name, buy-box verdict, link to the
 * deal page. Fully best-effort — reads the owner's toggle (default ON, including
 * on a pre-0014 schema where the column doesn't exist yet), derives the same
 * buy-box chip the deal header shows (lib/buy-box-chip, from the same
 * inputs), and swallows every failure.
 */
/**
 * The account's "Email when an analysis finishes" switch, read for one
 * send: ON for an account with no profile row yet (the switch's default),
 * OFF where the reader turned it off — and OFF where the read fails. It
 * had read a failed read as ON, a habit from before migration 0014 added
 * the column, so a blip in the database could email someone who had said
 * no; a missed email is the smaller wrong.
 */
export async function wantsAnalysisEmail(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data: prefs, error } = await admin
      .from("profiles")
      .select("email_on_analysis")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    return !(prefs && prefs.email_on_analysis === false);
  } catch {
    return false;
  }
}

export async function notifyAnalysisReady(
  admin: SupabaseClient,
  dealId: string,
): Promise<void> {
  if (!emailEnabled()) return;
  try {
    const { data: deal } = await admin
      .from("deals")
      .select(
        "name, user_id, team_id, asset_class, extraction, first_signal, address, verdict, is_sample, photo, om_storage_path",
      )
      .eq("id", dealId)
      .maybeSingle();
    if (!deal || deal.is_sample) return;
    const verdict = deal.verdict as VerdictResult | null;
    if (!verdict?.verdict) return;

    if (!(await wantsAnalysisEmail(admin, deal.user_id as string))) return;

    const { data: userRes } = await admin.auth.admin.getUserById(
      deal.user_id as string,
    );
    const to = userRes?.user?.email;
    if (!to) return;

    // The deal header's own chip (lib/buy-box-chip): the same box, the same
    // source — the extraction, the first signal, the address the page reads
    // — and the same fold, the mandate-fit score leading, so the email's
    // chip never disagrees with the page it links to. The page shows no chip
    // without a box; the email says so. A box the email could not read says
    // that, never "unverified" — the chip's word for a deal its facts could
    // not judge, a claim about the deal — nor "no buy box set".
    let buyBoxLabel = BUY_BOX_NOT_READ;
    try {
      const box = await getBuyBoxForDeal(
        deal.user_id as string,
        (deal.team_id as string) ?? null,
        { strict: true },
      );
      if (box) {
        const extraction = (deal.extraction as ExtractionResult | null) ?? null;
        const firstSignal = (deal.first_signal as FirstSignal | null) ?? null;
        // The page's address: the row's, read from the memorandum or the
        // typed line exactly as the page reads it (#441).
        const address =
          addressUpgrade(deal.address, extraction) ?? (deal.address as StructuredAddress | null) ?? null;
        buyBoxLabel = buyBoxRead(
          deal.asset_class as string,
          dealCheckSource(extraction, firstSignal, address),
          box,
        ).chip.label;
      } else {
        buyBoxLabel = "No buy box set";
      }
    } catch {
      // the box was not read: the label says so
    }

    const v = VERDICT_EMAIL[verdict.verdict] ?? {
      label: "Screened",
      color: "#114e54",
    };
    const dealName = (deal.name as string) ?? "Your deal";
    const picture = await emailPicture(admin, dealId, {
      cache: (deal.photo as DealVisualCache | null) ?? null,
      omPath: (deal.om_storage_path as string | null) ?? null,
    });
    const { subject, html, text } = analysisReadyEmail({
      dealName,
      verdictLabel: v.label,
      verdictColor: v.color,
      buyBoxLabel,
      reason: verdict.reason ?? "",
      dealUrl: `${appUrl()}/deals/${dealId}`,
      settingsUrl: `${appUrl()}/account`,
      picture,
    });
    // The occasion is the verdict itself: each screen stamps its own.
    await sendEmail(to, subject, html, text, {
      idempotencyKey: occasionKey("screen-complete", dealId, verdict.generatedAt),
    });
  } catch (err) {
    // Notification-only — the analysis itself already succeeded.
    console.error(
      `[email] analysis-ready notification failed for ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * A screen that stopped before its verdict (pass 14, 2026-10-01): the deal
 * page's own failure sentence, to the deal's owner, under the same switch as
 * the screen-complete email. Never for the sample, never when email is
 * paused, never a reason anything else fails.
 */
export async function notifyAnalysisFailed(
  admin: SupabaseClient,
  dealId: string,
  message: string,
): Promise<void> {
  if (!emailEnabled() || !message.trim()) return;
  try {
    const { data: deal } = await admin
      .from("deals")
      .select("name, user_id, is_sample")
      .eq("id", dealId)
      .maybeSingle();
    if (!deal || deal.is_sample) return;
    if (!(await wantsAnalysisEmail(admin, deal.user_id as string))) return;
    const { data: userRes } = await admin.auth.admin.getUserById(deal.user_id as string);
    const to = userRes?.user?.email;
    if (!to) return;
    const { subject, html, text } = screenStoppedEmail({
      dealName: (deal.name as string) ?? "Your deal",
      message,
      dealUrl: `${appUrl()}/deals/${dealId}`,
      settingsUrl: `${appUrl()}/account`,
    });
    // The occasion is the run: its job row's created_at, restamped by every
    // claim (lib/jobs), so a run's one failure is one email.
    const job = await latestJob(admin, dealId);
    await sendEmail(to, subject, html, text, {
      idempotencyKey: occasionKey("screen-stopped", dealId, job?.created_at),
    });
  } catch (err) {
    console.error(
      `[email] screen-stopped notification failed for ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** The deal's latest job row as the screen emails read it — its status and
 *  step (what a stopped run left behind) and when the run was asked for —
 *  or null where it cannot be read. */
async function latestJob(
  admin: SupabaseClient,
  dealId: string,
): Promise<{ status: string | null; step: string | null; created_at: string | null } | null> {
  try {
    const { data, error } = await admin
      .from("analysis_jobs")
      .select("status, step, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { status?: unknown; step?: unknown; created_at?: unknown };
    return {
      status: typeof row.status === "string" ? row.status : null,
      step: typeof row.step === "string" ? row.step : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    };
  } catch {
    return null;
  }
}

/** How long the email waits for a turn to read the memorandum's cover. */
export const EMAIL_PICTURE_WAIT_MS = 15_000;

/**
 * The building across the top of the screen-complete email (#464): its
 * photograph where it has one, else the cover its card wears. The screen is
 * often finished before anyone has opened the deal, so the memorandum's
 * cover is looked for here first where nobody has yet — the cover alone
 * (the gallery is left to the deal's first view), bounded, and never a
 * reason the email is late by more than the wait or not sent at all. The
 * email's picture link then serves whatever is stored when it is OPENED,
 * which is why the banner's alt is the template's (`bannerAlt`: the deal
 * and the link, true of either picture) and is no longer decided here — a
 * "Photograph of …" written at send time could sit over the cover's drawing.
 */
export async function emailPicture(
  admin: SupabaseClient,
  dealId: string,
  deal: { cache: DealVisualCache | null; omPath: string | null },
): Promise<{ url: string } | null> {
  const url = emailPictureUrl(appUrl(), dealId, "banner");
  if (!url) return null;
  if (pictureMayBeInMemorandum({ omPath: deal.omPath, isSample: false, cache: deal.cache })) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ensureDealPicture(admin, dealId, {
          omPath: deal.omPath,
          isSample: false,
          cache: deal.cache,
          waitMs: EMAIL_PICTURE_WAIT_MS,
          gallery: false,
        }),
        // Past the wait, the email goes with whatever is stored by then.
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, EMAIL_PICTURE_WAIT_MS + 10_000);
        }),
      ]);
    } catch {
      // The cover's drawing stands in; the email goes regardless.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { url };
}
