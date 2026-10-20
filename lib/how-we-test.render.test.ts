// The methodology page (2026-10-19): /how-we-test says how each of the
// memorandum's assumptions is tested, drawn from lib/stress-test-types'
// STRESS_METHODS — never copied by hand — so this holds the page's visible
// text to the table: every title, every `against` item and every `limits`
// item, in the table's order; the kind each evidence item is marked by, read
// off its words; the publishers with the notices their terms ask for; the
// catalogue and sitemap entries; and the live-verify marker in the bytes a
// curl receives.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { HowWeTestView } from "@/app/how-we-test/view";
import { metadata } from "@/app/how-we-test/page";
import sitemap from "@/app/sitemap";
import { BLS_NOTICE, FRED_NOTICE } from "@/lib/data-notices";
import { REALTOR_CREDIT } from "@/lib/realtor";
import { ZORI_CREDIT } from "@/lib/zori";
import { STRESS_KEYS, STRESS_METHODS } from "@/lib/stress-test-types";
import {
  CADENCE_RULE,
  CANNOT,
  HEADLINE_METHOD,
  HOW_WE_TEST_MARKER,
  HOW_WE_TEST_TITLE,
  KIND_LABEL,
  PUBLISHERS,
  TRACK_RECORD,
  VERDICT_RULES,
  VERDICT_WORDS,
  WHO_DOES_WHAT,
  engineReruns,
  evidenceKindOf,
} from "./how-we-test";
import { snapshotThreshold } from "./stress-snapshot";
import {
  BASIS_STRETCH_PCT,
  BASIS_UNSUPPORTED_PCT,
  EXIT_CAP_UNSUPPORTED_BPS,
  EXPENSE_GROWTH_UNSUPPORTED_PTS,
  IRR_MOVE_STRETCH_BPS,
  RENT_GROWTH_UNSUPPORTED_PTS,
  VACANCY_UNSUPPORTED_PTS,
} from "./stress-test";
import { RECORD_FLOOR } from "./track-record";
import { HOW_WE_TEST_PAGE, HOW_WE_TEST_PATH } from "./public-pages";
import { isPlanDeal } from "./deal-strategy";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const html = renderToStaticMarkup(React.createElement(HowWeTestView));
const text = visibleText(html);

