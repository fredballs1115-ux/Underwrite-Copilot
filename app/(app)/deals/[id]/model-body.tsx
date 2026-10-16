"use client";

// The first-draft model card's body — the banner, the returns, the stress
// test, the grid, the conflicts, the assumptions, the capital plan, the cash
// flow, what the model reconciled and what to verify, then a download and
// the card's two-model sentence — in a module with no server action, so the
// public sample screen (/demo) and the homepage's walkthrough draw the SAME
// card the deal page's Financials tab draws (model-view's `ModelView`, which
// adds the document and generate forms after it). The download is the
// caller's: the deal page's own workbook, or its upgrade link, or the public
// sample's.
import type { ReactNode } from "react";
import type { DealDocument } from "@/lib/documents";
import { MODEL_INPUTS, MODEL_PASTES } from "@/lib/model/inputs";
import type { UnderwritingModel } from "@/lib/model/types";
import {
  builtSentence,
  changedSinceSentence,
  modelProvenance,
  sourcingSentence,
} from "@/lib/model/provenance";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import { ReturnsHeadline } from "./returns-headline";
import { Sensitivity, StressPanel, Conflicts, Assumptions, CapexPanel, CashFlow } from "./model-panels";

/** The card's body with a model, as the deal page stacks it. */
export function ModelBody({
  model,
  documents,
  compare,
  interest = null,
  download,
}: {
  model: UnderwritingModel;
  documents: Pick<DealDocument, "id" | "kind" | "filename">[];
  /** compare the deal's documents with the model's — never on the sample */
  compare: boolean;
  /** what the price buys (lib/compare-interest `modelReturnsRead`): a
   *  note's, a share's or a preferred equity position's returns withheld */
  interest?: ModelReturnsRead | null;
  /** the workbook's download, or the way to it */
  download: ReactNode;
}) {
  // Returns the price did not buy are withheld — and so are the stress
  // panel's and the grid's, which recompute the same returns.
  const withheld = interest?.withheld ?? null;
  return (
    <>
      <FirstDraftBanner model={model} documents={documents} compare={compare} />
      <ReturnsHeadline model={model} interest={interest} />
      {!withheld && <StressPanel model={model} />}
      {!withheld && <Sensitivity model={model} />}
      <Conflicts conflicts={model.conflicts} />
      <Assumptions metrics={model.metrics} generatedFrom={model.generatedFrom} />
      <CapexPanel model={model} />
      <CashFlow cashFlow={model.cashFlow} />
      <SummaryCaveats summary={model.summary} caveats={model.caveats} />
      <div className="flex flex-col gap-1.5">
        {download}
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
  );
}

export function InputsNeeded({ documents }: { documents: Pick<DealDocument, "kind">[] }) {
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
  documents: Pick<DealDocument, "id" | "kind" | "filename">[];
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

/** The workbook's download button: the deal's own route, or the public
 *  sample's (/api/demo/underwrite.xlsx). */
export function DownloadRow({ href }: { href: string }) {
  return (
    <a
      href={href}
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
