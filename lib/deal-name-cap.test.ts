// A deal's name, one cap and every surface that prints it (research pass 42,
// M8 and L1): the upload stored any length while the rename cut at 120, the
// manual form at 120 and the batch at 80; a URL pasted as the name widened a
// phone's deal page to 711px; and the memo's hyphenation drew
// "…/1400-Market-St-P- hiladelphia-…", a name that is not the name.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { DEAL_NAME_MAX, dealNameOf, nameFromFile } from "./deal-name";
import { factsFromForm } from "./manual-deal";
import { nameBreaks } from "./memo/pdf-text";
import { MemoDocument, buildMemoData } from "./memo/memo-document";
import { buildReportData, renderReportPdf } from "./memo/report-document";
import { pdfPageTextsOf, pdfTextOf } from "./memo/pdf-text-of";
import { SAMPLE_DEAL } from "./sample-deal";
import type { DealRow } from "./deals";
import { DealHero, HERO_TITLE } from "@/app/(app)/deals/[id]/deal-hero";

const URL_NAME = "https://www.loopnet.com/Listing/1400-Market-St-Philadelphia-PA/31234567/ConfidentialOfferingMemorandumFinalVersion7";
const src = (p: string) => readFileSync(p, "utf8");

describe("one cap at create", () => {
  it("cuts a name to 120 characters, never inside an emoji, and reads nothing as no name", () => {
    expect(DEAL_NAME_MAX).toBe(120);
    expect(dealNameOf(`  ${"a".repeat(300)}  `)).toHaveLength(120);
    expect(dealNameOf("  The Maddox  ")).toBe("The Maddox");
    expect(dealNameOf(null)).toBe("");
    expect(dealNameOf("   ")).toBe("");
    const emoji = `${"x".repeat(119)}🏢🚀`;
    expect(Array.from(dealNameOf(emoji))).toHaveLength(120);
    expect(dealNameOf(emoji).endsWith("🏢")).toBe(true);
    expect(nameFromFile(`${"b".repeat(200)}.pdf`)).toHaveLength(120);
  });

  it("is the cap the upload, the batch, the manual form and the rename all read", () => {
    const form = new FormData();
    form.set("name", "c".repeat(200));
    expect(factsFromForm(form).name).toHaveLength(DEAL_NAME_MAX);
    const actions = src("app/(app)/deals/actions.ts");
    const core = actions.slice(actions.indexOf("async function createDealCore"), actions.indexOf("async function createDealCore") + 400);
    expect(core).toContain('const name = dealNameOf(formData.get("name"));');
    const rename = actions.slice(actions.indexOf("export async function renameDeal"), actions.indexOf("export async function renameDeal") + 1200);
    expect(rename).toContain('const name = dealNameOf(formData.get("name"));');
    expect(rename).not.toMatch(/name\.slice\(0, \d+\)/);
    // Each form's field holds the same cap.
    for (const f of ["app/(app)/deals/pipeline.tsx", "app/(app)/deals/manual-deal-form.tsx", "app/(app)/deals/batch-upload.tsx", "app/(app)/deals/[id]/deal-actions.tsx"]) {
      expect(src(f), f).toContain("maxLength={DEAL_NAME_MAX}");
      expect(src(f), f).not.toMatch(/maxLength=\{(80|120)\}/);
    }
  });
});

describe("the deal header's name", () => {
  it("wraps an unbroken name anywhere and stops at three lines, the whole name in its title", () => {
    const html = renderToStaticMarkup(
      React.createElement(DealHero, { title: URL_NAME, subtitle: "Philadelphia, PA · Multifamily", figures: [] }),
    );
    const h1 = /<h1 id="deal-title"[^>]*>/.exec(html)?.[0] ?? "";
    expect(h1).toContain(`title="${URL_NAME}"`);
    // overflow-wrap: anywhere lets the flex row shrink the name to the page,
    // where the unbroken URL had widened a 390px page to 711px.
    for (const cls of ["[overflow-wrap:anywhere]", "min-w-0", "line-clamp-3"]) expect(HERO_TITLE.split(" ")).toContain(cls);
    expect(h1).toContain(`class="${HERO_TITLE}"`);
  });
});

describe("nameBreaks — where a name breaks on paper", () => {
  it("keeps a word that fits whole", () => {
    expect(nameBreaks("Brewerytown")).toEqual(["Brewerytown"]);
    expect(nameBreaks("a".repeat(24))).toEqual(["a".repeat(24)]);
  });

  it("breaks a URL after its slashes and hyphens, never inside //, and draws nothing at a break", () => {
    const parts = nameBreaks(URL_NAME);
    // The parts, soft hyphens removed as react-pdf removes them, are the name.
    expect(parts.join("").replaceAll("­", "")).toBe(URL_NAME);
    const pieces = parts.filter((p) => p !== "­");
    expect(pieces.slice(0, 4)).toEqual(["https://", "www.", "loopnet.", "com/"]);
    expect(pieces).toContain("Market-");
    expect(pieces).toContain("Philadelphia-");
    // A run with no separator longer than a column is cut in pieces of twelve.
    expect(pieces.at(-1)!.length).toBeLessThanOrEqual(12);
    // Every piece is followed by a break that draws nothing.
    expect(parts.filter((p) => p === "­")).toHaveLength(pieces.length - 1);
  });
});

const dealNamed = (name: string) =>
  ({
    name,
    asset_class: SAMPLE_DEAL.asset_class,
    extraction: SAMPLE_DEAL.extraction,
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    market: SAMPLE_DEAL.market,
    reconciliation: SAMPLE_DEAL.reconciliation,
    verdict: SAMPLE_DEAL.verdict,
    prior_screen: null,
  }) as unknown as DealRow;

describe("a URL as a deal's name, on paper", () => {
  it("reads intact in the memo — no hyphen drawn inside it — and the memo keeps one page", async () => {
    const data = buildMemoData(dealNamed(URL_NAME), "October 5, 2026", []);
    const buf = await renderToBuffer(React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0]);
    expect(pdfPageTextsOf(buf)).toHaveLength(1);
    expect(pdfTextOf(buf).replace(/\s+/g, "")).toContain(URL_NAME);
  }, 120_000);

  it("reads intact in the report's running header, a name stored before the cap included", async () => {
    // Longer than the header's line, so it must break inside the URL.
    const stored = `${URL_NAME}/Appendix-B-RentRollAndTrailingTwelve`;
    expect(stored.length).toBeGreaterThan(DEAL_NAME_MAX);
    const input = buildReportData(dealNamed(stored), "October 5, 2026", [], null);
    const buf = await renderReportPdf(input);
    const second = (pdfPageTextsOf(buf)[1] ?? "").replace(/\s+/g, "");
    expect(second).toContain(`${stored}—fullscreeningreport`);
  }, 300_000);
});
