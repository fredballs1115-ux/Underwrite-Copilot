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
  HOW_WE_TEST_MARKER,
  HOW_WE_TEST_TITLE,
  KIND_LABEL,
  PUBLISHERS,
  WHO_DOES_WHAT,
  engineReruns,
  evidenceKindOf,
} from "./how-we-test";
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
      basis: ["document", "published", "rule_of_thumb"],
      exit_cap: ["document", "published", "published"],
      debt: ["published", null, null],
      noi: ["document", "document", "document"],
      vacancy: ["document", "published", "published", "rule_of_thumb"],
      rent_growth: ["published", "published", "published", "published"],
      expense_growth: ["published", "published", "published"],
      taxes: ["document", "document"],
      insurance: ["published", "document"],
      renovation_premium: ["document", "document", null],
      other: [null],
    });
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
      "No return is re-run on a plan",
      "No return is re-run on a figure nobody stated",
      "A metro figure is the metro's",
      "Licensed data is not read",
    ]);
    // The plan's limit names every kind lib/deal-strategy's isPlanDeal
    // calls a plan, and the stress test withholds the re-run on each.
    const plan = CANNOT.find((c) => c.heading === "No return is re-run on a plan")!.line;
    for (const kind of ["value_add", "lease_up", "conversion", "development"] as const) {
      expect(isPlanDeal(kind), kind).toBe(true);
      expect(plan.toLowerCase(), kind).toContain(kind.replace("_", "-"));
    }
    expect(isPlanDeal("stabilized")).toBe(false);
    // The published-figure line claims a link only where the evidence
    // carries one: recorded sales.
    expect(CADENCE_RULE.lines.join(" ")).not.toContain("a link to its source");
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
