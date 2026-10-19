import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
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
import { dealAllowance, type AllowancePool } from "@/lib/deal-allowance";
import { FREE_PLAN, PRICE_PRO_MONTHLY, PRO_PLAN_LINES, PRO_UPSELL } from "@/lib/marketing-constants";
import { startCheckout, openPortal } from "./actions";
import { removeMember, openTeamPortal } from "../team/actions";
import { PendingButton } from "../pending-button";
import { PersonBadge } from "../person-badge";
import { ConfirmSubmit } from "../team/team-client";
import { LEAVING_KEEPS } from "@/lib/team-leaving";
import { personName } from "@/lib/person";
import { SEAT_SYNC, SEAT_SYNC_REMOVE, planShownOf, renewsOn } from "@/lib/billing-view";
import { cookies } from "next/headers";
import { TZ_COOKIE, readerTimeZone } from "@/lib/reader-day";

export const metadata: Metadata = { title: "Billing" };

// The plan cards draw the homepage's own lists (lib/marketing-constants),
// each Pro line held to the gate that makes it Pro.

// Billing failures, in a customer's words. A setup problem on our side —
// the config codes from lib/stripe/diagnose.ts — reads as checkout not being
// available, with where to write; which knob is wrong goes to the server log
// for the operator (`stripeErrorCode`), never onto a customer's page.
const UNAVAILABLE = { cls: "bg-kill/10 text-kill", text: "Checkout isn't available right now — email underwritecopilot.support@gmail.com and we'll get you upgraded." };
const BILLING_ERRORS: Record<string, { cls: string; text: string }> = {
  config: UNAVAILABLE,
  stripekey: UNAVAILABLE,
  price: UNAVAILABLE,
  pricetype: UNAVAILABLE,
  appurl: UNAVAILABLE,
  nocustomer: { cls: "bg-faint text-muted", text: "No subscription on file yet — start with Upgrade to Pro below." },
  save: { cls: "bg-kill/10 text-kill", text: "Couldn't save your billing profile — please try again." },
  exists: { cls: "bg-faint text-muted", text: "You already have an active subscription — if it still shows Free, activation can take a moment; refresh shortly." },
  checkout: { cls: "bg-kill/10 text-kill", text: "Couldn't start checkout — please try again in a moment." },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; upsell?: string }>;
}) {
  const { status, error, upsell } = await searchParams;
  // Which Pro feature bounced the user here, for a contextual upsell line —
  // a key the refusals send, and an own key only: a link naming
  // "constructor" had printed Object's source into the banner.
  const upsellWords =
    upsell && Object.hasOwn(PRO_UPSELL, upsell) ? PRO_UPSELL[upsell as keyof typeof PRO_UPSELL] : null;
  const supabase = await createSupabaseServerClient();
  // Request-cached: the (app) layout's own auth call, not a second hop.
  const user = await getCurrentUser();
  const billing = user ? await getBilling(supabase, user.id) : null;
  const isPro = billing?.isPro ?? false;
  // The pools the next deal comes out of, by the create action's own rule
  // (lib/deal-allowance): a team's trial first, then the reader's own. The
  // page had counted the reader's own deals alone, and told a team-trial
  // member "the next OM needs Pro" while the pipeline's meter, and the
  // create action, still had team deals left (the audit of 2026-10-01).
  const allowance = billing ? dealAllowance(billing) : null;
  const atLimit = !isPro && allowance?.next === null;
  const pools = [
    allowance?.teamTrial ? { label: "Team trial deals", pool: allowance.teamTrial } : null,
    allowance?.personal ? { label: allowance.teamTrial ? "Your own free deals" : "Deals used", pool: allowance.personal } : null,
  ].filter((x): x is { label: string; pool: AllowancePool } => x !== null);
  // Full team detail (roster, seat count, renewal) for the Team section.
  const team = user && billing?.team ? await getTeam(supabase, user.id) : null;
  // The plan the reader pays for, else the team's (lib/billing-view): a
  // Team-plan member has no subscription of their own to manage.
  const shown = planShownOf(billing);
  // A renewal day on the reader's own calendar, never the server's UTC one.
  const timeZone = readerTimeZone((await cookies()).get(TZ_COOKIE)?.value);
  // Each subscription's own dunning: the reader's, and the team's, whose
  // card only its owner can update.
  const teamPastDue = !!team?.planActive && team.subscriptionStatus === "past_due";

  const banner =
    // Stripe returns the buyer here when checkout completes, which can be a
    // moment before its webhook switches the plan: "You're on Pro" waits for
    // the plan to say so.
    status === "success"
      ? isPro
        ? { cls: "bg-pass/10 text-pass", text: "You're on Pro — everything's unlocked. Thank you!" }
        : { cls: "bg-faint text-muted", text: "Checkout complete — your plan switches to Pro as soon as Stripe confirms it, usually within a minute. Refresh shortly." }
      : status === "cancelled"
        ? { cls: "bg-faint text-muted", text: "Checkout cancelled — no charge was made." }
        : upsell
          ? {
              cls: "bg-brand/5 text-brand",
              text: `Upgrade to Pro to ${upsellWords ?? "unlock that"} — choose a plan below.`,
            }
        : error
          ? (BILLING_ERRORS[error] ?? null)
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
      {teamPastDue && team && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-caution/30 bg-caution/5 p-4">
          <p className="text-sm font-medium text-caution">
            {team.name}&rsquo;s last payment for the Team plan didn&rsquo;t go
            through. The plan stays active while Stripe retries
            {team.role === "owner"
              ? ", but please update the team's payment method."
              : " — the team's owner can update the payment method."}
          </p>
          {team.role === "owner" && (
            <form action={openTeamPortal}>
              <PendingButton
                pendingLabel="Opening Stripe…"
                className="rounded-lg border border-caution/40 px-3.5 py-1.5 text-sm font-medium text-caution transition-colors hover:bg-caution/10"
              >
                Update team payment method
              </PendingButton>
            </form>
          )}
        </div>
      )}

      {/* Current plan */}
      <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Current plan
            </p>
            <p className="mt-1 text-xl font-semibold">{shown.label}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isPro ? "bg-pass/10 text-pass" : "bg-faint text-muted"
            }`}
          >
            {shown.badge}
          </span>
        </div>

        {shown.kind === "team" ? (
          <p className="mt-4 text-sm text-muted">
            Every Pro feature comes with {shown.teamName}&rsquo;s Team plan,
            and you have no subscription of your own to manage —{" "}
            {team?.role === "owner"
              ? "the team's subscription is managed from the Team page."
              : "the team's owner manages its subscription."}{" "}
            <Link href="/team" className="font-medium text-brand hover:text-brand-strong">
              Team page →
            </Link>
          </p>
        ) : shown.kind === "personal" ? (
          <>
            <p className="mt-4 text-sm text-muted">
              {billing?.currentPeriodEnd
                ? `Renews ${renewsOn(billing.currentPeriodEnd, timeZone)}.`
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
          <div className="mt-4 space-y-3">
            {pools.map(({ label, pool }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono tabular-nums">
                    {pool.used} / {pool.of}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-faint">
                  <div
                    className={`h-full rounded-full ${pool.used >= pool.of ? "bg-caution" : "bg-brand"}`}
                    style={{ width: `${Math.min(100, (pool.used / pool.of) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {atLimit && (
              <p className="rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution">
                {allowance?.teamTrial
                  ? `Your team's ${TEAM_TRIAL_DEALS} trial deals and your own ${FREE_DEAL_LIMIT} free deals are all in use — the next OM needs Pro.`
                  : `Your ${FREE_DEAL_LIMIT} free deals are all in use — the next OM needs Pro.`}{" "}
                Your existing deals stay right where they are.
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
            The full screen, on up to {FREE_DEAL_LIMIT} deals.
          </p>
          <ul className="mt-5 flex-1 space-y-2.5">
            {FREE_PLAN.map((f) => (
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
              <span className="rounded-full bg-pass/10 px-2.5 py-0.5 text-[11px] font-semibold text-pass">
                {shown.kind === "team" ? "Through your team" : "Your plan"}
              </span>
            )}
          </div>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight">{PRICE_PRO_MONTHLY}</span>
            <span className="text-sm text-muted">/month</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Unlimited screening, plus the artifacts you hand to your IC.
          </p>
          <ul className="mt-5 flex-1 space-y-2.5">
            {PRO_PLAN_LINES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-pass/10 text-[10px] font-bold text-pass">
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
                  ? "bg-pass/10 text-pass"
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
              ? `One subscription, ${team.seatCount} ${team.seatCount === 1 ? "seat" : "seats"}. ${SEAT_SYNC}${
                  team.currentPeriodEnd
                    ? ` Renews ${renewsOn(team.currentPeriodEnd, timeZone)}.`
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
                  <PersonBadge name={personName(m.fullName, m.email)} id={m.userId} size="sm" decorative />
                  <span className="min-w-0 flex-1 truncate">
                    {personName(m.fullName, m.email)}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {m.role === "owner"
                      ? "owner · in the base"
                      : fmtUsd(TEAM_MEMBER_PRICE) + "/mo"}
                  </span>
                  {team.role === "owner" && m.role !== "owner" && (
                    <form action={removeMember}>
                      <input type="hidden" name="memberId" value={m.userId} />
                      {/* The team page's own confirmation (lib/team-leaving). */}
                      <ConfirmSubmit
                        label="Remove"
                        confirmText={`Remove ${personName(m.fullName, m.email)} from ${team.name}? ${LEAVING_KEEPS.them}`}
                        danger
                      />
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {team.role === "owner" && team.planActive && (
              <p className="mt-2 text-xs text-muted">
                {SEAT_SYNC_REMOVE}
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
