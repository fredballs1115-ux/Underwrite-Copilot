"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadSupplement, removeSupplementFile, signatureMismatch } from "@/lib/storage";

type Supp = {
  notes: { id: string; text: string; createdAt: string }[];
  files: { id: string; name: string; path: string; createdAt: string }[];
};
type SuppMap = Record<string, Supp>;

const MAX_FILE = 32 * 1024 * 1024;
const VALID_TABS = new Set([
  "terms",
  "challenger",
  "comps",
  "reconciler",
  "market",
  "verdict",
  "overview",
]);

async function loadDeal(dealId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // RLS scopes this to the caller's own deal.
  const { data } = await supabase
    .from("deals")
    .select("id, supplements")
    .eq("id", dealId)
    .maybeSingle();
  if (!data) return null;
  return { supabase, map: (data.supplements as SuppMap | null) ?? {} };
}

function tabBucket(map: SuppMap, tab: string): Supp {
  if (!map[tab]) map[tab] = { notes: [], files: [] };
  return map[tab];
}

export async function addSupplementNote(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const tab = String(formData.get("tab") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!dealId || !VALID_TABS.has(tab) || !text) return;

  const ctx = await loadDeal(dealId);
  if (!ctx) return;
  tabBucket(ctx.map, tab).notes.push({
    id: crypto.randomUUID(),
    text: text.slice(0, 4000),
    createdAt: new Date().toISOString(),
  });
  const { error } = await ctx.supabase
    .from("deals")
    .update({ supplements: ctx.map, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) redirect(`/deals/${dealId}?error=supp`);
  revalidatePath(`/deals/${dealId}`);
}

export async function addSupplementFile(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const tab = String(formData.get("tab") ?? "");
  const file = formData.get("file");
  if (!dealId || !VALID_TABS.has(tab)) return;
  // Surface a bad file instead of silently dropping it.
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/deals/${dealId}?error=docfile`);
  }
  if (file.size > MAX_FILE) {
    redirect(`/deals/${dealId}?error=docsize`);
  }

  const ctx = await loadDeal(dealId);
  if (!ctx) return;

  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "file";
  const path = `supplements/${dealId}/${id}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // Same trust-the-bytes gate the OM upload applies: a file whose name
  // claims a known format must actually be that format.
  if (signatureMismatch(file.name, buffer)) {
    redirect(`/deals/${dealId}?error=docformat`);
  }
  await uploadSupplement(path, buffer, file.type);

  tabBucket(ctx.map, tab).files.push({
    id,
    name: file.name,
    path,
    createdAt: new Date().toISOString(),
  });
  const { error } = await ctx.supabase
    .from("deals")
    .update({ supplements: ctx.map, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) redirect(`/deals/${dealId}?error=supp`);
  revalidatePath(`/deals/${dealId}`);
}

export async function removeSupplement(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const tab = String(formData.get("tab") ?? "");
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!dealId || !VALID_TABS.has(tab) || !id) return;

  const ctx = await loadDeal(dealId);
  if (!ctx) return;
  const supp = ctx.map[tab];
  if (!supp) return;

  if (kind === "file") {
    const f = supp.files.find((x) => x.id === id);
    if (f) {
      await removeSupplementFile(f.path);
      supp.files = supp.files.filter((x) => x.id !== id);
    }
  } else {
    supp.notes = supp.notes.filter((x) => x.id !== id);
  }
  const { error } = await ctx.supabase
    .from("deals")
    .update({ supplements: ctx.map, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) redirect(`/deals/${dealId}?error=supp`);
  revalidatePath(`/deals/${dealId}`);
}
