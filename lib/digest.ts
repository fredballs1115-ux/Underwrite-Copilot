import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { weeklyDigestEmail } from "@/lib/email-template";
import { sendEmail, emailEnabled } from "@/lib/email";
import { STAGES, STAGE_LABEL, normalizeStage } from "@/lib/stages";

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

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";
}

interface DigestDealRow {
  id: string;
  name: string;
  stage?: string | null;
  offers_due?: string | null;
  verdict?: { verdict?: string } | null;
  updated_at: string;
  is_sample?: boolean | null;
  user_id: string;
  team_id: string | null;
}

/**
 * Send the Monday pipeline digest to every opted-in user with live deals.
 * Runs from the WORKER on a weekly tick; wholly best-effort — a failure for
 * one user never blocks the rest, and `last_digest_at` makes re-runs safe.
 *
 * Returns how many digests were sent (the rig asserts on it).
 */
export async function runWeeklyDigests(admin: SupabaseClient): Promise<number> {
  if (!emailEnabled()) return 0;

  // Everyone still opted in whose last digest is older than 5 days — the
  // guard makes an accidental double-tick (or a worker restart mid-run)
  // idempotent instead of double-sending.
  const cutoff = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, email_weekly_digest, last_digest_at")
    .eq("email_weekly_digest", true);
  if (profErr) {
    // The dominant failure class must never be invisible — a silent zero
    // here reads exactly like a normal quiet week.
    console.error("[digest] profiles query failed:", profErr.message);
    return 0;
  }
  const due = ((profiles ?? []) as {
    id: string;
    last_digest_at: string | null;
  }[]).filter((p) => !p.last_digest_at || p.last_digest_at < cutoff);

  let sent = 0;
  for (const profile of due) {
    try {
      // CLAIM before send: a conditional stamp makes concurrent workers
      // (deploy overlap) and repeat ticks at-most-once per user. On a failed
      // send the claim is released so the next tick retries.
      const { data: claimed, error: claimErr } = await admin
        .from("profiles")
        .update({ last_digest_at: new Date().toISOString() })
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
      // pipeline view, which is what the digest summarizes).
      const { data: mem } = await admin
        .from("team_members")
        .select("team_id")
        .eq("user_id", profile.id)
        .maybeSingle();
      const teamId = (mem?.team_id as string) ?? null;

      let query = admin
        .from("deals")
        .select("id, name, stage, offers_due, verdict, updated_at, is_sample, user_id, team_id");
      query = teamId
        ? query.or(`user_id.eq.${profile.id},team_id.eq.${teamId}`)
        : query.eq("user_id", profile.id);
      const { data: dealRows, error: dealsErr } = await query;
      if (dealsErr) {
        console.error(`[digest] deals query failed for ${profile.id}:`, dealsErr.message);
        await release();
        continue;
      }
      const deals = ((dealRows ?? []) as DigestDealRow[]).filter((d) => !d.is_sample);
      if (deals.length === 0) continue;

      // Live = not dead; grouped in ladder order, zero rows dropped.
      const byStage = new Map<string, number>();
      for (const d of deals) {
        const stage = normalizeStage((d.stage as string) ?? "screening");
        if (stage === "dead") continue;
        byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
      }
      const stages = STAGES.filter((s) => byStage.has(s)).map((s) => ({
        label: STAGE_LABEL[s] ?? s,
        count: byStage.get(s)!,
      }));
      if (stages.length === 0) continue; // everything dead — nothing to say

      const weekAhead = new Date(Date.now() + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const offersDue = deals
        .filter(
          (d) =>
            d.offers_due && d.offers_due >= today && d.offers_due <= weekAhead,
        )
        .sort((a, b) => (a.offers_due! < b.offers_due! ? -1 : 1))
        .slice(0, 6)
        .map((d) => ({
          name: d.name,
          due: DUE_FMT.format(new Date(`${d.offers_due}T00:00:00Z`)),
          url: `${appUrl()}/deals/${d.id}`,
        }));

      // Real verdict recency: the pipeline stamps generatedAt on each verdict
      // generation. deals.updated_at bumps on ANY edit (a rename, a note) and
      // would fill this section with false positives. Pre-stamp verdicts
      // simply don't list — honest, not noisy.
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const verdicts = deals
        .filter(
          (d) =>
            d.verdict?.verdict &&
            (d.verdict as { generatedAt?: string }).generatedAt &&
            (d.verdict as { generatedAt?: string }).generatedAt! >= weekAgo,
        )
        .sort((a, b) =>
          ((b.verdict as { generatedAt?: string }).generatedAt ?? "").localeCompare(
            (a.verdict as { generatedAt?: string }).generatedAt ?? "",
          ),
        )
        .slice(0, 6)
        .map((d) => {
          const v = VERDICT_EMAIL[d.verdict!.verdict!] ?? {
            label: "Screened",
            color: "#114e54",
          };
          return {
            name: d.name,
            label: v.label,
            color: v.color,
            url: `${appUrl()}/deals/${d.id}`,
          };
        });

      const { data: userRes } = await admin.auth.admin.getUserById(profile.id);
      const to = userRes?.user?.email;
      if (!to) continue;

      const { subject, html, text } = weeklyDigestEmail({
        stages,
        offersDue,
        verdicts,
        pipelineUrl: `${appUrl()}/deals`,
        settingsUrl: `${appUrl()}/account`,
      });
      const ok = await sendEmail(to, subject, html, text);
      if (!ok) {
        // Release the claim so the next tick retries instead of the guard
        // blocking a digest that never actually went out.
        console.error(`[digest] send failed for ${profile.id} — will retry next tick`);
        await release();
        continue;
      }
      sent += 1;
      // Stay under Resend's request-per-second ceiling as the list grows.
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.error(
        `[digest] failed for ${profile.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return sent;
}
