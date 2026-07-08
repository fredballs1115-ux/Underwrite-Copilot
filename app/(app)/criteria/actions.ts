"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveBuyBox, saveBuyBoxStore } from "@/lib/criteria-server";
import {
  hasNoDealbreakers,
  type BuyBox,
  type BuyBoxStore,
  type Dealbreakers,
  type GeoTarget,
} from "@/lib/criteria";

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

/** Build the BuyBox from the form, including the CoC floor and the hard
 *  dealbreakers (Feature 4). Only active red lines are kept. */
function buildBox(formData: FormData): BuyBox {
  const assetClasses = formData
    .getAll("assetClasses")
    .map(String)
    .filter((a) => ASSET_CLASSES.includes(a));

  const [priceMinM, priceMaxM] = range(formData, "priceMinM", "priceMaxM");
  const [sfMinK, sfMaxK] = range(formData, "sfMinK", "sfMaxK");

  const dealbreakers: Dealbreakers = {};
  if (formData.get("db_requireAssetClass") === "on") dealbreakers.requireAssetClass = true;
  if (formData.get("db_requireGeography") === "on") dealbreakers.requireGeography = true;
  const dbMaxPrice = num(formData, "db_maxPriceM");
  if (dbMaxPrice != null) dealbreakers.maxPriceM = dbMaxPrice;
  const dbMinCap = num(formData, "db_minCapPct");
  if (dbMinCap != null) dealbreakers.minCapPct = dbMinCap;
  const dbMaxPerUnit = num(formData, "db_maxPerUnitK");
  if (dbMaxPerUnit != null) dealbreakers.maxPerUnitK = dbMaxPerUnit;

  return {
    assetClasses: assetClasses.length ? assetClasses : undefined,
    geos: parseGeos(formData.get("geos")),
    sfMin: sfMinK != null ? sfMinK * 1e3 : undefined,
    sfMax: sfMaxK != null ? sfMaxK * 1e3 : undefined,
    priceMinM,
    priceMaxM,
    maxPerUnitK: num(formData, "maxPerUnitK"),
    minCapPct: num(formData, "minCapPct"),
    minCoCPct: num(formData, "minCoCPct"),
    minIrrPct: num(formData, "minIrrPct"),
    dealbreakers: hasNoDealbreakers(dealbreakers) ? undefined : dealbreakers,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 600) || undefined,
  };
}

/** Small, unique id for a new named box (no clock/random constraints here). */
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `box-${Date.now()}`;
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Save the form into the ACTIVE box (creating the first box if there is
 *  none), preserving every other named box in the store. */
export async function saveBuyBox(formData: FormData) {
  const { supabase, user } = await requireUser();
  const box = buildBox(formData);

  const active = await getActiveBuyBox(supabase, user.id);
  if (active.scope === "team" && !active.editable) redirect("/criteria?error=owner");

  const targetId = String(formData.get("boxId") ?? "") || active.activeId;
  let store: BuyBoxStore;
  if (!active.boxes.length) {
    const id = newId();
    store = { boxes: [{ id, name: "Mandate", box }], activeId: id };
  } else {
    const boxes = active.boxes.map((b) =>
      b.id === targetId ? { ...b, box } : b,
    );
    // If the target vanished (race), fall back to editing the active box.
    if (!boxes.some((b) => b.id === targetId)) {
      const idx = boxes.findIndex((b) => b.id === active.activeId);
      if (idx >= 0) boxes[idx] = { ...boxes[idx], box };
    }
    store = {
      boxes,
      activeId: boxes.some((b) => b.id === targetId) ? targetId : active.activeId,
    };
  }

  const res = await saveBuyBoxStore(supabase, user.id, store);
  if (!res.ok) redirect(`/criteria?error=${res.error}`);
  revalidatePath("/criteria");
  revalidatePath("/deals");
  redirect("/criteria?saved=1");
}

/** Add a new, empty named box and make it active. */
export async function addBuyBox(formData: FormData) {
  const { supabase, user } = await requireUser();
  const active = await getActiveBuyBox(supabase, user.id);
  if (active.scope === "team" && !active.editable) redirect("/criteria?error=owner");

  const name =
    String(formData.get("name") ?? "").trim().slice(0, 60) ||
    `Mandate ${active.boxes.length + 1}`;
  const id = newId();
  const store: BuyBoxStore = {
    boxes: [...active.boxes, { id, name, box: {} }],
    activeId: id,
  };
  const res = await saveBuyBoxStore(supabase, user.id, store);
  if (!res.ok) redirect(`/criteria?error=${res.error}`);
  revalidatePath("/criteria");
  redirect("/criteria?saved=box");
}

/** Switch which named box every screen is judged against. */
export async function selectBuyBox(formData: FormData) {
  const { supabase, user } = await requireUser();
  const active = await getActiveBuyBox(supabase, user.id);
  if (active.scope === "team" && !active.editable) redirect("/criteria?error=owner");

  const id = String(formData.get("boxId") ?? "");
  if (!active.boxes.some((b) => b.id === id)) redirect("/criteria");
  const res = await saveBuyBoxStore(supabase, user.id, {
    boxes: active.boxes,
    activeId: id,
  });
  if (!res.ok) redirect(`/criteria?error=${res.error}`);
  revalidatePath("/criteria");
  revalidatePath("/deals");
  redirect("/criteria");
}

/** Rename a named box. */
export async function renameBuyBox(formData: FormData) {
  const { supabase, user } = await requireUser();
  const active = await getActiveBuyBox(supabase, user.id);
  if (active.scope === "team" && !active.editable) redirect("/criteria?error=owner");

  const id = String(formData.get("boxId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name || !active.boxes.some((b) => b.id === id)) redirect("/criteria");
  const res = await saveBuyBoxStore(supabase, user.id, {
    boxes: active.boxes.map((b) => (b.id === id ? { ...b, name } : b)),
    activeId: active.activeId,
  });
  if (!res.ok) redirect(`/criteria?error=${res.error}`);
  revalidatePath("/criteria");
  redirect("/criteria?saved=name");
}

/** Delete a named box; if it was active, the first remaining box takes over. */
export async function deleteBuyBox(formData: FormData) {
  const { supabase, user } = await requireUser();
  const active = await getActiveBuyBox(supabase, user.id);
  if (active.scope === "team" && !active.editable) redirect("/criteria?error=owner");

  const id = String(formData.get("boxId") ?? "");
  const boxes = active.boxes.filter((b) => b.id !== id);
  const activeId =
    active.activeId === id ? (boxes[0]?.id ?? "") : active.activeId;
  const res = await saveBuyBoxStore(supabase, user.id, { boxes, activeId });
  if (!res.ok) redirect(`/criteria?error=${res.error}`);
  revalidatePath("/criteria");
  revalidatePath("/deals");
  redirect("/criteria?saved=deleted");
}
