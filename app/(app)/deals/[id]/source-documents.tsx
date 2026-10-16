import type { ReactNode } from "react";
import Link from "next/link";
import { dealFileLinkFor } from "@/lib/deal-file-link";
import { servedInline } from "@/lib/inline-types";
import { fileKindOf, FILE_KIND_WORDS, type FileKind } from "@/lib/file-kind";
import { DOC_KIND_LABEL, type DealDocument } from "@/lib/documents";
import { rentRollDateWords, t12DateWords, type ActualsRead } from "@/lib/actuals/actuals-read";

// The Documents tab's "Source documents" card, as drawn: the memorandum's
// row, the typed facts where the deal was typed by hand, the deal's stored
// documents and the memo's download. Pure — no server action, no hook, plain
// data — so the deal page draws it around its own controls (Replace OM, the
// deal's avatar) through the slots, and a public page draws the sample's the
// same way with no session.
//
// The sample deal holds no file: its memorandum is fictional, and its rent
// roll and T-12 were read into it with nothing behind them to open. So its
// card lists those two as the Overview's actuals card reads them (their own
// dates, lib/actuals/actuals-read) and says there is no file to open, rather
// than "none uploaded" beside an Overview that shows both.

/** What the sample's OM row says in place of a file. */
export const SAMPLE_OM_WORDS = "none — the sample's memorandum is fictional";
/** What the sample's rent roll and T-12 rows say in place of a link. */
export const SAMPLE_ACTUALS_WORDS = "read into the sample — no file to open";

const KIND_LABEL: Record<string, string> = {
  om: "Offering memorandum",
  rent_roll: "Rent roll",
  t12: "T-12",
  financials: "Financials",
  loan_terms: "Loan terms",
  bov: "BOV",
  other: "Document",
};

export interface SourceDocumentsData {
  dealId: string;
  /** a memorandum is stored on the deal */
  hasOm: boolean;
  /** the route that signs the OM on click (lib/om-link), or null */
  omUrl: string | null;
  /** the sample deal: no file behind any row */
  sample: boolean;
  /** a typed-facts deal (no OM, not the sample) */
  typedFacts: boolean;
  documents: DealDocument[];
  /** the sample's rent roll and T-12 as the Overview reads them; read only
   *  on the sample, where no document row stands for them */
  sampleActuals?: Pick<ActualsRead, "rentRoll" | "t12"> | null;
  /** the memo: a download, an upgrade, or nothing (no verdict yet) */
  memo?: { href: string } | { upsell: string } | null;
}

/** A stored file's kind as a picture: a page with its kind drawn on
 *  it — a PDF's band, a spreadsheet's grid, an image's hills, a document's
 *  lines — in the slot the memorandum's avatar takes, so the names start at
 *  one x. Hidden from a screen reader, which hears the file's own name and
 *  the row's kind word (Rent roll, BOV…) beside it. */
export function FileKindIcon({ kind }: { kind: FileKind }) {
  const tone =
    kind === "pdf"
      ? "text-kill"
      : kind === "sheet"
        ? "text-pass"
        : kind === "image"
          ? "text-asset-office"
          : kind === "doc"
            ? "text-brand"
            : "text-muted";
  return (
    <span
      aria-hidden
      data-file-kind={kind}
      title={FILE_KIND_WORDS[kind]}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-faint ${tone}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M6 2.75h8.5L19 7.25v14H6z" />
        <path d="M14.5 2.75v4.5H19" />
        {kind === "pdf" && <rect x="8" y="12" width="9" height="5" rx="1" fill="currentColor" stroke="none" />}
        {kind === "sheet" && <path d="M8.5 11h8v7h-8zM8.5 13.33h8M8.5 15.67h8M11.17 11v7M13.83 11v7" />}
        {kind === "image" && (
          <>
            <circle cx="10.5" cy="11.5" r="1.25" />
            <path d="M8.5 18l3-3.5 2 2 1.5-1.5 1.5 3" />
          </>
        )}
        {(kind === "doc" || kind === "text") && <path d="M8.5 11h8M8.5 13.5h8M8.5 16h5" />}
      </svg>
    </span>
  );
}

