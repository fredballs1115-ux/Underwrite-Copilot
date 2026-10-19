import { assetClassLabel } from "@/lib/asset-class";
import type { MemoData } from "@/lib/memo/memo-document";

/** A firm's branding as the account page shows it: the memo's masthead and
 *  footer with the firm's name, logo and footer text laid in, as the PDF
 *  lays them (lib/memo/memo-document's masthead and footer). The logo is a
 *  URL the page can show; a blank is null, and the memo's default stands. */
export type MemoPreviewBranding = {
  firmName: string | null;
  logoUrl: string | null;
  footerText: string | null;
};

/**
 * The top of the sample's one-page IC memo, as a picture of it: the memo's
 * own title, the line under it, the call and the words under the call, and
 * its first key terms with the basis under the price, from the data the
 * PDF is drawn from (lib/sample-memo `sampleMemoData`, the download's own
 * inputs) — so the tile beside "Download the sample memo" shows the memo it
 * downloads, never grey bars and a typed chip. The call is set in the
 * memo's own colour for it. A miniature of a page, not a paragraph: the
 * reason is clamped to two lines, the whole of it in the PDF.
 *
 * With `branding`, the masthead (logo, firm name, "Deal Screening Memo")
 * heads it and the footer closes it, each as the PDF draws them — the
 * account page's picture of what branding changes.
 */
export function MemoPreview({
  data,
  branding,
  label = "The sample memo's first lines",
}: {
  data: MemoData;
  branding?: MemoPreviewBranding;
  label?: string;
}) {
  // The memo's own subtitle (MemoPage's `subParts`).
  const sub = [data.market, assetClassLabel(data.assetClass), data.strategyLine ?? ""].filter(Boolean).join(" · ");
  const b = branding;
  const firm = b?.firmName?.trim() || null;
  const logo = b?.logoUrl || null;
  const foot = b?.footerText?.trim() || null;
  return (
    <div role="group" aria-label={label} className="rounded-lg border border-line bg-paper p-3">
      {b ? (
        // The PDF's masthead (memo-document's brandRow): the logo, then the
        // firm's name; the UC badge and the product's name only where the
        // firm states neither.
        <div data-qa="memo-preview-masthead" className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the firm's own logo, signed for this page
              <img src={logo} alt="Firm logo" className="h-4 max-w-[64px] shrink-0 object-contain" />
            ) : null}
            {!logo && !firm ? (
              <span className="shrink-0 rounded bg-brand px-1 text-[8px] font-bold text-white">UC</span>
            ) : null}
            {firm ? (
              <span className="truncate text-[10px] font-semibold">{firm}</span>
            ) : !logo ? (
              <span className="truncate text-[10px] font-semibold">Underwrite Copilot</span>
            ) : null}
          </span>
          <span className="shrink-0 text-[8px] text-muted">Deal Screening Memo</span>
        </div>
      ) : null}
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
      {b ? (
        // The PDF's footer: the firm's footer text over the memo's own line,
        // the firm's name at the right, and "Powered by" under a branded one.
        <div data-qa="memo-preview-footer" className="mt-2 border-t border-line pt-1.5 text-[8px] text-muted">
          <div className="flex items-end justify-between gap-2">
            <span className="min-w-0">
              {foot ? <span className="block truncate">{foot}</span> : null}
              <span className="block truncate">First-pass screen, not investment advice.</span>
            </span>
            <span className="shrink-0">{firm ?? "Underwrite Copilot"}</span>
          </div>
          {firm || logo || foot ? <p className="mt-1 text-center text-[7px]">Powered by Underwrite Copilot</p> : null}
        </div>
      ) : null}
    </div>
  );
}
