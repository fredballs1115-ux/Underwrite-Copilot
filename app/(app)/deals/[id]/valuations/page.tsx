import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { signedSupplementUrl } from "@/lib/storage";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import {
  bridgeSummaryLine,
  reconcileValuations,
  scoreAggressiveness,
  type NamedValuation,
} from "@/lib/valuation/reconcile";
import { impliedReturns } from "@/lib/valuation/implied";
import {
  FIELD_LABELS,
  VALUATION_FIELDS,
  parseValuationRow,
  type Valuation,
  type ValuationField,
} from "@/lib/valuation/types";
import { ValuationsView, type ColumnData } from "./valuations-view";
import {
  addManualValuation,
  addValuationFromPdf,
  deleteValuation,
  reextractValuation,
  updateValuation,
} from "./actions";

export const metadata: Metadata = { title: "Valuations" };

const ERRORS: Record<string, string> = {
  file: "Pick a BOV file to upload.",
  size: "That file is over 32MB — the analysis service can't read it.",
  format: "That file's contents don't match its extension.",
  label: "Give the valuation a label so the comparison columns are readable.",
  save: "Couldn't save that valuation.",
  nodoc: "There's no source document attached to that valuation to re-read.",
  extract: "Re-reading that BOV failed. Try again, or fill the fields in by hand.",
};

/** How each field is typed on the manual form. */
const FIELD_HINT: Record<ValuationField, string> = {
  headlineValue: "$",
  year1Noi: "$",
  goingInCap: "%",
  exitCap: "%",
  holdYears: "yr",
  rentGrowth: "%",
  vacancyAssumption: "%",
  capexDeduction: "$",
  discountRate: "%",
};
const PCT_FIELDS: ReadonlySet<ValuationField> = new Set([
  "goingInCap",
  "exitCap",
  "rentGrowth",
  "vacancyAssumption",
  "discountRate",
]);

const toNamed = (v: Valuation): NamedValuation => ({
  sourceLabel: v.sourceLabel,
  headlineValue: v.headlineValue,
  year1Noi: v.year1Noi,
  goingInCap: v.goingInCap,
  exitCap: v.exitCap,
  holdYears: v.holdYears,
  rentGrowth: v.rentGrowth,
  vacancyAssumption: v.vacancyAssumption,
  capexDeduction: v.capexDeduction,
  discountRate: v.discountRate,
});

