import { createSupabaseServerClient } from "@/lib/supabase/server";
import { allDayEventIcs } from "@/lib/ics";
import { offersDueUpgrade } from "@/lib/offering";
import type { ExtractionResult } from "@/lib/anthropic/types";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";
}

/**
 * The deal's call for offers as a calendar file (#467): one all-day event,
 * a reminder two days before, the deal's link in it. The deadline the deal
 * carries — the reader's own date, else the memorandum's — read under the
 * reader's own session, so a deal nobody may open is a bare 404, as is a
 * deal with no deadline. The event's id is the deal's, so a second
 * download after the date moves updates the same event.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(`/deals/${id}`)}`, req.url), 302);
  }
  const { data } = await supabase.from("deals").select("id, name, offers_due, extraction").eq("id", id).maybeSingle();
  const row = data as { id: string; name: string | null; offers_due?: string | null; extraction?: ExtractionResult | null } | null;
  const due = row ? (row.offers_due ?? offersDueUpgrade(null, row.extraction ?? null)) : null;
  if (!row || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return new Response("Not found", { status: 404 });

  const name = (row.name ?? "").trim() || "Untitled deal";
  const link = `${appUrl()}/deals/${id}`;
  const ics = allDayEventIcs({
    uid: `offers-due-${id}@underwrite-copilot`,
    date: due,
    summary: `Offers due — ${name}`,
    description: link,
    url: link,
    remindDaysBefore: 2,
    now: new Date(),
  });
  const file = `offers-due-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "deal"}.ics`;
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "private, no-store",
    },
  });
}
