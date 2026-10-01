// A public page's metadata, said one way: its own title, description and
// canonical, and the link preview that says the same. Pure.
//
// A child's `openGraph` and `twitter` REPLACE the root layout's wholesale,
// and a child that sets neither inherits them whole — the homepage's url,
// title and description — so /why, /tools, /login and the rest were shared
// as the homepage. Every public page states its own here, the site's card
// carried in, since a replaced `openGraph` loses the root's picture too.
// The market pages go through it as well (their `marketMeta` is this shape).

import type { Metadata } from "next";
import { SITE_CARD, type PageMeta } from "@/lib/public-pages";

export const SITE_NAME = "Underwrite Copilot";

export type PublicPage = Omit<PageMeta, "image"> & {
  /** the preview's picture; the site's own card where the page has none */
  image?: PageMeta["image"];
};

/** A /market page's one h1: a metro's own page names the metro, as its
 *  title does; a sector page and the base page are the covered markets. */
export function marketHeading(metro: { name: string } | null): string {
  return metro ? `${metro.name} market data` : "The covered markets";
}

export function publicMetadata(page: PublicPage): Metadata {
  const image = page.image ?? SITE_CARD;
  // The root layout's template adds " · Underwrite Copilot". A title that
  // already names the site stands as it is, so the name is said once.
  const title = page.title.includes(SITE_NAME) ? { absolute: page.title } : page.title;
  return {
    title,
    description: page.description,
    alternates: { canonical: page.canonical },
    openGraph: {
      type: "website",
      url: page.canonical,
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}
