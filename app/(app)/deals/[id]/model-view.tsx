"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DOC_KINDS, DOC_KIND_LABEL, type DealDocument } from "@/lib/documents";
import { MODEL_INPUTS, MODEL_PASTES } from "@/lib/model/inputs";
import type {
  UnderwritingModel,
  ReconciledMetric,
} from "@/lib/model/types";
import type { CashFlowYear } from "@/lib/model/compute";
import {
  addDealDocument,
  removeDealDocument,
  generateModel,
} from "./model-actions";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : "$" + Math.round(n).toLocaleString();
const pct = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2) + "%";
const mult = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2) + "x";

const CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};

export function ModelView({
  dealId,
  model,
  documents,
  active,
  isPro,
}: {
  dealId: string;
  model: UnderwritingModel | null;
  documents: DealDocument[];
  active: boolean;
  isPro: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {model ? (
        <>
          <FirstDraftBanner />
          <ReturnsHeadline model={model} />
          <Conflicts conflicts={model.conflicts} />
          <Assumptions metrics={model.metrics} />
          <CashFlow cashFlow={model.cashFlow} />
          <SummaryCaveats summary={model.summary} caveats={model.caveats} />
          <DownloadRow dealId={dealId} />
        </>
      ) : (
        <Intro />
      )}
      <InputsNeeded documents={documents} />
      <DocumentsPanel
        dealId={dealId}
        documents={documents}
        active={active}
        hasModel={!!model}
        isPro={isPro}
      />
    </div>
  );
}

function Intro() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Build a first-draft underwriting model
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
        Upload everything you have on the deal — the OM, the rent roll, the
        T-12, offering financials, loan terms. We’ll reconcile the figures
        across them (actuals beat pro forma, and every conflict is surfaced, not
        hidden) and generate a complete first-draft Excel model: cash flows,
        sourced assumptions, and returns. Add at least the OM and a rent roll to
        start.
      </p>
    </div>
  );
}

