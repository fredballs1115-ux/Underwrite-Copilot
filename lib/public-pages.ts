// The public pages a search engine should find, and what each is called
// (#430). Pure: the sitemap, the market page's own metadata and the
// IndexNow submission read one catalogue, so a market with a page is a
// market in the sitemap, under the title its page gives itself.
//
// `/market` draws one page a metro (`?metro=<id>`) and one a sector
// (`?sector=<id>`), and each used to go out under the same bare "Market
// data" title with no canonical — forty-odd distinct pages a search engine
// could only read as one. Each now names its place or its sector, says
// what it holds, and declares itself canonical.

import metrosSeed from "@/data/research/metros.json";
import { DATA_METROS } from "@/lib/market-match";
import { MARKETS_READ } from "@/lib/market-count";
import { metroSeriesFor } from "@/lib/live-rates";
import { SECTORS } from "@/lib/research-sectors";

export interface MarketPage {
  id: string;
  name: string;
  /** a covered market with its research brief, or a metro area read without one */
  briefed: boolean;
}

export interface SectorPage {
  id: string;
  label: string;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** the link preview's picture (#436): a metro's page carries its own
   *  card; the others the site's branded one */
  image: { url: string; width: number; height: number; alt: string };
}

/** The site's own branded card (app/opengraph-image.tsx). */
export const SITE_CARD = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Underwrite Copilot: every CRE deal through the same disciplined screen",
};

/** The site's plain card (app/api/og/plain, lib/plain-card): the mark and
 *  the name, no claim — the preview of a private page, never the advert. */
export const PLAIN_CARD = {
  url: "/api/og/plain",
  width: 1200,
  height: 630,
  alt: "Underwrite Copilot",
};

/** A metro page's own card (app/api/og/market/[id]). */
export function marketCardPath(id: string): string {
  return `/api/og/market/${encodeURIComponent(id)}`;
}

/** Every metro page, the briefed markets first, each once. */
export function marketPages(): MarketPage[] {
  const out: MarketPage[] = [];
  const seen = new Set<string>();
  for (const m of metrosSeed.metros ?? []) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      out.push({ id: m.id, name: m.name, briefed: true });
    }
  }
  for (const m of DATA_METROS) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      out.push({ id: m.id, name: m.name, briefed: false });
    }
  }
  return out;
}

export function sectorPages(): SectorPage[] {
  return SECTORS.map((s) => ({ id: s.id, label: s.label }));
}

export function marketPageFor(id: string | null | undefined): MarketPage | null {
  return id ? (marketPages().find((p) => p.id === id) ?? null) : null;
}

export function sectorPageFor(id: string | null | undefined): SectorPage | null {
  return id ? (sectorPages().find((p) => p.id === id) ?? null) : null;
}

export function marketPath(id: string): string {
  return `/market?metro=${encodeURIComponent(id)}`;
}

export function sectorPath(id: string): string {
  return `/market?sector=${encodeURIComponent(id)}`;
}

/**
 * The published figures a metro's page draws, in the page's order, each
 * named only where the series table holds a series for the metro (its own,
 * or the metro area's it borrows): Cleveland's permits stopped when the
 * Census redrew its metro area in 2023 and are not read, so its page claims
 * no building permits (the research pass of 2026-10-01 found the
 * description promising them). The asking rents and the for-sale market are
 * Zillow's and Realtor.com's rows, which their pulls write for every metro
 * page the site has.
 */
export function figuresDrawn(id: string): string[] {
  const metrics = new Set<string>(metroSeriesFor(id).series.map((s) => s.metric));
  const out = ["asking rents"];
  if (metrics.has("rental_vacancy_msa") || metrics.has("rental_vacancy")) out.push("rental vacancy");
  if ([...metrics].some((m) => m.startsWith("jobs_") && m !== "jobs_yoy")) out.push("jobs by sector");
  else if (metrics.has("jobs_yoy")) out.push("jobs");
  if (metrics.has("permits")) out.push("building permits");
  out.push("the for-sale market");
  return out;
}

/** "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * What a `/market` page is called. A metro wins over a sector when a link
 * carries both, since the metro's page is the one it opens on. Only what
 * the page draws is claimed: a metro read without a brief says nothing of
 * a brief, a metro with no permit series says nothing of permits, and the
 * dating is claimed of the published figures, each of which carries its
 * period and a link — never of the research brief's, some of which the
 * research left undated or unsourced, and which the page says so of.
 */
export function marketMeta(metro: MarketPage | null, sector: SectorPage | null): PageMeta {
  if (metro) {
    const figures = listed(figuresDrawn(metro.id));
    return {
      title: `${metro.name} market data: rents, vacancy, jobs and supply`,
      description: metro.briefed
        ? `${metro.name}: the research brief, and the published figures the site reads for the market — ${figures} — each published figure dated and linked to its source.`
        : `${metro.name}: the published figures the site reads for the metro area — ${figures} — each dated and linked to its source.`,
      canonical: marketPath(metro.id),
      image: { url: marketCardPath(metro.id), width: 1200, height: 630, alt: `${metro.name} market data, over the market's own photograph` },
    };
  }
  if (sector) {
    return {
      title: `${sector.label} market data: vacancy, cap rates and demand by market`,
      description: `${sector.label} across the markets the site covers: the research tracker's vacancy and cap rates, each with its period and source where the research recorded them, and where demand for the space is growing.`,
      canonical: sectorPath(sector.id),
      image: SITE_CARD,
    };
  }
  // Counted as the homepage counts: the Washington area's four briefs are
  // one market, so this and "the 15 covered markets" add up (lib/market-count).
  const count = MARKETS_READ;
  return {
    title: "CRE market data: rates, rents, vacancy and jobs",
    description: `Live commercial real estate market data for ${count} US markets: the latest Treasury curve and lending rates, asking rents, rental vacancy, jobs by sector and building permits — each published figure dated and linked to its source.`,
    canonical: "/market",
    image: SITE_CARD,
  };
}
