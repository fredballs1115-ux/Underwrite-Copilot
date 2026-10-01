import { foldParts } from "@/lib/first-sentence";

/** A research note, folded: its first sentence shows, the rest opens on
 *  demand. The whole text stays in the HTML — the page lint, live-verify and
 *  a screen reader all still read it — so it is one click away rather than
 *  on the page at once. A single-sentence note renders as itself.
 *
 *  The first sentence is lib/first-sentence's, which never ends at an
 *  abbreviation or inside parentheses: cut at the first ". ", a note read
 *  "(Fla." or "Under D.C." (the research pass of 2026-10-01). A caution in
 *  the text ("CAUTION: …") is never folded away: it stays in view under the
 *  first sentence.
 *
 *  Pure, and the one copy the market page and its views share. */
export function Fold({ text, className = "" }: { text: string; className?: string }) {
  const { first, cautions, rest } = foldParts(text);
  const caution =
    cautions.length > 0 ? (
      <p className={`${className.replace(/\btext-muted\b/g, "").trim()} font-medium text-amber-700`} data-qa="caution">
        {cautions.join(" ")}
      </p>
    ) : null;
  if (!rest) {
    return (
      <>
        <p className={className}>{cautions.length > 0 ? first : text}</p>
        {caution}
      </>
    );
  }
  return (
    <>
      <details className={className}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {first}{" "}
          <span className="text-[11px] font-medium text-brand">more</span>
        </summary>
        <p className="mt-1">{rest}</p>
      </details>
      {caution}
    </>
  );
}
