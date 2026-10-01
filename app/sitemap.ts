import type { MetadataRoute } from "next";
import { latestChange } from "@/lib/changelog";
import { marketPages, marketPath, sectorPages, sectorPath } from "@/lib/public-pages";

// Generated at /sitemap.xml. Only the public, indexable pages belong here —
// the app itself sits behind auth and is disallowed in robots.txt.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // A page is stamped with the day it last changed only where it can say
  // which day that was. Stamping every page "now" told a crawler that all
  // of them changed on every fetch, which was never true; /whats-new's own
  // newest entry is the day it last changed, and the rest say nothing.
  const newest = latestChange()?.date ?? "";
  const whatsNewChanged = /^\d{4}-\d{2}-\d{2}$/.test(newest) ? newest : null;
  return [
    {
      url: APP_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${APP_URL}/demo`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${APP_URL}/why`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      // The covered-market briefs — public since the marquee and coverage
      // board link prospects straight into them.
      url: `${APP_URL}/market`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      // The deal-math calculators — public because a calculator behind a
      // login is a calculator nobody reaches for, and because "cap rate
      // calculator" is a thing people search for.
      url: `${APP_URL}/tools`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${APP_URL}/whats-new`,
      ...(whatsNewChanged ? { lastModified: whatsNewChanged } : {}),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${APP_URL}/login`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${APP_URL}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${APP_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${APP_URL}/security`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    // Each market's own page and each sector's (#430): the figures move
    // weekly, and each is a page someone searching for that market's
    // rents or vacancy should land on.
    ...marketPages().map((m) => ({
      url: `${APP_URL}${marketPath(m.id)}`,
      changeFrequency: "weekly" as const,
      priority: m.briefed ? 0.6 : 0.5,
    })),
    ...sectorPages().map((s) => ({
      url: `${APP_URL}${sectorPath(s.id)}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
