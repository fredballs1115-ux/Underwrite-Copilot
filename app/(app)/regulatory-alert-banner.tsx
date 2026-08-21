// Red banner for undismissed regulatory alerts (research build, Phase 2
// item 5): when the daily intel job flags a likely law/regulation change,
// it stays visible on every signed-in screen until someone dismisses it.
// Server component + server action — no client JS.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

interface AlertRow {
  id: string;
  rule_id: string | null;
  headline: string;
  url: string | null;
  detail: string | null;
}

async function dismissAlert(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("regulatory_alerts")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: user.id })
    .eq("id", id);
  revalidatePath("/", "layout");
}

export async function RegulatoryAlertBanner() {
  let alerts: AlertRow[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("regulatory_alerts")
      .select("id, rule_id, headline, url, detail")
      .is("dismissed_at", null)
      .order("detected_at", { ascending: false })
      .limit(3);
    alerts = (data as AlertRow[] | null) ?? [];
  } catch {
    // 0023 not migrated yet — no banner, no crash.
  }
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-px">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-sm text-white"
        >
          <span className="rounded bg-white/20 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide">
            Possible rule change
          </span>
          <span className="min-w-0 flex-1">
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
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
      ))}
    </div>
  );
}
