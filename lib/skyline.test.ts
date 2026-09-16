import { describe, expect, it } from "vitest";
import {
  SKYLINES,
  SKYLINE_WIDTH,
  commonsPage,
  commonsUrl,
  creditLine,
  hasSkyline,
  skylineFor,
} from "./skyline";
import { gluedWords } from "./render-lint";
import metrosSeed from "@/data/research/metros.json";

const METRO_IDS = new Set((metrosSeed.metros ?? []).map((m) => (m as { id: string }).id));

describe("the market photograph table", () => {
  it("only names markets the research layer actually covers", () => {
    for (const id of Object.keys(SKYLINES)) {
      expect(METRO_IDS.has(id), `${id} is not a covered market`).toBe(true);
    }
  });

  it("carries a filename, a place, a photographer and a licence for every entry", () => {
    for (const [id, shot] of Object.entries(SKYLINES)) {
      // A bare name, never a URL or a "File:" prefix — the route builds both.
      expect(shot.file, id).toMatch(/^[^:/]+\.(jpg|jpeg|png|webp)$/i);
      expect(shot.file, id).not.toMatch(/^File:/i);
      expect(shot.place.length, id).toBeGreaterThan(3);
      expect(shot.credit.length, id).toBeGreaterThan(1);
      expect(shot.license.length, id).toBeGreaterThan(1);
    }
  });

  it("links the licence wherever the licence obliges us to", () => {
    // Public domain asks nothing. Every Creative Commons licence asks for
    // the licence itself to be linked, so an entry claiming one without a
    // URL would be publishing under terms we are not honouring.
    for (const [id, shot] of Object.entries(SKYLINES)) {
      if (/^public domain$/i.test(shot.license) || /^cc0/i.test(shot.license)) continue;
      expect(shot.licenseUrl, `${id} claims ${shot.license} with no licence link`).toMatch(
        /^https?:\/\//,
      );
    }
  });

  it("reads a market's photograph by id, and nothing for one without", () => {
    expect(skylineFor("definitely-not-a-metro")).toBeNull();
    expect(hasSkyline("definitely-not-a-metro")).toBe(false);
    for (const id of Object.keys(SKYLINES)) {
      expect(hasSkyline(id)).toBe(true);
      expect(skylineFor(id)?.file).toBe(SKYLINES[id].file);
    }
  });
});

describe("the Commons URLs", () => {
  it("addresses a file by name at a clamped width", () => {
    const url = commonsUrl("Chicago Skyline.jpg", 1600);
    expect(url).toContain("/wiki/Special:FilePath/");
    // A space must survive as an escape, or Commons answers on the wrong name.
    expect(url).toContain("Chicago%20Skyline.jpg");
    expect(url).toContain("width=1600");
  });

  it("refuses to ask for a width outside the served range", () => {
    expect(commonsUrl("a.jpg", 99999)).toContain(`width=${SKYLINE_WIDTH.max}`);
    expect(commonsUrl("a.jpg", 10)).toContain(`width=${SKYLINE_WIDTH.min}`);
    expect(commonsUrl("a.jpg", Number.NaN)).toContain(`width=${SKYLINE_WIDTH.default}`);
  });

  it("escapes a name on the way into the file's own page", () => {
    expect(commonsPage("Foo Bar.jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Foo%20Bar.jpg",
    );
  });
});

describe("every credit the table will actually print", () => {
  it("survives the same text lint the live pages are held to", () => {
    // These strings go onto public pages, so they meet the public pages'
    // standard. Worth asserting rather than assuming: the photographers are
    // named exactly as Commons names them, which means one credit is in
    // Chinese characters and another carries a parenthetical real name —
    // neither shape has appeared in this codebase's copy before.
    for (const [id, shot] of Object.entries(SKYLINES)) {
      const line = creditLine(shot);
      expect(gluedWords(line), `${id}: ${line}`).toEqual([]);
      expect(line, id).not.toContain("undefined");
      expect(line, id).not.toContain("  ");
    }
  });

  it("names a real place and a real photographer, never a placeholder", () => {
    for (const [id, shot] of Object.entries(SKYLINES)) {
      expect(shot.credit.toLowerCase(), id).not.toBe("unknown");
      expect(shot.credit.trim(), id).toBe(shot.credit);
      expect(shot.place.trim(), id).toBe(shot.place);
    }
  });
});

describe("the credit line", () => {
  it("names the place, the photographer and the licence", () => {
    const line = creditLine({
      file: "x.jpg",
      place: "Downtown Dallas",
      credit: "Jane Roe",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    });
    expect(line).toBe("Downtown Dallas · Jane Roe · CC BY-SA 4.0");
  });

  it("falls back to the archive rather than printing the word unknown", () => {
    const line = creditLine({
      file: "x.jpg",
      place: "Downtown Dallas",
      credit: "unknown",
      license: "Public domain",
      licenseUrl: "",
    });
    expect(line).toContain("Wikimedia Commons");
    expect(line).not.toContain("unknown");
  });
});
