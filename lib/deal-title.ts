import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * A deal page's tab title (research pass 33): every deal page had carried
 * the homepage's tagline, so ten open deals were ten identical tabs and a
 * screen reader opening a deal heard the tagline, never the deal. The name
 * is read under the reader's own session, so row-level security decides
 * what a title may say, once a request however many readers ask.
 */
export const dealNameFor = cache(async (dealId: string): Promise<string | null> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId)) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("deals").select("name").eq("id", dealId).maybeSingle();
    const name = (data as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
});

/** The title a deal page carries: the deal's name, after the sub-page's own
 *  ("Rent roll — Harbor View Apartments"); the page's own word where the
 *  name cannot be read. The root layout's template adds the site's name. */
export async function dealTitle(dealId: string, page?: string): Promise<Metadata> {
  const name = await dealNameFor(dealId);
  return { title: page ? (name ? `${page} — ${name}` : page) : (name ?? "Deal") };
}
