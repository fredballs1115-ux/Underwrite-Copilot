import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeam, memberLabel, TEAM_TRIAL_DEALS } from "@/lib/teams";
import { TEAM_PRICE_LABEL, teamMonthlyTotal, fmtUsd } from "@/lib/billing";
import {
  createTeam,
  createInvite,
  revokeInvite,
  removeMember,
  leaveTeam,
  startTeamCheckout,
  openTeamPortal,
} from "./actions";
import { CopyLinkButton, ConfirmSubmit } from "./team-client";
import { PendingButton } from "../pending-button";

export const metadata: Metadata = { title: "Team" };

const MESSAGES: Record<string, { cls: string; text: string }> = {
  created: { cls: "bg-pass/10 text-pass", text: "Team created — invite your first teammate below." },
  success: { cls: "bg-pass/10 text-pass", text: "Team plan active — the shared pipeline is unlimited. Thank you!" },
  cancelled: { cls: "bg-faint text-muted", text: "Checkout cancelled — no charge was made." },
  name: { cls: "bg-kill/10 text-kill", text: "Give the team a name." },
  already: { cls: "bg-kill/10 text-kill", text: "You're already on a team — leave it before creating or joining another." },
  create: { cls: "bg-kill/10 text-kill", text: "Couldn't create the team — please try again. If it keeps failing, email underwritecopilot.support@gmail.com." },
  owner: { cls: "bg-kill/10 text-kill", text: "Only the team owner can do that." },
  invite: { cls: "bg-kill/10 text-kill", text: "Couldn't create the invite — please try again." },
  remove: { cls: "bg-kill/10 text-kill", text: "Couldn't remove that member — please try again." },
  leave: { cls: "bg-kill/10 text-kill", text: "Couldn't leave the team — please try again." },
  ownerleave: { cls: "bg-kill/10 text-kill", text: "Owners can't leave their own team. Transfer isn't supported yet — email underwritecopilot.support@gmail.com and we'll handle it." },
  config: { cls: "bg-kill/10 text-kill", text: "Team checkout isn't available right now — email underwritecopilot.support@gmail.com and we'll get you set up." },
  save: { cls: "bg-kill/10 text-kill", text: "Couldn't save the team's billing profile — please try again." },
  checkout: { cls: "bg-kill/10 text-kill", text: "Couldn't start checkout — please try again." },
  nocustomer: { cls: "bg-faint text-muted", text: "No team subscription on file yet — start with the Team plan below." },
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string; status?: string }>;
}) {
  const { created, error, status } = await searchParams;
  const banner = created
    ? MESSAGES.created
    : status
      ? MESSAGES[status]
      : error
        ? MESSAGES[error]
        : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const team = user ? await getTeam(supabase, user.id) : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const invites = team && team.role === "owner"
    ? ((
        await supabase
          .from("team_invites")
          .select("id, token, created_at, expires_at")
          .eq("team_id", team.id)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      ).data ?? [])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted">
          One shared pipeline — every teammate sees, screens, and compares the
          same deals.
        </p>
      </div>

      {banner && (
        <p className={`rounded-lg px-3 py-2 text-sm ${banner.cls}`}>
          {banner.text}
        </p>
      )}

      {!team ? (
        <>
          {/* Create */}
          <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-sm font-semibold tracking-tight">
              Create your team
            </h2>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted">
              Name it, invite teammates with a link, and every deal anyone
              uploads lands in one shared pipeline. Your existing personal
              deals stay personal.
            </p>
            <form action={createTeam} className="mt-4 flex max-w-md gap-2">
              <input
                name="name"
                required
                maxLength={80}
                placeholder="Team name — e.g. Meridian Acquisitions"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
              />
              <PendingButton
                pendingLabel="Creating…"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Create team
              </PendingButton>
            </form>
          </section>

          {/* How it works */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight">
              How teams work
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {[
                "Everyone on the team sees the same pipeline — deals, verdicts, models, and memos.",
                `The first ${TEAM_TRIAL_DEALS} shared deals are free to try. After that, the Team plan is ${TEAM_PRICE_LABEL} — billed only for the seats you actually have.`,
                "The Team plan unlocks the Excel model, PDF memo, and comp search for every member.",
                "Joining is one click on an invite link. You can be on one team at a time.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Have an invite link? Just open it while signed in.
            </p>
          </section>
        </>
      ) : (
        <>
          {/* Team header */}
          <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Your team
                </p>
                <p className="mt-1 text-xl font-semibold">{team.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {team.seatCount} {team.seatCount === 1 ? "seat" : "seats"} ·{" "}
                  {team.dealCount} shared{" "}
                  {team.dealCount === 1 ? "deal" : "deals"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  team.planActive
                    ? "bg-pass/15 text-pass"
                    : "bg-faint text-muted"
                }`}
              >
                {team.planActive ? "Team plan active" : "Trial"}
              </span>
            </div>
          </section>

          {/* Members */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight">Members</h2>
            <ul className="mt-3 divide-y divide-line">
              {team.members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold uppercase text-brand">
                      {memberLabel(m).charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {memberLabel(m)}
                        {m.userId === user?.id && (
                          <span className="text-muted"> (you)</span>
                        )}
                      </p>
                      {m.email && m.fullName && (
                        <p className="truncate text-xs text-muted">{m.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-faint px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted">
                      {m.role}
                    </span>
                    {team.role === "owner" && m.userId !== user?.id && (
                      <form action={removeMember}>
                        <input type="hidden" name="memberId" value={m.userId} />
                        <ConfirmSubmit
                          label="Remove"
                          confirmText={`Remove ${memberLabel(m)} from ${team.name}? Their deals stay in the team pipeline.`}
                          danger
                        />
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {team.role !== "owner" && (
              <form action={leaveTeam} className="mt-4 border-t border-line pt-4">
                <ConfirmSubmit
                  label="Leave team"
                  confirmText={`Leave ${team.name}? You'll stop seeing the shared pipeline.`}
                  danger
                />
              </form>
            )}
          </section>

          {/* Invites — owner only */}
          {team.role === "owner" && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">
                    Invite teammates
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Each link works until it expires (14 days) and can be
                    revoked anytime.
                  </p>
                </div>
                <form action={createInvite}>
                  <PendingButton
                    pendingLabel="Creating link…"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
                  >
                    + New invite link
                  </PendingButton>
                </form>
              </div>
              {invites.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {(invites as { id: string; token: string; expires_at: string }[]).map(
                    (inv) => {
                      const url = `${appUrl}/team/join/${inv.token}`;
                      return (
                        <li
                          key={inv.id}
                          className="flex items-center gap-2 rounded-lg border border-line bg-faint px-3 py-2"
                        >
                          <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                            {url}
                          </code>
                          <CopyLinkButton url={url} />
                          <form action={revokeInvite}>
                            <input type="hidden" name="inviteId" value={inv.id} />
                            <button
                              type="submit"
                              className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-kill transition-colors hover:bg-kill/5"
                            >
                              Revoke
                            </button>
                          </form>
                        </li>
                      );
                    },
                  )}
                </ul>
              )}
            </section>
          )}

          {/* Billing */}
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight">
              Team billing
            </h2>
            {team.planActive ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Team plan · {TEAM_PRICE_LABEL} ·{" "}
                  {fmtUsd(teamMonthlyTotal(team.seatCount))}/mo for{" "}
                  {team.seatCount} {team.seatCount === 1 ? "seat" : "seats"}
                  {team.currentPeriodEnd
                    ? ` · renews ${new Date(team.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                    : ""}
                  . Adding or removing a member updates the seat count and
                  Stripe prorates automatically.
                </p>
                {team.role === "owner" && (
                  <form action={openTeamPortal} className="mt-4">
                    <PendingButton
                      pendingLabel="Opening Stripe…"
                      className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
                    >
                      Manage subscription
                    </PendingButton>
                  </form>
                )}
              </>
            ) : (
              <>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Trial deals used</span>
                    <span className="font-mono tabular-nums">
                      {Math.min(team.dealCount, TEAM_TRIAL_DEALS)} /{" "}
                      {TEAM_TRIAL_DEALS}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-faint">
                    <div
                      className={`h-full rounded-full ${
                        team.dealCount >= TEAM_TRIAL_DEALS
                          ? "bg-caution"
                          : "bg-brand"
                      }`}
                      style={{
                        width: `${Math.min(100, (team.dealCount / TEAM_TRIAL_DEALS) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">
                  The Team plan is {TEAM_PRICE_LABEL} — with{" "}
                  {team.seatCount} {team.seatCount === 1 ? "seat" : "seats"}{" "}
                  today that&apos;s {fmtUsd(teamMonthlyTotal(team.seatCount))}
                  /mo. Unlimited shared deals, and every member gets the Excel
                  model, PDF memo, and comp search.
                </p>
                {team.role === "owner" ? (
                  <form action={startTeamCheckout} className="mt-4">
                    <PendingButton
                      pendingLabel="Opening secure checkout…"
                      className="shadow-card hover-lift rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white"
                    >
                      Start Team plan — {TEAM_PRICE_LABEL}
                    </PendingButton>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-muted">
                    Only the team owner can start the plan.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
