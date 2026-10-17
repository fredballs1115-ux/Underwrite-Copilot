// The deal header's picture where the deal has nothing of the place to
// show (no address, no photograph, no market photograph): its own cover,
// the one its pipeline card wears, so the header splits beside a picture
// rather than collapsing to text.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("../app/(app)/deals/actions", () => ({ replacePicture: async () => {} }));

import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { HeroCover } from "@/app/(app)/deals/[id]/hero-cover";
import { coverFor } from "@/lib/deal-cover";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const cover = coverFor({ seed: "deal-1", assetClass: "office", place: "Downtown core" });

function hero(canAdd: boolean): string {
  return renderToStaticMarkup(
    React.createElement(DealHero, {
      title: "Tower at 12 Main",
      subtitle: "Office",
      figures: [{ label: "Price", value: "$40,000,000", figure: true }],
      picture: React.createElement(HeroCover, { cover, label: "Tower at 12 Main", dealId: "deal-1", canAdd }),
    }),
  );
}

describe("the deal header's cover", () => {
  it("draws the deal's cover as the header's picture, named as no photograph", () => {
    const html = hero(true);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(html).toContain("data-hero-picture");
    expect(html).toContain(`data-deal-cover="${cover.kind}"`);
    expect(html).toContain('aria-label="No photograph of Tower at 12 Main yet, in Downtown core"');
    expect(visibleText(html)).toContain("No photo yet");
    // The reader may add one from it.
    expect(html).toContain('name="dealId" value="deal-1"');
  });

  it("offers no photograph to add where the deal may not take one", () => {
    expect(hero(false)).not.toContain('name="dealId"');
  });

  it("is the deal page's picture wherever PropertyVisual has nothing to show", () => {
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(page).toMatch(/dealAddress\?\.label \|\| picture \|\| marketPicture \|\| gallery\.length > 0 \? \(\s*<PropertyVisual[\s\S]*?\) : \(\s*(?:\/\/[^\n]*\n\s*)*<HeroCover/);
  });
});
