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
 * What a `/market` page is called. A metro wins over a sector when a link
 * carries both, since the metro's page is the one it opens on. Only what
 * the page draws is claimed: a metro read without a brief says nothing of
 * a brief.
 */
export function marketMeta(metro: MarketPage | null, sector: SectorPage | null): PageMeta {
  if (metro) {
    return {
      title: `${metro.name} market data: rents, vacancy, jobs and supply`,
      description: metro.briefed
        ? `${metro.name}: the research brief, and the published figures the site reads for the market — asking rents, rental vacancy, jobs by sector, building permits and the for-sale market — each dated and linked to its source.`
        : `${metro.name}: the published figures the site reads for the metro area — asking rents, rental vacancy, jobs by sector, building permits and the for-sale market — each dated and linked to its source.`,
      canonical: marketPath(metro.id),
    };
  }
  if (sector) {
    return {
      title: `${sector.label} market data: vacancy, cap rates and demand by market`,
      description: `${sector.label} across the markets the site covers: the research tracker's vacancy and cap rate ranges, dated and sourced, and where demand for the space is growing.`,
      canonical: sectorPath(sector.id),
    };
  }
  const count = marketPages().length;
  return {
    title: "CRE market data: rates, rents, vacancy and jobs",
    description: `Live commercial real estate market data for ${count} US metro areas: today's Treasury curve and lending rates, asking rents, rental vacancy, jobs by sector and building permits — each figure dated and linked to its source.`,
    canonical: "/market",
  };
}
