import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBilling } from "@/lib/billing";
import { signOut } from "@/app/login/actions";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Account" };

const DELETE_ERRORS: Record<string, string> = {
  confirm: 'Type DELETE (all caps) in the box to confirm deletion.',
  ownerdelete:
    "You own a team, so self-deletion is disabled — it would take the team down with you. Email support and we'll handle it.",
  cancelsub:
    "We couldn't cancel your subscription automatically — nothing was deleted. Cancel it from the Billing page first, then try again.",
  delete: "Deletion failed — nothing was removed. Please try again or email support.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string }>;
}) {
  const { reset, error } = await searchParams;
  const deleteError = error ? (DELETE_ERRORS[error] ?? null) : null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const billing = user ? await getBilling(supabase, user.id) : null;
  const isPro = billing?.isPro ?? false;

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

      {/* Profile */}
      <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Signed in as
            </p>
            <p className="mt-1 font-medium">{user?.email ?? "—"}</p>
            {billing && !isPro && (
              <p className="mt-1 text-xs text-muted">
                {billing.dealCount} of {billing.dealLimit} free deals used
              </p>
            )}
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

      {/* Security */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold tracking-tight">Change password</h2>
        <p className="mt-1 text-sm text-muted">
          Use at least 6 characters. You&apos;ll stay signed in on this device.
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
