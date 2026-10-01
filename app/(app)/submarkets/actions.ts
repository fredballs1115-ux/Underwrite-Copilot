"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signatureMismatch } from "@/lib/storage";
import {
  PERIOD_FIELDS,
  PIPELINE_FIELDS,
  mappingSummary,
  packMapping,
  pipelineRowsToReplace,
  readGrid,
  suggestMarketMapping,
  toPeriods,
  toPipeline,
} from "@/lib/market/import";
import { RENT_BASES, type ExclusionRules, type RentBasis } from "@/lib/market/types";
import { getSubmarket } from "@/lib/market/store";
import { ASSET_CLASS_LABEL } from "@/lib/asset-class";

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

// The submarket LIST is the "Your submarkets" panel on /market (anchor
// #submarkets); list-level errors travel there as ?submarketError=. Each
// submarket's own page is still /submarkets/[id].
const LIST = "/market#submarkets";
const listError = (code: string) => `/market?submarketError=${code}#submarkets`;

export async function createSubmarket(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(listError("name"));

  // One of the site's own classes (lib/asset-class), the list every deal is
  // filed under; anything else posted is not a class.
  const classRaw = String(formData.get("assetClass") ?? "").trim().toLowerCase();
  const assetClass = Object.prototype.hasOwnProperty.call(ASSET_CLASS_LABEL, classRaw) ? classRaw : "industrial";

  const { data, error } = await supabase
    .from("submarkets")
    .insert({
      user_id: user.id,
      name,
      metro: String(formData.get("metro") ?? "").trim() || null,
      asset_class: assetClass,
      exclusion_rules: {},
      supply_warning_months: num(formData.get("supplyWarningMonths")) ?? 24,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(listError("save"));
  revalidatePath("/market");
  redirect(`/submarkets/${data.id}`);
}

export async function deleteSubmarket(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  if (!id) return;
  await supabase.from("submarkets").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/market");
  redirect(LIST);
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

  const { error } = await supabase
    .from("submarkets")
    .update({
      exclusion_rules: rules,
      supply_warning_months: num(formData.get("supplyWarningMonths")) ?? 24,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("[submarkets] rules update failed", error.message);
    redirect(`/submarkets/${id}?error=save`);
  }

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
  if (!submarket) redirect(listError("notfound"));

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
  // What the import did, carried to the page: how many rows, how many of them
  // replaced rows already loaded, how many it skipped, and which header each
  // field was read from — there is no step to confirm the column matching,
  // so the page says what it matched.
  const done = (params: Record<string, string | number>) =>
    `/submarkets/${id}?${new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString()}`;

  if (kind === "pipeline") {
    const mapping = suggestMarketMapping(grid, PIPELINE_FIELDS);
    const { rows, skipped, headers } = toPipeline(grid, mapping, file.name, asOf);
    if (!rows.length) redirect(`/submarkets/${id}?error=norows`);

    // Replace rather than append — the rows this file wrote before, and any
    // stored row that is one of these buildings by name and address, so a
    // renamed copy of the same export does not double the pipeline.
    const { data: existing, error: readError } = await supabase
      .from("pipeline_properties")
      .select("id, name, address, source")
      .eq("submarket_id", id)
      .limit(5000);
    if (readError) {
      console.error("[submarkets] pipeline read failed", readError.message);
      redirect(`/submarkets/${id}?error=importsave`);
    }
    const replace = pipelineRowsToReplace(
      (existing ?? []) as { id: string; name: string | null; address: string | null; source: string | null }[],
      rows,
      file.name,
    );

    // The new rows go in FIRST: a write that fails then leaves what was
    // loaded before untouched, never a pipeline deleted and not replaced.
    const { data: inserted, error: insertError } = await supabase
      .from("pipeline_properties")
      .insert(
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
      )
      .select("id");
    if (insertError) {
      console.error("[submarkets] pipeline insert failed", insertError.message);
      redirect(`/submarkets/${id}?error=importsave`);
    }
    if (replace.length) {
      const removed = await deleteRows(supabase, replace);
      if (!removed) {
        // Both copies would stand: take the new rows back out, so the
        // pipeline is what it was, and say so.
        await deleteRows(supabase, ((inserted ?? []) as { id: string }[]).map((r) => r.id));
        redirect(`/submarkets/${id}?error=importreplace`);
      }
    }
    revalidatePath(`/submarkets/${id}`);
    redirect(
      done({
        imported: rows.length,
        replaced: replace.length,
        skipped,
        kind: "pipeline",
        file: file.name.slice(0, 80),
        cols: packMapping(mappingSummary(mapping, headers, PIPELINE_FIELDS).read),
      }),
    );
  }

  const mapping = suggestMarketMapping(grid, PERIOD_FIELDS);
  const { rows, skipped, headers } = toPeriods(grid, mapping, file.name);
  if (!rows.length) redirect(`/submarkets/${id}?error=norows`);
  // A period already loaded for one of these dates is REPLACED by the import
  // (one row a date) — counted, so the page can say how many.
  const dates = [...new Set(rows.map((r) => r.period))];
  const { data: before, error: beforeError } = await supabase
    .from("submarket_periods")
    .select("period")
    .eq("submarket_id", id)
    .in("period", dates);
  // Unread is unsaid: a count the read could not make is left off the page.
  const replaced = beforeError
    ? null
    : new Set(((before ?? []) as { period: string }[]).map((p) => String(p.period).slice(0, 10))).size;
  const { error: upsertError } = await supabase.from("submarket_periods").upsert(
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
  if (upsertError) {
    console.error("[submarkets] period upsert failed", upsertError.message);
    redirect(`/submarkets/${id}?error=importsave`);
  }

  revalidatePath(`/submarkets/${id}`);
  redirect(
    done({
      imported: rows.length,
      ...(replaced == null ? {} : { replaced }),
      skipped,
      kind: "periods",
      file: file.name.slice(0, 80),
      cols: packMapping(mappingSummary(mapping, headers, PERIOD_FIELDS).read),
    }),
  );
}

/** Delete pipeline rows by id, a few hundred at a time so the request's
 *  filter stays a sane length. True when every batch went. */
async function deleteRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: readonly string[],
): Promise<boolean> {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("pipeline_properties").delete().in("id", ids.slice(i, i + 200));
    if (error) {
      console.error("[submarkets] pipeline delete failed", error.message);
      return false;
    }
  }
  return true;
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
  // The form says a web-sourced figure needs its link, and every surface
  // marks it with that link — so one without is refused, not stored bare.
  if (unverified && !sourceUrl) redirect(`/submarkets/${id}?error=sourceurl`);

  const { error } = await supabase.from("submarket_periods").upsert(
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
  if (error) {
    console.error("[submarkets] period save failed", error.message);
    redirect(`/submarkets/${id}?error=save`);
  }

  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}

export async function deleteSubmarketPeriod(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  if (!id || !periodId) return;
  const { error } = await supabase.from("submarket_periods").delete().eq("id", periodId).eq("submarket_id", id);
  if (error) {
    console.error("[submarkets] period delete failed", error.message);
    redirect(`/submarkets/${id}?error=delete`);
  }
  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}

export async function deleteSubmarketPipeline(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("submarketId") ?? "");
  if (!id) return;
  const { error } = await supabase.from("pipeline_properties").delete().eq("submarket_id", id);
  if (error) {
    console.error("[submarkets] pipeline clear failed", error.message);
    redirect(`/submarkets/${id}?error=delete`);
  }
  revalidatePath(`/submarkets/${id}`);
  redirect(`/submarkets/${id}`);
}
