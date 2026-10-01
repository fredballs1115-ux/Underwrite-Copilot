import { BROWSER_DIRECT_NOTE, DATA_PROCESSORS } from "@/lib/data-processors";

/**
 * The outside services that receive something of a user's, one line each —
 * who, then what it receives — with the one note about what a browser's
 * direct requests show. Drawn by the security page and the privacy policy
 * from the one list (lib/data-processors), so the two cannot disagree.
 */
export function ProcessorList() {
  return (
    <>
      <ul className="mt-3 space-y-2" data-qa="processors">
        {DATA_PROCESSORS.map((p) => (
          <li key={p.name} className="text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">{p.name}</span>
            {" — "}
            {p.receives}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-muted">{BROWSER_DIRECT_NOTE}</p>
    </>
  );
}
