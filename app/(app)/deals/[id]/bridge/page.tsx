import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { bridgeSentence } from "@/lib/bridge/attribution";
import { getOrBuildBridge, listDealVersions, snapshotVersion } from "@/lib/bridge/versions";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import { BridgeView, type VersionOption } from "./bridge-view";
import { saveScenarioVersion, deleteDealVersion } from "./actions";

export const metadata: Metadata = { title: "Assumption bridge" };

const pct1 = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

const ERRORS: Record<string, string> = {
  save: "Couldn't save that scenario. Check the label isn't already used on this deal.",
  noextraction: "This deal hasn't been screened yet, so there are no assumptions to version.",
};

/** Percent inputs are typed as whole numbers; the engine stores decimals. */
const asPct = (v: number) => (v * 100).toFixed(2);

export default async function BridgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; error?: string }>;
}) {
  const { id } = await params;
  const { from: fromParam, to: toParam, error: errorCode } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, name, extraction")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the deal: ${error.message}`);
  if (!deal) notFound();

  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  const current = await currentDealAssumptions(supabase, id, deal.name as string, extraction);

  // Every visit snapshots the deal's live assumptions — but only when they
  // actually moved since the last version, so the list is a record of changes
  // rather than a record of page views.
  if (current) {
    await snapshotVersion(supabase, {
      dealId: id,
      userId: user.id,
      assumptions: current,
    });
  }

  const versions = await listDealVersions(supabase, id);

  const options: VersionOption[] = versions.map((v) => ({
    id: v.id,
    label: v.version_label,
    note: v.note,
    createdAt: v.created_at,
    automatic: v.automatic,
    leveredIrrPct: v.results?.leveredIrrPct ?? null,
  }));

  // Default to the latest two, oldest of the pair on the left.
  const toVersion = versions.find((v) => v.id === toParam) ?? versions[0] ?? null;
  const fromVersion =
    versions.find((v) => v.id === fromParam && v.id !== toVersion?.id) ??
    versions.find((v) => v.id !== toVersion?.id) ??
    null;

  const bridge =
    fromVersion && toVersion
      ? await getOrBuildBridge(supabase, id, fromVersion, toVersion)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/deals/${id}`}
          className="text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          ← {deal.name as string}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Assumption bridge</h1>
        <p className="max-w-2xl text-sm text-muted">
          Which input moved the return, and by how much. Contributions are Shapley values over the
          changed assumptions, so they don&apos;t depend on the order you apply the changes — and
          they add up to the headline move exactly.
        </p>
      </header>

      {errorCode && ERRORS[errorCode] ? (
        <p className="rounded-lg border border-kill/30 bg-kill/5 px-4 py-3 text-sm text-kill">
          {ERRORS[errorCode]}
        </p>
      ) : null}

      {versions.length < 2 ? (
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-base font-semibold text-ink">One version so far</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {versions.length === 0
              ? "This deal has no saved assumption sets yet — screen it, or save a scenario below."
              : `${versions[0].version_label} is the only saved version. Save a second one below (change the price, the exit cap, whatever you're testing) and the bridge will attribute the difference.`}
          </p>
        </div>
      ) : bridge && fromVersion && toVersion ? (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
              From
              <select
                name="from"
                defaultValue={fromVersion.id}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
              >
                {options
                  .filter((o) => o.id !== toVersion.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} — {pct1(o.leveredIrrPct)} levered
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
              To
              <select
                name="to"
                defaultValue={toVersion.id}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
              >
                {options
                  .filter((o) => o.id !== fromVersion.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} — {pct1(o.leveredIrrPct)} levered
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Compare
            </button>
          </form>

          <BridgeView
            bridge={bridge}
            sentence={bridgeSentence(bridge)}
            fromVersion={options.find((o) => o.id === fromVersion.id)!}
            toVersion={options.find((o) => o.id === toVersion.id)!}
          />
        </>
      ) : null}

      {/* ── Save a scenario ───────────────────────────────────────────────── */}
      {current ? (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Save a scenario</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Starts from this deal&apos;s current assumptions. Change only what you&apos;re testing —
            everything you leave alone stays exactly what the OM and your documents produced, so the
            bridge attributes the move to your changes and nothing else.
          </p>
          <form action={saveScenarioVersion} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="dealId" value={id} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["purchasePrice", "Purchase price ($)", String(Math.round(current.purchasePrice))],
                  ["exitCapPct", "Exit cap (%)", asPct(current.exitCapPct)],
                  ["rentGrowthPct", "Rent growth (%)", asPct(current.rentGrowthPct)],
                  ["vacancyPct", "Vacancy (%)", asPct(current.vacancyPct)],
                  ["expenseGrowthPct", "Expense growth (%)", asPct(current.expenseGrowthPct)],
                  ["holdMonths", "Hold (months)", String(current.holdMonths)],
                  ["ltc", "Loan to cost (%)", asPct(current.ltc)],
                  ["allInRatePct", "All-in rate (%)", asPct(current.allInRatePct)],
                ] as const
              ).map(([name, label, value]) => (
                <label key={name} className="flex flex-col gap-1 text-xs text-muted">
                  {label}
                  <input
                    name={name}
                    defaultValue={value}
                    inputMode="decimal"
                    className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1 text-xs text-muted sm:w-44">
                Label
                <input
                  name="label"
                  placeholder="broker case"
                  className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
                Note (optional)
                <input
                  name="note"
                  placeholder="Retrade at $12.0M, exit at 6.5%"
                  className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
              >
                Save version
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ── Version list ──────────────────────────────────────────────────── */}
      {versions.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
            Saved versions
          </h2>
          <ul>
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3 text-sm last:border-b-0"
              >
                <span className="font-medium text-ink">{v.version_label}</span>
                <span className="font-mono text-muted">{pct1(v.results?.leveredIrrPct)} levered</span>
                <span className="font-mono text-muted">
                  {v.results?.leveredEquityMultiple != null
                    ? `${v.results.leveredEquityMultiple.toFixed(2)}x`
                    : "—"}
                </span>
                <span className="text-xs text-muted">
                  {v.automatic ? "auto" : "saved"} ·{" "}
                  {new Date(v.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {v.note ? <span className="text-xs text-muted">{v.note}</span> : null}
                <form action={deleteDealVersion} className="ml-auto">
                  <input type="hidden" name="dealId" value={id} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <button
                    type="submit"
                    className="text-xs text-muted underline-offset-2 hover:text-kill hover:underline"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
