// The sample deal's first-draft model card, on /demo and the homepage's
// walkthrough: the deal page's Financials-tab card (deal-view's details,
// open as it opens with a model) around the card's own body
// (app/(app)/deals/[id]/model-body `ModelBody`) and its "Add more to the
// model" list, on the sample. What needs an account is left off, never
// imitated: the card's document and generate forms, and with them the
// heading's "or regenerate". Its download is the public sample's workbook.
import type { UnderwritingModel } from "@/lib/model/types";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import { DownloadRow, InputsNeeded, ModelBody } from "./(app)/deals/[id]/model-body";

/** The public sample's workbook, the one the header's tools download. */
export const SAMPLE_WORKBOOK_HREF = "/api/demo/underwrite.xlsx";

export function SampleModelCard({
  model,
  interest = null,
}: {
  model: UnderwritingModel;
  /** what the price buys, read as the deal page reads it (lib/compare-
   *  interest `modelReturnsRead`) */
  interest?: ModelReturnsRead | null;
}) {
  return (
    <details className="rounded-2xl border border-line bg-surface shadow-card" open>
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          First-draft model — ready
          <span className="text-xs font-normal text-muted">the Excel workbook</span>
        </span>
      </summary>
      <div className="border-t border-line p-5">
        {/* The sample is seeded with no document rows of its own, and the
            deal page compares none with the model's on it (`compare`). Its
            banner speaks of the sample's documents (`sample`), and the
            inputs its fixture was built from are ticked as in (`builtFrom`),
            never offered to a visitor as missing. */}
        <div className="flex flex-col gap-6">
          <ModelBody
            model={model}
            documents={[]}
            compare={false}
            sample
            interest={interest}
            download={<DownloadRow href={SAMPLE_WORKBOOK_HREF} />}
          />
          <InputsNeeded documents={[]} builtFrom={model.generatedFrom} />
        </div>
      </div>
    </details>
  );
}
