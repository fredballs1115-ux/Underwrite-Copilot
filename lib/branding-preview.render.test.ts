// The account page's branding card shows what branding changes: the sample
// memo's head and foot (app/memo-preview) with the firm's name, logo and
// footer laid in where the PDF lays them — and, on the locked Free card,
// an example ghosted out of the accessibility tree.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandingPreview, GHOST_BRANDING } from "@/app/(app)/account/branding-preview";
import { MemoPreview } from "@/app/memo-preview";
import { sampleMemoData } from "@/lib/sample-memo";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const data = sampleMemoData(new Date("2026-10-04T15:00:00Z"));

describe("BrandingPreview — the memo's head and foot under the firm's branding", () => {
  it("lays the firm's name, logo and footer where the PDF lays them", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandingPreview, {
        data,
        branding: { firmName: "Sterling Ridge Capital", logoUrl: "https://storage.example/logo.png", footerText: "Confidential — IC use only" },
      }),
    );
    expect(html).toContain('data-qa="branding-preview"');
    expect(html).toContain('data-qa="memo-preview-masthead"');
    expect(html).toContain('data-qa="memo-preview-footer"');
    expect(html).toContain('src="https://storage.example/logo.png"');
    expect(html).not.toContain("aria-hidden");
    const text = visibleText(html);
    expect(text).toContain("Sterling Ridge Capital");
    expect(text).toContain("Deal Screening Memo");
    expect(text).toContain("Confidential — IC use only");
    expect(text).toContain("Powered by Underwrite Copilot");
    expect(text).toContain(data.name);
    expect(text).not.toContain("UC");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("keeps the memo's default head where nothing is set, with no Powered by line", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandingPreview, { data, branding: { firmName: null, logoUrl: null, footerText: null } }),
    );
    const text = visibleText(html);
    expect(text).toContain("UC");
    expect(text).toContain("Underwrite Copilot");
    expect(text).not.toContain("Powered by");
    expect(html).not.toContain("<img");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("ghosts the locked card's example: muted and hidden from a screen reader", () => {
    const html = renderToStaticMarkup(React.createElement(BrandingPreview, { data, branding: GHOST_BRANDING, ghost: true }));
    expect(html).toContain('data-qa="branding-preview-ghost"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("opacity-50");
    expect(visibleText(html)).toContain("Your firm");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("leaves the homepage's tile as it was without branding", () => {
    const html = renderToStaticMarkup(React.createElement(MemoPreview, { data }));
    expect(html).toContain('aria-label="The sample memo&#x27;s first lines"');
    expect(html).not.toContain("memo-preview-masthead");
    expect(html).not.toContain("memo-preview-footer");
  });
});
