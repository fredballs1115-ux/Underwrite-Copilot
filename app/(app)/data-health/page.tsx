import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { hoursSince } from "@/lib/research";

export const metadata: Metadata = { title: "Data health" };
export const dynamic = "force-dynamic";

// The steward's public ledger: every nightly run, every open issue, every
// correction — the "our data polices itself" claim, backed by rows. Nothing
// here is synthesized; empty tables render as honest empty states.

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  checks_run: number;
  issues_found: number;
  notes: string | null;
}
interface IssueRow {
  id: string;
  kind: string;
  subject: string;
  detail: string | null;
  detected_at: string;
}
interface ChangeRow {
  id: string;
  subject: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  source_url: string | null;
  changed_at: string;
}

const KIND_META: Record<string, { label: string; cls: string }> = {
  dead_link: { label: "dead link", cls: "bg-red-500/10 text-red-600" },
  stale: { label: "stale", cls: "bg-amber-500/10 text-amber-600" },
  consistency: { label: "consistency", cls: "bg-red-500/10 text-red-600" },
  disputed: { label: "disputed", cls: "bg-amber-500/10 text-amber-600" },
  steward_error: { label: "steward error", cls: "bg-red-500/10 text-red-600" },
};

const fmtTs = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";

export default async function DataHealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/data-health");

  const supabase = await createSupabaseServerClient();
  let runs: RunRow[] = [];
  let issues: IssueRow[] = [];
  let changes: ChangeRow[] = [];
  let migrated = true;
  try {
    const [{ data: r, error }, { data: i }, { data: c }] = await Promise.all([
      supabase
        .from("steward_runs")
        .select("id, started_at, finished_at, checks_run, issues_found, notes")
        .order("started_at", { ascending: false })
        .limit(10),
      supabase
        .from("data_issues")
        .select("id, kind, subject, detail, detected_at")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false })
        .limit(50),
      supabase
        .from("data_changelog")
        .select("id, subject, old_value, new_value, reason, source_url, changed_at")
        .order("changed_at", { ascending: false })
        .limit(20),
    ]);
    if (error) migrated = false;
    runs = (r as RunRow[] | null) ?? [];
    issues = (i as IssueRow[] | null) ?? [];
    changes = (c as ChangeRow[] | null) ?? [];
  } catch {
    migrated = false;
  }

  const latest = runs[0] ?? null;
  const overdue = !latest || hoursSince(latest.finished_at ?? latest.started_at) > 48;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Data health</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every night a verification steward re-checks this site&apos;s data:
          source links, feed freshness, consistency invariants, and the oldest
          singly-sourced claims against the live web. Its findings land here —
          corrections are made in the open in the changelog, never silently.
        </p>
      </header>

      <section
        className={`rounded-xl border p-4 ${
          overdue ? "border-red-500/40 bg-red-500/5" : "border-line bg-surface"
        }`}
      >
        <h2 className="text-sm font-semibold">Steward heartbeat</h2>
        {!migrated ? (
          <p className="mt-1 text-sm text-muted">
            The steward tables don&apos;t exist yet — run migration 0028, then
            schedule <code className="rounded bg-faint px-1">node scripts/steward.mjs</code>{" "}
            nightly (Render cron in render.yaml, or the steward GitHub Action).
          </p>
        ) : latest ? (
          <p className="mt-1 text-sm">
            Last run {fmtTs(latest.finished_at ?? latest.started_at)} —{" "}
            {latest.checks_run} checks, {latest.issues_found} issue flags.
            {overdue && (
              <span className="ml-2 font-medium text-red-600">
                More than 48 hours ago — the nightly cron looks dead. That
                itself is the signal this panel exists for.
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            No steward runs recorded yet. Schedule{" "}
            <code className="rounded bg-faint px-1">node scripts/steward.mjs</code>{" "}
            nightly — until the first run lands, &quot;data last verified&quot;
            has honestly never happened.
          </p>
        )}
        {runs.length > 1 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
            {runs.slice(1, 6).map((r) => (
              <li key={r.id} className="font-mono tabular-nums">
                {fmtTs(r.started_at)} · {r.checks_run} checks · {r.issues_found} flags
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">
          Open issues{" "}
          <span className="ml-1 font-normal text-muted">({issues.length})</span>
        </h2>
        {issues.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            Nothing open. Issues appear here the night something breaks — a
            source link dies, a feed goes quiet, an invariant fails, a claim
            stops matching its source.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {issues.map((i) => {
              const meta = KIND_META[i.kind] ?? { label: i.kind, cls: "bg-faint text-muted" };
              return (
                <li key={i.id} className="text-sm leading-snug">
                  <span className={`mr-2 rounded px-1.5 py-px text-[11px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="break-all font-mono text-[12px]">{i.subject}</span>
                  {i.detail && <span className="text-muted"> — {i.detail}</span>}
                  <span className="ml-1 text-[11px] text-muted">
                    ({i.detected_at.slice(0, 10)})
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Changelog — corrections in the open</h2>
        {changes.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No corrections yet. When the steward finds a number that changed at
            the source, it updates the row AND records old → new here with the
            evidence link — a number on this site never changes silently.
          </p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {changes.map((c) => (
              <li key={c.id} className="text-sm leading-snug">
                <span className="font-medium">{c.subject}</span>
                {c.old_value !== null && c.new_value !== null && (
                  <span className="ml-2 font-mono text-[12px] tabular-nums">
                    {c.old_value} → {c.new_value}
                  </span>
                )}
                <span className="block text-[12px] text-muted">
                  {c.reason}
                  {c.source_url && (
                    <>
                      {" · "}
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2 hover:text-brand"
                      >
                        evidence
                      </a>
                    </>
                  )}
                  {" · "}
                  {c.changed_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
