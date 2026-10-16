import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { getBilling } from "@/lib/billing";
import { dealAllowance } from "@/lib/deal-allowance";
import { signOut } from "@/app/login/actions";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";
import { EmailToggle } from "./email-toggle";
import { BrandingSection } from "./branding-section";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailEnabled } from "@/lib/email-send";
import { emailNotes } from "@/lib/email-notes";
import { analysisWorkerEnabled, workerSchemaReady } from "@/lib/jobs";
import { deletionStopNotice, doneFromQuery } from "@/lib/account-deletion";
import { FULL_NAME_MAX, personName } from "@/lib/person";
import { PendingButton } from "../pending-button";
import { PersonBadge } from "../person-badge";
import { saveFullName } from "./actions";

export const metadata: Metadata = { title: "Account" };

const DELETE_ERRORS: Record<string, string> = {
  emailpref:
    "Couldn't save your notification preference just now — please try again.",
  confirm: 'Type DELETE (all caps) in the box to confirm deletion.',
  ownerdelete:
    "You own a team, so self-deletion is disabled — it would take the team down with you. Email underwritecopilot.support@gmail.com and we'll handle it.",
  // A deletion that stopped part way (handover, cancelsub, delete) says what
  // its earlier steps had already done: lib/account-deletion, read below.
  // Report branding (Feature 6)
  brandowner:
    "Team branding is managed by the team owner — ask them to update it.",
  brandsave: "Couldn't save your branding just now — please try again.",
  brandlogosize: "That logo is over 1MB — please resize it and try again.",
  brandlogotype: "Logos must be a PNG or JPG file.",
  // The name field (lib/person `readFullName`)
  namesave: "Couldn't save your name just now — please try again.",
  namelong: `Names are kept to ${FULL_NAME_MAX} characters — please shorten it.`,
  nameemail: "That's an email address — enter the name your teammates know you by.",
};

/** The two email preferences, ON by default. One read of the profile row:
 *  `*` returns whichever columns the schema has, so a pre-0014/0017 schema
 *  missing one toggle's column still reads the other — the per-toggle
 *  degradation the old column-at-a-time reads bought, in one round trip.
 *  A missing row reads as ON, the switches' default, as the senders read
 *  it. A failed read SHOWS as ON here too — the page draws the default it
 *  could not check — while the senders read a failed read as OFF and send
 *  nothing (lib/email `wantsAnalysisEmail`; the digest asks for the
 *  switched-on rows and sends none when that read fails). */
