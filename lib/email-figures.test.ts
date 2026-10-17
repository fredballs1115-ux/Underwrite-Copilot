import { describe, expect, it } from "vitest";
import { emailFigures } from "./email-figures";
import { analysisReadyEmail } from "./email-template";
import { sampleDealCard } from "./pipeline-card";
import { sampleHeader } from "./sample-header";
import { compactPrice } from "@/app/(app)/deals/deal-card-parts";
import { SAMPLE_DEAL } from "./sample-deal";
import type { ExtractionResult } from "./anthropic/types";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const TODAY = "2026-10-17";
const sample = () =>
  emailFigures({
    name: SAMPLE_DEAL.name,
    assetClass: SAMPLE_DEAL.asset_class,
    extraction: SAMPLE_DEAL.extraction,
    firstSignal: null,
    address: SAMPLE_DEAL.address,
    today: TODAY,
  });

describe("the screen-complete email's figure tiles read what the card and the header read", () => {
  it("the price and its basis are the pipeline card's, the cap the card's, the size the deal header's", () => {
    const card = sampleDealCard({ today: TODAY });
    const header = sampleHeader(new Date(`${TODAY}T12:00:00Z`));
    const figs = sample();
    expect(figs.map((f) => f.label)).toEqual(["Price", "Cap", "Size"]);
    expect(figs[0]).toEqual({ label: "Price", value: compactPrice(card.slots.price!), sub: card.slots.basis ?? null });
    expect(figs[1].value).toBe(card.slots.cap);
    expect(figs[2].value).toBe(header.figures.find((f) => f.label === "Size")!.value);
  });

  it("a plan deal's tile is its yield on cost, labelled so — never a cap", () => {
    const ex: ExtractionResult = {
      dealName: "Elm Conversion",
      assetClass: "multifamily",
      market: "Baltimore, MD",
      metrics: [
        { label: "Asking price", value: "$18,500,000", flagged: false, page: "p. 3" },
        { label: "NOI (in-place)", value: "$1,100,000", flagged: false, page: "p. 8" },
        { label: "NOI (stabilized)", value: "$1,337,800", flagged: false, page: "p. 9" },
        { label: "Capital budget", value: "$2,850,000", flagged: false, page: "p. 10" },
        { label: "Units", value: "100", flagged: false, page: "p. 3" },
      ],
    };
    const figs = emailFigures({
      name: "Elm",
      assetClass: "multifamily",
      extraction: ex,
      firstSignal: { take: "A value-add play: the renovation program carries the return." } as never,
      address: null,
      today: TODAY,
    });
    const ret = figs.find((f) => f.label === "Yield on cost" || f.label === "Cap");
    expect(ret?.label).toBe("Yield on cost");
    expect(figs.find((f) => f.label === "Size")?.value).toBe("100 units");
  });

  it("nothing read yet is no tiles at all", () => {
    expect(emailFigures({ name: "x", assetClass: null, extraction: null, firstSignal: null, address: null, today: TODAY })).toEqual([]);
  });
});

describe("the screen-complete email draws the tiles as a listing alert does", () => {
  const base = {
    dealName: SAMPLE_DEAL.name,
    verdictLabel: "Caution",
    verdictColor: "#a05a1c",
    buyBoxLabel: "Fit 82 · Pursue",
    reason: "The exit cap carries the return.",
    dealUrl: "https://underwrite.example/deals/d1",
    settingsUrl: "https://underwrite.example/account",
  };

  it("a table row of tiles between the name and the call, inline styles only, each figure escaped", () => {
    const figs = sample();
    const { html, text } = analysisReadyEmail({ ...base, figures: figs });
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    for (const f of figs) expect(html).toContain(`>${f.value}</p>`);
    expect(html).not.toMatch(/<style|class=/);
    // Under the name, before the call's pill.
    expect(html.indexOf(`>${figs[0].value}</p>`)).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html.indexOf(`>${figs[0].value}</p>`)).toBeLessThan(html.indexOf(">Caution</span>"));
    // Three across: a cell each, a third of the row.
    expect((html.match(/<td width="33%"/g) ?? []).length).toBe(3);
    // The plain text says them on one line.
    expect(text).toContain(`Price: ${figs[0].value}${figs[0].sub ? ` (${figs[0].sub})` : ""} · Cap: ${figs[1].value} · Size: ${figs[2].value}`);
    const tricky = analysisReadyEmail({ ...base, figures: [{ label: "Price <b>", value: "$5M & up", sub: '"x"' }] });
    expect(tricky.html).toContain("Price &lt;b&gt;");
    expect(tricky.html).toContain("$5M &amp; up");
    expect(tricky.html).toContain("&quot;x&quot;");
  });

  it("no figures leaves the email as it was", () => {
    const a = analysisReadyEmail(base);
    const b = analysisReadyEmail({ ...base, figures: [] });
    expect(b.html).toBe(a.html);
    expect(b.text).toBe(a.text);
    expect(a.html).not.toContain('<td width="33%"');
  });
});
