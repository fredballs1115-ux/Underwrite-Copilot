/** A research note, folded: its first sentence shows, the rest opens on
 *  demand. The whole text stays in the HTML — the page lint, live-verify and
 *  a screen reader all still read it — so it is one click away rather than
 *  on the page at once. A single-sentence note renders as itself.
 *
 *  Pure, and the one copy the market page and its views share. */
export function Fold({ text, className = "" }: { text: string; className?: string }) {
  const m = /^([\s\S]+?[.!?])\s+([\s\S]+)$/.exec(text);
  if (!m) return <p className={className}>{text}</p>;
  return (
    <details className={className}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {m[1]}{" "}
        <span className="text-[11px] font-medium text-brand">more</span>
      </summary>
      <p className="mt-1">{m[2]}</p>
    </details>
  );
}
