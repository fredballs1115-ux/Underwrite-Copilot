import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getBilling,
  FREE_DEAL_LIMIT,
  PRO_PRICE_LABEL,
} from "@/lib/billing";
import { startCheckout, openPortal } from "./actions";

export const metadata: Metadata = { title: "Billing" };

const PRO_FEATURES = [
  "Unlimited deals",
  "First-draft underwriting model + Excel export",
  "One-page PDF screening memo",
  "Public-web comp search",
  "Multi-document reconciliation & per-tab uploads",
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const billing = user ? await getBilling(supabase, user.id) : null;

  const banner =
    status === "success"
      ? { cls: "bg-pass/10 text-pass", text: "You're on Pro — everything's unlocked. Thank you!" }
      : status === "cancelled"
        ? { cls: "bg-faint text-muted", text: "Checkout cancelled — no charge was made." }
        : error === "config"
          ? { cls: "bg-kill/10 text-kill", text: "Billing isn't fully configured yet (missing Stripe price). Add STRIPE_PRICE_ID." }
          : error === "nocustomer"
            ? { cls: "bg-faint text-muted", text: "No subscription on file yet — start with Upgrade to Pro below." }
            : error === "save"
              ? { cls: "bg-kill/10 text-kill", text: "Couldn't save your billing profile — please try again." }
              : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your plan and subscription.
        </p>
      </div>

      {banner && (
        <p className={`rounded-lg px-3 py-2 text-sm ${banner.cls}`}>
          {banner.text}
        </p>
      )}

      {/* Current plan */}
      <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Current plan
            </p>
            <p className="mt-1 text-xl font-semibold">
              {billing?.isPro ? "Pro" : "Free"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              billing?.isPro ? "bg-pass/15 text-pass" : "bg-faint text-muted"
            }`}
          >
            {billing?.isPro ? "Active" : "Free tier"}
          </span>
        </div>

        {billing?.isPro ? (
          <>
            <p className="mt-4 text-sm text-muted">
              {billing.currentPeriodEnd
                ? `Renews ${new Date(billing.currentPeriodEnd).toLocaleDateString(
                    "en-US",
                    { month: "long", day: "numeric", year: "numeric" },
                  )}.`
                : "Subscription active."}
            </p>
            <form action={openPortal} className="mt-4">
              <button
                type="submit"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
              >
                Manage subscription
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Deals used</span>
                <span className="font-mono tabular-nums">
                  {billing?.dealCount ?? 0} / {FREE_DEAL_LIMIT}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-faint">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{
                    width: `${Math.min(100, ((billing?.dealCount ?? 0) / FREE_DEAL_LIMIT) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <form action={startCheckout} className="mt-5">
              <button
                type="submit"
                className="shadow-card hover-lift rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white"
              >
                Upgrade to Pro — {PRO_PRICE_LABEL}
              </button>
            </form>
          </>
        )}
      </section>

      {/* What Pro includes */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Pro includes
        </p>
        <ul className="mt-3 space-y-2">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pass/15 text-[11px] font-bold text-pass">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
