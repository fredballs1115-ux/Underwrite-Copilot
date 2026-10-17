"use client";

import Link from "next/link";
import { FileField } from "../../file-field";
import { type ReactNode } from "react";
import { DOC_KINDS, DOC_KIND_LABEL, type DealDocument } from "@/lib/documents";
import { fileKindOf } from "@/lib/file-kind";
import { FileKindIcon, SAMPLE_ACTUALS_WORDS } from "./source-documents";
import type { UnderwritingModel } from "@/lib/model/types";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import {
  addDealDocument,
  removeDealDocument,
  generateModel,
} from "./model-actions";
// The returns headline and its tiles live in returns-headline.tsx, the
// card's views in model-panels.tsx and the card's body in model-body.tsx
// (none with a server action); importers keep reading them here.
import { DownloadRow, InputsNeeded, ModelBody } from "./model-body";
export { ReturnsHeadline } from "./returns-headline";
export { Sensitivity, StressPanel, Conflicts, Assumptions, CapexPanel, CashFlow } from "./model-panels";

export function ModelView({
  dealId,
  model,
  documents,
  active,
  isPro,
  downloadsOpen = isPro,
  isSample = false,
  interest = null,
}: {
  dealId: string;
  model: UnderwritingModel | null;
  documents: DealDocument[];
  active: boolean;
  isPro: boolean;
  /** the workbook download: Pro, or the reader's own sample deal, which
   *  the public pages promise free (lib/sample-exports) */
  downloadsOpen?: boolean;
  /** the sample deal, whose model lists the fixture's documents and which
   *  has no document rows of its own to compare them with */
  isSample?: boolean;
  /** what the price buys, read by the compare table's rule (lib/compare-
   *  interest `modelReturnsRead`): a note's, a share's or a preferred
   *  equity position's returns withheld */
  interest?: ModelReturnsRead | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {model ? (
        <ModelBody
          model={model}
          documents={documents}
          compare={!isSample}
          sample={isSample}
          interest={interest}
          download={
            downloadsOpen ? (
              <DownloadRow href={`/api/deals/${dealId}/underwrite.xlsx`} />
            ) : (
              <Link
                href="/billing?upsell=underwrite"
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-caution/30 bg-caution/5 px-4 py-2.5 text-sm font-medium text-caution transition-colors hover:bg-caution/10"
              >
                Upgrade to Pro to download the OM underwrite model (.xlsx)
              </Link>
            )
          }
        />
      ) : (
        <Intro />
      )}
      {/* The sample has no document rows of its own: the kinds its model
          was built from are ticked as in, as the public sample's are. */}
      <InputsNeeded documents={documents} builtFrom={isSample ? model?.generatedFrom : undefined} />
      <DocumentsPanel
        dealId={dealId}
        documents={documents}
        active={active}
        hasModel={!!model}
        isPro={isPro}
        isSample={isSample}
        builtFrom={model?.generatedFrom ?? []}
      />
    </div>
  );
}

/** A document as the model keeps it ("Rent roll: Maddox-RentRoll.xlsx"):
 *  its kind and its file name. */
function sampleDocument(label: string): { label: string; kind: string; filename: string } {
  const at = label.indexOf(": ");
  return at > 0
    ? { label, kind: label.slice(0, at).trim(), filename: label.slice(at + 2).trim() }
    : { label, kind: "Document", filename: label.trim() };
}

function Intro() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Build a first-draft underwriting model
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
        Upload what you have — one document is enough to start. Actuals beat
        pro forma, and every conflict is shown with its sources.
      </p>
    </div>
  );
}

function DocumentsPanel({
  dealId,
  documents,
  active,
  hasModel,
  isPro,
  isSample = false,
  builtFrom = [],
}: {
  dealId: string;
  documents: DealDocument[];
  active: boolean;
  hasModel: boolean;
  isPro: boolean;
  /** the sample deal: no upgrade prompt is drawn on it — the public pages
   *  promise the sample whole (lib/sample-exports) */
  isSample?: boolean;
  /** the documents the model names as built from (`generatedFrom`) */
  builtFrom?: string[];
}) {
  // Only the sample lists the model's documents in place of rows: a real
  // deal's rows are its documents, and its banner says what changed since.
  const sampleRows = isSample && documents.length === 0 ? builtFrom.map(sampleDocument) : [];
  return (
    // The banner's "Regenerate the model" lands here, at the control.
    <section id="model-documents" className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Documents <span className="font-normal text-muted">· {documents.length + sampleRows.length}</span>
      </h2>

      {/* The sample holds no document rows: its model was built from the
          three documents it names (`generatedFrom`), which were read into
          it with no file behind them. They are listed as the model names
          them, the Documents tab's way, never as "0" under a model built
          from three. */}
      {sampleRows.length > 0 && (
        <>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line" data-qa="model-sample-documents">
            {sampleRows.map((d) => (
              <li key={d.label} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <FileKindIcon kind={fileKindOf(d.filename)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.filename}</span>
                  <span className="block text-xs text-muted">{d.kind}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            {`The model was built from these ${sampleRows.length === 1 ? "document" : `${sampleRows.length} documents`}, ${SAMPLE_ACTUALS_WORDS}.`}
          </p>
        </>
      )}

      {documents.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <FileKindIcon kind={fileKindOf(d.filename, d.content_type)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.filename}</span>
                <span className="block text-xs text-muted">{DOC_KIND_LABEL[d.kind] ?? d.kind}</span>
              </span>
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
          aria-label="Document type"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {DOC_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <FileField name="file" />
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
      ) : isSample ? null : (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Building this model from your documents is a{" "}
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
