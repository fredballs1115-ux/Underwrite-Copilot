// A fit judged on the first signal, marked wherever it is written: the
// pipeline card says "First read", and its CSV and the meeting workbook say
// it on the figure (the lead's correctness audit, 2026-10-01: the CSV's
// buy-box, score and mandate cells and the workbook's buy-box cell
// exported a first read unmarked).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FIRST_READ_TITLE, markFirstRead } from "./first-read";
import { fitCellText } from "./fit-label";

describe("markFirstRead — an exported figure says it is a first read", () => {
  it("marks a figure judged on the first signal, and leaves a full screen's alone", () => {
    expect(markFirstRead("Near", true)).toBe("Near (first read)");
    expect(markFirstRead("64", true)).toBe("64 (first read)");
    expect(markFirstRead("Watch", true)).toBe("Watch (first read)");
    expect(markFirstRead("Near", false)).toBe("Near");
    expect(markFirstRead("64", undefined)).toBe("64");
    expect(markFirstRead("Watch", null)).toBe("Watch");
  });

  it("leaves a blank blank: a figure nothing has judged has nothing to mark", () => {
    expect(markFirstRead("", true)).toBe("");
  });

  it("is what the pipeline's CSV writes in its Buy box, Mandate score and Mandate fit columns", () => {
    // The CSV is built in the list's click handler, which no render reaches,
    // so its cells are held at their source.
    const src = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    const csv = src.slice(src.indexOf("function exportCsv"), src.indexOf("URL.createObjectURL"));
    const header = csv.match(/const header = \[([^\]]*)\]/)?.[1] ?? "";
    const columns = [...header.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(columns.slice(columns.indexOf("Buy box"), columns.indexOf("Buy box") + 3)).toEqual(["Buy box", "Mandate score", "Mandate fit"]);
    // The Buy box cell also says how many of the box's criteria the fit
    // stands on (lib/fit-label `fitCellText`, research pass 35), and marks a
    // first read as markFirstRead does.
    expect(csv).toMatch(
      /fitCellText\(d\.fit \? FIT_META\[d\.fit\]\.label : "", d\.fitCoverage, d\.fitFirstRead\),\s*markFirstRead\(d\.score != null \? String\(d\.score\) : "", d\.fitFirstRead\),/,
    );
    // The Mandate fit cell says the score's call in the deal header's chip's
    // words (lib/fit-label `fitScoreLabel`, less its "Fit N · "), marked a
    // first read the same way.
    const fitCell = csv.slice(csv.indexOf("markFirstRead(", csv.indexOf("String(d.score)")));
    expect(fitCell).toMatch(/^markFirstRead\(\s*d\.mandateVerdict && d\.score != null\s*\?\s*fitScoreLabel\(d\.score, d\.mandateVerdict, d\.fit === "outside", d\.fitCoverage\)/);
    expect(fitCell.slice(0, 600)).toContain("d.fitFirstRead,");
    for (const [word, read] of [["Near", true], ["Fits", false], ["", true]] as const) {
      expect(fitCellText(word, null, read)).toBe(markFirstRead(word, read));
    }
    // The card's tooltip reads the same words, from the same module.
    expect(src).toMatch(/import \{ FIRST_READ_TITLE, markFirstRead \} from "@\/lib\/first-read";/);
    expect(src).not.toMatch(/const FIRST_READ_TITLE\s*=/);
    expect(FIRST_READ_TITLE).toMatch(/^First read — judged on the first pass over the memorandum/);
  });
});
