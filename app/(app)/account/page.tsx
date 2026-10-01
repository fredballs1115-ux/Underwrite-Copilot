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
import { emailEnabled } from "@/lib/email";
import { deletionStopNotice } from "@/lib/account-deletion";

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
};

/** The two email preferences, ON by default. One read of the profile row:
 *  `*` returns whichever columns the schema has, so a pre-0014/0017 schema
 *  missing one toggle's column still reads the other — the per-toggle
 *  degradation the old column-at-a-time reads bought, in one round trip.
 *  A missing row or a failed read reads as ON, as the senders assume. */
async function emailPrefsOf(userId: string): Promise<{ onAnalysis: boolean; weeklyDigest: boolean }> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    const row = !error && data ? (data as { email_on_analysis?: unknown; email_weekly_digest?: unknown }) : null;
    return {
      onAnalysis: row?.email_on_analysis !== false,
      weeklyDigest: row?.email_weekly_digest !== false,
    };
  } catch {
    return { onAnalysis: true, weeklyDigest: true };
  }
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string; branding?: string; moved?: string; cancelled?: string }>;
}) {
  const { reset, error, branding: brandingParam, moved, cancelled } = await searchParams;
  const deleteError =
    deletionStopNotice({ error, moved, cancelled }) ?? (error ? (DELETE_ERRORS[error] ?? null) : null);
  const supabase = await createSupabaseServerClient();
  // Request-cached: the (app) layout's own auth call, not a second hop.
  const user = await getCurrentUser();
  // The billing read and the email preferences don't wait on each other.
  const [billing, prefs] = user
    ? await Promise.all([getBilling(supabase, user.id), emailPrefsOf(user.id)])
    : [null, { onAnalysis: true, weeklyDigest: true }];
  const isPro = billing?.isPro ?? false;
  // The pipeline's meter and this line count by the create action's own
  // rule (lib/deal-allowance): a team's trial first, then the reader's own.
  const allowance = billing ? dealAllowance(billing) : null;
  const emailOnAnalysis = prefs.onAnalysis;
  const emailWeeklyDigest = prefs.weeklyDigest;
  // Paused (no key, or no sender a customer receives mail from — lib/email):
  // the switches still save a choice, and the section says nothing is sent.
  const emailSending = emailEnabled();

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
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Signed in as
            </p>
            <p className="mt-1 font-medium">{user?.email ?? "—"}</p>
            {allowance?.line && <p className="mt-1 text-xs text-muted">{allowance.line}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isPro ? "bg-pass/15 text-pass" : "bg-faint text-muted"
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
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        {!emailSending && (
          <p
            data-qa="email-paused"
            className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-faint px-3 py-2 text-sm text-muted"
          >
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink">
              Paused
            </span>
            <span>
              Both emails are paused for now — none is being sent. Each
              switch keeps your choice for when sending starts.
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Email when an analysis finishes
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              One email per completed screen — the verdict, the buy-box call,
              and a link to the deal page — and one if a screen fails before
              its verdict, saying why.
            </p>
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
            <p className="mt-1 max-w-md text-sm text-muted">
              Monday morning: your deals by stage, offers due this week, and
              the verdicts that landed since last week.
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
          Permanently deletes your account, your deals, your documents, and
          your analyses, and cancels any active subscription. Deals you shared
          with a team stay with the team. This cannot be undone.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