async function emailPrefsOf(
  userId: string,
): Promise<{ onAnalysis: boolean; weeklyDigest: boolean; fullName: string | null }> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    const row = !error && data ? (data as { email_on_analysis?: unknown; email_weekly_digest?: unknown; full_name?: unknown }) : null;
    return {
      onAnalysis: row?.email_on_analysis !== false,
      weeklyDigest: row?.email_weekly_digest !== false,
      // The name the reader set on this page (saveFullName), read in the
      // same round trip; the field shows it to edit.
      fullName: typeof row?.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : null,
    };
  } catch {
    return { onAnalysis: true, weeklyDigest: true, fullName: null };
  }
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string; branding?: string; moved?: string; cancelled?: string; name?: string }>;
}) {
  const { reset, error, branding: brandingParam, moved, cancelled, name: nameParam } = await searchParams;
  const deleteError =
    deletionStopNotice({ error, moved, cancelled }) ?? (error ? (DELETE_ERRORS[error] ?? null) : null);
  const supabase = await createSupabaseServerClient();
  // Request-cached: the (app) layout's own auth call, not a second hop.
  const user = await getCurrentUser();
  // The billing read and the email preferences don't wait on each other.
  const [billing, prefs] = user
    ? await Promise.all([getBilling(supabase, user.id), emailPrefsOf(user.id)])
    : [null, { onAnalysis: true, weeklyDigest: true, fullName: null }];
  const isPro = billing?.isPro ?? false;
  // The pipeline's meter and this line count by the create action's own
  // rule (lib/deal-allowance): a team's trial first, then the reader's own.
  const allowance = billing ? dealAllowance(billing) : null;
  // What teammates see: the name set here, else the email's local part.
  const fullName = prefs.fullName;
  const shownAs = personName(fullName, user?.email ?? null, "you");
  const emailOnAnalysis = prefs.onAnalysis;
  const emailWeeklyDigest = prefs.weeklyDigest;
  // What each switch promises, and which process sends each email
  // (lib/email-notes): this service's own setup (no key, or no sender a
  // customer receives mail from — lib/email-send) speaks only for what this
  // service sends. The digest always goes from the background worker, and
  // so do the screen emails once screens run there, as the deal actions
  // decide it (the flag, and the worker's columns in place).
  const workerMode = analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  const notes = emailNotes({ sending: emailEnabled(), workerMode });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted">Your profile and security.</p>
      </div>

      {reset && (
        <p className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass">
          You&apos;re signed in via your reset link — set a new password below.
        </p>
      )}
      {deleteError && (
        <p className="rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {deleteError}
        </p>
      )}
      {brandingParam === "saved" && (
        <p className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass">
          Branding saved — your next memo or report export will carry it.
        </p>
      )}

      {/* Profile */}
      <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* The badge every teammate sees beside the reader's work. */}
            {user && <PersonBadge name={fullName ?? user.email} id={user.id} size="md" decorative />}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Signed in as
              </p>
              {fullName && <p className="mt-1 truncate font-medium">{fullName}</p>}
              <p className={`truncate ${fullName ? "text-sm text-muted" : "mt-1 font-medium"}`}>{user?.email ?? "—"}</p>
              {allowance?.line && <p className="mt-1 text-xs text-muted">{allowance.line}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isPro ? "bg-pass/10 text-pass" : "bg-faint text-muted"
              }`}
            >
              {isPro ? "Pro" : "Free"}
            </span>
            <Link
              href="/billing"
              className="rounded-lg border border-line px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-faint"
            >
              {isPro ? "Manage plan" : "Upgrade"}
            </Link>
          </div>
        </div>

        {/* The reader's name (signed-in gaps, H2): what a teammate reads on
            the roster, a task, a note and a question in place of an email.
            Saved through the reader's own session (saveFullName). */}
        <form id="name" action={saveFullName} className="mt-5 scroll-mt-20 border-t border-line pt-5">
          <label htmlFor="account-full-name" className="text-sm font-semibold tracking-tight">
            Your name
          </label>
          <p className="mt-1 max-w-md text-sm text-muted">
            {fullName
              ? "What your teammates see on the roster, tasks, notes and questions."
              : `Your teammates see ${shownAs} until you set one.`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id="account-full-name"
              name="fullName"
              type="text"
              autoComplete="name"
              maxLength={FULL_NAME_MAX}
              defaultValue={fullName ?? ""}
              placeholder="e.g. Jordan Lee"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 sm:max-w-xs"
            />
            <PendingButton
              pendingLabel="Saving…"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Save name
            </PendingButton>
          </div>
          {nameParam === "saved" && (
            <p role="status" className="mt-2 text-sm text-pass">
              {fullName ? `Saved — your teammates now see ${fullName}.` : "Name cleared — your teammates see your email's first part."}
            </p>
          )}
        </form>
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        {notes.paused && (
          <p
            data-qa="email-paused"
            className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-faint px-3 py-2 text-sm text-muted"
          >
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink">
              Paused
            </span>
            <span>{notes.paused}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Email when an analysis finishes
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">{notes.analysis}</p>
            {notes.analysisSentBy && (
              <p data-qa="email-sent-by-worker" className="mt-1 max-w-md text-xs text-muted">
                {notes.analysisSentBy}
              </p>
            )}
          </div>
          <EmailToggle
            enabled={emailOnAnalysis}
            field="analysis"
            label="Email me when an analysis finishes"
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Weekly pipeline digest
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">{notes.digest}</p>
            <p data-qa="digest-sent-by-worker" className="mt-1 max-w-md text-xs text-muted">
              {notes.digestSentBy}
            </p>
          </div>
          <EmailToggle
            enabled={emailWeeklyDigest}
            field="digest"
            label="Email me the weekly pipeline digest"
          />
        </div>
      </section>

      {/* Report branding (Feature 6, Pro/Team) */}
      {user && <BrandingSection userId={user.id} pro={isPro} />}

      {/* Security */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold tracking-tight">Change password</h2>
        <p className="mt-1 text-sm text-muted">
          Use at least 8 characters. You&apos;ll stay signed in on this device.
        </p>
        <ChangePasswordForm />
      </section>

      {/* Support */}
      <p className="text-xs text-muted">
        Need help?{" "}
        <a
          href="mailto:underwritecopilot.support@gmail.com"
          className="font-medium text-brand hover:text-brand-strong"
        >
          underwritecopilot.support@gmail.com
        </a>
      </p>

      {/* Data health: the corrections ledger every reader sees (the
          operator's working view is on the same page, for the operator) */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Data health</h2>
            <p className="mt-1 text-sm text-muted">
              Every correction the nightly steward makes to the site&apos;s
              data, with its evidence.
            </p>
          </div>
          <Link
            href="/data-health"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
          >
            View ledger
          </Link>
        </div>
      </section>

      {/* Sign out */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Sign out</h2>
            <p className="mt-1 text-sm text-muted">
              End your session on this device.
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-kill/25 bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold tracking-tight text-kill">
          Delete account
        </h2>
        <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted">
          Permanently deletes your account, your personal deals with their
          documents and analyses, and cancels any active subscription. The
          deals you added to a team&apos;s pipeline stay with the team, handed
          to its owner, and so does your work on any team&apos;s deals: saved
          versions, valuations and rent roll imports. This cannot be undone.
        </p>
        {/* What a stopped try had already done rides into the next one,
            so its pages say it too (lib/account-deletion). */}
        <DeleteAccountForm carried={doneFromQuery({ moved, cancelled })} />
      </section>
    </div>
  );
}
