// GET /api/intel/latest — the newest digest + its notable items + open
// regulatory alerts. Signed-in users only (RLS enforces the same, but a
// clean 401 beats an empty 200 for an unauthenticated caller).
//
// "Open" is the banner's rule (app/(app)/regulatory-alert-banner.tsx):
// detected in the last 30 days and not dismissed by this reader in this
// browser — their account's cookie, read through the banner's own reader
// (`dismissedFor`). The shared `dismissed_at` column is not read — every
// signed-in user could write it until migration 0036 took the grant back.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { alertWindowStart, dismissedFor, undismissed } from "@/lib/dismissed-alerts";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const store = await cookies();
  const dismissed = dismissedFor((name) => store.get(name)?.value, user.id);
  const supabase = await createSupabaseServerClient();
  try {
    const [{ data: digest }, { data: items }, { data: alerts }] = await Promise.all([
      supabase
        .from("market_intel_digests")
        .select("digest_date, markdown, item_count")
        .order("digest_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("market_intel_items")
        .select("url, title, source, sector, relevance, summary, action, published_at")
        .gte("relevance", 6)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("regulatory_alerts")
        .select("id, rule_id, headline, url, detail, detected_at")
        .gte("detected_at", alertWindowStart(new Date()))
        .order("detected_at", { ascending: false }),
    ]);
    return NextResponse.json({
      digest: digest ?? null,
      items: items ?? [],
      alerts: undismissed((alerts as { id: string }[] | null) ?? [], dismissed),
    });
  } catch {
    // Tables not migrated yet (0023/0024) — an empty payload, not a 500.
    return NextResponse.json({ digest: null, items: [], alerts: [] });
  }
}
