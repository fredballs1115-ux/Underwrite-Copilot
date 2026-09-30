import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analysisReadyEmail } from "@/lib/email-template";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import type { ExtractionResult, FirstSignal, VerdictResult } from "@/lib/anthropic/types";
import type { DealVisualCache } from "@/lib/deal-location";
import { ensureDealPicture, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import { emailPictureUrl } from "@/lib/email-picture";

/**
 * Analysis-ready email via Resend's REST API (plain fetch — no SDK to carry).
 * Key-ready by design: without RESEND_API_KEY the feature is silently off and
 * nothing here can ever crash the analysis pipeline.
 *
 * Env:
 *   RESEND_API_KEY   enables sending
 *   RESEND_FROM      verified sender (falls back to Resend's onboarding one)
 *   RESEND_BASE_URL  test override for the API host
 */

const VERDICT_EMAIL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: "#1b7a5e" },
  caution: { label: "Caution", color: "#a05a1c" },
  pass_on: { label: "No-go", color: "#b23a30" },
};

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const base = process.env.RESEND_BASE_URL ?? "https://api.resend.com";
  const from =
    process.env.RESEND_FROM ?? "Underwrite Copilot <onboarding@resend.dev>";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[email] resend responded ${res.status} for "${subject}"`);
    }
    return res.ok;
  } catch (err) {
    console.error(
      `[email] send failed for "${subject}":`,
      err instanceof Error ? err.message : err,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One email per completed analysis: deal name, buy-box verdict, link to the
 * report. Fully best-effort — reads the owner's toggle (default ON, including
 * on a pre-0014 schema where the column doesn't exist yet), derives the same
 * buy-box chip the deal header shows (lib/buy-box-chip, from the same
 * inputs), and swallows every failure.
 */
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

    // The per-user toggle — ON by default, and ON when the column predates
    // migration 0014 (the select just errors; never block the email feature
    // on schema lag, and never crash on it either).
    let wants = true;
    try {
      const { data: prefs, error } = await admin
        .from("profiles")
        .select("email_on_analysis")
        .eq("id", deal.user_id as string)
        .maybeSingle();
      if (!error && prefs && prefs.email_on_analysis === false) wants = false;
    } catch {
      // pre-0014 schema — default on
    }
    if (!wants) return;

    const { data: userRes } = await admin.auth.admin.getUserById(
      deal.user_id as string,
    );
    const to = userRes?.user?.email;
    if (!to) return;

    // The deal header's own chip (lib/buy-box-chip): the same box, the same
    // source — the extraction, the first signal, the address the page reads
    // — and the same fold, the mandate-fit score leading, so the email's
    // chip never disagrees with the page it links to. The page shows no chip
    // without a box; the email says so.
    let buyBoxLabel = "Buy box unverified";
    try {
      const box = await getBuyBoxForDeal(
        deal.user_id as string,
        (deal.team_id as string) ?? null,
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
      // keep the default label
    }

    const v = VERDICT_EMAIL[verdict.verdict] ?? {
      label: "Screened",
      color: "#114e54",
    };
    const dealName = (deal.name as string) ?? "Your deal";
    const picture = await emailPicture(admin, dealId, dealName, {
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
    await sendEmail(to, subject, html, text);
  } catch (err) {
    // Notification-only — the analysis itself already succeeded.
    console.error(
      `[email] analysis-ready notification failed for ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
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
 * email's picture link then serves whatever is stored when it is opened.
 */
export async function emailPicture(
  admin: SupabaseClient,
  dealId: string,
  dealName: string,
  deal: { cache: DealVisualCache | null; omPath: string | null },
): Promise<{ url: string; alt: string } | null> {
  const url = emailPictureUrl(appUrl(), dealId, "banner");
  if (!url) return null;
  let photo = !!deal.cache?.picture;
  if (pictureMayBeInMemorandum({ omPath: deal.omPath, isSample: false, cache: deal.cache })) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const found = await Promise.race([
        ensureDealPicture(admin, dealId, {
          omPath: deal.omPath,
          isSample: false,
          cache: deal.cache,
          waitMs: EMAIL_PICTURE_WAIT_MS,
          gallery: false,
        }),
        // Past the wait, the email goes on what the cache held.
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), EMAIL_PICTURE_WAIT_MS + 10_000);
        }),
      ]);
      // The search's answer is the picture now stored, or none (an old
      // memorandum picture its rules no longer take for the cover is gone).
      if (found !== undefined) photo = !!found;
    } catch {
      // The cover's drawing stands in; the email goes regardless.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { url, alt: photo ? `Photograph of ${dealName}` : "" };
}
