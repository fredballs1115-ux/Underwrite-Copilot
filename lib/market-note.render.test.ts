import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import metrosSeed from "@/data/research/metros.json";
import { MarketNote } from "@/app/market/market-note";
import { snapshotReadOn } from "./tracker-read";
import { datedNotes } from "./dated-window";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// Research pass 26, C17: /market printed each covered market's note with no
// date at all, so the figures in it — Philadelphia's "$363,500 May 2026
// median", Baltimore's Q1 2026 volume, a rule's allowance — would have read
// as current in 2028. The note now carries the day its market's research was
// read, in the snapshot panel's own words, and ages by the research rule
// (lib/research-age): past 180 days it keeps the day and adds its age and the
// stale mark. The note itself is printed exactly as the file writes it.

type Entry = { id: string; market_notes?: { value?: string; status?: string } | null; sector_snapshot?: unknown };
const metros = (metrosSeed.metros ?? []) as Entry[];
const byId = (id: string) => metros.find((m) => m.id === id)!;
const draw = (m: Entry, today: string) =>
  renderToStaticMarkup(
    React.createElement(MarketNote, { note: m.market_notes ?? null, readOn: snapshotReadOn(m.sector_snapshot), today }),
  );
const oneLine = (html: string) => visibleText(html).replace(/\s+/g, " ").trim();

describe("a covered market's note on /market", () => {
  it("prints every market's note as the file writes it, with the day its research was read", () => {
    expect(metros.length).toBeGreaterThan(0);
    for (const m of metros) {
      const html = draw(m, "2026-10-05");
      const text = oneLine(html);
      const note = m.market_notes!.value!;
      // The note unchanged, whole.
      expect(text, m.id).toContain(note.replace(/\s+/g, " ").trim());
      expect(text, m.id).toContain(`${note.replace(/\s+/g, " ").trim()} ${m.market_notes!.status ?? "sourced"} · research read Aug 25, 2026`);
      expect(html, m.id).not.toContain('data-qa="research-stale"');
      expect(a11yIssues(html), m.id).toEqual([]);
      expect(gluedWords(visibleText(html)), m.id).toEqual([]);
    }
  });

  it("keeps the day through its 180th, and from the 181st adds its age and the stale mark, the note still shown", () => {
    const philly = byId("philadelphia");
    expect(snapshotReadOn(philly.sector_snapshot)).toBe("2026-08-25");
    const current = draw(philly, "2027-02-21");
    expect(oneLine(current)).toContain("· research read Aug 25, 2026");
    expect(oneLine(current)).not.toContain("stale");
    const stale = draw(philly, "2027-02-22");
    expect(oneLine(stale)).toContain("· research read Aug 25, 2026 (181 days old, stale)");
    expect(stale).toMatch(/text-caution[^>]*data-qa="research-stale"/);
    expect(oneLine(stale)).toContain("$363,500 May 2026 median");
  });

  it("says undated where the market's research states no day, never a day of its own", () => {
    const text = oneLine(
      renderToStaticMarkup(
        React.createElement(MarketNote, { note: { value: "No rent control (VA).", status: "sourced" }, readOn: null, today: "2026-10-05" }),
      ),
    );
    expect(text).toBe("No rent control (VA). sourced · research undated");
  });

  it("draws nothing where the market has no note", () => {
    expect(renderToStaticMarkup(React.createElement(MarketNote, { note: null, readOn: "2026-08-25", today: "2026-10-05" }))).toBe("");
    expect(
      renderToStaticMarkup(React.createElement(MarketNote, { note: { value: "  ", status: "sourced" }, readOn: "2026-08-25", today: "2026-10-05" })),
    ).toBe("");
  });

  it("still says, under the note, a window its words state that has ended (lib/dated-window)", () => {
    const note = { value: "An allowance of 3% for increases between July 1, 2026 and June 30, 2027.", status: "sourced" };
    const at = (today: string) =>
      renderToStaticMarkup(React.createElement(MarketNote, { note, readOn: "2026-08-25", today }));
    expect(at("2027-06-30")).not.toContain('data-qa="window-ended"');
    const ended = at("2027-07-01");
    expect(ended).toContain('data-qa="window-ended"');
    const said = datedNotes(note.value, "2027-07-01").map((n) => n.text);
    expect(said).toHaveLength(1);
    expect(oneLine(ended)).toContain(said[0]);
    expect(oneLine(ended)).toContain(`${note.value} sourced · research read Aug 25, 2026`);
  });

  it("is what the page draws, handed the market's snapshot day and the page's day", () => {
    const page = readFileSync(join(process.cwd(), "app/market/page.tsx"), "utf8");
    expect(page).toContain("<MarketNote");
    expect(page).toMatch(/readOn=\{snapshotReadOn\(\s*\(active as \{ sector_snapshot\?: unknown \}\)\.sector_snapshot\s*\)\}/);
    // The note is no longer printed inline, undated.
    expect(page).not.toContain("(active.market_notes as { value?: string } | null)?.value}");
  });
});
