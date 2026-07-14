"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  VERDICT_IMPORT_MAX,
  normalizeTaskTitle,
  unimportedVerdictSteps,
} from "@/lib/deal-tasks";
import type { VerdictResult } from "@/lib/anthropic/types";

// All writes go through the USER client — RLS from 0022 (can_access_deal in
// every policy) is the security boundary; these actions only shape the data.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The assignee must be someone who can actually see the deal: the caller
 *  themselves, or (team deals) a member of the deal's team. Returns null for
 *  "unassigned", the id when valid, or undefined when the pick is bogus. */
async function resolveAssignee(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dealId: string,
  userId: string,
  raw: string,
): Promise<string | null | undefined> {
  if (!raw) return null;
  if (raw === userId) return userId;
  const { data: deal } = await supabase
    .from("deals")
    .select("team_id")
    .eq("id", dealId)
    .maybeSingle();
  const teamId = (deal?.team_id as string | null) ?? null;
  if (!teamId) return undefined;
  const { data: mem } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", raw)
    .maybeSingle();
  return mem ? raw : undefined;
}

export async function addDealTask(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  // Trim + code-point cap (can't shear an emoji in half; same as notes).
  const title = normalizeTaskTitle(String(formData.get("title") ?? ""));
  const assigneeRaw = String(formData.get("assignee") ?? "").trim();
  const dueRaw = String(formData.get("dueDate") ?? "").trim();

  if (!dealId) redirect("/deals");
  if (!title) redirect(`/deals/${dealId}?error=taskempty`);
  const dueDate = DATE_RE.test(dueRaw) ? dueRaw : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const assignee = await resolveAssignee(supabase, dealId, user.id, assigneeRaw);
  if (assignee === undefined) redirect(`/deals/${dealId}?error=taskassignee`);

  const { error } = await supabase.from("deal_tasks").insert({
    deal_id: dealId,
    created_by: user.id,
    title,
    assignee_user_id: assignee,
    due_date: dueDate,
  });
  if (error) redirect(`/deals/${dealId}?error=task`);

  revalidatePath(`/deals/${dealId}`);
}

export async function toggleDealTask(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  // An unchecked checkbox simply isn't in the form data — that IS the signal.
  const done = String(formData.get("done") ?? "") === "on";
  if (!dealId || !taskId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("deal_tasks")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("deal_id", dealId);
  if (error) redirect(`/deals/${dealId}?error=task`);

  revalidatePath(`/deals/${dealId}`);
}

export async function deleteDealTask(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  if (!dealId || !taskId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("deal_tasks")
    .delete()
    .eq("id", taskId)
    .eq("deal_id", dealId);
  if (error) redirect(`/deals/${dealId}?error=taskdelete`);

  revalidatePath(`/deals/${dealId}`);
}

/** One-click: the verdict's "next steps" become open tasks (source =
 *  'verdict'). Steps whose text already exists as a task are skipped, so a
 *  double-click or re-import after a re-screen never duplicates. */
export async function importVerdictTasks(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal, error: readErr } = await supabase
    .from("deals")
    .select("id, verdict")
    .eq("id", dealId)
    .maybeSingle();
  if (readErr) redirect(`/deals/${dealId}?error=task`);
  if (!deal) redirect("/deals");

  const verdict = deal.verdict as VerdictResult | null;

  // A failed read here must ABORT: with the dedupe base missing, importing
  // would blindly duplicate every step.
  const { data: existing, error: existErr } = await supabase
    .from("deal_tasks")
    .select("title")
    .eq("deal_id", dealId);
  if (existErr) redirect(`/deals/${dealId}?error=task`);

  // Normalize + in-batch dedupe + drop already-imported titles, THEN cap —
  // so a later re-import can still bring in steps past the first batch.
  const fresh = unimportedVerdictSteps(
    verdict?.nextSteps,
    ((existing ?? []) as { title: string }[]),
  ).slice(0, VERDICT_IMPORT_MAX);
  if (fresh.length === 0) redirect(`/deals/${dealId}?error=tasknosteps`);

  const { error } = await supabase.from("deal_tasks").insert(
    fresh.map((title) => ({
      deal_id: dealId,
      created_by: user.id,
      title,
      source: "verdict" as const,
    })),
  );
  if (error) redirect(`/deals/${dealId}?error=task`);

  revalidatePath(`/deals/${dealId}`);
}
