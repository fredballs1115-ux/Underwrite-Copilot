import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { weeklyDigestEmail, type DigestInput } from "@/lib/email-template";
import { sendEmail, emailEnabled, occasionKey } from "@/lib/email";
import { STAGES, STAGE_LABEL, isOpenStage, normalizeStage } from "@/lib/stages";
import { emailPictureUrl } from "@/lib/email-picture";
import { emailUnsubscribeUrl, oneClickHeaders } from "@/lib/email-unsubscribe";
import { appUrl } from "@/lib/app-url";
import { listJobStatus, type JobLike } from "@/lib/screen-run";
import { readAll } from "@/lib/read-all";

/** A failed read's message, for the log. */
const messageOf = (e: unknown): string =>
  e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);

const VERDICT_EMAIL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: "#1b7a5e" },
  caution: { label: "Caution", color: "#a05a1c" },
  pass_on: { label: "No-go", color: "#b23a30" },
};

const DUE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DAY_MS = 86_400_000;

/** How many days of offer deadlines the digest lists, today included: from
 *  the digest's day through the sixth day after — a Monday's digest lists
 *  Monday through Sunday, and the heading names the last day. */
export const OFFERS_WINDOW_DAYS = 7;

/** How many deadlines, and how many calls, one digest lists. */
const LIST_MAX = 6;

/** How the digest marks a call its deal's latest screen has not replaced
 *  yet (lib/screen-run `listJobStatus`, the pipeline card's own read): a
 *  re-screen still running, one that stopped writing progress, or one that
 *  failed before its verdict. The call shown is the previous screen's. */
export const CALL_NOTE: Record<"running" | "stalled" | "failed", string> = {
  running: "Re-screening now",
  stalled: "Re-screen stalled",
  failed: "Re-screen failed",
};

export interface DigestDealRow {
  id: string;
  name: string;
  stage?: string | null;
  offers_due?: string | null;
  verdict?: { verdict?: string; generatedAt?: string } | null;
  updated_at: string;
  is_sample?: boolean | null;
  user_id: string;
  team_id: string | null;
}

/** A deal's job row, as far as the digest reads it. */
export interface DigestJobRow extends JobLike {
  deal_id: string;
  created_at?: string | null;
}

/** The week a digest belongs to: the date of its Monday (UTC). */
export function digestWeek(now: number): string {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday)).toISOString().slice(0, 10);
}

/** What one person's digest says, before the links around it. */
export type DigestContent = Pick<
  DigestInput,
  "stages" | "offersDue" | "offersDueTotal" | "offersThrough" | "verdicts" | "verdictsTotal"
> & { offersDueTotal: number; verdictsTotal: number };

const generatedAt = (d: DigestDealRow): string => d.verdict?.generatedAt ?? "";

/**
 * Every deal whose call landed in the last seven days, newest first.
 *
 * Real verdict recency: the pipeline stamps generatedAt on each verdict
 * generation. deals.updated_at bumps on ANY edit (a rename, a note) and
 * would fill this section with false positives. Pre-stamp verdicts simply
 * don't list — honest, not noisy.
 */
function callsThisWeek(deals: DigestDealRow[], now: number): DigestDealRow[] {
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
  return deals
    .filter((d) => d.verdict?.verdict && generatedAt(d) && generatedAt(d) >= weekAgo)
    .sort((a, b) => generatedAt(b).localeCompare(generatedAt(a)));
}

/** The calls of the last seven days the digest lists — the newest LIST_MAX,
 *  and so the ones whose job rows it reads; the rest are counted. */
export function recentVerdictDeals(deals: DigestDealRow[], now: number): DigestDealRow[] {
  return callsThisWeek(deals, now).slice(0, LIST_MAX);
}

/** Each deal's newest job row (a deal keeps one row that every run claims
 *  again; an older deal may still carry an earlier one beside it). */
export function newestJobs(rows: DigestJobRow[]): Map<string, DigestJobRow> {
  const out = new Map<string, DigestJobRow>();
  for (const row of rows) {
    const seen = out.get(row.deal_id);
    if (!seen || (row.created_at ?? "") > (seen.created_at ?? "")) out.set(row.deal_id, row);
  }
  return out;
}

/**
 * One person's digest, from the deals they see (the sample left out) and
 * the job rows of the deals whose calls it lists. Pure. Null where there is
 * nothing to say: no open deal at all.
 *
 *   - The count is of OPEN deals (lib/stages `isOpenStage`) and says so: a
 *     Closed deal had been counted as "live".
 *   - The deadlines are open deals' only — a dead or closed deal's offer
 *     date is no one's to meet — from today through the sixth day after,
 *     and the heading names that last day (`offersThrough`): "this week"
 *     had listed eight days, today through today + 7.
 *   - A call whose deal is being re-screened, or whose re-screen stalled or
 *     failed before its verdict, carries the note the pipeline card's read
 *     gives it (`CALL_NOTE`); a job that is no screen leaves the call alone.
 *   - Each list stops at LIST_MAX and counts the rest (`offersDueTotal`,
 *     `verdictsTotal`): the email says "and 9 more due by Sun, Oct 11 —
 *     open the pipeline", and the inbox preheader states the true count. A
 *     cut list had dropped nine of fifteen deadlines with no sign (research
 *     pass 42).
 */
