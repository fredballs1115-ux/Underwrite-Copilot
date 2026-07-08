"use client";

import { useState, useTransition } from "react";
import {
  recomputeDiscrepancy,
  severityLabel,
  formatDelta,
  type Discrepancy,
  type ReconcileResult,
  type Severity,
} from "@/lib/reconcile";
import { DOC_KIND_LABEL } from "@/lib/documents";
import { setReconOverride } from "./reconcile-actions";

const SEV_PILL: Record<Severity, string> = {
  red_flag: "bg-kill/10 text-kill",
  material: "bg-caution/10 text-caution",
  minor: "bg-line/70 text-muted",
};

/**
 * The discrepancies card (Feature 3): every figure the deal's documents
 * disagree on, ranked by severity, with which source feeds the model and a
 * per-line toggle to switch it. Sits above the analysis so the conflicts are
 * seen before the verdict. Toggling recomputes the row instantly and persists
 * the choice for the next model generation.
 */
export function ReconciliationPanel({
  dealId,
  result,
}: {
  dealId: string;
  result: ReconcileResult;
}) {
  const [rows, setRows] = useState<Discrepancy[]>(result.discrepancies);
  const [, startTransition] = useTransition();

  if (!rows.length) return null;

  const docLabel = (k: string) => DOC_KIND_LABEL[k] ?? k;

  const choose = (idx: number, docKind: string) => {
    setRows((prev) =>
      prev.map((d, i) => (i === idx ? recomputeDiscrepancy(d, docKind) : d)),
    );
    startTransition(() => {
      void setReconOverride(dealId, rows[idx].key, docKind);
    });
  };

  const counts = {
    red_flag: rows.filter((r) => r.severity === "red_flag").length,
    material: rows.filter((r) => r.severity === "material").length,
    minor: rows.filter((r) => r.severity === "minor").length,
  };
  const summaryParts = [
    counts.red_flag ? `${counts.red_flag} red flag${counts.red_flag > 1 ? "s" : ""}` : "",
    counts.material ? `${counts.material} material` : "",
    counts.minor ? `${counts.minor} minor` : "",
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Document reconciliation
        </h2>
        <p className="text-xs text-muted">
          {rows.length} discrepanc{rows.length === 1 ? "y" : "ies"}
          {summaryParts.length ? `: ${summaryParts.join(", ")}` : ""}
        </p>
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        Where the OM, rent roll, and T-12 disagree. The source in use feeds the
        model — switch it per line if you trust a different document.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((d, idx) => (
          <div key={d.key} className="rounded-xl border border-line/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{d.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted">
                  Δ {formatDelta(d.deltaPct)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEV_PILL[d.severity]}`}
                >
                  {severityLabel(d.severity)}
                </span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {d.values.map((v) => {
                const inUse = v.docKind === d.inUse;
                return (
                  <button
                    key={v.docKind}
                    type="button"
                    onClick={() => choose(idx, v.docKind)}
                    aria-pressed={inUse}
                    title={`Use the ${docLabel(v.docKind)} value for the model`}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition-colors ${
                      inUse
                        ? "border-brand/50 bg-brand/5"
                        : "border-line hover:bg-faint"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${inUse ? "bg-brand" : "bg-line"}`}
                    />
                    <span>
                      <span className="text-muted">{docLabel(v.docKind)}</span>{" "}
                      <span className="font-mono font-semibold tabular-nums">{v.value}</span>
                    </span>
                    {inUse && (
                      <span className="ml-0.5 text-[9px] font-semibold uppercase text-brand">
                        in use
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
