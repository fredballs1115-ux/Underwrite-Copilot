"use client";

import { addDealDocument } from "./model-actions";
import { PendingButton } from "../../pending-button";
import { RetryForm } from "./deal-sections";

export type ActualsSlotState = "missing" | "uploaded" | "done";

/**
 * The post-OM prompt (Feature 1), directly under the stress test on the
 * Overview: the deal's own rent roll and T-12, up to two documents tagged by
 * type. Each slot walks missing → uploaded (re-screen to fold it in) → done
 * (in the analysis); the parent hides the whole card once both are done or
 * while a screen is running. OM-only deals keep working exactly as before —
 * this is purely additive.
 *
 * Its words say what the documents do to the stress test, and only that
 * (lib/stress-test): a T-12 is the evidence the NOI, vacancy and insurance
 * rows are judged on (its NOI, its vacancy loss over its rent line, its
 * insurance line), a rent roll the vacancy row's (the occupancy it runs at).
 * The T-12's tax line is shown beside the taxes row and judges nothing, so
 * taxes are not named. And a document dated after the screen's verdict (and
 * uploaded after it) is what the track record scores the screen's
 * challenges against (lib/track-record) — never its taxes or insurance,
 * which a seller's T-12 cannot show for a new owner.
 */
export function ActualsPrompt({
  dealId,
  rentRoll,
  t12,
  onReconcile = null,
}: {
  dealId: string;
  rentRoll: ActualsSlotState;
  t12: ActualsSlotState;
  /** opens the Reconciler, where the page offers one; null leaves the link
   *  out */
  onReconcile?: (() => void) | null;
}) {
  const anyUploaded = rentRoll === "uploaded" || t12 === "uploaded";

  return (
    <section className="rounded-2xl border border-dashed border-brand/40 bg-brand/[0.03] p-5" data-qa="actuals-prompt">
      <h2 className="text-sm font-semibold tracking-tight">
        Test the OM against the building&apos;s own figures{" "}
        <span className="font-normal text-muted">(optional)</span>
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        A T-12 tests the OM&apos;s NOI, vacancy and insurance against the
        building&apos;s own year; a rent roll tests its vacancy against the
        occupancy it runs at. Dated after this screen (the roll&apos;s as-of,
        the T-12&apos;s period end), either one lets the track record score
        its challenges.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Slot dealId={dealId} kind="rent_roll" label="Rent roll" state={rentRoll} />
        <Slot dealId={dealId} kind="t12" label="T-12 operating statement" state={t12} />
      </div>

      {anyUploaded && (
        <div className="mt-1">
          <RetryForm dealId={dealId} label="Re-screen with the actuals" />
          <p className="mt-1.5 text-[11px] text-muted">
            The next screen reads the document into the stress test and the
            model, and makes the call again.
          </p>
        </div>
      )}

      {onReconcile && (
        <p className="mt-3 text-xs">
          <a
            href={`/deals/${dealId}?tab=analyses&a=reconciler`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onReconcile();
            }}
            className="font-medium text-brand hover:underline"
            data-qa="actuals-reconcile"
          >
            Reconcile your own model against the OM
          </a>
        </p>
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
