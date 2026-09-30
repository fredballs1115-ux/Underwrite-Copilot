import { describe, expect, it } from "vitest";
import table from "@/data/fred-series.json";
import capitalMarkets from "@/data/research/capital_markets.json";

/**
 * The research file's note says how many series the rates pull reads, and
 * a count in prose cannot render from the file, so it is held to it here:
 * the note said "Forty-six series" while the table grew past a thousand
 * (the audit of 2026-09-30). The pull's own rule decides what it asks for —
 * every list in the file, each id once, FRED's and the BLS's; the Census
 * survey's series are scripts/fetch-hvs.mjs's.
 */

type Entry = { id: string; source?: string };
const lists = table as unknown as { series: Entry[]; metroSeries?: Entry[]; regionSeries?: Entry[]; stateSeries?: Entry[] };

function counts() {
  const seen = new Set<string>();
  const all = [...lists.series, ...(lists.metroSeries ?? []), ...(lists.regionSeries ?? []), ...(lists.stateSeries ?? [])].filter(
    (s) => !seen.has(s.id) && seen.add(s.id),
  );
  const from = (source: string) => all.filter((s) => (s.source ?? "fred") === source).length;
  return { strip: lists.series.length, fred: from("fred"), bls: from("bls"), census: from("census") };
}

const number = (s: string | undefined) => Number((s ?? "").replace(/,/g, ""));

describe("the capital markets note counts the series from the file", () => {
  const note = (capitalMarkets as { fred_series_note: string }).fred_series_note;
  const c = counts();

  it("says the strip's count, the weekday pull's and each source's as the file holds them", () => {
    expect(number(note.match(/(\d[\d,]*) national series on the rates strip/)?.[1])).toBe(c.strip);
    expect(number(note.match(/(\d[\d,]*) in the weekday pull/)?.[1])).toBe(c.fred + c.bls);
    expect(number(note.match(/\((\d[\d,]*) from FRED/)?.[1])).toBe(c.fred);
    expect(number(note.match(/(\d[\d,]*) from the BLS/)?.[1])).toBe(c.bls);
    expect(number(note.match(/(\d[\d,]*) Census survey series/)?.[1])).toBe(c.census);
  });

  it("says the pull runs on weekdays, as it does, and types no count in words", () => {
    const schema = (capitalMarkets as { $schema_note: string }).$schema_note;
    expect(schema).toContain("every weekday");
    expect(schema).not.toMatch(/\bdaily\b/);
    expect(note).not.toMatch(/\b(forty|fifty|sixty|hundred|thousand)\b/i);
  });
});
