import type { ReactNode } from "react";
import { CROPPED_WORDS, galleryCreditParts, skylineCredit, type CreditLink, type SkylineShot } from "@/lib/skyline";

// The credit a market photograph owes, drawn with its links (2026-09-30).
//
// A Creative Commons licence asks for more than a name: a link to the work
// where one is practicable, the licence with a link to its text, and a word
// that the work was modified (CC BY-SA 4.0 §3(a)(1)). Every credit on the
// site printed the photographer and the licence's short name as plain text
// and stopped there, while every surface crops the photograph to its frame.
// These draw lib/skyline's parts — the same words `creditLine` and
// `galleryCredit` say — with the photographer linked to the file's page on
// Commons and the licence to its text. No hooks, so a server page and a
// client component (`CityPhoto`) draw the same markup.

const LINK = "underline decoration-dotted underline-offset-2";

function Linked({ link, className }: { link: CreditLink; className: string }) {
  if (!link.url) return <>{link.name}</>;
  return (
    <a href={link.url} target="_blank" rel="noreferrer" className={className}>
      {link.name}
    </a>
  );
}

/** One photograph's credit: the place, the photographer, the licence and
 *  that it is cropped — lib/skyline `creditLine`'s words, linked. */
export function SkylineCreditText({ shot, linkClassName = LINK }: { shot: SkylineShot; linkClassName?: string }) {
  const c = skylineCredit(shot);
  return (
    <>
      {`${c.place} · `}
      <Linked link={c.author} className={linkClassName} />
      {" · "}
      <Linked link={c.license} className={linkClassName} />
      {` · ${CROPPED_WORDS}`}
    </>
  );
}

/** A grid's one credit line: every photographer shown and every licence,
 *  each once — lib/skyline `galleryCredit`'s words, linked. Nothing where no
 *  market shown has a photograph. */
export function GalleryCreditText({ ids, linkClassName = LINK }: { ids: readonly string[]; linkClassName?: string }) {
  const parts = galleryCreditParts(ids);
  if (!parts) return null;
  const out: ReactNode[] = ["Skyline photographs by "];
  parts.authors.forEach((a, i) => {
    if (i) out.push(", ");
    out.push(<Linked key={`a${i}`} link={a} className={linkClassName} />);
  });
  out.push(" — via Wikimedia Commons, ");
  parts.licenses.forEach((l, i) => {
    if (i) out.push(" / ");
    out.push(<Linked key={`l${i}`} link={l} className={linkClassName} />);
  });
  out.push(`, ${CROPPED_WORDS}.`);
  return <>{out}</>;
}
