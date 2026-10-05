import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { bridgeSentence } from "@/lib/bridge/attribution";
import { screeningModelCaveat } from "@/lib/bridge/model-caveat";
import { getOrBuildBridge, listDealVersions, snapshotVersion } from "@/lib/bridge/versions";
import { currentVersionId, defaultPair } from "@/lib/bridge/version-rules";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import {
  SCENARIO_LEVERS,
  leverFor,
  leverRefusalSentence,
  leverText,
  type LeverRefusal,
} from "@/lib/bridge/scenario-form";
import { BridgeView, type VersionOption } from "./bridge-view";
import { saveScenarioVersion, deleteDealVersion } from "./actions";
import { DealCrumb } from "../deal-crumb";
import { dealTitle } from "@/lib/deal-title";

/** "Assumption bridge — <the deal's name>" (lib/deal-title). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return dealTitle(id, "Assumption bridge");
}

const pct1 = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

const ERRORS: Record<string, string> = {
  labeltaken: "That label is already used by a version on this deal — pick another. Nothing was saved.",
  denied: "This account can't add versions to this deal. Nothing was saved.",
  save: "The version could not be saved — the database refused the write. Nothing was saved; try again.",
  delete: "That version could not be deleted. Try again.",
  current: "That version is the deal's assumptions as they stand, so it is kept: a view of this page would only take it again.",
  noextraction: "This deal hasn't been screened yet, so there are no assumptions to version.",
};

const REFUSALS: readonly LeverRefusal[] = ["unreadable", "range", "whole_years"];

/** The sentence an error code is answered with; a refused lever's is built
 *  from the lever's own label (lib/bridge/scenario-form). */
function errorSentence(code: string | undefined, field: string | undefined, why: string | undefined): string | null {
  if (!code) return null;
  if (code === "lever") {
    const lever = leverFor(field);
    const refusal = REFUSALS.find((r) => r === why);
    return lever && refusal ? leverRefusalSentence(lever, refusal) : null;
  }
  return ERRORS[code] ?? null;
}

export default async function BridgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; error?: string; field?: string; why?: string }>;
}) {
  const { id } = await params;
  const { from: fromParam, to: toParam, error: errorCode, field, why } = await searchParams;
  const errorText = errorSentence(errorCode, field, why);

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, name, extraction, first_signal")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the deal: ${error.message}`);
  if (!deal) notFound();

  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  // On a note or a plan deal the screening model's IRRs are not the buyer's:
  // said above them, and on the end of the line a reader copies.
  const caveat = screeningModelCaveat(extraction, (deal.first_signal as FirstSignal | null) ?? null);
  const current = await currentDealAssumptions(supabase, id, deal.name as string, extraction);

  // Every visit snapshots the deal's live assumptions — but only when they
  // moved from its latest base snapshot (a saved scenario is never one), so
  // the list is a record of changes rather than a record of page views.
  if (current) {
    await snapshotVersion(supabase, {
      dealId: id,
      userId: user.id,
      assumptions: current,
    });
  }

  const versions = await listDealVersions(supabase, id);
  // The version that is the deal as it stands: kept, so not offered for
  // deletion — a view would only take it again.
  const liveId = currentVersionId(current, versions);

  const options: VersionOption[] = versions.map((v) => ({
    id: v.id,
    label: v.version_label,
    note: v.note,
    createdAt: v.created_at,
    automatic: v.automatic,
    leveredIrrPct: v.results?.leveredIrrPct ?? null,
  }));

  // A scenario opens against the base it was saved from, a base against the
  // base before it — never a scenario against a later base, backwards.
  const { from: fromVersion, to: toVersion } = defaultPair(versions, toParam, fromParam);

  const bridge =
    fromVersion && toVersion
      ? await getOrBuildBridge(supabase, id, fromVersion, toVersion)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <DealCrumb dealId={id} name={deal.name as string} />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Assumption bridge</h1>
        <p className="max-w-2xl text-sm text-muted">
          Which input moved the return, and by how much — Shapley values, so the order of changes
          doesn&apos;t matter and the parts sum to the move.
        </p>
      </header>

      {errorText ? (
        <p className="rounded-lg border border-kill/30 bg-kill/5 px-4 py-3 text-sm text-kill">
          {errorText}
        </p>
      ) : null}

      {caveat ? (
        <p
          data-caveat={caveat.kind}
          className="rounded-lg border border-caution/30 bg-caution/5 px-4 py-3 text-sm text-ink"
        >
          {caveat.text}
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
            sentence={caveat ? `${bridgeSentence(bridge)} ${caveat.copy}` : bridgeSentence(bridge)}
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
            Starts from this deal&apos;s current assumptions; change only what you&apos;re testing,
            so the bridge attributes the move to that alone.
          </p>
          <form action={saveScenarioVersion} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="dealId" value={id} />
            {/* Each lever prefilled at the input's own precision; a price is
                typed as people type it ("$12.5M"), so it keeps a keyboard
                with letters, and the rest take numbers. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SCENARIO_LEVERS.map((lever) => (
                <label key={lever.field} className="flex flex-col gap-1 text-xs text-muted">
                  {lever.label}
                  <input
                    name={lever.field}
                    defaultValue={leverText(lever, current[lever.field])}
                    inputMode={lever.kind === "usd" ? undefined : "decimal"}
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
                {v.id === liveId ? (
                  <span
                    className="ml-auto rounded bg-faint px-1.5 py-px text-xs text-muted"
                    title="The deal's assumptions as they stand. It is kept while they do — a visit would only take it again — so it has no Delete."
                  >
                    current
                  </span>
                ) : (
                  <form action={deleteDealVersion} className="ml-auto">
                    <input type="hidden" name="dealId" value={id} />
                    <input type="hidden" name="versionId" value={v.id} />
                    <button
                      type="submit"
                      aria-label={`Delete version ${v.version_label}`}
                      className="text-xs text-muted underline-offset-2 hover:text-kill hover:underline"
                    >
                      Delete
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
