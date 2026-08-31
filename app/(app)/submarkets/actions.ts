"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signatureMismatch } from "@/lib/storage";
import {
  PERIOD_FIELDS,
  PIPELINE_FIELDS,
  readGrid,
  suggestMarketMapping,
  toPeriods,
  toPipeline,
} from "@/lib/market/import";
import { RENT_BASES, type ExclusionRules, type RentBasis } from "@/lib/market/types";
import { getSubmarket } from "@/lib/market/store";

const MAX_FILE = 32 * 1024 * 1024;

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const num = (raw: FormDataEntryValue | null): number | null => {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s%]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const list = (raw: FormDataEntryValue | null): string[] =>
  String(raw ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function createSubmarket(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/submarkets?error=name");

  const { data, error } = await supabase
    .from("submarkets")
    .insert({
      user_id: user.id,
      name,
      metro: String(formData.get("metro") ?? "").trim() || null,
      asset_class: String(formData.get("assetClass") ?? "industrial"),
      exclusion_rules: {},
      supply_warning_months: num(formData.get("supplyWarningMonths")) ?? 24,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) redirect("/submarkets?error=save");
  revalidatePath("/submarkets");
  redirect(`/submarkets/${data.id}`);
}

export async function deleteSubmarket(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  if (!id) return;
  await supabase.from("submarkets").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/submarkets");
  redirect("/submarkets");
}

/**
 * Save the exclusion rules. They are PERSISTENT — stored on the submarket, not
 * on the import — so a data-center exclusion set once applies to every future
 * import into this submarket, which is the whole point of trap 1.
 */
export async function saveExclusionRules(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  if (!id) return;

  const rules: ExclusionRules = {
    subtypes: list(formData.get("subtypes")),
    namePatterns: list(formData.get("namePatterns")),
    minSf: num(formData.get("minSf")),
    maxSf: num(formData.get("maxSf")),
    excludeOwnerOccupied: formData.get("excludeOwnerOccupied") === "on",
  };

  await supabase
    .from("submarkets")
    .update({
      exclusion_rules: rules,
      supply_warning_months: num(formData.get("supplyWarningMonths")) ?? 24,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}

/** Import a market export — statistics grid or property pipeline. */
export async function importSubmarketFile(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  const kind = String(formData.get("kind") ?? "periods");
  if (!id) return;

  const submarket = await getSubmarket(supabase, id);
  if (!submarket) redirect("/submarkets?error=notfound");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/submarkets/${id}?error=file`);
  if (file.size > MAX_FILE) redirect(`/submarkets/${id}?error=size`);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (signatureMismatch(file.name, buffer)) redirect(`/submarkets/${id}?error=format`);

  let grid;
  try {
    grid = await readGrid(file.name, buffer);
  } catch {
    redirect(`/submarkets/${id}?error=parse`);
  }
  if (!grid.length) redirect(`/submarkets/${id}?error=empty`);

  const asOf = new Date().toISOString().slice(0, 10);

  if (kind === "pipeline") {
    const mapping = suggestMarketMapping(grid, PIPELINE_FIELDS);
    const { rows } = toPipeline(grid, mapping, file.name, asOf);
    if (!rows.length) redirect(`/submarkets/${id}?error=norows`);
    // Replace rather than append: a re-import of the same export should not
    // double the pipeline, which is the surest way to make trap 3 fire on your
    // own data.
    await supabase.from("pipeline_properties").delete().eq("submarket_id", id).eq("source", file.name);
    await supabase.from("pipeline_properties").insert(
      rows.map((r) => ({
        submarket_id: id,
        name: r.name,
        address: r.address,
        sf: r.sf,
        status: r.status,
        expected_delivery: r.expectedDelivery,
        subtype: r.subtype,
        owner_occupied: r.ownerOccupied,
        stale_flag: r.staleFlag,
        stale_reason: r.staleReason,
        source: r.source,
        notes: r.notes,
      })),
    );
    revalidatePath(`/submarkets/${id}`);
    redirect(`/submarkets/${id}?imported=${rows.length}`);
  }

  const mapping = suggestMarketMapping(grid, PERIOD_FIELDS);
  const { rows } = toPeriods(grid, mapping, file.name);
  if (!rows.length) redirect(`/submarkets/${id}?error=norows`);
  await supabase.from("submarket_periods").upsert(
    rows.map((r) => ({
      submarket_id: id,
      period: r.period,
      inventory_sf: r.inventorySf,
      vacancy_pct: r.vacancyPct,
      net_absorption_sf: r.netAbsorptionSf,
      under_construction_sf: r.underConstructionSf,
      asking_rent: r.askingRent,
      rent_basis: r.rentBasis,
      source: r.source,
      unverified: false,
      source_url: null,
    })),
    { onConflict: "submarket_id,period" },
  );

  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}?imported=${rows.length}`);
}

/** Add or correct one period by hand. */
export async function saveSubmarketPeriod(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  const period = String(formData.get("period") ?? "").trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(period)) redirect(`/submarkets/${id}?error=period`);

  const basisRaw = String(formData.get("rentBasis") ?? "");
  const rentBasis = (RENT_BASES as string[]).includes(basisRaw) ? (basisRaw as RentBasis) : null;
  const vacancy = num(formData.get("vacancyPct"));
  const unverified = formData.get("unverified") === "on";
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;

  await supabase.from("submarket_periods").upsert(
    {
      submarket_id: id,
      period,
      inventory_sf: num(formData.get("inventorySf")),
      // Entered as whole percents; stored as decimals like everything else.
      vacancy_pct: vacancy == null ? null : vacancy / 100,
      net_absorption_sf: num(formData.get("netAbsorptionSf")),
      under_construction_sf: num(formData.get("underConstructionSf")),
      asking_rent: num(formData.get("askingRent")),
      rent_basis: rentBasis,
      // Never blank: every displayed metric carries its source.
      source: String(formData.get("source") ?? "").trim() || (unverified ? "web search" : "manual"),
      unverified,
      source_url: sourceUrl,
    },
    { onConflict: "submarket_id,period" },
  );

  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}

export async function deleteSubmarketPeriod(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  if (!id || !periodId) return;
  await supabase.from("submarket_periods").delete().eq("id", periodId).eq("submarket_id", id);
  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}

export async function deleteSubmarketPipeline(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  if (!id) return;
  await supabase.from("pipeline_properties").delete().eq("submarket_id", id);
  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}
