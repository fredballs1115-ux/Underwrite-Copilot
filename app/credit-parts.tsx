import type { CreditPart } from "@/lib/credit-parts";

// A photograph's credit, drawn: its words, and each link a Creative Commons
// licence asks for — the work to its page on Commons, the licence to its text
// (lib/credit-parts). No hooks and nothing imported but a type, so a server
// page, a client component and a client handed the credit as plain data (the
// deal page's picture and its full-screen viewer) draw the same markup, and
// none of them loads lib/skyline's table to do it.

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