export function buildDigest(
  deals: DigestDealRow[],
  jobs: ReadonlyMap<string, JobLike>,
  opts: {
    now: number;
    appUrl: string;
    /** the person the digest goes to: each square's link is signed for
     *  them, and serves only while they can still read its deal */
    recipient: string;
    pictureUrl?: (dealId: string) => string | null;
  },
): DigestContent | null {
  const { now } = opts;
  const dealUrl = (id: string) => `${opts.appUrl}/deals/${id}`;
  // The deal's own square beside its name (#464): its photograph, else the
  // cover its card wears.
  const pictureUrl = opts.pictureUrl ?? ((id: string) => emailPictureUrl(opts.appUrl, id, "thumb", opts.recipient));

  const open = deals.filter((d) => isOpenStage(normalizeStage(d.stage ?? null)));
  // Grouped in ladder order, zero rows dropped.
  const byStage = new Map<string, number>();
  for (const d of open) {
    const stage = normalizeStage(d.stage ?? null);
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
  }
  const stages = STAGES.filter((s) => byStage.has(s)).map((s) => ({
    label: STAGE_LABEL[s] ?? s,
    count: byStage.get(s)!,
  }));
  if (stages.length === 0) return null; // nothing open — nothing to say

  const today = new Date(now).toISOString().slice(0, 10);
  const through = new Date(Date.parse(`${today}T00:00:00Z`) + (OFFERS_WINDOW_DAYS - 1) * DAY_MS);
  const lastDay = through.toISOString().slice(0, 10);
  const dueThisWeek = open
    .filter((d) => d.offers_due && d.offers_due >= today && d.offers_due <= lastDay)
    .sort((a, b) => (a.offers_due! < b.offers_due! ? -1 : a.offers_due! > b.offers_due! ? 1 : 0));
  const offersDue = dueThisWeek.slice(0, LIST_MAX).map((d) => ({
    name: d.name,
    due: DUE_FMT.format(new Date(`${d.offers_due}T00:00:00Z`)),
    url: dealUrl(d.id),
    pictureUrl: pictureUrl(d.id),
  }));

  const calls = callsThisWeek(deals, now);
  const verdicts = calls.slice(0, LIST_MAX).map((d) => {
    const v = VERDICT_EMAIL[d.verdict!.verdict!] ?? { label: "Screened", color: "#114e54" };
    const status = listJobStatus(jobs.get(d.id) ?? null, true, now);
    return {
      name: d.name,
      label: v.label,
      color: v.color,
      url: dealUrl(d.id),
      pictureUrl: pictureUrl(d.id),
      note: status ? CALL_NOTE[status] : null,
    };
  });

  return {
    stages,
    offersDue,
    offersDueTotal: dueThisWeek.length,
    offersThrough: DUE_FMT.format(through),
    verdicts,
    verdictsTotal: calls.length,
  };
}

/**
 * Send the Monday pipeline digest to every opted-in user with open deals.
 * Runs from the WORKER on a weekly tick; wholly best-effort — a failure for
 * one user never blocks the rest, and `last_digest_at` makes re-runs safe.
 *
 * Returns how many digests were sent (the rig asserts on it). `now` and the
 * pause between sends are the test's to set.
 */
