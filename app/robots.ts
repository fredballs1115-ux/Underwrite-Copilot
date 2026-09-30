import type { MetadataRoute } from "next";

// Generated at /robots.txt. Lets search engines crawl the public marketing
// pages while keeping the authenticated app and API out of the index.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // The link previews' pictures are under /api (each market page's own
      // card, #436), and a crawler that honours robots.txt for a card's
      // image — X's does — drew the market pages' shared links with no
      // picture while /api/ was disallowed whole. The longer rule wins, so
      // this opens the cards and nothing else under /api.
      allow: ["/", "/api/og/"],
      // Everything behind auth stays out of the index — and shared screens
      // are for the people holding the link, not crawlers.
      disallow: [
        "/api/",
        "/deals",
        "/deals/",
        "/billing",
        "/account",
        "/team",
        "/criteria",
        "/analytics",
        "/share/",
        "/preview-shell",
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