export default async function ValuationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string; error?: string }>;
}) {
  const { id } = await params;
  const { a: aParam, b: bParam, error: errorCode } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ data: deal, error }, { data: rows }] = await Promise.all([
    supabase.from("deals").select("id, name, extraction").eq("id", id).maybeSingle(),
    supabase
      .from("valuations")
      .select("*")
      .eq("deal_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (error) throw new Error(`Couldn't load the deal: ${error.message}`);
  if (!deal) notFound();

  const valuations = ((rows ?? []) as Record<string, unknown>[]).map(parseValuationRow);

  // The user's own underwriting, pinned as the last column. Derived, not
  // stored — it always reflects the deal as it stands right now.
  const base = await currentDealAssumptions(
    supabase,
    id,
    deal.name as string,
    (deal.extraction as ExtractionResult | null) ?? null,
  );
  const ours: NamedValuation | null = base
    ? (() => {
        const r = computeUnderwrite(base);
        return {
          sourceLabel: "Our UW",
          headlineValue: base.purchasePrice,
          year1Noi: r.cashFlow[0]?.noi ?? null,
          goingInCap: r.returns.goingInCapPct,
          exitCap: base.exitCapPct,
          holdYears: Math.round(base.holdMonths / 12),
          rentGrowth: base.rentGrowthPct,
          vacancyAssumption: base.vacancyPct,
          capexDeduction: base.capitalImprovementsYr1,
          // The screening engine prices off cash flows and an exit cap, not a
          // discount rate — claiming one would be inventing an assumption.
          discountRate: null,
        };
      })()
    : null;

  // Signed URLs for the extracted BOVs, so a page citation can open its source.
  const docIds = valuations.map((v) => v.sourceDocumentId).filter((x): x is string => !!x);
  const docUrls = new Map<string, string>();
  if (docIds.length) {
    const { data: docs } = await supabase
      .from("deal_documents")
      .select("id, storage_path")
      .in("id", docIds);
    await Promise.all(
      (docs ?? []).map(async (d) => {
        const url = await signedSupplementUrl(d.storage_path as string);
        if (url) docUrls.set(String(d.id), url);
      }),
    );
  }

  const columns: ColumnData[] = [
    ...valuations.map((v) => {
      const named = toNamed(v);
      const implied = base
        ? impliedReturns(base, named)
        : {
            ok: false,
            error: "Screen this deal first — the implied return needs your own model to run.",
            leveredIrrPct: null,
            leveredEquityMultiple: null,
            substitutions: [],
          };
      return {
        id: v.id,
        label: v.sourceLabel,
        sourceType: v.sourceType,
        extracted: v.extracted,
        internal: false,
        documentUrl: v.sourceDocumentId ? (docUrls.get(v.sourceDocumentId) ?? null) : null,
        note: v.note,
        values: Object.fromEntries(VALUATION_FIELDS.map((f) => [f, named[f]])) as ColumnData["values"],
        citations: v.citations,
        derivedFields: v.derivedFields,
        implied: {
          ok: implied.ok,
          error: implied.error,
          leveredIrrPct: implied.leveredIrrPct,
          leveredEquityMultiple: implied.leveredEquityMultiple,
          substitutions: implied.substitutions,
        },
      } satisfies ColumnData;
    }),
    ...(ours
      ? [
          {
            id: "__ours",
            label: ours.sourceLabel,
            sourceType: "internal",
            extracted: false,
            internal: true,
            documentUrl: null,
            note: null,
            values: Object.fromEntries(
              VALUATION_FIELDS.map((f) => [f, ours[f]]),
            ) as ColumnData["values"],
            citations: {},
            derivedFields: [],
            implied: (() => {
              const r = impliedReturns(base!, ours);
              return {
                ok: r.ok,
                error: r.error,
                leveredIrrPct: r.leveredIrrPct,
                leveredEquityMultiple: r.leveredEquityMultiple,
                // Our own model borrows nothing from itself.
                substitutions: [],
              };
            })(),
          } satisfies ColumnData,
        ]
      : []),
  ];

  // The two columns being bridged. Default: the first two available.
  const byId = new Map<string, NamedValuation>([
    ...valuations.map((v) => [v.id, toNamed(v)] as const),
    ...(ours ? ([["__ours", ours]] as const) : []),
  ]);
  const ids = columns.map((c) => c.id);
  const aId = aParam && byId.has(aParam) ? aParam : (ids[0] ?? null);
  const bId =
    bParam && byId.has(bParam) && bParam !== aId
      ? bParam
      : (ids.find((x) => x !== aId) ?? null);

  const a = aId ? byId.get(aId)! : null;
  const b = bId ? byId.get(bId)! : null;
  const bridge = a && b ? reconcileValuations(a, b) : null;
  const tally = a && b ? scoreAggressiveness(a, b) : null;
  const summary = bridge?.ok ? bridgeSummaryLine(bridge) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/deals/${id}`}
          className="text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          ← {deal.name as string}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Valuations</h1>
        <p className="max-w-2xl text-sm text-muted">
          Two brokers value the same asset and the numbers don&apos;t match. This decomposes the gap
          into Year-1 NOI, cap rate and capex treatment, and then answers the question that actually
          matters: what levered IRR each implied price produces under your model.
        </p>
      </header>

      {errorCode && ERRORS[errorCode] ? (
        <p className="rounded-lg border border-kill/30 bg-kill/5 px-4 py-3 text-sm text-kill">
          {ERRORS[errorCode]}
        </p>
      ) : null}

      {columns.length >= 2 ? (
        <form method="get" className="flex flex-wrap items-end gap-3">
          {(
            [
              ["a", "Bridge from", aId],
              ["b", "to", bId],
            ] as const
          ).map(([name, label, selected]) => (
            <label
              key={name}
              className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted"
            >
              {label}
              <select
                name={name}
                defaultValue={selected ?? ""}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Bridge
          </button>
        </form>
      ) : null}

      {columns.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-base font-semibold text-ink">No valuations yet</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Upload a BOV PDF or type one in below. Add two and the gap between them gets
            decomposed; your own underwriting appears automatically once the deal has been screened.
          </p>
        </div>
      ) : (
        <ValuationsView
          columns={columns}
          bridge={bridge}
          summary={summary}
          tally={tally}
          aLabel={a?.sourceLabel ?? null}
          bLabel={b?.sourceLabel ?? null}
        />
      )}

      {/* ── Add: upload ───────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Upload a BOV</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One read of the document, one page citation per field. Anything the BOV doesn&apos;t state
          comes back blank for you to fill in — it is never estimated.
        </p>
        <form action={addValuationFromPdf} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="dealId" value={id} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            BOV file (PDF)
            <input
              type="file"
              name="file"
              accept="application/pdf,.pdf"
              required
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-faint file:px-2 file:py-1 file:text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Label (optional)
            <input
              name="sourceLabel"
              placeholder="JLL BOV"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Upload and read
          </button>
        </form>
      </section>

      {/* ── Add: manual ───────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Enter one by hand</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Leave a field blank if the source doesn&apos;t state it. Blank means &ldquo;not
          stated&rdquo; and stays out of the bridge — it never becomes a zero.
        </p>
        <form action={addManualValuation} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="dealId" value={id} />
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Label
              <input
                name="sourceLabel"
                required
                placeholder="Eastdil BOV"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Type
              <select
                name="sourceType"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              >
                <option value="broker">Broker</option>
                <option value="seller">Seller guidance</option>
                <option value="internal">Internal</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {VALUATION_FIELDS.map((f) => (
              <label key={f} className="flex flex-col gap-1 text-xs text-muted">
                {FIELD_LABELS[f]} ({FIELD_HINT[f]})
                <input
                  name={f}
                  inputMode="decimal"
                  placeholder={PCT_FIELDS.has(f) ? "e.g. 6.5" : ""}
                  className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Note (optional)
              <input
                name="note"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Add valuation
            </button>
          </div>
        </form>
      </section>

      {/* ── Saved valuations ──────────────────────────────────────────── */}
      {valuations.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
            Saved valuations
          </h2>
          <ul>
            {valuations.map((v) => (
              <li key={v.id} className="border-b border-line px-5 py-3 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium text-ink">{v.sourceLabel}</span>
                  <span className="text-xs capitalize text-muted">{v.sourceType}</span>
                  <span className="text-xs text-muted">
                    {v.extracted ? "read from PDF" : "typed"}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    {v.sourceDocumentId ? (
                      <form action={reextractValuation}>
                        <input type="hidden" name="dealId" value={id} />
                        <input type="hidden" name="valuationId" value={v.id} />
                        <button
                          type="submit"
                          className="text-xs text-muted underline-offset-2 hover:text-brand hover:underline"
                        >
                          Re-read PDF
                        </button>
                      </form>
                    ) : null}
                    <form action={deleteValuation}>
                      <input type="hidden" name="dealId" value={id} />
                      <input type="hidden" name="valuationId" value={v.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted underline-offset-2 hover:text-kill hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                {v.note ? <p className="mt-1 text-xs text-muted">{v.note}</p> : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted hover:text-brand">
                    Fill in or correct the assumptions
                  </summary>
                  <form action={updateValuation} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="dealId" value={id} />
                    <input type="hidden" name="valuationId" value={v.id} />
                    <label className="flex w-full max-w-xs flex-col gap-1 text-xs text-muted">
                      Label
                      <input
                        name="sourceLabel"
                        defaultValue={v.sourceLabel}
                        className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {VALUATION_FIELDS.map((f) => (
                        <label key={f} className="flex flex-col gap-1 text-xs text-muted">
                          {FIELD_LABELS[f]} ({FIELD_HINT[f]})
                          <input
                            name={f}
                            inputMode="decimal"
                            defaultValue={
                              v[f] == null ? "" : PCT_FIELDS.has(f) ? (v[f]! * 100).toFixed(3).replace(/\.?0+$/, "") : String(v[f])
                            }
                            className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="submit"
                      className="w-fit rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand hover:text-white"
                    >
                      Save changes
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
