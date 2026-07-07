import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/teams";
import { joinTeam } from "../../actions";
import { PendingButton } from "../../../pending-button";

export const metadata: Metadata = { title: "Join team" };

const ERRORS: Record<string, string> = {
  invalid:
    "This invite link is invalid or has expired. Ask your teammate for a fresh one.",
  already:
    "You're already on a team — leave it from the Team page before joining another.",
};

export default async function JoinTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const team = user ? await getTeam(supabase, user.id) : null;

  // Which team is this? (Migration 0015's definer RPC returns the name only
  // for a live token; pre-0015 or invalid token → null and the copy stays
  // generic.) Never join blind.
  let inviteTeamName: string | null = null;
  try {
    const { data } = await supabase.rpc("invite_team_name", { tok: token });
    inviteTeamName = (data as string | null) ?? null;
  } catch {
    inviteTeamName = null;
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <section className="shadow-card rounded-2xl border border-line bg-surface p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6" />
            <path d="M22 11h-6" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Join a shared pipeline
        </h1>

        {error && (
          <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
            {ERRORS[error] ?? "Something went wrong — try the link again."}
          </p>
        )}

        {team ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              You&apos;re already on <span className="font-medium text-ink">{team.name}</span>.
              You can be on one team at a time.
            </p>
            <Link
              href="/team"
              className="mt-5 inline-flex rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
            >
              Go to your team
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {inviteTeamName ? (
                <>
                  You&apos;ve been invited to{" "}
                  <span className="font-medium text-ink">{inviteTeamName}</span>{" "}
                  on Underwrite Copilot.
                </>
              ) : (
                <>You&apos;ve been invited to a team on Underwrite Copilot.</>
              )}{" "}
              Joining puts you and your teammates on one pipeline — same deals,
              same screens, same verdicts.
            </p>
            <form action={joinTeam} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <PendingButton
                pendingLabel="Joining…"
                className="shadow-card hover-lift rounded-lg bg-brand px-6 py-2.5 text-sm font-medium text-white"
              >
                Join the team
              </PendingButton>
            </form>
            <p className="mt-3 text-xs text-muted">
              Your existing personal deals stay personal.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
