import { assetClassLabel } from "@/lib/asset-class";
import type { MemoData } from "@/lib/memo/memo-document";

/**
 * The top of the sample's one-page IC memo, as a picture of it: the memo's
 * own title, the line under it, the call and the words under the call, and
 * its first key terms with the basis under the price, from the data the
 * PDF is drawn from (lib/sample-memo `sampleMemoData`, the download's own
 * inputs) — so the tile beside "Download the sample memo" shows the memo it
 * downloads, never grey bars and a typed chip. The call is set in the
 * memo's own colour for it. A miniature of a page, not a paragraph: the
 * reason is clamped to two lines, the whole of it in the PDF.
 */
export function MemoPreview({ data }: { data: MemoData }) {
  // The memo's own subtitle (MemoPage's `subParts`).
  const sub = [data.market, assetClassLabel(data.assetClass), data.strategyLine ?? ""].filter(Boolean).join(" · ");
  return (
    <div role="group" aria-label="The sample memo's first lines" className="rounded-lg border border-line bg-paper p-3">
      <p className="truncate text-[11px] font-semibold tracking-tight">{data.name}</p>
      {sub ? <p className="truncate text-[9px] text-muted">{sub}</p> : null}
      {data.verdictWord ? (
        <div className="mt-2 rounded-md bg-faint px-2 py-1.5" data-qa="memo-call">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold" style={{ color: data.verdictColor }}>
              {data.verdictWord}
            </span>{" "}
            <span className="text-[9px] text-muted">{data.verdictSub}</span>
          </p>
          {data.verdictReason ? <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug">{data.verdictReason}</p> : null}
        </div>
      ) : null}
      <dl className="mt-2 grid grid-cols-2 gap-1.5">
        {data.keyTerms.slice(0, 4).map((t) => (
          <div key={t.label} className="min-w-0 rounded bg-faint px-1.5 py-1">
            <dt className="truncate text-[8px] uppercase tracking-wide text-muted">{t.label}</dt>
            <dd className="truncate font-mono text-[10px] font-semibold tabular-nums">
              {t.value}
              {t.sub ? (
                <>
                  {" "}
                  <span className="font-sans text-[8px] font-normal text-muted">{t.sub}</span>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
