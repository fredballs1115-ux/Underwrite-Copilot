// Red banner for regulatory alerts (research build, Phase 2 item 5): when
// the daily intel job flags a likely law/regulation change, it shows on every
// signed-in screen until the reader dismisses it.
// Server component + server action — no client JS.
//
// THE RULE: an alert shows where it was detected in the last
// ALERT_WINDOW_DAYS (30) days and THIS READER has not dismissed it. The
// shared row's `dismissed_at` is ignored: every signed-in user may write it
// (migration 0034's column grant), so it was one reader's click — or anyone's
// direct PATCH — hiding an alert from every customer. A dismissal is the
// alert's id in a cookie named for the reader's account (lib/dismissed-
// alerts), so a second account on the same browser keeps its own; nothing
// shared is written, and /news keeps every alert whatever a banner did.

import { cookies } from "next/headers";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { safeHttpUrl } from "@/lib/safe-url";
import {
  alertWindowStart,
  dismissedCookie,
  dismissedCookieName,
  parseDismissed,
  undismissed,
} from "@/lib/dismissed-alerts";

interface AlertRow {
  id: string;
  rule_id: string | null;
  headline: string;
  url: string | null;
  detail: string | null;
}

/** The banner shows the newest few. */
const SHOWN = 3;

async function dismissAlert(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const user = await getCurrentUser();
  if (!user) return;
  const store = await cookies();
  const next = dismissedCookie(
    store.get(dismissedCookieName(user.id))?.value,
    id,
    process.env.NODE_ENV === "production",
    user.id,
  );
  // Setting a cookie in a server action re-renders the page it was called
  // from, so the banner redraws without the alert — for this reader only.
  if (next) store.set(next.name, next.value, next.options);
}

export async function RegulatoryAlertBanner() {
  let alerts: AlertRow[] = [];
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const dismissed = parseDismissed((await cookies()).get(dismissedCookieName(user.id))?.value);
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("regulatory_alerts")
      .select("id, rule_id, headline, url, detail")
      .gte("detected_at", alertWindowStart(new Date()))
      .order("detected_at", { ascending: false })
      // Enough rows that the newest few this reader has not dismissed are
      // among them.
      .limit(SHOWN + dismissed.length);
    alerts = undismissed((data as AlertRow[] | null) ?? [], dismissed, SHOWN);
  } catch {
    // 0023 not migrated yet — no banner, no crash.
  }
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-px">
      {alerts.map((a) => {
        // The row is shared state written outside this request — only a real
        // web URL ever becomes a link (the same allowlist the comps map uses).
        const href = safeHttpUrl(a.url);
        return (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-sm text-white"
        >
          <span className="rounded bg-white/20 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide">
            Possible rule change
          </span>
          <span className="min-w-0 flex-1">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {a.headline}
              </a>
            ) : (
              a.headline
            )}
            {a.rule_id && (
              <span className="ml-2 text-white/80">affects rule: {a.rule_id}</span>
            )}
          </span>
          <form action={dismissAlert}>
            <input type="hidden" name="id" value={a.id} />
            <button
              type="submit"
              className="rounded border border-white/40 px-2 py-0.5 text-[12px] hover:bg-white/10"
            >
              Dismiss
            </button>
          </form>
        </div>
        );
      })}
    </div>
  );
}
