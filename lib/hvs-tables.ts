/**
 * Which of the Housing Vacancy Survey's workbooks hold the metro areas'
 * rental vacancy rates — read off the links on the survey's rates page, never
 * typed into the pull.
 *
 * The Census Bureau names the year's tables by year. The pull
 * (scripts/fetch-hvs.mjs) had always fetched "tab4_msa_26_rvr.xlsx" and
 * "tab4b_msa_15_25_rvr.xlsx", so the year the bureau published
 * "tab4_msa_27_…" it would have gone on reading 2026's table, quietly, every
 * quarter. So the pull reads the page first and takes what it links.
 *
 * WHAT THE RUNNER PRINTED (zori.yml probe_url, run 37231906743, 2026-10-04):
 * the page answered 200, text/html, 64 KB, and links twelve data files, each
 * a root-relative href: the state tables (tab1_state05_2026_rvr,
 * tab2_…_hvr, tab3_…_hmr), and for the 75 largest metro areas the rental
 * vacancy family — tab4_msa_26_rvr (the current year), tab4b_msa_15_25_rvr
 * (2015–2025) and tab4a_msa_05_2014_rvr (2005–2014) — beside the homeowner
 * vacancy (tab5…_hvr) and homeownership (tab6…_hmr) families in the same
 * three shapes. The fixture in lib/hvs-tables.test.ts is those twelve lines.
 *
 * TWO RULES. The CURRENT table is the rental vacancy table named by one year
 * (`tab4_msa_<yy>_rvr.xlsx`), the newest year listed. The HISTORY is the one
 * named by a span (`tab4<letter>_msa_<yy>_<yy>_rvr.xlsx`) whose span ends
 * latest — and, beside a current table, only one that reaches the year before
 * it, so the two run without a gap: the 2005–2014 table is never read in the
 * recent history's place. A year is read from the name as written, a
 * two-digit one in the 2000s ("26" is 2026, "05" 2005); a name in any other
 * shape is not one of these tables.
 *
 * Imports nothing at run time: the pull loads it under plain Node, as it
 * loads lib/gh-annotate.ts.
 */

/** The page every Census tile links to, and the one the pull reads the
 *  tables' names from. */
export const HVS_RATES_URL = "https://www.census.gov/housing/hvs/data/rates.html";

/** Where the tables sat when the pull last knew their names — the base its
 *  fallback names are fetched from. */
export const HVS_FALLBACK_BASE = "https://www.census.gov/housing/hvs/data/rates/";

/** The names the pull fetched before it read the page, newest first: the
 *  current year's table and the history. Used only where the page itself
 *  cannot be read, and said so — never where the page answers and lists
 *  something else. */
export const HVS_FALLBACK_FILES = ["tab4_msa_26_rvr.xlsx", "tab4b_msa_15_25_rvr.xlsx"] as const;

/** One of the rental vacancy tables, as the page links it. */
export interface HvsTable {
  /** the file's name as linked: "tab4_msa_26_rvr.xlsx" */
  name: string;
  /** the link resolved against the page */
  url: string;
  /** the first and last year the name states — one year for a current table */
  from: number;
  to: number;
}

export interface HvsTables {
  /** the newest single-year table, or null where the page lists none */
  current: HvsTable | null;
  /** the history ending latest that runs on to the current table, or null */
  history: HvsTable | null;
  /** span tables the page lists that were not taken as the history because
   *  they end short of the year before the current table's — said by the
   *  pull, never silently skipped */
  gapped: HvsTable[];
}

const CURRENT = /^tab4_msa_(\d{2}|\d{4})_rvr\.xlsx$/i;
const HISTORY = /^tab4[a-z]_msa_(\d{2}|\d{4})_(\d{2}|\d{4})_rvr\.xlsx$/i;

/** A year as a table's name writes it: four digits as written, two in the 2000s. */
function yearOf(written: string): number {
  return written.length === 2 ? 2000 + Number(written) : Number(written);
}

/** Every href on the page, each once, in the page's order. */
function hrefsOf(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (href && !out.includes(href)) out.push(href);
  }
  return out;
}

/** The file name a link ends in, without its query or fragment; null for a
 *  link that cannot be resolved against the page. */
function linked(href: string, pageUrl: string): { name: string; url: string } | null {
  try {
    const url = new URL(href, pageUrl);
    const name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    return name ? { name, url: url.href } : null;
  } catch {
    return null;
  }
}

/**
 * The rental vacancy tables the rates page links: the newest current-year
 * table and the history that runs on to it, each with its link resolved
 * against `pageUrl` (the page's links are root-relative). Pure.
 */
export function hvsTablesFrom(html: string, pageUrl: string = HVS_RATES_URL): HvsTables {
  const currents: HvsTable[] = [];
  const histories: HvsTable[] = [];
  const seen = new Set<string>();
  for (const href of hrefsOf(html)) {
    const file = linked(href, pageUrl);
    if (!file || seen.has(file.url)) continue;
    seen.add(file.url);
    const one = CURRENT.exec(file.name);
    if (one) {
      const y = yearOf(one[1]);
      currents.push({ ...file, from: y, to: y });
      continue;
    }
    const span = HISTORY.exec(file.name);
    if (span) histories.push({ ...file, from: yearOf(span[1]), to: yearOf(span[2]) });
  }
  // The newest by the last year in the name; a tie keeps the page's first.
  const newest = (tables: HvsTable[]) => tables.reduce<HvsTable | null>((best, t) => (!best || t.to > best.to ? t : best), null);
  const current = newest(currents);
  const reaches = (t: HvsTable) => !current || t.to >= current.from - 1;
  return {
    current,
    history: newest(histories.filter(reaches)),
    gapped: histories.filter((t) => !reaches(t)),
  };
}

/** "2026", "2015–2025" — the years a table's name states. */
export function tableYears(t: Pick<HvsTable, "from" | "to">): string {
  return t.from === t.to ? String(t.from) : `${t.from}–${t.to}`;
}
