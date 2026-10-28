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
 * (lib/stress-deciders' orders): a T-12's NOI decides the NOI row, its
 * expenses less its tax and insurance lines the operating-expense row, and its
 * insurance line decides the insurance row where the OM's premium sits more
 * than 2% under it (the seller's actual premium, the building's own
 * history, not a new owner's quote), and stands beside it otherwise; on
 * a vacancy for today counted by doors the rent roll decides, and the T-12,
 * dollars not doors, decides only one the OM states as economic; beside a
 * stabilized vacancy they show today's gap to close and never decide it
 * (lib/stress-deciders' VACANCY_ORDER.stabilized: the market's published
 * figure, then the class norm). The T-12's tax line decides the taxes row
 * where the OM's bill sits more than 2% under it and no reset bill can be
 * struck (lib/stress-deciders' TAXES_ORDER, its third step), stretched at
 * most: the seller's bill, the building's history. And a document dated
 * after the screen's verdict (and uploaded after it) is what the track
 * record scores the screen's stress-test rows against (lib/track-record),
 * in the same measures — never its taxes or insurance, which a seller's
 * T-12 cannot show for a new owner.
 */
const ACTUALS_TESTS = [
  { doc: "T-12", tests: "The OM's NOI and its operating expenses; and its tax bill and insurance premium where either sits more than 2% under the seller's own (a tax bill only where no reset bill can be struck): the building's history, not a new owner's bill or quote." },
  { doc: "Rent roll", tests: "The OM's occupancy today, by its doors. (The T-12 tests an economic vacancy today, in dollars.)" },
] as const;
/** The rule the documents never decide. */
const ACTUALS_STABILIZED =
  "A stabilized vacancy is held to the market's published figure, else the class's norm; beside it the documents show today's gap to close, and never decide it.";
/** What the documents do for the track record. */
const ACTUALS_RECORD =
  "Dated after this screen (the roll's as-of, the T-12's period end), either one lets the track record score the stress test's rows, each in its own measure.";
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
      {/* What each document turns into a test, one line a document, and
          the one rule the documents never decide (lib/stress-deciders). */}
      <ul className="mt-1 space-y-1 text-xs leading-relaxed text-muted" data-qa="actuals-tests">
        {ACTUALS_TESTS.map((t) => (
          <li key={t.doc} className="flex items-start gap-2">
            <span className="mt-px inline-block w-16 shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-center text-[10px] font-medium text-brand">{t.doc}</span>{" "}
            <span>{t.tests}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{ACTUALS_STABILIZED}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{ACTUALS_RECORD}</p>

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
