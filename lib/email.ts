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

/**
 * Analysis-ready email via Resend's REST API (plain fetch — no SDK to carry).
 * Key-ready by design: without RESEND_API_KEY the feature is silently off and
 * nothing here can ever crash the analysis pipeline.
 *
 * Env:
 *   RESEND_API_KEY   enables sending
 *   RESEND_FROM      the sender, on a domain verified with Resend — required:
 *                    without one the emails are PAUSED (see `emailSetup`)
 *   RESEND_BASE_URL  test override for the API host
 */

const VERDICT_EMAIL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: "#1b7a5e" },
  caution: { label: "Caution", color: "#a05a1c" },
  pass_on: { label: "No-go", color: "#b23a30" },
};

/** The screen-complete email's buy-box line where the box itself could not
 *  be read: said as the read's failure, never as a fact about the deal. */
export const BUY_BOX_NOT_READ = "couldn't be read just now — open the deal to see it";

/** Resend's shared onboarding domain. Mail sent from it is delivered only to
 *  the address that owns the Resend account, never to a customer, so a
 *  sender there is no sender at all. */
const RESEND_SHARED_DOMAIN = "resend.dev";

/**
 * Whether the emails can reach a customer. `off`: no key, the feature is not
 * set up. `paused`: a key, but no sender a customer would receive mail from —
 * RESEND_FROM unset, naming no address, or on Resend's shared resend.dev
 * domain (the default this module used to fall back to, which delivered to
 * the Resend account's owner and nobody else while the account page showed
 * both emails on). Pure: the environment is an argument.
 */
export type EmailSetup =
  | { state: "on"; key: string; from: string }
  | { state: "off" }
  | { state: "paused"; reason: string };

export function emailSetup(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EmailSetup {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return { state: "off" };
  const from = env.RESEND_FROM?.trim() ?? "";
  if (!from) return { state: "paused", reason: "RESEND_FROM is not set" };
  const domain = senderDomain(from);
  if (!domain) return { state: "paused", reason: `RESEND_FROM names no address ("${from}")` };
  if (domain === RESEND_SHARED_DOMAIN || domain.endsWith(`.${RESEND_SHARED_DOMAIN}`)) {
    return {
      state: "paused",
      reason: `RESEND_FROM is on Resend's shared ${RESEND_SHARED_DOMAIN} domain, which delivers only to the Resend account's own address`,
    };
  }
  return { state: "on", key, from };
}

/** The domain of a sender written "Name <a@b.com>" or "a@b.com", lowercased;
 *  null where it names no address. */
export function senderDomain(from: string): string | null {
  const angled = /<([^<>]*)>\s*$/.exec(from);
  const address = (angled ? angled[1] : from).trim();
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = address.slice(at + 1).trim().toLowerCase();
  return domain && !/[\s<>"]/.test(domain) ? domain : null;
}

/** Said once a process, never per email: a paused feature is one fact. */
let pausedSaid = false;

/** The setup to send with, or null. A paused setup says why in the log,
 *  once; a missing key stays silent, as it always has. */
function readySetup(): { key: string; from: string } | null {
  const setup = emailSetup();
  if (setup.state === "paused" && !pausedSaid) {
    pausedSaid = true;
    console.warn(
      `[email] paused: ${setup.reason} — no email is sent until RESEND_FROM names a sender on a domain verified with Resend.`,
    );
  }
  return setup.state === "on" ? setup : null;
}

/** Whether the emails go out — what the senders check before reading
 *  anything, and what the account page says beside its two switches. */
export function emailEnabled(): boolean {
  return readySetup() !== null;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  // The rule holds at the one place a request is made: while paused, no
  // send is attempted, whoever calls.
  const ready = readySetup();
  if (!ready) return false;
  const { key, from } = ready;
  const base = process.env.RESEND_BASE_URL ?? "https://api.resend.com";
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
    await sendEmail(to, subject, html, text);
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
    await sendEmail(to, subject, html, text);
  } catch (err) {
    console.error(
      `[email] screen-stopped notification failed for ${dealId}:`,
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
