// The covered market a headline names — a tag on the News page that links
// to the metro's brief. Pure: a table of the proper nouns each market goes
// by in a headline (not the address matcher in lib/market-match.ts, whose
// keywords — "king", "cook", "hudson", "arlington" — are guarded by a
// state and would tag a burger chain), matched on word boundaries. A word
// that names two places ("Arlington", "Washington" alone, "Richmond" on
// its own) is left out rather than guessed.

import metrosSeed from "@/data/research/metros.json";

export interface MarketMention {
  /** the metro id `/market?metro=` takes */
  id: string;
  /** the short tag the page shows */
  label: string;
  /** the metro's full name, for the tag's title */
  name: string;
  href: string;
}

const NAME_BY_ID = new Map((metrosSeed.metros ?? []).map((m) => [m.id, m.name as string]));

const MENTIONS: { id: string; label: string; rx: RegExp }[] = [
  { id: "nyc", label: "NYC", rx: /\b(new york city|new york|nyc|manhattan|brooklyn|the bronx|queens|staten island)\b/i },
  { id: "dc", label: "DC", rx: /\b(washington,? d\.?c\.?|d\.c\.|district of columbia)(?![a-z])/i },
  // not "NoVA": a company name and a Scotia as often as the market
  { id: "nova", label: "Northern Virginia", rx: /\b(northern virginia|alexandria|fairfax|tysons|loudoun|reston|falls church)\b/i },
  { id: "montgomery_county", label: "Montgomery County", rx: /\b(montgomery county|bethesda|silver spring|rockville|gaithersburg)\b/i },
  { id: "pg_county", label: "Prince George’s", rx: /\b(prince george'?’?s)\b/i },
  { id: "baltimore", label: "Baltimore", rx: /\bbaltimore\b/i },
  { id: "richmond", label: "Richmond", rx: /\b(richmond,? va|richmond,? virginia|henrico|chesterfield county)\b/i },
  { id: "norfolk_hampton_roads", label: "Hampton Roads", rx: /\b(hampton roads|norfolk|virginia beach|newport news|chesapeake,? va)\b/i },
  { id: "philadelphia", label: "Philadelphia", rx: /\b(philadelphia|philly|center city)\b/i },
  { id: "newark_jc", label: "Newark & Jersey City", rx: /\b(newark|jersey city|hoboken)\b/i },
  { id: "boston", label: "Boston", rx: /\b(boston|cambridge,? ma|seaport district)\b/i },
  { id: "chicago", label: "Chicago", rx: /\bchicago\b/i },
  { id: "los_angeles", label: "Los Angeles", rx: /\b(los angeles|l\.a\.)(?![a-z])/i },
  { id: "san_francisco", label: "San Francisco", rx: /\b(san francisco|bay area|oakland|silicon valley|san jose)\b/i },
  { id: "seattle", label: "Seattle", rx: /\b(seattle|bellevue,? wa|puget sound)\b/i },
  { id: "miami", label: "Miami", rx: /\b(miami|fort lauderdale|south florida|brickell)\b/i },
  { id: "atlanta", label: "Atlanta", rx: /\b(atlanta|buckhead|midtown atlanta)\b/i },
  { id: "dallas", label: "Dallas–Fort Worth", rx: /\b(dallas|fort worth|dfw|plano|frisco,? tx)\b/i },
];

/**
 * The covered markets a headline names, in the table's order, at most
 * `max`. Only a proper noun that means one place counts: "Washington"
 * alone is a state as often as the District, "Arlington" is in Texas and
 * Virginia, "Richmond" is in five states — none of those tags.
 */
export function headlineMarkets(item: { title: string; snippet?: string }, max = 2): MarketMention[] {
  const text = `${item.title} ${item.snippet ?? ""}`;
  const out: MarketMention[] = [];
  for (const m of MENTIONS) {
    if (!m.rx.test(text)) continue;
    out.push({ id: m.id, label: m.label, name: NAME_BY_ID.get(m.id) ?? m.label, href: `/market?metro=${m.id}` });
    if (out.length >= max) break;
  }
  return out;
}