export async function runWeeklyDigests(
  admin: SupabaseClient,
  opts: { now?: number; pauseMs?: number } = {},
): Promise<number> {
  if (!emailEnabled()) return 0;
  const now = opts.now ?? Date.now();
  const pauseMs = opts.pauseMs ?? 600;

  // Everyone still opted in whose last digest is older than 5 days — the
  // guard makes an accidental double-tick (or a worker restart mid-run)
  // idempotent instead of double-sending. The cutoff is the query's, the
  // claim's own `.or` below, and the read pages in id order (lib/read-all):
  // the opt-in is on by default for every profile, and one capped read had
  // seen at most the project's max rows, in no stated order, each later tick
  // reading mostly the same already-stamped rows (research pass 42).
  const cutoff = new Date(now - 5 * DAY_MS).toISOString();
  const due = await readAll<{ id: string; last_digest_at: string | null }>(
    (from, to) =>
      admin
        .from("profiles")
        .select("id, last_digest_at")
        .eq("email_weekly_digest", true)
        .or(`last_digest_at.is.null,last_digest_at.lt.${cutoff}`)
        .order("id")
        .range(from, to),
    // The dominant failure class must never be invisible — a silent zero
    // here reads exactly like a normal quiet week.
    (e) => console.error("[digest] profiles query failed:", messageOf(e)),
  );
  if (!due) return 0;

  const site = appUrl();
  let sent = 0;
  for (const profile of due) {
    try {
      // CLAIM before send: a conditional stamp makes concurrent workers
      // (deploy overlap) and repeat ticks at-most-once per user. On a failed
      // send the claim is released so the next tick retries.
      const { data: claimed, error: claimErr } = await admin
        .from("profiles")
        .update({ last_digest_at: new Date(now).toISOString() })
        .eq("id", profile.id)
        .or(`last_digest_at.is.null,last_digest_at.lt.${cutoff}`)
        .select("id");
      if (claimErr) {
        console.error(`[digest] claim failed for ${profile.id}:`, claimErr.message);
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another worker won

      const release = () =>
        admin
          .from("profiles")
          .update({ last_digest_at: profile.last_digest_at })
          .eq("id", profile.id);

      // Deals this user sees: their own plus their team's (mirrors the app's
      // pipeline view, which is what the digest summarizes). A membership
      // read that FAILED is not "on no team": a personal-only digest would
      // go out under the claim, which would keep the whole digest from being
      // retried, so the claim is released and the user waits for the next
      // tick.
      const { data: mem, error: memErr } = await admin
        .from("team_members")
        .select("team_id")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (memErr) {
        console.error(`[digest] team membership read failed for ${profile.id} — will retry next tick:`, memErr.message);
        await release();
        continue;
      }
      const teamId = (mem?.team_id as string) ?? null;

      // Every one of them, a page at a time in id order: the count, the
      // stages and the deadlines are of the whole pipeline, never of the
      // first response's rows.
      const dealRows = await readAll<DigestDealRow>(
        (from, to) => {
          const query = admin
            .from("deals")
            .select("id, name, stage, offers_due, verdict, updated_at, is_sample, user_id, team_id");
          return (teamId ? query.or(`user_id.eq.${profile.id},team_id.eq.${teamId}`) : query.eq("user_id", profile.id))
            .order("id")
            .range(from, to);
        },
        (e) => console.error(`[digest] deals query failed for ${profile.id}:`, messageOf(e)),
      );
      if (!dealRows) {
        await release();
        continue;
      }
      const deals = dealRows.filter((d) => !d.is_sample);
      if (deals.length === 0) continue;

      // The job rows of the deals whose calls the digest lists — ONE read
      // for all of them — so a call a re-screen is replacing is marked as
      // the pipeline card marks it. A failed read marks nothing and says so.
      const listed = recentVerdictDeals(deals, now).map((d) => d.id);
      let jobs = new Map<string, DigestJobRow>();
      if (listed.length > 0) {
        const { data: jobRows, error: jobsErr } = await admin
          .from("analysis_jobs")
          .select("deal_id, status, step, updated_at, created_at")
          .in("deal_id", listed);
        if (jobsErr) console.error(`[digest] job rows read failed for ${profile.id} — calls unmarked:`, jobsErr.message);
        else jobs = newestJobs((jobRows ?? []) as DigestJobRow[]);
      }

      const content = buildDigest(deals, jobs, { now, appUrl: site, recipient: profile.id });
      if (!content) continue; // nothing open — nothing to say

      const { data: userRes } = await admin.auth.admin.getUserById(profile.id);
      const to = userRes?.user?.email;
      if (!to) continue;

      // One click turns this digest off for this person (lib/email-
      // unsubscribe): a link in the footer, and the List-Unsubscribe pair a
      // mail provider's own button POSTs to.
      const unsubscribeUrl = emailUnsubscribeUrl(site, profile.id, "digest");
      const { subject, html, text } = weeklyDigestEmail({
        ...content,
        pipelineUrl: `${site}/deals`,
        settingsUrl: `${site}/account`,
        unsubscribeUrl,
      });
      // One digest a person a week: a send that timed out after Resend took
      // it, and the retry the released claim brings, share this key, so the
      // retry inside Resend's 24 hours is not a second email.
      const ok = await sendEmail(to, subject, html, text, {
        idempotencyKey: occasionKey("weekly-digest", profile.id, digestWeek(now)),
        headers: unsubscribeUrl ? oneClickHeaders(unsubscribeUrl) : null,
      });
      if (!ok) {
        // Release the claim so the next tick retries instead of the guard
        // blocking a digest that never actually went out.
        console.error(`[digest] send failed for ${profile.id} — will retry next tick`);
        await release();
        continue;
      }
      sent += 1;
      // Stay under Resend's request-per-second ceiling as the list grows.
      if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    } catch (err) {
      console.error(
        `[digest] failed for ${profile.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return sent;
}