function InputsNeeded({ documents }: { documents: DealDocument[] }) {
  const have = new Set(documents.map((d) => d.kind));
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Inputs needed to complete the model
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        The generated Excel matches your master template. Assumption cells are
        filled from your documents — provide these to fill the rest. Nothing is
        left blank or guessed; each gap is labeled in the workbook.
      </p>
      <ul className="mt-4 space-y-3">
        {MODEL_INPUTS.map((inp) => {
          const ok = have.has(inp.kind);
          return (
            <li key={inp.kind} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  ok ? "bg-pass/15 text-pass" : "bg-caution/15 text-caution"
                }`}
              >
                {ok ? "✓" : "!"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {inp.label}{" "}
                  <span
                    className={`ml-1 text-xs font-normal ${ok ? "text-pass" : "text-caution"}`}
                  >
                    {ok ? "provided" : "needed"}
                  </span>
                </p>
                <p className="text-xs leading-relaxed text-muted">{inp.fills}</p>
              </div>
            </li>
          );
        })}
        {MODEL_PASTES.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
              →
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.label}{" "}
                <span className="ml-1 text-xs font-normal text-brand">action</span>
              </p>
              <p className="text-xs leading-relaxed text-muted">{p.fills}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FirstDraftBanner() {
  return (
    <div className="rounded-xl border border-line border-l-4 border-l-caution bg-caution/5 px-4 py-3">
      <p className="text-sm font-medium">First-draft model — verify before relying on it</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        Every number traces to a source document. Conflicts between sources are
        listed below and flagged in the Excel’s Conflicts sheet.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ReturnsHeadline({ model }: { model: UnderwritingModel }) {
  const r = model.returns;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Projected returns
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {model.holdYears}-yr hold
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Levered IRR" value={pct(r.leveredIrrPct)} />
        <Stat label="Cash-on-cash (Yr 1)" value={pct(r.cashOnCashPct)} />
        <Stat label="Equity multiple" value={mult(r.equityMultiple)} />
        <Stat label="Going-in cap" value={pct(r.goingInCapPct)} />
        <Stat label="Purchase price" value={usd(r.purchasePrice)} />
        <Stat label="Equity" value={usd(r.equity)} />
        <Stat label="Year-1 NOI" value={usd(r.year1Noi)} />
        <Stat label="Exit value" value={usd(r.exitValue)} />
      </div>
    </section>
  );
}

function sourceLine(m: ReconciledMetric): string {
  return m.sources
    .map((s) => `${s.doc}: ${s.value}${s.basis ? ` (${s.basis})` : ""}`)
    .join("  ·  ");
}

function Conflicts({ conflicts }: { conflicts: ReconciledMetric[] }) {
  if (conflicts.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Source conflicts
        </h2>
        <p className="mt-2 text-sm text-muted">
          No material disagreements between your documents — the sources lined
          up.
        </p>
      </section>
    );
  }
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Source conflicts
        </h2>
        <span className="rounded-full bg-kill/10 px-2 py-0.5 text-[11px] font-medium text-kill">
          {conflicts.length} reconciled
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {conflicts.map((m, i) => (
          <div
            key={i}
            className="rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{m.label}</span>
              <span className="ml-auto rounded-full bg-pass/10 px-2 py-0.5 text-[10px] font-medium uppercase text-pass">
                {m.chosenValue}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xs tabular-nums text-muted">
              {sourceLine(m)}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              <span className="font-medium">Chose {m.authority} — </span>
              <span className="text-muted">{m.rationale}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Assumptions({ metrics }: { metrics: ReconciledMetric[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? metrics : metrics.slice(0, 8);
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        Assumptions <span className="font-normal text-muted">· every value sourced</span>
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Assumption</th>
              <th className="px-4 py-2.5 font-medium">Value</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => {
              const c = CONF[m.confidence] ?? CONF.medium;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top last:border-0"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${m.isConflict ? "text-kill" : ""}`}
                    >
                      {m.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums">
                    {m.chosenValue}
                  </td>
                  <td className="px-4 py-3 text-muted">{m.authority}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${c.cls}`}
                    >
                      {c.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {metrics.length > 8 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-2 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show fewer" : `Show all ${metrics.length} assumptions`}
        </button>
      )}
    </section>
  );
}

function CashFlow({ cashFlow }: { cashFlow: CashFlowYear[] }) {
  const [open, setOpen] = useState(false);
  if (cashFlow.length === 0) return null;
  const rows: [string, (c: CashFlowYear) => number][] = [
    ["Gross potential rent", (c) => c.gpr],
    ["Vacancy loss", (c) => -c.vacancyLoss],
    ["Other income", (c) => c.otherIncome],
    ["Effective gross income", (c) => c.egi],
    ["Operating expenses", (c) => -c.opex],
    ["Net operating income", (c) => c.noi],
    ["Debt service", (c) => -c.debtService],
    ["Levered cash flow", (c) => c.cashFlow],
  ];
  const bold = new Set([
    "Effective gross income",
    "Net operating income",
    "Levered cash flow",
  ]);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-sm font-semibold tracking-tight"
      >
        Operating cash flow
        <span className="text-xs font-normal text-brand">
          {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-[10px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-left font-medium">Line</th>
                {cashFlow.map((c) => (
                  <th key={c.year} className="px-4 py-2.5 font-medium">
                    Yr {c.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, pick]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td
                    className={`px-4 py-2.5 text-left ${bold.has(label) ? "font-semibold" : "text-muted"}`}
                  >
                    {label}
                  </td>
                  {cashFlow.map((c) => (
                    <td
                      key={c.year}
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${bold.has(label) ? "font-semibold" : ""}`}
                    >
                      {usd(pick(c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummaryCaveats({
  summary,
  caveats,
}: {
  summary: string;
  caveats: string[];
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {summary && (
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            How it reconciled
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{summary}</p>
        </div>
      )}
      {caveats.length > 0 && (
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Verify before relying on this
          </p>
          <ul className="mt-2 space-y-1.5">
            {caveats.map((c, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-caution" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DownloadRow({ dealId }: { dealId: string }) {
  return (
    <a
      href={`/api/deals/${dealId}/model.xlsx`}
      className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      Download Excel model (.xlsx)
    </a>
  );
}

function DocumentsPanel({
  dealId,
  documents,
  active,
  hasModel,
  isPro,
}: {
  dealId: string;
  documents: DealDocument[];
  active: boolean;
  hasModel: boolean;
  isPro: boolean;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Documents <span className="font-normal text-muted">· {documents.length}</span>
      </h2>

      {documents.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <span className="rounded bg-faint px-2 py-0.5 text-[10px] font-medium uppercase text-muted">
                {DOC_KIND_LABEL[d.kind] ?? d.kind}
              </span>
              <span className="min-w-0 flex-1 truncate">{d.filename}</span>
              <form action={removeDealDocument}>
                <input type="hidden" name="dealId" value={dealId} />
                <input type="hidden" name="docId" value={d.id} />
                <button
                  type="submit"
                  aria-label="Remove document"
                  className="rounded p-1 text-muted transition-colors hover:text-kill"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={addDealDocument}
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="dealId" value={dealId} />
        <select
          name="kind"
          defaultValue="rent_roll"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {DOC_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="file"
          name="file"
          required
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-faint file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-line"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:bg-faint"
        >
          Add
        </button>
      </form>

      {isPro ? (
        <form action={generateModel} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="dealId" value={dealId} />
          <Generate
            disabled={documents.length === 0 || active}
            hasModel={hasModel}
          />
          {documents.length === 0 && (
            <p className="mt-1.5 text-xs text-muted">
              Add at least one document to generate a model.
            </p>
          )}
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Building the Excel model is a{" "}
            <span className="font-medium text-ink">Pro</span> feature.
          </p>
          <Link
            href="/billing"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}
    </section>
  );
}

function Generate({
  disabled,
  hasModel,
}: {
  disabled: boolean;
  hasModel: boolean;
}): ReactNode {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {hasModel ? "Regenerate model" : "Generate model"}
    </button>
  );
}
