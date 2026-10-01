import { linkOk } from "@/lib/link-audit";
import { sourceParts } from "@/lib/source-parts";

/**
 * A research source as a page cites it: the address linked as "source", and
 * the words the file wrote beside it as text — never an address with a note
 * inside it as the link (lib/source-parts). A link the audit found dead is
 * said as that rather than linked. Pure.
 */
export function SourceRef({ source, className = "" }: { source: string | null | undefined; className?: string }) {
  const { href, words } = sourceParts(source);
  if (!href && !words) return null;
  const live = href !== null && linkOk(href) !== false;
  return (
    <span className={className} data-qa="source-ref">
      {live ? (
        <a href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
          source
        </a>
      ) : href ? (
        "source on file — link unavailable"
      ) : null}
      {words ? `${href ? " " : ""}(${words})` : null}
    </span>
  );
}
