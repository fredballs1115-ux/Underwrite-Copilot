import { galleryCreditLine, skylineCreditParts, type SkylineShot } from "@/lib/skyline";
import { CreditPartsText } from "./credit-parts";

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
// client component (`CityPhoto`) draw the same markup. A client that is
// handed a credit as data rather than a table id draws it with
// `CreditPartsText` (app/credit-parts) directly.

/** One photograph's credit: the place, the photographer, the licence and
 *  that it is cropped — lib/skyline `creditLine`'s words, linked. */
export function SkylineCreditText({ shot, linkClassName }: { shot: SkylineShot; linkClassName?: string }) {
  return <CreditPartsText parts={skylineCreditParts(shot)} linkClassName={linkClassName} />;
}

/** A grid's one credit line: every photographer shown, each photograph of
 *  theirs linked to its own page, and every licence, each once —
 *  lib/skyline `galleryCredit`'s words, linked. Nothing where no market shown
 *  has a photograph. */
export function GalleryCreditText({ ids, linkClassName }: { ids: readonly string[]; linkClassName?: string }) {
  const line = galleryCreditLine(ids);
  if (!line) return null;
  return <CreditPartsText parts={line} linkClassName={linkClassName} />;
}
