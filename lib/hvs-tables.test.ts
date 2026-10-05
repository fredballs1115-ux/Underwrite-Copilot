import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HVS_FALLBACK_BASE, HVS_FALLBACK_FILES, HVS_RATES_URL, hvsTablesFrom, tableYears } from "./hvs-tables";
import { HVS_RATES_URL as LIVE_RATES_HVS_URL } from "./live-rates";

/**
 * The links the runner printed from the rates page, exactly (zori.yml
 * probe_url, run 37231906743, 2026-10-04: 200, text/html, 64 KB) — the only
 * file names this test uses.
 */
const RUNNER_HREFS = [
  "/housing/hvs/data/rates/tab1_state05_2026_rvr.xlsx",
  "/housing/hvs/data/rates/tab2_state05_2026_hvr.xlsx",
  "/housing/hvs/data/rates/tab3_state05_2026_hmr.xlsx",
  "/housing/hvs/data/rates/tab4_msa_26_rvr.xlsx",
  "/housing/hvs/data/rates/tab4a_msa_05_2014_rvr.xlsx",
  "/housing/hvs/data/rates/tab4b_msa_15_25_rvr.xlsx",
  "/housing/hvs/data/rates/tab5_msa_26_hvr.xlsx",
  "/housing/hvs/data/rates/tab5a_msa_05_2014_hvr.xlsx",
  "/housing/hvs/data/rates/tab5b_msa_15_25_hvr.xlsx",
  "/housing/hvs/data/rates/tab6_msa_26_hmr.xlsx",
  "/housing/hvs/data/rates/tab6a_msa_05_2014_hmr.xlsx",
  "/housing/hvs/data/rates/tab6b_msa_15_25_hmr.xlsx",
] as const;

/** A page that links the hrefs given and nothing else — no link the runner
 *  did not print. */
function page(hrefs: readonly string[]): string {
  const items = hrefs.map((h) => `<li><a href="${h}" target="_blank">${h.split("/").pop()}</a></li>`).join("\n");
  return `<!doctype html><html><body><ul>\n${items}\n</ul></body></html>`;
}

const RATES = "https://www.census.gov/housing/hvs/data/rates/";

describe("the Housing Vacancy Survey's tables, read off the rates page", () => {
  it("takes the current year's metro rental vacancy table and the recent history from the page the runner printed", () => {
    const t = hvsTablesFrom(page(RUNNER_HREFS), HVS_RATES_URL);
    expect(t.current).toEqual({ name: "tab4_msa_26_rvr.xlsx", url: `${RATES}tab4_msa_26_rvr.xlsx`, from: 2026, to: 2026 });
    expect(t.history).toEqual({ name: "tab4b_msa_15_25_rvr.xlsx", url: `${RATES}tab4b_msa_15_25_rvr.xlsx`, from: 2015, to: 2025 });
    // The 2005–2014 table ends short of the year before the current one.
    expect(t.gapped.map((g) => g.name)).toEqual(["tab4a_msa_05_2014_rvr.xlsx"]);
    expect(tableYears(t.current!)).toBe("2026");
    expect(tableYears(t.history!)).toBe("2015–2025");
  });

  it("reads the years from the names, never from where a link sits on the page", () => {
    // The history ending latest wins whichever comes first; with no current
    // table there is no gap to hold a history to.
    const histories = ["/housing/hvs/data/rates/tab4b_msa_15_25_rvr.xlsx", "/housing/hvs/data/rates/tab4a_msa_05_2014_rvr.xlsx"];
    for (const order of [histories, [...histories].reverse()]) {
      const t = hvsTablesFrom(page(order));
      expect(t.current).toBeNull();
      expect(t.history?.name).toBe("tab4b_msa_15_25_rvr.xlsx");
      expect(t.gapped).toEqual([]);
    }
    // A four-digit year is read as written.
    const old = hvsTablesFrom(page(["/housing/hvs/data/rates/tab4a_msa_05_2014_rvr.xlsx"]));
    expect(old.history).toMatchObject({ from: 2005, to: 2014 });
  });

  it("never reads the 2005–2014 table as the recent history beside the current year's", () => {
    const t = hvsTablesFrom(page(["/housing/hvs/data/rates/tab4_msa_26_rvr.xlsx", "/housing/hvs/data/rates/tab4a_msa_05_2014_rvr.xlsx"]));
    expect(t.current?.name).toBe("tab4_msa_26_rvr.xlsx");
    expect(t.history).toBeNull();
    expect(t.gapped.map((g) => g.name)).toEqual(["tab4a_msa_05_2014_rvr.xlsx"]);
  });

  it("takes neither the states' tables nor the homeowner and homeownership families", () => {
    const others = RUNNER_HREFS.filter((h) => !/\/tab4/.test(h));
    expect(hvsTablesFrom(page(others))).toEqual({ current: null, history: null, gapped: [] });
    // A page with no links at all, or the files only as text, lists nothing.
    expect(hvsTablesFrom("<html><body>tab4_msa_26_rvr.xlsx</body></html>")).toEqual({ current: null, history: null, gapped: [] });
  });

  it("reads a link in single quotes or unquoted, and each file once", () => {
    const html = `<a href='/housing/hvs/data/rates/tab4_msa_26_rvr.xlsx'>a</a>
      <a href=/housing/hvs/data/rates/tab4b_msa_15_25_rvr.xlsx>b</a>
      <a href="/housing/hvs/data/rates/tab4_msa_26_rvr.xlsx">again</a>`;
    const t = hvsTablesFrom(html);
    expect(t.current?.name).toBe("tab4_msa_26_rvr.xlsx");
    expect(t.history?.name).toBe("tab4b_msa_15_25_rvr.xlsx");
  });

  it("keeps the names the pull knew as the fallback, and they are what the page links today", () => {
    expect([...HVS_FALLBACK_FILES]).toEqual(["tab4_msa_26_rvr.xlsx", "tab4b_msa_15_25_rvr.xlsx"]);
    const t = hvsTablesFrom(page(RUNNER_HREFS));
    expect([t.current?.url, t.history?.url]).toEqual(HVS_FALLBACK_FILES.map((f) => HVS_FALLBACK_BASE + f));
  });

  it("is the one address the tiles link and the pull reads", () => {
    expect(LIVE_RATES_HVS_URL).toBe(HVS_RATES_URL);
    const src = readFileSync(join("scripts", "fetch-hvs.mjs"), "utf8");
    expect(src).toContain('from "../lib/hvs-tables.ts"');
    expect(src).toContain("hvsTablesFrom(");
    // The local hook stays, and the old names are only the fallback.
    expect(src).toContain("process.env.HVS_BASE");
    expect(src).not.toMatch(/const FILES = \[/);
    // A page that lists neither table fails the run on its page.
    expect(src).toMatch(/annotation\(\s*"error",\s*`HVS: the rates page \(\$\{PAGE\}\) links neither/);
  });
});
