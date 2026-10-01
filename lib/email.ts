import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml, screenStoppedEmail, analysisReadyEmail } from "@/lib/email-template";
import { ACCOUNT_PAUSED_FAILURE, CREDENTIALS_FAILURE, needsOperator } from "@/lib/anthropic/operator-failures";
import { operatorEmails } from "@/lib/operator";
import { screenedOn, verdictBehind } from "@/lib/screen-run";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import type { ExtractionResult, FirstSignal, VerdictResult } from "@/lib/anthropic/types";
import type { DealVisualCache } from "@/lib/deal-location";
import { ensureDealPicture, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import { emailPictureUrl } from "@/lib/email-picture";
import { appUrl } from "@/lib/app-url";
import { emailEnabled, occasionKey, sendEmail } from "@/lib/email-send";
import { requesterOf } from "@/lib/jobs";

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

/** Whose run a screen email is about: the user who asked for it, where the
 *  run recorded one (lib/jobs `requesterOf`). */
export interface ScreenEmailOptions {
  requestedBy?: string | null;
}

/**
 * Who a screen's email goes to. The person who asked for the run, where the
 * run recorded one — any member can re-screen a team deal, and the email had
 * gone to the deal's creator, who had asked for nothing. A run with no
 * recorded requester (one queued before the requester was carried) emails
 * the deal's creator, as before.
 *
 * Never anyone the deal's row-level security would hide it from: the
 * requester must be the deal's creator or a member of its team when the
 * email is built — the id rides on a job row any member can write, and a
 * person who has left the team since asking is no longer shown the deal.
 * Null, and no email, where they are not (or the check cannot be read).
 */
export async function screenEmailRecipient(
  admin: SupabaseClient,
  deal: { user_id: string | null; team_id: string | null },
  requestedBy?: string | null,
): Promise<string | null> {
  const who = requesterOf(requestedBy) ?? deal.user_id ?? null;
  if (!who) return null;
  if (who === deal.user_id) return who;
  if (!deal.team_id) return null; // a personal deal is its creator's alone
  try {
    const { data, error } = await admin
      .from("team_members")
      .select("user_id")
      .eq("team_id", deal.team_id)
      .eq("user_id", who)
      .maybeSingle();
    return !error && data ? who : null;
  } catch {
    return null;
  }
}

/** The recipient's address, under their own switch: the email they asked
 *  for, where they have not turned these emails off. */
async function screenEmailAddress(
  admin: SupabaseClient,
  deal: { user_id: string | null; team_id: string | null },
  requestedBy?: string | null,
): Promise<string | null> {
  const recipient = await screenEmailRecipient(admin, deal, requestedBy);
  if (!recipient) return null;
  if (!(await wantsAnalysisEmail(admin, recipient))) return null;
  const { data: userRes } = await admin.auth.admin.getUserById(recipient);
  return userRes?.user?.email ?? null;
}

/**
 * One email per completed analysis: deal name, the call, the buy-box chip,
 * a link to the deal page — to whoever asked for the run
 * (`screenEmailRecipient`), under their own switch (default ON, and OFF
 * where it cannot be read). Fully best-effort: derives the same buy-box chip
 * the deal header shows (lib/buy-box-chip, from the same inputs), and
 * swallows every failure.
 */
export async function notifyAnalysisReady(
  admin: SupabaseClient,
  dealId: string,
  opts: ScreenEmailOptions = {},
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

    const to = await screenEmailAddress(
      admin,
      { user_id: (deal.user_id as string | null) ?? null, team_id: (deal.team_id as string | null) ?? null },
      opts.requestedBy,
    );
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
 * page's own failure sentence, to whoever asked for the run
 * (`screenEmailRecipient`), under the same switch as the screen-complete
 * email — and, on a re-screen, the call the deal still shows, with its day.
 * Where the failure is the operator's to fix (`needsOperator`), the
 * operators are told too (`alertOperators`). Never for the sample, never
 * when email is paused, never a reason anything else fails.
 */
export async function notifyAnalysisFailed(
  admin: SupabaseClient,
  dealId: string,
  message: string,
  opts: ScreenEmailOptions = {},
): Promise<void> {
  if (!emailEnabled() || !message.trim()) return;
  if (needsOperator(message)) await alertOperators(message);
  try {
    const { data: deal } = await admin
      .from("deals")
      .select("name, user_id, team_id, is_sample, verdict")
      .eq("id", dealId)
      .maybeSingle();
    if (!deal || deal.is_sample) return;
    const to = await screenEmailAddress(
      admin,
      { user_id: (deal.user_id as string | null) ?? null, team_id: (deal.team_id as string | null) ?? null },
      opts.requestedBy,
    );
    if (!to) return;
    const job = await latestJob(admin, dealId);
    // The call the deal still shows is the previous screen's only where the
    // run's job row says the run never reached its verdict (lib/screen-run,
    // the deal page's own read); an unread job row says nothing about it.
    const stored = deal.verdict as VerdictResult | null;
    const previous =
      stored?.verdict && verdictBehind(job) === "failed"
        ? (VERDICT_EMAIL[stored.verdict] ?? { label: "Screened", color: "#114e54" })
        : null;
    const { subject, html, text } = screenStoppedEmail({
      dealName: (deal.name as string) ?? "Your deal",
      message,
      dealUrl: `${appUrl()}/deals/${dealId}`,
      settingsUrl: `${appUrl()}/account`,
      previousCall: previous ? { ...previous, on: screenedOn(stored?.generatedAt) } : null,
    });
    // The occasion is the run: its job row's created_at, restamped by every
    // claim (lib/jobs), so a run's one failure is one email.
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

/** The operator alert's subject and kind, by the failure it is about. */
const OPERATOR_ALERT: Record<string, { kind: string; subject: string }> = {
  [CREDENTIALS_FAILURE]: {
    kind: "credentials",
    subject: "Screens are stopping: the analysis service refuses our credentials",
  },
  [ACCOUNT_PAUSED_FAILURE]: {
    kind: "account-paused",
    subject: "Screens are stopping: the analysis service paused our account",
  },
};

/**
 * A failure that is the operator's to fix (lib/anthropic/operator-failures
 * `needsOperator`: the analysis service refusing our credentials, or pausing
 * our account) stops every screen the same way until someone acts, and the
 * person who asked can do nothing about it — so the operators named in
 * OPERATOR_EMAILS (lib/operator, the setting /data-health already reads)
 * are told, whatever any customer's switch says. At most once an hour for
 * one kind of failure: the idempotency key names the hour, and the body
 * names no deal (the server log does), so a second send inside the hour is
 * the same email. Unset names nobody, and nothing is sent. Never throws.
 */
export async function alertOperators(message: string, now: number = Date.now()): Promise<boolean> {
  const alert = OPERATOR_ALERT[message.trim()];
  const to = [...operatorEmails(process.env.OPERATOR_EMAILS)];
  if (!alert || to.length === 0) return false;
  const hour = new Date(now).toISOString().slice(0, 13);
  const text = [
    message.trim(),
    ``,
    `Every screen stops this way until it is fixed. Each deal's page shows the sentence above and offers no retry.`,
    `The server log names each deal it stopped ("[pipeline] screen failed for deal …") with the service's own response.`,
    ``,
    `Sent at most once an hour (this one for the hour from ${hour}:00 UTC).`,
  ].join("\n");
  try {
    return await sendEmail(to, alert.subject, `<p style="font-family:sans-serif;font-size:14px;line-height:1.5;white-space:pre-line;">${escapeHtml(text)}</p>`, text, {
      idempotencyKey: occasionKey("operator-alert", alert.kind, hour),
    });
  } catch {
    return false;
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
