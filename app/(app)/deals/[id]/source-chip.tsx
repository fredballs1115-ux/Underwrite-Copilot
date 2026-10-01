import type { DealFact } from "@/lib/facts";

/**
 * A citation chip next to an extracted number (Feature 2).
 *  - located extracted fact → gray "p. 14" chip; hover = snippet + doc; click
 *    opens the OM at that page.
 *  - unlocated fact → a muted "source not located" tag (the absolute rule:
 *    never show a page we couldn't validate).
 *  - derived fact → an "ƒ" chip (hover explains the derivation).
 *  - assumption/default → an "A" chip.
 * Plain markup, so it renders in both server and client components.
 */
export function SourceChip({
  fact,
  omUrl,
  note,
}: {
  fact: DealFact;
  /** the deal's OM route (lib/om-link: `/api/deals/<id>/om`, which signs the
   *  file when clicked); when present a located chip links to it at
   *  `#page=N` */
  omUrl?: string | null;
  /** plain-English derivation for an ƒ chip */
  note?: string;
}) {
  const base =
    "ml-1 inline-flex items-center rounded px-1 py-px align-middle text-[9px] font-medium leading-none";

  if (fact.provenance === "derived") {
    return (
      <span
        className={`${base} bg-brand/10 text-brand`}
        title={note || "Derived figure — see the model for how it's computed"}
      >
        ƒ
      </span>
    );
  }
  if (fact.provenance === "assumption") {
    return (
      <span
        className={`${base} bg-caution/10 text-caution`}
        title="Underwrite Copilot default — edit in the model's Assumptions tab"
      >
        A
      </span>
    );
  }
  if (!fact.located || fact.pageNumber == null) {
    return (
      <span
        className={`${base} bg-line/60 text-muted`}
        title="The extraction couldn't tie this to a page in the OM"
      >
        source not located
      </span>
    );
  }

  const hover = [fact.locatorSnippet, fact.docLabel].filter(Boolean).join(" · ");
  const chip = `p.${fact.pageNumber}`;
  if (omUrl) {
    // The page rides as the fragment on the route's URL. The route answers
    // with a redirect whose Location has no fragment, and a browser keeps
    // the request's fragment across such a redirect, so the signed PDF
    // opens at this page.
    return (
      <a
        href={`${omUrl}#page=${fact.pageNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} bg-faint text-muted underline-offset-2 transition-colors hover:bg-line/60 hover:text-ink`}
        title={hover || `Open the OM at ${chip}`}
      >
        {chip}
      </a>
    );
  }
  return (
    <span className={`${base} bg-faint text-muted`} title={hover || chip}>
      {chip}
    </span>
  );
}
