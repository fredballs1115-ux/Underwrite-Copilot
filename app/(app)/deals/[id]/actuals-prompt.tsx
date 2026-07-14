"use client";

import { addDealDocument } from "./model-actions";
import { PendingButton } from "../../pending-button";
import { RetryForm } from "./deal-sections";

export type ActualsSlotState = "missing" | "uploaded" | "done";

/**
 * The post-OM prompt (Feature 1): "Add rent roll or T-12 for deeper analysis
 * (optional)." Up to two additional documents, tagged by type. Each slot walks
 * missing → uploaded (re-screen to fold it in) → done (in the analysis); the
 * parent hides the whole card once both are done or while a screen is running.
 * OM-only deals keep working exactly as before — this is purely additive.
 */
export function ActualsPrompt({
  dealId,
  rentRoll,
  t12,
}: {
  dealId: string;
  rentRoll: ActualsSlotState;
  t12: ActualsSlotState;
}) {
  const anyUploaded = rentRoll === "uploaded" || t12 === "uploaded";

  return (
    <section className="rounded-2xl border border-dashed border-brand/40 bg-brand/[0.03] p-5">
      <h2 className="text-sm font-semibold tracking-tight">
        Add rent roll or T-12 for deeper analysis{" "}
        <span className="font-normal text-muted">(optional)</span>
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        Real occupancy, in-place rents, and actual expenses replace the OM&apos;s
        narrative in the model — the returns and verdict re-base on what the
        property actually produced.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Slot dealId={dealId} kind="rent_roll" label="Rent roll" state={rentRoll} />
        <Slot dealId={dealId} kind="t12" label="T-12 operating statement" state={t12} />
      </div>

      {anyUploaded && (
        <div className="mt-1">
          <RetryForm dealId={dealId} label="Re-screen with the actuals" />
          <p className="mt-1.5 text-[11px] text-muted">
            The next screen reads the document, rebuilds the model on the
            actuals, and updates the verdict.
          </p>
        </div>
      )}
    </section>
  );
}

function Slot({
  dealId,
  kind,
  label,
  state,
}: {
  dealId: string;
  kind: "rent_roll" | "t12";
  label: string;
  state: ActualsSlotState;
}) {
  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-pass/30 bg-pass/5 px-3 py-2.5">
        <span aria-hidden className="text-pass">✓</span>
        <span className="text-sm">
          <span className="font-medium">{label}</span>{" "}
          <span className="text-muted">— folded into the analysis</span>
        </span>
      </div>
    );
  }
  if (state === "uploaded") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span aria-hidden className="text-brand">↑</span>
        <span className="text-sm">
          <span className="font-medium">{label}</span>{" "}
          <span className="text-muted">— uploaded; re-screen to fold it in</span>
        </span>
      </div>
    );
  }
  return (
    <form
      action={addDealDocument}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="kind" value={kind} />
      <span className="w-full text-sm font-medium sm:w-auto sm:min-w-28">{label}</span>
      <input
        type="file"
        name="file"
        required
        accept=".pdf,.xlsx,.xls,.csv,application/pdf"
        aria-label={`Choose the ${label} file`}
        className="min-w-0 flex-1 text-xs text-muted file:mr-2 file:rounded-lg file:border file:border-line file:bg-faint file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-line/50"
      />
      <PendingButton
        pendingLabel="Uploading…"
        className="rounded-lg border border-brand/50 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/5"
      >
        Add
      </PendingButton>
    </form>
  );
}
