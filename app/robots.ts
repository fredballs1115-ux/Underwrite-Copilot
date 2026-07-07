import type { MetadataRoute } from "next";

// Generated at /robots.txt. Lets search engines crawl the public marketing
// pages while keeping the authenticated app and API out of the index.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Everything behind auth stays out of the index.
      disallow: [
        "/api/",
        "/deals",
        "/deals/",
        "/billing",
        "/account",
        "/team",
        "/criteria",
        "/preview-shell",
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
