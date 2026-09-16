import { describe, expect, it } from "vitest";
import {
  SKYLINES,
  SKYLINE_WIDTH,
  commonsPage,
  commonsUrl,
  creditLine,
  hasSkyline,
  headerSafe,
  skylineFor,
  skylineTag,
} from "./skyline";
import { gluedWords } from "./render-lint";
import metrosSeed from "@/data/research/metros.json";
import candidateFile from "@/data/skyline-candidates.json";

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

  it("tags a market by the file it currently names", () => {
    // The token exists so a year-long immutable cache is honest. It has to
    // be stable for the same file (or every deploy would needlessly bust
    // every browser's copy) and different for a different file (or the
    // cache would never be busted when it should be).
    const tags = Object.keys(SKYLINES).map((id) => skylineTag(id));
    expect(new Set(tags).size, "two markets share a tag").toBe(tags.length);
    for (const id of Object.keys(SKYLINES)) {
      expect(skylineTag(id)).toBe(skylineTag(id));
      expect(skylineTag(id)).toMatch(/^[0-9a-z]+$/);
    }
    // A market with no photograph has nothing to bust.
    expect(skylineTag("definitely-not-a-metro")).toBe("0");
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

// ── the credit as an HTTP header ───────────────────────────────────────────
//
// The bug this is the guard for: Philadelphia's photographer is credited on
// Commons as 颐园居, the skyline route put the raw credit in
// `x-imagery-source`, and `new Headers()` THROWS above U+00FF rather than
// dropping the character. A throw in a route handler is a 500 — and 500 is
// not the 404 that tells CityPhoto to fall back to the overhead, so the
// picture vanished instead of degrading. Philadelphia is /demo's own metro.
describe("the credit as a header value", () => {
  it("can be put in a real Headers object for EVERY market in the table", () => {
    // The assertion that would have caught it. Not a unit test of the
    // helper — the whole table, through the real constructor.
    for (const [id, shot] of Object.entries(SKYLINES)) {
      const credit = `Wikimedia Commons · ${shot.credit} · ${shot.license}`;
      expect(() => new Headers({ "x-imagery-source": headerSafe(credit) }), id).not.toThrow();
    }
  });

  it("proves the raw credit really does throw, so the guard is not theatre", () => {
    const philly = SKYLINES.philadelphia;
    expect(philly, "philadelphia is still in the table").toBeTruthy();
    expect(() =>
      new Headers({ "x-imagery-source": `Wikimedia Commons · ${philly.credit}` }),
    ).toThrow();
  });

  it("keeps a Latin-1 name readable rather than encoding it", () => {
    // "Mario Roberto Durán Ortiz" is a real credit in this table, and á is
    // inside the range a header accepts. Encoding it would be a regression
    // in legibility for no safety gain.
    expect(headerSafe("Mario Roberto Durán Ortiz")).toBe("Mario Roberto Durán Ortiz");
    expect(headerSafe("Downtown Dallas · alfred twu · CC0")).toBe(
      "Downtown Dallas · alfred twu · CC0",
    );
  });

  it("percent-encodes what a header cannot carry, rather than dropping it", () => {
    // The name survives as something a reader can decode back.
    const encoded = headerSafe("颐园居");
    expect(encoded).not.toContain("颐");
    expect(decodeURIComponent(encoded)).toBe("颐园居");
  });

  it("takes a newline out of a credit, so a header cannot be split", () => {
    expect(headerSafe("Jane Roe\r\nx-evil: 1")).not.toMatch(/[\r\n]/);
  });
});

// ── the candidate file the runner probes ───────────────────────────────────
//
// WHY THIS IS A TEST AND NOT A CONVENTION. scripts/probe-skylines.mjs reads
// `cand.file` out of each entry. NoVA's four candidates were committed as
// bare STRINGS rather than `{ file, note }` objects, so `cand.file` was
// undefined, and the probe's verify pass printed
//
//     DEAD  undefined — no such file on Commons
//
// four times — which reads exactly like a dead photograph and is nothing of
// the sort: the file was never asked for. That shipped, and the round's
// marker passed anyway because it grepped the credit line out of the
// server's HTML, which renders whether or not the picture resolves.
//
// The sandbox cannot check Commons, so the probe is the ONLY way a dead file
// is ever caught. A malformed entry silently disables it for that market.
describe("the candidate file", () => {
  it("gives every candidate a file the probe can actually ask for", () => {
    for (const market of candidateFile.markets ?? []) {
      for (const [i, cand] of (market.candidates ?? []).entries()) {
        const where = `${market.metroId}[${i}]`;
        expect(typeof cand, `${where} is not an object`).toBe("object");
        expect(typeof (cand as { file?: unknown }).file, `${where}.file`).toBe("string");
        expect((cand as { file: string }).file, where).toMatch(/\.(jpe?g|png|webp)$/i);
      }
    }
  });

  it("offers a candidate for every market whose table entry names a file", () => {
    // The table is what the site serves; the candidate file is what the
    // runner verifies. A market in one and not the other is unverifiable.
    const probed = new Set(
      (candidateFile.markets ?? [])
        .filter((m) => (m.candidates ?? []).length > 0)
        .map((m) => m.metroId),
    );
    for (const id of Object.keys(SKYLINES)) {
      expect(probed.has(id), `${id} is served but never probed`).toBe(true);
    }
  });

  it("probes the file the table actually serves, not merely some file", () => {
    // A candidate list that has drifted off the chosen file verifies the
    // wrong picture — green, and meaningless.
    for (const [id, shot] of Object.entries(SKYLINES)) {
      const market = (candidateFile.markets ?? []).find((m) => m.metroId === id);
      const files = (market?.candidates ?? []).map((c) => (c as { file: string }).file);
      expect(files, `${id}: the served file is not among its candidates`).toContain(shot.file);
    }
  });
});
