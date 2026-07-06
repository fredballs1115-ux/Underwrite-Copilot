import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getBilling,
  FREE_DEAL_LIMIT,
  PRO_PRICE_LABEL,
} from "@/lib/billing";
import { startCheckout, openPortal } from "./actions";

export const metadata: Metadata = { title: "Billing" };

// Benefit-framed: what the feature does for you, not what it's called.
const FREE_FEATURES = [
  "3 deals with the full six-step screen on each",
  "Sourced ranges + the three deal-killers, stressed first",
  "Side-by-side deal comparison",
  "Reconcile the screen against your own model",
];

const PRO_FEATURES = [
  "Unlimited deals — screen every OM that hits your inbox",
  "First-draft Excel model with live formulas and IRR sensitivity",
  "One-page PDF screening memo you can hand to your IC",
  "Public-web comp search beyond the broker's comps",
  "Per-tab uploads and multi-document reconciliation",
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
  const isPro = billing?.isPro ?? false;
  const dealCount = billing?.dealCount ?? 0;
  const atLimit = !isPro && dealCount >= FREE_DEAL_LIMIT;

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
              {isPro ? "Pro" : "Free"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isPro ? "bg-pass/15 text-pass" : "bg-faint text-muted"
            }`}
          >
            {isPro ? "Active" : "Free tier"}
          </span>
        </div>

        {isPro ? (
          <>
            <p className="mt-4 text-sm text-muted">
              {billing?.currentPeriodEnd
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
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Deals used</span>
              <span className="font-mono tabular-nums">
                {dealCount} / {FREE_DEAL_LIMIT}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-faint">
              <div
                className={`h-full rounded-full ${atLimit ? "bg-caution" : "bg-brand"}`}
                style={{
                  width: `${Math.min(100, (dealCount / FREE_DEAL_LIMIT) * 100)}%`,
                }}
              />
            </div>
            {atLimit && (
              <p className="mt-3 rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution">
                You&apos;ve screened all {FREE_DEAL_LIMIT} free deals — the next
                OM needs Pro. Your existing deals stay right where they are.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Plan comparison */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Free */}
        <section className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Free</p>
            {!isPro && (
              <span className="rounded-full bg-faint px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                Your plan
              </span>
            )}
          </div>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight">$0</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            The full screen, on your first {FREE_DEAL_LIMIT} deals.
          </p>
          <ul className="mt-5 flex-1 space-y-2.5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-faint text-[10px] font-bold text-muted">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Pro */}
        <section className="shadow-float relative flex flex-col rounded-2xl border-2 border-brand bg-surface p-6">
          <span className="absolute -top-3 left-6 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">
            For active pipelines
          </span>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Pro</p>
            {isPro && (
              <span className="rounded-full bg-pass/15 px-2.5 py-0.5 text-[11px] font-semibold text-pass">
                Your plan
              </span>
            )}
          </div>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight">$39</span>
            <span className="text-sm text-muted">/month</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Unlimited screening, plus the artifacts you hand to your IC.
          </p>
          <ul className="mt-5 flex-1 space-y-2.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-pass/15 text-[10px] font-bold text-pass">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          {!isPro && (
            <form action={startCheckout} className="mt-6">
              <button
                type="submit"
                className="shadow-card hover-lift w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white"
              >
                Upgrade to Pro — {PRO_PRICE_LABEL}
              </button>
            </form>
          )}
        </section>
      </div>

      <p className="text-xs text-muted">
        Cancel anytime · billed monthly through Stripe · your deals and
        documents are never deleted when you downgrade. Working as a group?
        The{" "}
        <a href="/team" className="font-medium text-brand hover:text-brand-strong">
          Team plan
        </a>{" "}
        is $29/seat with one shared pipeline.
      </p>
    </div>
  );
}
