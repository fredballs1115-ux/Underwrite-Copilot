"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { rerunAnalysis, reconcileWithModel } from "../actions";
import { PendingButton } from "../../pending-button";
import {
  addSupplementNote,
  addSupplementFile,
  removeSupplement,
} from "./supplement-actions";
import { searchPublicComps } from "./comps-actions";
import { CompsMap } from "./comps-map";
import { FileDrop } from "../../file-drop";
import { FileField } from "../../file-field";
import { BrokerComps as BrokerCompsView } from "./deal-sections-view";
import { IconPaperclip, IconPlus, IconTrash } from "./deal-sections-base";

// The sections as drawn live in deal-sections-view.tsx (no server action, no
// map); every importer keeps reading them here.
export {
  EmptyState,
  deriveRisks,
  OverviewView,
  TermsView,
  ChallengerView,
  buildBrokerEmail,
  COMP_RATING,
  Reconciliation,
  TONE,
  MarketCheck,
  VerdictView,
  LEVER_META,
  SCENARIO_META,
  BASE_CELL,
} from "./deal-sections-view";

/** The broker comps as the deal page draws them: with the comps map and the
 *  public-web search, which deal-sections-view.tsx leaves out. */
export function BrokerComps(props: Omit<ComponentProps<typeof BrokerCompsView>, "map" | "searchAction">) {
  return <BrokerCompsView {...props} map={CompsMap} searchAction={searchPublicComps} />;
}

export function ReconcileSection({
  dealId,
  hasResult,
  error,
  disabled = false,
}: {
  dealId: string;
  hasResult: boolean;
  error: string | null;
  /** true while another pipeline runs — form stays visible but can't submit */
  disabled?: boolean;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        {hasResult ? "Reconcile a different model" : "Reconcile your model"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Upload your own underwriting — Excel, CSV, or a PDF / ARGUS export — and every gap against
        the OM is lined up from your side.
      </p>
      {error && (
        <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {error}
        </p>
      )}
      <form action={reconcileWithModel} className="mt-4 space-y-3">
        <input type="hidden" name="dealId" value={dealId} />
        <FileDrop
          name="model"
          accept=".xlsx,.xls,.csv,application/pdf"
          hint="Excel (.xlsx), CSV, or a PDF / Argus export"
          maxBytes={32 * 1024 * 1024}
        />
        <PendingButton
          disabled={disabled}
          pendingLabel="Uploading your model…"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Reconcile
        </PendingButton>
        {disabled && (
          <p className="text-xs text-muted">
            Available once the running analysis finishes.
          </p>
        )}
      </form>
    </section>
  );
}

/* ================================================================== */
/* Per-tab supplements — add your own data to any section              */
/* ================================================================== */

export type TabSupplement = {
  notes: { id: string; text: string; createdAt: string }[];
  /** `url` is the route that signs the file when it is clicked
   *  (lib/deal-file-link), null where the path is not the deal's own. */
  files: { id: string; name: string; createdAt: string; url: string | null }[];
};

export function Supplements({
  dealId,
  tab,
  data,
}: {
  dealId: string;
  tab: string;
  data: TabSupplement;
}) {
  if (data.notes.length === 0 && data.files.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
        Your additions
      </h3>
      <div className="mt-3 space-y-2">
        {data.notes.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 rounded-xl border border-line border-l-2 border-l-brand bg-surface p-4 shadow-sm"
          >
            <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">
              {n.text}
            </p>
            <RemoveButton dealId={dealId} tab={tab} id={n.id} kind="note" />
          </div>
        ))}
        {data.files.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm"
          >
            <IconPaperclip className="h-4 w-4 shrink-0 text-muted" />
            {f.url ? (
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-sm font-medium text-brand hover:underline"
              >
                {f.name}
              </a>
            ) : (
              <span className="flex-1 truncate text-sm">{f.name}</span>
            )}
            <RemoveButton dealId={dealId} tab={tab} id={f.id} kind="file" />
          </div>
        ))}
      </div>
    </section>
  );
}

function RemoveButton({
  dealId,
  tab,
  id,
  kind,
}: {
  dealId: string;
  tab: string;
  id: string;
  kind: "note" | "file";
}) {
  return (
    <form action={removeSupplement}>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        aria-label="Remove"
        className="shrink-0 rounded p-1 text-muted transition-colors hover:text-kill"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </form>
  );
}

/** A note or a file kept with the deal (deals.supplements), shown back under
 *  the section and on the Documents tab. Nothing in the analysis reads it —
 *  not the screen, the model or Ask — so the words promise a note kept with
 *  the deal, never a correction to a figure. */
export function AddData({ dealId, tab }: { dealId: string; tab: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-dashed border-line p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <IconPlus
          className={`h-4 w-4 transition-transform ${open ? "rotate-45" : ""}`}
        />
        Add a note or a file to this section
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <form action={addSupplementNote} className="space-y-2">
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="tab" value={tab} />
            <textarea
              name="text"
              aria-label="Note to keep with this deal"
              required
              rows={2}
              placeholder="A note to keep with this deal…"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Add note
            </button>
          </form>
          <div className="border-t border-line pt-3">
            <form
              action={addSupplementFile}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="dealId" value={dealId} />
              <input type="hidden" name="tab" value={tab} />
              <FileField name="file" />
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
              >
                Upload
              </button>
            </form>
            <p className="mt-1.5 text-[11px] text-muted">
              Kept with the deal for reference — the analysis does not read
              notes or files added here. PDF, Excel, CSV or image, up to 32 MB.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function RetryForm({
  dealId,
  label,
  className = "mt-3",
  secondary = false,
}: {
  dealId: string;
  label: string;
  /** the form's own spacing — none where it sits in a row of actions */
  className?: string;
  /** drawn as the second of two actions, beside a primary one */
  secondary?: boolean;
}) {
  return (
    <form action={rerunAnalysis} className={className}>
      <input type="hidden" name="dealId" value={dealId} />
      <PendingButton
        pendingLabel="Starting the screen…"
        className={
          secondary
            ? "rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
            : "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        }
      >
        {label}
      </PendingButton>
    </form>
  );
}

