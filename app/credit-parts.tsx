import { galleryCreditLineOf, type CreditPart, type PhotoCredit } from "@/lib/credit-parts";

// A photograph's credit, drawn: its words, and each link a Creative Commons
// licence asks for — the work to its page on Commons, the licence to its text
// (lib/credit-parts). No hooks, and nothing imported but lib/credit-parts,
// which imports nothing, so a server page, a client component and a client
// handed the credit as plain data (the deal page's picture and its
// full-screen viewer, the pipeline's cards) draw the same markup, and none of
// them loads lib/skyline's table to do it.

const LINK = "underline decoration-dotted underline-offset-2";

export function CreditPartsText({ parts, linkClassName = LINK }: { parts: readonly CreditPart[]; linkClassName?: string }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          p
        ) : p.url ? (
          <a key={i} href={p.url} target="_blank" rel="noreferrer" className={linkClassName}>
            {p.name}
          </a>
        ) : (
          p.name
        ),
      )}
    </>
  );
}

/** A grid's one credit line from its photographs' credits as data
 *  (lib/credit-parts `galleryCreditLineOf`) — the pipeline's line under its
 *  cards. Nothing where no photograph is shown. */
export function GalleryCreditPartsText({
  credits,
  linkClassName = LINK,
}: {
  credits: readonly PhotoCredit[];
  linkClassName?: string;
}) {
  const line = galleryCreditLineOf(credits);
  if (!line) return null;
  return <CreditPartsText parts={line} linkClassName={linkClassName} />;
}