/** One of the sample's actuals, listed with its own date and no link. */
function SampleActualsRow({ kind, label, date }: { kind: "rent_roll" | "t12"; label: string; date: string | null }) {
  return (
    <li data-doc-row={kind} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
      <FileKindIcon kind="sheet" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {date && <span className="shrink-0 text-xs text-muted">{date}</span>}
      <span className="w-full text-xs text-muted sm:w-auto">{SAMPLE_ACTUALS_WORDS}</span>
    </li>
  );
}

export function SourceDocumentsView({
  data,
  omPicture,
  omActions,
  children,
}: {
  data: SourceDocumentsData;
  /** the memorandum row's picture: the deal's own avatar on the deal page,
   *  the sample's cover on a public page */
  omPicture?: ReactNode;
  /** the memorandum row's controls (Replace OM, Attach OM) on the deal page */
  omActions?: ReactNode;
  /** drawn under the list and the memo (the typed facts' editor) */
  children?: ReactNode;
}) {
  const { dealId, hasOm, omUrl, sample, typedFacts, documents } = data;
  const actuals = sample ? (data.sampleActuals ?? null) : null;
  const memo = data.memo ?? null;
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">Source documents</h2>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        <li data-doc-row="om" className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
          {/* The memorandum wears the deal's own picture (its photograph,
              else its drawn cover), the way a deal room shows the deck. */}
          {omPicture ?? <FileKindIcon kind="pdf" />}
          <span className="min-w-0 flex-1 truncate font-medium">Offering memorandum</span>
          {omUrl && (
            <a
              href={omUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens the uploaded OM"
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
            >
              View
            </a>
          )}
          {omActions}
          {!hasOm && !typedFacts && (
            <span className="text-xs text-muted">{sample ? SAMPLE_OM_WORDS : "none uploaded"}</span>
          )}
        </li>
        {actuals?.rentRoll && (
          <SampleActualsRow kind="rent_roll" label="Rent roll" date={rentRollDateWords(actuals.rentRoll)} />
        )}
        {actuals?.t12 && <SampleActualsRow kind="t12" label="T-12" date={t12DateWords(actuals.t12)} />}
        {typedFacts && (
          <li className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <FileKindIcon kind="text" />
            <span className="min-w-0 flex-1 truncate font-medium">Typed deal facts</span>
            <span className="text-xs text-muted">entered by hand — the screen runs on these</span>
          </li>
        )}
        {documents.map((d) => {
          // Signed when it is clicked (app/api/deals/[id]/file), so a page
          // left open never hands over an expired link.
          const href = dealFileLinkFor(dealId, d.storage_path);
          // A PDF or an image opens in the browser; anything else — a rent
          // roll's spreadsheet — is stored to download (lib/inline-types).
          const opens = d.content_type
            ? servedInline(d.content_type)
            : /\.(pdf|png|jpe?g|gif|webp)$/i.test(d.filename);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <FileKindIcon kind={fileKindOf(d.filename, d.content_type)} />
              <span className="min-w-0 flex-1 truncate">{d.filename}</span>
              <span className="shrink-0 text-xs text-muted">
                {KIND_LABEL[d.kind] ?? DOC_KIND_LABEL[d.kind] ?? d.kind}
              </span>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={opens ? `Opens ${d.filename}` : `Downloads ${d.filename}`}
                  aria-label={`${opens ? "View" : "Download"} ${d.filename}`}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
                >
                  {opens ? "View" : "Download"}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {memo && (
        <div className="mt-3">
          {"href" in memo ? (
            <a
              href={memo.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
            >
              Download the IC memo (PDF)
            </a>
          ) : (
            <Link
              href={memo.upsell}
              className="inline-flex items-center gap-1.5 rounded-lg border border-caution/30 bg-caution/5 px-3 py-1.5 text-xs font-medium text-caution transition-colors hover:bg-caution/10"
            >
              Upgrade for the PDF memo
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
