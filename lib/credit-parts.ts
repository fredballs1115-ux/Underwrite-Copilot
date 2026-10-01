// A photograph's credit as the parts a caption draws: its words, and the
// links a Creative Commons licence asks for (CC BY-SA 4.0 §3(a)(1)) — the
// work linked to its page, the licence to its text, and a word that the work
// was modified where the surface crops it.
//
// PURE, AND IMPORTS NOTHING. lib/skyline builds every credit out of these,
// and a client component that is handed a credit as plain data (the deal
// page's picture and its full-screen viewer, lib/market-picture's
// `author` / `license`) draws it from here too, without loading the table
// of every market's photograph into the browser.

/** A link a credit carries: the photographer to the file's page on
 *  Commons, a photograph to its page, a licence to its text. */
export interface CreditLink {
  name: string;
  /** where it links — "" where there is nothing to link (public domain asks
   *  for no licence link), and the name is drawn as words */
  url: string;
}

/** One piece of a credit: words, or a link. */
export type CreditPart = string | CreditLink;

/** What a credit says where the surface crops the photograph to its frame. */
export const CROPPED_WORDS = "cropped to fit";

/**
 * The photographer and the licence, and — only where the surface crops the
 * picture (`object-cover` into a band, a card, the deal header) — that it is
 * cropped. A picture shown whole, as the full-screen viewer shows it, is not
 * modified, and its credit does not say it was.
 */
export function photographerParts(author: CreditLink, license: CreditLink, cropped: boolean): CreditPart[] {
  return [author, " · ", license, ...(cropped ? [` · ${CROPPED_WORDS}`] : [])];
}

/** A credit's words, each link's name in its place: what a caption says. */
export function creditText(parts: readonly CreditPart[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.name)).join("");
}
