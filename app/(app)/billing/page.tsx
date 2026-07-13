import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getBilling,
  FREE_DEAL_LIMIT,
  PRO_PRICE_LABEL,
  TEAM_BASE_PRICE,
  TEAM_MEMBER_PRICE,
  teamMonthlyTotal,
  fmtUsd,
} from "@/lib/billing";
import { getTeam, TEAM_TRIAL_DEALS } from "@/lib/teams";
import { startCheckout, openPortal } from "./actions";
import { removeMember, openTeamPortal } from "../team/actions";
import { PendingButton } from "../pending-button";

export const metadata: Metadata = { title: "Billing" };

// Benefit-framed: what the feature does for you, not what it's called.
const FREE_FEATURES = [
  "3 deals with the full six-stage screen on each",
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
  searchParams: Promise<{ status?: string; error?: string; upsell?: string }>;
}) {
  const { status, error, upsell } = await searchParams;
  // Which Pro feature bounced the user here, for a contextual upsell line.
  const UPSELL_LABELS: Record<string, string> = {
    memo: "export the one-page IC memo",
    report: "export the full multi-page report",
    model: "export the Excel model",
    underwrite: "export the institutional underwriting model",
    loi: "export the LOI draft",
    branding: "put your firm's name and logo on exported reports",
  };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const billing = user ? await getBilling(supabase, user.id) : null;
  const isPro = billing?.isPro ?? false;
  const dealCount = billing?.dealCount ?? 0;
  const atLimit = !isPro && dealCount >= FREE_DEAL_LIMIT;
  // Full team detail (roster, seat count, renewal) for the Team section.
  const team = user && billing?.team ? await getTeam(supabase, user.id) : null;

  const banner =
    status === "success"
      ? { cls: "bg-pass/10 text-pass", text: "You're on Pro — everything's unlocked. Thank you!" }
      : status === "cancelled"
        ? { cls: "bg-faint text-muted", text: "Checkout cancelled — no charge was made." }
        : upsell
          ? {
              cls: "bg-brand/5 text-brand",
              text: `Upgrade to Pro to ${UPSELL_LABELS[upsell] ?? "unlock that"} — choose a plan below.`,
            }
        : error === "config"
          ? { cls: "bg-kill/10 text-kill", text: "Checkout isn't available right now — email underwritecopilot.support@gmail.com and we'll get you upgraded." }
          : error === "nocustomer"
            ? { cls: "bg-faint text-muted", text: "No subscription on file yet — start with Upgrade to Pro below." }
            : error === "save"
              ? { cls: "bg-kill/10 text-kill", text: "Couldn't save your billing profile — please try again." }
              : error === "exists"
                ? { cls: "bg-faint text-muted", text: "You already have an active subscription — if it still shows Free, activation can take a moment; refresh shortly." }
                : error === "checkout"
                  ? { cls: "bg-kill/10 text-kill", text: "Couldn't start checkout — please try again in a moment." }
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

      {/* Dunning: the plan stays active while Stripe retries the card, but
          the user needs to hear about it before the subscription cancels. */}
      {billing?.status === "past_due" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-caution/30 bg-caution/5 p-4">
          <p className="text-sm font-medium text-caution">
            Your last payment didn&rsquo;t go through. Your plan stays active
            while Stripe retries, but please update your payment method.
          </p>
          <form action={openPortal}>
            <PendingButton
              pendingLabel="Opening Stripe…"
              className="rounded-lg border border-caution/40 px-3.5 py-1.5 text-sm font-medium text-caution transition-colors hover:bg-caution/10"
            >
              Update payment method
            </PendingButton>
          </form>
        </div>
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
              <PendingButton
                pendingLabel="Opening Stripe…"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
              >
                Manage subscription
              </PendingButton>
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
            <span className="text-3xl font-semibold tracking-tight">$29.99</span>
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
              <PendingButton
                pendingLabel="Opening secure checkout…"
                className="shadow-card hover-lift w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white"
              >
                Upgrade to Pro — {PRO_PRICE_LABEL}
              </PendingButton>
            </form>
          )}
        </section>
      </div>

      {/* Team billing — plan, roster, per-member price, next invoice. */}
      {team ? (
        <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Team plan
              </p>
              <p className="mt-1 text-xl font-semibold">{team.name}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                team.planActive
                  ? "bg-pass/15 text-pass"
                  : "bg-faint text-muted"
              }`}
            >
              {team.planActive ? "Active" : "Trial"}
            </span>
          </div>

          {/* The invoice math, spelled out. */}
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-line bg-faint px-3 py-2">
              <dt className="text-muted">Base (includes the owner)</dt>
              <dd className="font-mono tabular-nums">{fmtUsd(TEAM_BASE_PRICE)}/mo</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line bg-faint px-3 py-2">
              <dt className="text-muted">
                Added members ({Math.max(0, team.seatCount - 1)} ×{" "}
                {fmtUsd(TEAM_MEMBER_PRICE)})
              </dt>
              <dd className="font-mono tabular-nums">
                {fmtUsd(Math.max(0, team.seatCount - 1) * TEAM_MEMBER_PRICE)}/mo
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-brand/25 bg-brand/[0.04] px-3 py-2 text-sm">
            <span className="font-medium">
              {team.planActive ? "Next invoice" : "Once the plan starts"}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {fmtUsd(teamMonthlyTotal(team.seatCount))}/mo
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {team.planActive
              ? `One subscription, ${team.seatCount} ${team.seatCount === 1 ? "seat" : "seats"} — adding or removing a member updates the seat count immediately and Stripe prorates the difference automatically.${
                  team.currentPeriodEnd
                    ? ` Renews ${new Date(team.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                    : ""
                }`
              : `Trial: ${Math.min(team.dealCount, TEAM_TRIAL_DEALS)} of ${TEAM_TRIAL_DEALS} shared deals used. Start the plan from the Team page when you're ready.`}
          </p>

          {/* Roster — the people the invoice is billing for. */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                Members ({team.seatCount})
              </h3>
              {team.role === "owner" && (
                <Link
                  href="/team"
                  className="text-xs font-medium text-brand transition-colors hover:text-brand-strong"
                >
                  Invite a member →
                </Link>
              )}
            </div>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {team.members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {m.fullName || m.email || "Teammate"}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {m.role === "owner"
                      ? "owner · in the base"
                      : fmtUsd(TEAM_MEMBER_PRICE) + "/mo"}
                  </span>
                  {team.role === "owner" && m.role !== "owner" && (
                    <form action={removeMember}>
                      <input type="hidden" name="memberId" value={m.userId} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-kill transition-colors hover:bg-kill/5"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {team.role === "owner" && team.planActive && (
              <p className="mt-2 text-xs text-muted">
                Removing a member drops the seat count — and the invoice — in
                the same action.
              </p>
            )}
          </div>

          {team.role === "owner" && team.planActive && (
            <form action={openTeamPortal} className="mt-4">
              <PendingButton
                pendingLabel="Opening Stripe…"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
              >
                Manage team subscription
              </PendingButton>
            </form>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted">
          Working as a group? The{" "}
          <a href="/team" className="font-medium text-brand hover:text-brand-strong">
            Team plan
          </a>{" "}
          is {fmtUsd(TEAM_BASE_PRICE)}/mo (that covers the owner) plus{" "}
          {fmtUsd(TEAM_MEMBER_PRICE)}/mo per added member — one shared
          pipeline, one subscription.
        </p>
      )}

      <p className="text-xs text-muted">
        Cancel anytime · billed monthly through Stripe · your deals and
        documents are never deleted when you downgrade.
      </p>
    </div>
  );
}