describe("/how-we-test draws every method from the table", () => {
  it("names the page, says who does what, and carries the marker", () => {
    expect(text).toContain(HOW_WE_TEST_TITLE);
    expect(html).toMatch(/<h1[^>]*>How each assumption is tested<\/h1>/);
    for (const side of [WHO_DOES_WHAT.ai, WHO_DOES_WHAT.code]) {
      expect(text).toContain(side.heading);
      for (const item of side.items) expect(text).toContain(item);
    }
    expect(text).toContain(HOW_WE_TEST_MARKER);
  });

  it("prints every title, every `against` item and every `limits` item, in the table's order", () => {
    expect(STRESS_METHODS.length).toBeGreaterThan(5);
    let at = text.indexOf("1 of ");
    expect(at).toBeGreaterThan(-1);
    for (const [i, m] of STRESS_METHODS.entries()) {
      const title = text.indexOf(m.title, at);
      expect(title, m.key).toBeGreaterThan(-1);
      at = title;
      expect(text).toContain(`${i + 1} of ${STRESS_METHODS.length}`);
      expect(text).toContain(`The OM's claim: ${m.claim}`);
      for (const item of m.against) expect(text, `${m.key} against`).toContain(item);
      expect(text, `${m.key} engine`).toContain(m.engine);
      for (const item of m.limits) expect(text, `${m.key} limits`).toContain(item);
      // One section an assumption, keyed so the jump list lands on it.
      expect(html).toContain(`<section id="${m.key}"`);
      expect(html).toContain(`href="#${m.key}"`);
    }
    // The table covers every key the stress test uses, once each.
    expect(STRESS_METHODS.map((m) => m.key)).toEqual([...STRESS_KEYS]);
    expect((html.match(/data-method="/g) ?? []).length).toBe(STRESS_METHODS.length);
  });

  it("draws one schematic a section, hidden from a screen reader, with no figure in it", () => {
    const pictures = html.match(/<svg[^>]*data-qa="method-picture"[^>]*>[\s\S]*?<\/svg>/g) ?? [];
    expect(pictures.length).toBe(STRESS_METHODS.length);
    for (const p of pictures) {
      expect(p).toContain('aria-hidden="true"');
      // Three words and no figure: visibleText keeps <text> runs together.
      const words = [...p.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].trim());
      expect(words).toEqual(["OM", "evidence", "IRR"]);
      expect(visibleText(p)).not.toMatch(/\d/);
    }
    // The arrow is dashed where the engine swaps no figure.
    const dashed = pictures.filter((p) => p.includes("stroke-dasharray")).length;
    expect(dashed).toBe(STRESS_METHODS.filter((m) => !engineReruns(m)).length);
    expect(engineReruns(STRESS_METHODS.find((m) => m.key === "vacancy")!)).toBe(true);
    expect(engineReruns(STRESS_METHODS.find((m) => m.key === "other")!)).toBe(false);
  });

  it("marks each evidence item by its kind, read off the table's own words, and leaves the rest unmarked", () => {
    const byKey = Object.fromEntries(STRESS_METHODS.map((m) => [m.key, m.against.map(evidenceKindOf)]));
    expect(byKey).toEqual({
      // The reader's past screens are other memoranda's asks — asks, not
      // trades, nobody's publication — filed as a rule of thumb.
      // The memorandum's own figures are the OM against itself, as the
      // stress test files them and the panel marks them; the rent roll and
      // the T-12 are the deal's own documents.
      basis: ["om_internal", "published", "rule_of_thumb"],
      exit_cap: ["om_internal", "published", "published"],
      debt: ["published", null, null],
      noi: ["document", "document", "om_internal"],
      // A stabilized assumption is the market's to judge first; the
      // documents' vacancy is today's.
      vacancy: ["published", "published", "document", "rule_of_thumb"],
      rent_growth: ["published", "published", "published", "published", "published"],
      expense_growth: ["published", "published", "published", "published"],
      taxes: ["om_internal", "om_internal"],
      insurance: ["published", "document"],
      // The break-even is said beside the row, never set against it.
      renovation_premium: ["om_internal", "om_internal"],
      other: [null],
    });
    // The page's words for a kind are the panel's own.
    const panel = readFileSync("app/stress-test-panel.tsx", "utf8");
    for (const word of Object.values(KIND_LABEL)) expect(panel, word).toContain(`word: "${word}"`);
    // Every item the table names a rule of thumb is marked one, and no other.
    for (const m of STRESS_METHODS) {
      for (const item of m.against) {
        expect(evidenceKindOf(item) === "rule_of_thumb", item).toBe(/rule of thumb|class's norm/.test(item));
      }
    }
    const marks = [...html.matchAll(/data-kind="(\w+)"/g)].map((m) => m[1]);
    const expected = Object.values(byKey).flat().filter((k): k is NonNullable<typeof k> => k !== null);
    expect(marks).toEqual(expected);
    for (const k of new Set(expected)) expect(text).toContain(KIND_LABEL[k]);
  });

  it("names the publishers with the notices their terms ask for, and the cadence rule", () => {
    for (const p of PUBLISHERS) {
      expect(text).toContain(p.name);
      expect(text).toContain(p.reads);
      if (p.notice) expect(text).toContain(p.notice);
    }
    expect(PUBLISHERS.map((p) => p.name)).toEqual([
      "FRED",
      "BLS",
      "Census Bureau",
      "Zillow Research",
      "Realtor.com",
      "The research tracker",
      "Public property records",
    ]);
    // The notices are lib/data-notices' own words, and the feeds' own credits.
    expect(PUBLISHERS.find((p) => p.name === "FRED")?.notice).toBe(FRED_NOTICE);
    expect(PUBLISHERS.find((p) => p.name === "BLS")?.notice).toBe(BLS_NOTICE);
    expect(PUBLISHERS.find((p) => p.name === "Zillow Research")?.notice).toBe(ZORI_CREDIT);
    expect(PUBLISHERS.find((p) => p.name === "Realtor.com")?.notice).toBe(REALTOR_CREDIT);
    expect(text).toContain(CADENCE_RULE.heading);
    for (const line of CADENCE_RULE.lines) expect(text).toContain(line);
    expect(text).toContain("What a stress test cannot do");
    for (const c of CANNOT) {
      expect(text).toContain(c.heading);
      expect(text).toContain(c.line);
    }
    expect(CANNOT.map((c) => c.heading)).toEqual([
      "Not a forecast",
      "Not investment advice",
      "No levered return on a plan",
      "No return is re-run on a figure nobody stated",
      "A metro figure is the metro's",
      "Licensed databases are not read",
    ]);
    // Published broker research is read (the tracker's cap ranges), so the
    // page never says broker research goes unread.
    expect(text).not.toMatch(/broker cap-rate surveys? (?:are|is) (?:licensed|never read)/i);
    // The plan's limit names every kind lib/deal-strategy's isPlanDeal
    // calls a plan, and the stress test withholds the re-run on each.
    const plan = CANNOT.find((c) => c.heading === "No levered return on a plan")!.line;
    for (const kind of ["value_add", "lease_up", "conversion", "development"] as const) {
      expect(isPlanDeal(kind), kind).toBe(true);
      expect(plan.toLowerCase(), kind).toContain(kind.replace("_", "-"));
    }
    expect(isPlanDeal("stabilized")).toBe(false);
    // The published-figure line claims a link only where the evidence
    // carries one: recorded sales.
    expect(CADENCE_RULE.lines.join(" ")).not.toContain("a link to its source");
  });

  it("defines the four verdict words, each row's rule with the reader's own thresholds, and how the record is scored", () => {
    expect(VERDICT_WORDS.map((v) => v.word)).toEqual(["holds", "stretched", "unsupported", "unchecked"]);
    for (const v of VERDICT_WORDS) {
      expect(text).toContain(v.word);
      expect(text).toContain(v.line);
    }
    expect(text).toContain(`${IRR_MOVE_STRETCH_BPS} bps or more`);
    // One rule a method, printed in its section, every threshold the
    // constant lib/stress-test reads.
    expect(Object.keys(VERDICT_RULES).sort()).toEqual([...STRESS_KEYS].sort());
    expect((html.match(/data-qa="verdict-rule"/g) ?? []).length).toBe(STRESS_METHODS.length);
    for (const m of STRESS_METHODS) expect(text, m.key).toContain(VERDICT_RULES[m.key]);
    expect(VERDICT_RULES.vacancy).toContain(`${VACANCY_UNSUPPORTED_PTS} points`);
    expect(VERDICT_RULES.vacancy).toMatch(/^A stabilized assumption is held to the market/);
    expect(VERDICT_RULES.rent_growth).toMatch(/^Held to the figure for its kind of rent/);
    // A rented house, a park, a student or a mixed-use building (audit M4).
    expect(VERDICT_RULES.rent_growth).toContain("a house, all-homes first; a park, student or mixed-use building, the closest, named so");
    expect(VERDICT_RULES.rent_growth).toContain(`${RENT_GROWTH_UNSUPPORTED_PTS} points`);
    // ONE figure decides each row (lib/stress-deciders), never the lowest
    // of several: all-items CPI for an expense growth, core only in its place.
    expect(VERDICT_RULES.expense_growth).toMatch(/^Held to all-items CPI/);
    expect(VERDICT_RULES.expense_growth).not.toMatch(/lowest/);
    expect(VERDICT_RULES.expense_growth).toContain(`${EXPENSE_GROWTH_UNSUPPORTED_PTS} points`);
    expect(VERDICT_RULES.exit_cap).toContain(`${EXIT_CAP_UNSUPPORTED_BPS} bps`);
    expect(VERDICT_RULES.exit_cap).toMatch(/a cap range beside a going-in cap decides nothing/);
    expect(VERDICT_RULES.exit_cap).not.toMatch(/stretched at worst/);
    expect(VERDICT_RULES.basis).toContain(`${BASIS_STRETCH_PCT}%`);
    expect(VERDICT_RULES.basis).toContain(`${BASIS_UNSUPPORTED_PCT}%`);
    // The record: its heading, its lines, and its floor the reader's own.
    expect(text).toContain(TRACK_RECORD.heading);
    for (const line of TRACK_RECORD.lines) expect(text).toContain(line);
    expect(TRACK_RECORD.lines.join(" ")).toContain(`under ${RECORD_FLOOR} scored rows`);
    expect(RECORD_FLOOR).toBe(5);
    // Every row scored, holds included, each outcome said, and the margins
    // the snapshot keeps (lib/stress-snapshot) printed as the reader's own.
    const record = TRACK_RECORD.lines.join(" ");
    expect(record).toContain("Every row of the stress test is scored, holds included");
    expect(record).toContain("a false hold");
    expect(record).toContain("An unchecked row is not scored.");
    expect(record).toContain('"3 of 5 rows"');
    expect(record).toContain("0.05 points on a vacancy, 5% of the OM's NOI, 5% of its price.");
    expect(snapshotThreshold("vacancy")).toEqual({ value: 0.05, unit: "pts" });
    expect(snapshotThreshold("noi")).toEqual({ value: 0.05, unit: "share" });
    expect(snapshotThreshold("basis")).toEqual({ value: 0.05, unit: "share" });
    for (const line of TRACK_RECORD.lines) expect(line.length, line).toBeLessThanOrEqual(260);
    // A stabilized vacancy the market decided is not scored by a later document (audit L5).
    expect(TRACK_RECORD.lines).toContain("A stabilized vacancy the market's figure decided is not scored by a later rent roll or T-12: a document's vacancy is the building's today, not a test of the assumption.");
    // The marker keeps the sentence live-verify greps, whole.
    expect(HOW_WE_TEST_MARKER).toContain("The arithmetic is run in code, never by the AI.");
    expect(readFileSync(".github/workflows/live-verify.yml", "utf8")).toContain("The arithmetic is run in code, never by the AI.");
    // The closing card names the sample for what it is.
    expect(text).toContain("See it on the sample deal");
    expect(text).not.toContain("real deal");
  });

  it("says how the headline is struck, in HEADLINE_METHOD's own words, before the assumptions' sections", () => {
    const flat = text.replace(/\s+/g, " ").replace(/&#x27;/g, "'");
    const m = HEADLINE_METHOD;
    for (const s of [m.title, m.claim, ...m.omCase, ...m.evidenceCase, ...m.split, ...m.overlap, ...m.plan, ...m.limits]) expect(flat).toContain(s);
    // The panel's link lands here, ahead of the per-assumption sections.
    expect(html).toContain('<section id="headline"');
    expect(html.indexOf('id="headline"')).toBeLessThan(html.indexOf(`id="${STRESS_METHODS[0].key}"`));
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-qa="headline-picture"/);
  });

  it("reads clean: no glued words, no accessibility faults, no article typed before a value", () => {
    expect(gluedWords(text)).toEqual([]);
    // A coverage label carries its own brackets ("New Jersey (statewide)"):
    // the page never wraps it in another pair.
    expect(text).not.toContain("))");
    expect(a11yIssues(html)).toEqual([]);
    // No paragraph past a line of prose on a public page: the longest
    // sentence the page's own words carry is the table's, not a paragraph.
    for (const m of html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
      expect(visibleText(m[1]).length, m[1].slice(0, 60)).toBeLessThan(260);
    }
  });

  it("is in the catalogue and the sitemap, under its own name, and its metadata reads the catalogue", () => {
    expect(HOW_WE_TEST_PAGE.title).toBe(HOW_WE_TEST_TITLE);
    expect(HOW_WE_TEST_PAGE.canonical).toBe(HOW_WE_TEST_PATH);
    expect(HOW_WE_TEST_PATH).toBe("/how-we-test");
    expect(metadata.alternates?.canonical).toBe(HOW_WE_TEST_PATH);
    expect(metadata.title).toBe(HOW_WE_TEST_TITLE);
    const entry = sitemap().find((e) => e.url.endsWith(HOW_WE_TEST_PATH));
    expect(entry).toBeDefined();
    expect(entry?.lastModified).toBeUndefined();
    // Linked where /why is: the public shell's footer, /why's own, and the
    // homepage's product list.
    for (const f of ["app/public-shell.tsx", "app/why/page.tsx", "app/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain('href="/how-we-test"');
    }
  });

  it("carries the live-verify marker as one text node in the bytes a curl receives", () => {
    // React's server renderer puts <!-- --> between adjacent text nodes, so
    // a marker that spans an interpolation is never in the served HTML
    // (lib/live-verify-markers.test.ts). The marker is one JS string.
    const served = renderToString(React.createElement(HowWeTestView));
    expect(served).toContain(HOW_WE_TEST_MARKER);
    expect(HOW_WE_TEST_MARKER).not.toMatch(/[{}]/);
    expect(served).toContain(`data-qa="how-we-test-marker">${HOW_WE_TEST_MARKER}</p>`);
  });
});
