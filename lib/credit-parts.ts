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

/** One photograph a grid credits, as its credit's parts: what it shows, its
 *  photographer linked to its own page, and its licence linked to its text
 *  (lib/skyline `skylineCredit`, lib/market-picture's `place` / `author` /
 *  `license`). */
export interface PhotoCredit {
  place: string;
  author: CreditLink;
  license: CreditLink;
}

/** One photograph in a grid's credit: what it shows, linked to its own
 *  page, and the licence that photograph is under, linked to its text. */
export interface GalleryPhoto extends CreditLink {
  license: CreditLink;
}

/** One photographer in a grid's credit, with every one of their photographs
 *  the grid shows, each by what it shows and linked to its own page, each
 *  with its own licence. */
export interface GalleryAuthor {
  name: string;
  photos: GalleryPhoto[];
}

/**
 * A grid's credit, in parts: each photographer once, with every photograph
 * of theirs the grid shows linked to its own file's page — the first cut
 * linked a photographer's name to their first file only, so on the
 * homepage, where Bruce Emmerling took both Richmond's and Norfolk's,
 * Norfolk's photograph was linked nowhere — each with the licence it is
 * under, and the licences the grid's photographs are under, each once.
 * Null where no photograph is shown.
 */
export function galleryCreditPartsOf(
  credits: readonly PhotoCredit[],
): { authors: GalleryAuthor[]; licenses: CreditLink[] } | null {
  if (credits.length === 0) return null;
  const authors = new Map<string, GalleryAuthor>();
  for (const c of credits) {
    const author = authors.get(c.author.name) ?? { name: c.author.name, photos: [] };
    if (!author.photos.some((p) => p.url === c.author.url)) {
      author.photos.push({ name: c.place, url: c.author.url, license: { name: c.license.name, url: c.license.url } });
    }
    authors.set(c.author.name, author);
  }
  const licenses = new Map<string, CreditLink>();
  for (const c of credits) {
    const held = licenses.get(c.license.name);
    if (!held || (!held.url && c.license.url)) licenses.set(c.license.name, { name: c.license.name, url: c.license.url });
  }
  return {
    authors: [...authors.values()],
    licenses: [...licenses.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
}

/**
 * The grid's one line, as parts: a photographer with one photograph shown is
 * their name linked to it; one with several is their name, then each of
 * those photographs by what it shows, linked to its own page — "Bruce
 * Emmerling (Downtown Richmond; Downtown Norfolk from the Elizabeth River)",
 * semicolons because a place can hold a comma. Each photographer's licence
 * follows them, linked to its text — or, where their photographs shown are
 * under different licences, each photograph's follows it — so a reader can
 * tell which photograph is under which licence. The line had listed the
 * grid's licences once each at its end ("CC BY 2.0 / CC BY-SA 4.0 / Public
 * domain"), which said none of that (the research pass of 2026-10-01).
 * Then where they came from and that the photographs are cropped. Null
 * where no photograph is shown. "Photographs", not "Skyline photographs": a
 * market is shown by the photograph it is known by, which may be a memorial,
 * a wheel on the river or a row of houses.
 *
 * Here, beside the parts, so a client that holds its photographs' credits as
 * plain data (the pipeline's cards) draws the line without loading
 * lib/skyline's table into the browser (research pass 25).
 */
export function galleryCreditLineOf(credits: readonly PhotoCredit[]): CreditPart[] | null {
  const parts = galleryCreditPartsOf(credits);
  if (!parts) return null;
  const out: CreditPart[] = ["Photographs by "];
  parts.authors.forEach((a, i) => {
    if (i) out.push(" · ");
    if (a.photos.length === 1) {
      out.push({ name: a.name, url: a.photos[0].url }, ", ", a.photos[0].license);
      return;
    }
    const one = a.photos.every((p) => p.license.name === a.photos[0].license.name);
    out.push(`${a.name} (`);
    a.photos.forEach((p, j) => {
      if (j) out.push("; ");
      out.push({ name: p.name, url: p.url });
      if (!one) out.push(", ", p.license);
    });
    out.push(")");
    if (one) out.push(", ", a.photos[0].license);
  });
  out.push(` — via Wikimedia Commons, ${CROPPED_WORDS}.`);
  return out;
}
