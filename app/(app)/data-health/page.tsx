import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { hoursSince } from "@/lib/research";
import { costByStep, medianUsd, type UsageSummary } from "@/lib/anthropic/usage";

export const metadata: Metadata = { title: "Data health" };

/** The live service probes — signed-in JSON endpoints that report what each
 *  service actually returned from THIS deployment. The checks an operator is
 *  asked to run live here, on the page, not in a chat transcript. */
const PROBES: { href: string; name: string; what: string }[] = [
  {
    href: "/api/comps/health",
    name: "Public-record comps",
    what: "every county and city data portal: reachable, the columns it expects, rows on file.",
  },
  {
    href: "/api/imagery/health",
    name: "Maps & building photos",
    what: "where the geocoder places a known address, then Street View, satellite, the USGS aerial and the basemap tiles.",
  },
  {
    href: "/api/news/health",
    name: "News feeds",
    what: "each publisher feed and Google News search: HTTP status, items parsed, latency, whether a stale copy stood in.",
  },
];
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

/** A screen's ledger as the job row carries it (migration 0035). */
interface UsageRow {
  id: string;
  usage: UsageSummary | null;
  updated_at: string;
}

/** The steps' colours in the cost bar, in the order the pipeline runs them. */
const STEP_COLORS = ["bg-brand", "bg-pass", "bg-caution", "bg-kill", "bg-ink/50", "bg-muted"];

/** "The first signal" → "First signal": the step's name as a legend word. */
const stepWord = (what: string) => {
  const w = what.replace(/^The /, "");
  return w.charAt(0).toUpperCase() + w.slice(1);
};

const fmtTokens = (n: number) => n.toLocaleString("en-US");

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

  // What the last screens cost — their ledgers, newest first. A schema
  // without the column (pre-0035) reads as an error here, never a throw.
  let screens: UsageRow[] = [];
  let usageColumn = true;
  try {
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("id, usage, updated_at")
      .not("usage", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) usageColumn = false;
    else screens = ((data as UsageRow[] | null) ?? []).filter((s) => s.usage && Array.isArray(s.usage.calls));
  } catch {
    usageColumn = false;
  }
  const pricedScreens = screens
    .map((s) => s.usage?.usd)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const medianCost = medianUsd(pricedScreens);
  const latestScreen = screens[0]?.usage ?? null;
  const split = latestScreen ? costByStep(latestScreen) : [];
  const splitTotal = split.reduce((acc, s) => acc + (s.usd ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Data health</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A nightly steward re-checks source links, feed freshness and the oldest singly-sourced
          claims; corrections land here and in the changelog, never silently.
        </p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Service probes</h2>
        <p className="mt-1 text-sm text-muted">
          Each opens as JSON and names what the service actually said from this
          deployment, so a thin feature is diagnosed rather than guessed at.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {PROBES.map((p) => (
            <li key={p.href} className="rounded-lg border border-line/70 p-3">
              <a
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {p.name}
              </a>
              <p className="mt-1 text-xs leading-relaxed text-muted">{p.what}</p>
              <p className="mt-1 font-mono text-[10px] text-muted">{p.href}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4" data-cost-card>
        <h2 className="text-sm font-semibold">Cost per screen</h2>
        {!usageColumn ? (
          <p className="mt-1 text-sm text-muted">
            The ledger column isn&apos;t there yet — run migration 0035; the next
            screen writes what it spent here.
          </p>
        ) : screens.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No screen has recorded what it spent yet — the next one will.
          </p>
        ) : (
          <div className="mt-2">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {medianCost != null ? `$${medianCost.toFixed(2)}` : "—"}
              </span>
              <span className="text-xs text-muted">
                median of the last {screens.length} screen{screens.length === 1 ? "" : "s"}
                {pricedScreens.length < screens.length ? " that priced" : ""}, at list price
              </span>
            </p>
            {latestScreen && split.length > 0 && (
              <>
                <div
                  className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-faint"
                  data-cost-bar
                  role="img"
                  aria-label={`Latest screen, ${
                    latestScreen.usd != null ? `$${latestScreen.usd.toFixed(2)}` : "unpriced"
                  }: ${split.map((s) => `${stepWord(s.what)} ${s.usd != null ? `$${s.usd.toFixed(2)}` : "unpriced"}`).join(", ")}`}
                >
                  {split.map((s, i) => (
                    <span
                      key={s.what}
                      className={`${STEP_COLORS[i % STEP_COLORS.length]} h-full`}
                      style={{ width: `${splitTotal > 0 && s.usd != null ? (s.usd / splitTotal) * 100 : 0}%` }}
                    />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-hidden>
                  {split.map((s, i) => (
                    <li key={s.what} className="inline-flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-sm ${STEP_COLORS[i % STEP_COLORS.length]}`} />
                      {stepWord(s.what)}
                      <span className="font-mono tabular-nums text-ink">
                        {s.usd != null ? `$${s.usd.toFixed(2)}` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-mono text-[11px] tabular-nums text-muted">
                  latest screen · {latestScreen.calls.length} calls · in {fmtTokens(latestScreen.totals.input)} · cache write{" "}
                  {fmtTokens(latestScreen.totals.cacheWrite)} · cache read {fmtTokens(latestScreen.totals.cacheRead)} · out{" "}
                  {fmtTokens(latestScreen.totals.output)} · {Math.round(latestScreen.ms / 1000)}s
                  {latestScreen.unpriced.length ? ` · unpriced: ${latestScreen.unpriced.join(", ")}` : ""}
                </p>
              </>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The one cache write of the OM is most of a screen; the levers that cut it are
              named in order in <code className="rounded bg-faint px-1">lib/anthropic/models.ts</code>.
            </p>
          </div>
        )}
      </section>

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
                  {i.detail && <span className="text-muted"> — {i.detail}</span>}{" "}
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
            No corrections yet — a number that changes at its source is recorded here as old → new,
            with the evidence.
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
