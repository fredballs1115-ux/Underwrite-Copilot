"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveBuyBox } from "@/lib/criteria-server";
import { isEmptyBuyBox, type BuyBox, type GeoTarget } from "@/lib/criteria";

const ASSET_CLASSES = ["multifamily", "office", "industrial", "retail"];

function num(formData: FormData, key: string): number | undefined {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Parse + sanitize the geography chips JSON from the picker. */
function parseGeos(raw: unknown): GeoTarget[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return undefined;
    const out: GeoTarget[] = [];
    for (const item of arr.slice(0, 12)) {
      const label = String(item?.label ?? "").slice(0, 80).trim();
      if (!label) continue;
      out.push({
        label,
        city: item?.city ? String(item.city).slice(0, 60) : undefined,
        state: item?.state ? String(item.state).slice(0, 30) : undefined,
        county: item?.county ? String(item.county).slice(0, 60) : undefined,
      });
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** A min–max pair, swapped if entered backwards. */
function range(
  formData: FormData,
  minKey: string,
  maxKey: string,
): [number | undefined, number | undefined] {
  let lo = num(formData, minKey);
  let hi = num(formData, maxKey);
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

/** Save the caller's mandate — team box when they own a team, else personal. */
export async function saveBuyBox(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const assetClasses = formData
    .getAll("assetClasses")
    .map(String)
    .filter((a) => ASSET_CLASSES.includes(a));

  const [priceMinM, priceMaxM] = range(formData, "priceMinM", "priceMaxM");
  const [sfMinK, sfMaxK] = range(formData, "sfMinK", "sfMaxK");

  const box: BuyBox = {
    assetClasses: assetClasses.length ? assetClasses : undefined,
    geos: parseGeos(formData.get("geos")),
    sfMin: sfMinK != null ? sfMinK * 1e3 : undefined,
    sfMax: sfMaxK != null ? sfMaxK * 1e3 : undefined,
    priceMinM,
    priceMaxM,
    maxPerUnitK: num(formData, "maxPerUnitK"),
    minCapPct: num(formData, "minCapPct"),
    minIrrPct: num(formData, "minIrrPct"),
    notes: String(formData.get("notes") ?? "").trim().slice(0, 600) || undefined,
  };
  const value = isEmptyBuyBox(box) ? null : box;

  const active = await getActiveBuyBox(supabase, user.id);

  if (active.scope === "team") {
    if (!active.editable) redirect("/criteria?error=owner");
    // Team criteria are service-role writes (teams table is user-write-locked).
    const { error } = await createSupabaseAdminClient()
      .from("teams")
      .update({ criteria: value })
      .eq("id", active.teamId!);
    if (error) redirect("/criteria?error=save");
  } else {
    const { error } = await supabase
      .from("profiles")
      .update({ criteria: value })
      .eq("id", user.id);
    if (error) redirect("/criteria?error=save");
  }

  revalidatePath("/criteria");
  revalidatePath("/deals");
  redirect("/criteria?saved=1");
}
