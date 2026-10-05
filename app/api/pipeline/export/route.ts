import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import type { JobLike } from "@/lib/screen-run";
import { getTeam } from "@/lib/teams";
import { getActiveBranding } from "@/lib/branding-server";
import {
  buildPipelineWorkbook,
  type PipelineExportRow,
} from "@/lib/pipeline-workbook";
import { pipelineExportRow } from "@/lib/pipeline-export-row";

// exceljs needs the Node runtime.
export const runtime = "nodejs";

/**
 * The whole pipeline as a meeting-ready .xlsx — stage-grouped with verdict
 * and buy-box markers plus a summary sheet. RLS scopes the query to the
 * caller's own + shared team deals; the sample deal stays out of a real
 * meeting artifact.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // This link navigates the whole tab — a raw 401 body strands the user.
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent("/deals")}`, req.url),
      302,
    );
  }

  const [{ data, error }, team] = await Promise.all([
    supabase
      .from("deals")
      // The first signal and the address too: the row reads the deal's kind
      // and its buy-box fit on the pipeline page's own inputs.
      .select(
        "id, name, asset_class, created_at, verdict, extraction, first_signal, address, site_flags, user_id, team_id, stage, is_sample",
      )
      .order("created_at", { ascending: false }),
    getTeam(supabase, user.id).catch(() => null),
  ]);
  if (error) return Response.redirect(new URL("/deals?error=exportfail", req.url), 302);

  type Row = {
    id: string;
    name: string;
    asset_class: string;
    created_at: string;
    verdict: unknown;
    extraction: unknown;
    first_signal: unknown;
    address: unknown;
    site_flags: unknown;
    user_id: string;
    team_id: string | null;
    stage: string | null;
    is_sample: boolean | null;
  };
  const rows = ((data ?? []) as Row[]).filter((d) => !d.is_sample);

  // Deadlines, teammate names, and both buy boxes are mutually independent —
  // one parallel batch instead of four sequential round trips.
  const mateIds = Array.from(
    new Set(
      rows.filter((d) => d.team_id && d.user_id !== user.id).map((d) => d.user_id),
    ),
  );
  const [{ data: dueRows }, { data: mates }, personalBox, teamBox, { data: jobRows }] =
    await Promise.all([
      rows.length
        ? supabase
            .from("deals")
            .select("id, offers_due")
            .in(
              "id",
              rows.map((d) => d.id),
            )
        : Promise.resolve({ data: [] as { id: string; offers_due: string | null }[] }),
      mateIds.length
        ? supabase.from("profiles").select("id, email, full_name").in("id", mateIds)
        : Promise.resolve({
            data: [] as { id: string; email: string | null; full_name: string | null }[],
          }),
      getBuyBoxForDeal(user.id, null).catch(() => null),
      team ? getBuyBoxForDeal("", team.id).catch(() => null) : Promise.resolve(null),
      // Each deal's latest job, as the pipeline page reads it: a re-screen
      // running, or one that failed before its verdict, leaves the call on
      // file the previous screen's beside this run's terms (lib/screen-run).
      rows.length
        ? supabase
            .from("analysis_jobs")
            .select("deal_id, status, step, created_at")
            .in(
              "deal_id",
              rows.map((d) => d.id),
            )
            .order("created_at", { ascending: false })
            .limit(Math.max(100, rows.length * 3))
        : Promise.resolve({ data: [] as ({ deal_id: string } & JobLike)[] }),
    ]);
  // The newest job per deal (rows arrive newest first).
  const jobByDeal = new Map<string, JobLike>();
  for (const j of (jobRows ?? []) as ({ deal_id: string } & JobLike)[]) {
    if (!jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j);
  }
  // Offers-due dates are best-effort (column arrived in migration 0013).
  const dueById = new Map<string, string>();
  for (const r of (dueRows ?? []) as { id: string; offers_due: string | null }[]) {
    if (r.offers_due) dueById.set(r.id, r.offers_due);
  }
  const nameById = new Map<string, string>();
  for (const m of (mates ?? []) as {
    id: string;
    email: string | null;
    full_name: string | null;
  }[]) {
    nameById.set(m.id, m.full_name || m.email || "Teammate");
  }

  // Each row read through the readers every other surface uses
  // (lib/pipeline-export-row, pure and tested), on the route's UTC day —
  // the day the file is named for — which decides the rent allowance in
  // force.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const exportRows: PipelineExportRow[] = rows.map((d) =>
    pipelineExportRow(d, {
      box: d.team_id ? teamBox : personalBox,
      job: jobByDeal.get(d.id),
      offersDue: dueById.get(d.id) ?? null,
      addedBy:
        d.team_id && d.user_id !== user.id
          ? (nameById.get(d.user_id) ?? "Teammate")
          : null,
      today,
    }),
  );

  // Firm branding (Feature 6) — the caller's own identity (this is an
  // account-level export, not a deal-level one). Best-effort.
  let branding = null;
  try {
    branding = (await getActiveBranding(supabase, user.id)).branding;
  } catch {
    branding = null;
  }

  const buffer = await buildPipelineWorkbook(exportRows, now, branding);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pipeline-${now.toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
