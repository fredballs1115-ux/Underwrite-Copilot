import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analysisReadyEmail } from "@/lib/email-template";
import { evaluateBuyBox } from "@/lib/criteria";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import type { ExtractionResult, VerdictResult } from "@/lib/anthropic/types";

/**
 * Analysis-ready email via Resend's REST API (plain fetch — no SDK to carry).
 * Key-ready by design: without RESEND_API_KEY the feature is silently off and
 * nothing here can ever crash the analysis pipeline.
 *
 * Env:
 *   RESEND_API_KEY   enables sending
 *   RESEND_FROM      verified sender (falls back to Resend's onboarding one)
 *   RESEND_BASE_URL  test override for the API host
 */

const VERDICT_EMAIL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: "#1b7a5e" },
  caution: { label: "Caution", color: "#a05a1c" },
  pass_on: { label: "No-go", color: "#b23a30" },
};

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const base = process.env.RESEND_BASE_URL ?? "https://api.resend.com";
  const from =
    process.env.RESEND_FROM ?? "Underwrite Copilot <onboarding@resend.dev>";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[email] resend responded ${res.status} for "${subject}"`);
    }
    return res.ok;
  } catch (err) {
    console.error(
      `[email] send failed for "${subject}":`,
      err instanceof Error ? err.message : err,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One email per completed analysis: deal name, buy-box verdict, link to the
 * report. Fully best-effort — reads the owner's toggle (default ON, including
 * on a pre-0014 schema where the column doesn't exist yet), derives the same
 * buy-box chip the deal header shows, and swallows every failure.
 */
export async function notifyAnalysisReady(
  admin: SupabaseClient,
  dealId: string,
): Promise<void> {
  if (!emailEnabled()) return;
  try {
    const { data: deal } = await admin
      .from("deals")
      .select("name, user_id, team_id, asset_class, extraction, verdict, is_sample")
      .eq("id", dealId)
      .maybeSingle();
    if (!deal || deal.is_sample) return;
    const verdict = deal.verdict as VerdictResult | null;
    if (!verdict?.verdict) return;

    // The per-user toggle — ON by default, and ON when the column predates
    // migration 0014 (the select just errors; never block the email feature
    // on schema lag, and never crash on it either).
    let wants = true;
    try {
      const { data: prefs, error } = await admin
        .from("profiles")
        .select("email_on_analysis")
        .eq("id", deal.user_id as string)
        .maybeSingle();
      if (!error && prefs && prefs.email_on_analysis === false) wants = false;
    } catch {
      // pre-0014 schema — default on
    }
    if (!wants) return;

    const { data: userRes } = await admin.auth.admin.getUserById(
      deal.user_id as string,
    );
    const to = userRes?.user?.email;
    if (!to) return;

    // Same buy-box chip the deal header derives.
    let buyBoxLabel = "Buy box unverified";
    try {
      const box = await getBuyBoxForDeal(
        deal.user_id as string,
        (deal.team_id as string) ?? null,
      );
      if (box) {
        const checks = evaluateBuyBox(
          (deal.asset_class as string) ?? "auto",
          (deal.extraction as ExtractionResult) ?? null,
          box,
        );
        buyBoxLabel = checks.some((c) => c.status === "miss")
          ? "Outside buy box"
          : checks.some((c) => c.status === "near")
            ? "Near buy box"
            : checks.length > 0 && checks.every((c) => c.status === "pass")
              ? "Fits buy box"
              : "Buy box unverified";
      } else {
        buyBoxLabel = "No buy box set";
      }
    } catch {
      // keep the default label
    }

    const v = VERDICT_EMAIL[verdict.verdict] ?? {
      label: "Screened",
      color: "#114e54",
    };
    const { subject, html, text } = analysisReadyEmail({
      dealName: (deal.name as string) ?? "Your deal",
      verdictLabel: v.label,
      verdictColor: v.color,
      buyBoxLabel,
      reason: verdict.reason ?? "",
      dealUrl: `${appUrl()}/deals/${dealId}`,
      settingsUrl: `${appUrl()}/account`,
    });
    await sendEmail(to, subject, html, text);
  } catch (err) {
    // Notification-only — the analysis itself already succeeded.
    console.error(
      `[email] analysis-ready notification failed for ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
