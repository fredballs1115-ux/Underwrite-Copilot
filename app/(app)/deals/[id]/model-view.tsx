"use client";

import Link from "next/link";
import { FileField } from "../../file-field";
import { type ReactNode } from "react";
import { DOC_KINDS, DOC_KIND_LABEL, type DealDocument } from "@/lib/documents";
import { MODEL_INPUTS, MODEL_PASTES } from "@/lib/model/inputs";
import type { UnderwritingModel } from "@/lib/model/types";
import {
  builtSentence,
  changedSinceSentence,
  modelProvenance,
  sourcingSentence,
} from "@/lib/model/provenance";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import {
  addDealDocument,
  removeDealDocument,
  generateModel,
} from "./model-actions";
// The returns headline and its tiles live in returns-headline.tsx, and the
// card's views in model-panels.tsx (neither with a server action);
// importers keep reading them here.
import { ReturnsHeadline } from "./returns-headline";
import { Sensitivity, StressPanel, Conflicts, Assumptions, CapexPanel, CashFlow } from "./model-panels";
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
  // Returns the price did not buy are withheld — and so are the stress
  // panel's and the grid's, which recompute the same returns.
  const withheld = interest?.withheld ?? null;
  return (
    <div className="flex flex-col gap-6">
      {model ? (
        <>
          <FirstDraftBanner model={model} documents={documents} compare={!isSample} />
          <ReturnsHeadline model={model} interest={interest} />
          {!withheld && <StressPanel model={model} />}
          {!withheld && <Sensitivity model={model} />}
          <Conflicts conflicts={model.conflicts} />
          <Assumptions metrics={model.metrics} generatedFrom={model.generatedFrom} />
          <CapexPanel model={model} />
          <CashFlow cashFlow={model.cashFlow} />
          <SummaryCaveats summary={model.summary} caveats={model.caveats} />
          <div className="flex flex-col gap-1.5">
            {downloadsOpen ? (
              <DownloadRow dealId={dealId} />
            ) : (
              <Link
                href="/billing?upsell=underwrite"
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-caution/30 bg-caution/5 px-4 py-2.5 text-sm font-medium text-caution transition-colors hover:bg-caution/10"
              >
                Upgrade to Pro to download the OM underwrite model (.xlsx)
              </Link>
            )}
            {/* Two models, said as two: the card's returns are this
                first draft's; the workbook's are the OM underwrite's, and
                so are the Overview's sensitivity playground's. */}
            <p data-qa="workbook-note" className="max-w-2xl text-xs leading-relaxed text-muted">
              The workbook is a separate model, built from the memorandum’s
              terms — its returns can differ from the ones above. The
              Overview’s sensitivity playground runs the workbook’s model,
              not this one.
            </p>
          </div>
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
        isSample={isSample}
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
        Upload what you have — one document is enough to start. Actuals beat
        pro forma, and every conflict is shown with its sources.
      </p>
    </div>
  );
}

function InputsNeeded({ documents }: { documents: DealDocument[] }) {
  const have = new Set(documents.map((d) => d.kind));
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Add more to the model
      </h2>
      {/* One chip per input, ticked when it is in: what each one adds to the
          model is the tooltip, not a line of copy under every row. */}
      <ul className="mt-3 flex flex-wrap gap-2">
        {MODEL_INPUTS.map((inp) => {
          const ok = have.has(inp.kind);
          return (
            <li
              key={inp.kind}
              title={`${inp.fills} — ${ok ? "added" : "optional"}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                ok ? "border-pass/30 bg-pass/10 text-pass" : "border-line bg-paper text-ink"
              }`}
            >
              <span aria-hidden className="font-bold">
                {ok ? "✓" : "+"}
              </span>
              {inp.label}
              <span className="sr-only">{ok ? "— added" : "— optional"}</span>
            </li>
          );
        })}
        {MODEL_PASTES.map((p, i) => (
          <li
            key={i}
            title={`${p.fills} — optional`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink"
          >
            <span aria-hidden className="font-bold">+</span>
            {p.label}
            <span className="sr-only">— optional</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The first-draft workbook this card once exported, and its Conflicts sheet,
// were retired (2d036c4): the one Excel download is the OM underwrite
// (lib/underwrite/workbook.ts), a separate model built from the
// memorandum's figures. The card says so beside its download button.
//
// What the banner says is counted, never claimed (lib/model/provenance):
// how many assumptions a document states and how many the model chose where
// none does, when the model was built and from which documents, and what
// the deal's documents gained or lost since — with the way to rebuild.
function FirstDraftBanner({
  model,
  documents,
  compare,
}: {
  model: UnderwritingModel;
  documents: DealDocument[];
  /** compare the deal's documents with the model's — never on the sample */
  compare: boolean;
}) {
  const read = modelProvenance(model, documents);
  const changed = compare ? changedSinceSentence(read) : "";
  return (
    <div className="rounded-xl border border-line border-l-4 border-l-caution bg-caution/5 px-4 py-3">
      <p className="text-sm font-medium">First-draft model — verify before relying on it</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{sourcingSentence(read)}</p>
      <p data-qa="model-built" className="mt-1 text-xs leading-relaxed text-muted">
        {builtSentence(read)}
      </p>
      {changed && (
        <p data-qa="model-changed" className="mt-1 text-xs font-medium leading-relaxed text-caution">
          {changed}{" "}
          <a href="#model-documents" className="underline underline-offset-2 transition-colors hover:text-ink">
            Regenerate the model
          </a>{" "}
          to build from the documents the deal has now.
        </p>
      )}
    </div>
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
      href={`/api/deals/${dealId}/underwrite.xlsx`}
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
      Download the OM underwrite model (.xlsx)
    </a>
  );
}

function DocumentsPanel({
  dealId,
  documents,
  active,
  hasModel,
  isPro,
  isSample = false,
}: {
  dealId: string;
  documents: DealDocument[];
  active: boolean;
  hasModel: boolean;
  isPro: boolean;
  /** the sample deal: no upgrade prompt is drawn on it — the public pages
   *  promise the sample whole (lib/sample-exports) */
  isSample?: boolean;
}) {
  return (
    // The banner's "Regenerate the model" lands here, at the control.
    <section id="model-documents" className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 shadow-sm">
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
