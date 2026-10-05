import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PICTURE_CHIPS, PICTURE_TIERS, chipWidth, dealTags, pictureRoom, placeTags, placeTagsByTier } from "./pipeline-tags";
import type { PipelineSlots } from "./pipeline-slots";
import type { ExtractionResult } from "./anthropic/types";
import { exchangeForDeal } from "./exchange-deal";

const slots = (over: Partial<PipelineSlots>): PipelineSlots => ({ cap: null, price: null, yoc: null, ...over });

// Each printable character's advance in a chip's type (Geist semibold at
// 11px), as Chromium drew it on 2026-10-01: twenty of the character in a
// span, measured and divided (the space measured between two letters).
const DRAWN_ADVANCE: [string, number][] = [
  [" ", 2.6], ["'", 2.15], [",", 2.48], [".", 2.48], ["·", 2.48], ["!", 2.67], ["i", 2.79], ["`", 2.95], ["I", 3.02], ["|", 3.12],
  ["j", 3.16], ["l", 3.16], ["(", 3.37], [")", 3.37], [":", 3.37], [";", 3.37], ["f", 3.93], ["t", 4.09], ["[", 4.13], ["]", 4.13],
  ['"', 4.14], ["r", 4.16], ["\\", 4.17], ["1", 4.28], ["{", 4.41], ["}", 4.41], ["/", 4.42], ["-", 4.6], ["*", 4.66], ["^", 4.95],
  ["~", 5.75], ["−", 5.9], ["s", 5.98], ["<", 6.03], ["=", 6.03], [">", 6.03], ["z", 6.03], ["#", 6.07], ["7", 6.13], ["_", 6.16],
  ["L", 6.18], ["+", 6.23], ["y", 6.27], ["c", 6.28], ["Z", 6.35], ["a", 6.36], ["?", 6.39], ["k", 6.39], ["e", 6.4], ["v", 6.42],
  ["F", 6.43], ["n", 6.44], ["x", 6.45], ["T", 6.53], ["o", 6.53], ["–", 6.53], ["h", 6.55], ["J", 6.56], ["u", 6.57], ["E", 6.71],
  ["g", 6.72], ["b", 6.73], ["d", 6.73], ["p", 6.73], ["q", 6.73], ["6", 6.77], ["9", 6.8], ["Y", 6.95], ["3", 7.01], ["2", 7.06],
  ["4", 7.07], ["8", 7.08], ["P", 7.1], ["K", 7.2], ["5", 7.22], ["$", 7.22], ["X", 7.26], ["S", 7.35], ["&", 7.45], ["B", 7.56],
  ["R", 7.58], ["0", 7.62], ["V", 7.69], ["U", 7.73], ["H", 7.74], ["A", 7.8], ["D", 7.88], ["C", 7.96], ["G", 7.99], ["N", 8.06],
  ["Q", 8.33], ["O", 8.39], ["%", 9], ["w", 9.23], ["m", 9.65], ["M", 9.76], ["—", 10.01], ["@", 10.38], ["W", 10.8],
];

// Chips as Chromium drew them on a card's picture (8px a side included),
// for the tags lib/pipeline-slots writes.
const DRAWN_CHIP: [string, number][] = [
  ["Flood AE", 62.3], ["49% share", 70.8], ["Note", 41.5], ["Leasehold", 70.3], ["Leased fee", 73.8],
  ["Leasehold, 45 yrs left", 129.4], ["Leased fee, reverts in 45 yrs", 164.3], ["Assumable 3.45%", 109.9],
  ["Assumable loan", 99.8], ["LIHTC, 75% restricted", 128.2], ["Section 8, 34% of units", 136.6],
  ["Single tenant, 6 yrs left", 138.6], ["Single tenant, may leave in 4 yrs", 185.7], ["Mgmt encumbered, PIP $35k/key", 192.6],
  ["Unencumbered", 96], ["Independent", 82.4], ["Auction, 5% premium", 126.6], ["Receivership sale", 108.9],
  ["Bankruptcy sale", 101.8], ["Bank-owned (REO)", 114.2], ["Shadow-anchored", 112.4], ["56% rolls in 5 yrs", 105.2],
  ["Shadow-anchored, 56% rolls in 5 yrs", 206.6], ["Reno $250/mo, 20% on cost", 166], ["Tax abated, 4 yrs left, +$450k/yr", 188.8],
  ["Abatement ended", 109.5], ["Seller financing 5.00%", 135.5], ["Phase I: REC", 82.4], ["PML 24%", 64.6], ["Phase I: CREC", 90.3],
  ["Non-conforming", 102], ["Legal non-conforming", 131.8], ["Repairs $630k", 94.1], ["Phase I over a year old", 134.1],
  ["Pre-leased 87%, +5 pts y/y", 156], ["Drive-to campus", 103.5], ["Lot rent $430 vs $525 mkt, Private water & sewer", 277.8],
  ["In-place 21.1% over street, Economic 84%", 231.9], ["Lease-up, 72% occupied", 143.3],
];

describe("dealTags — one list, in one order, for the list row and the card", () => {
  it("reads every slot that carries a tag, the flood zone first, and nothing a slot leaves empty", () => {
    const tags = dealTags(
      slots({
        price: "$12,500,000",
        sale: "Auction, 5% premium",
        interest: "49% share",
        sandwich: "Spread $720k, 1.65× cover",
        forward: "Build-to-suit, 6.00% at delivery",
        goingConcern: "Operator lease, 2.61x coverage",
        debt: "Assumable 3.45%",
        sellerNote: "Seller financing 5.00%",
        affordable: "LIHTC, 75% restricted",
        regulation: "Rent-stabilized, 41 of 48",
        tenancy: "Single tenant, 6 yrs left",
        roster: "Shadow-anchored",
        valueAdd: "Reno $250/mo, 20% on cost",
        abatement: "Abatement ended",
        hotel: "Unencumbered",
        reports: "Phase I: REC",
        student: "Drive-to campus",
        mh: "Lot rent $430 vs $525 mkt, Private water & sewer",
        storage: "Lease-up, 72% occupied",
        mixedUse: "Commercial 29% of income",
        condo: "Bulk 42 of 120 (35%)",
        exchange: "1031: identify by Oct 30",
        broker: "CBRE",
        basis: "$274k/unit",
      }),
      { tag: "Flood AE" },
    );
    expect(tags.map((t) => t.key)).toEqual([
      "flood", "sale", "interest", "sandwich", "forward", "goingConcern", "debt", "sellerNote", "affordable", "regulation", "tenancy", "roster", "valueAdd", "abatement", "hotel", "reports", "student", "mh", "storage", "mixedUse", "condo", "exchange",
    ]);
    // The broker and the basis are no tag: one is a CSV column, the other
    // the price's own second line.
    expect(tags.map((t) => t.text)).not.toContain("CBRE");
    expect(tags.map((t) => t.text)).not.toContain("$274k/unit");
    // Each says what it means and where the deal page reads it.
    expect(tags[0]).toMatchObject({ tone: "kill", title: expect.stringMatching(/^Flood AE: FEMA's Special Flood Hazard Area/) });
    expect(tags.find((t) => t.key === "interest")?.title).toBe("49% share: the price does not buy the building outright — the deal page says what it buys");
    // The tone warns where the words do.
    const tone = (key: string) => tags.find((t) => t.key === key)?.tone;
    expect([tone("sale"), tone("regulation"), tone("roster"), tone("abatement"), tone("reports"), tone("student"), tone("mh"), tone("storage")]).toEqual(Array(8).fill("caution"));
    expect([tone("interest"), tone("forward"), tone("debt"), tone("sellerNote"), tone("affordable"), tone("tenancy"), tone("valueAdd"), tone("hotel")]).toEqual(Array(8).fill("brand"));
    expect(tags.find((t) => t.key === "forward")?.title).toBe(
      "Build-to-suit, 6.00% at delivery: the price is paid at delivery and the developer funds the works — the deal page reads the clock, the deposit and the yield at delivery",
    );
    expect(dealTags(slots({ student: "Pre-leased 87%, +5 pts y/y", mh: "Lot rent $430 vs $525 mkt", storage: "In-place 21.1% over street" })).map((t) => t.tone)).toEqual(["brand", "brand", "brand"]);
    expect(tone("mixedUse")).toBe("brand");
    // Condominium units are the brand's: the deal page reads the share.
    expect(tone("condo")).toBe("brand");
    // A sandwich position's spread is the brand's; subleases that bring in
    // less than the master rent warn.
    expect(tone("sandwich")).toBe("brand");
    expect(dealTags(slots({ sandwich: "Subleases under the master rent" }))[0]).toMatchObject({ key: "sandwich", tone: "caution" });
    expect(tags.find((t) => t.key === "sandwich")?.title).toBe(
      "Spread $720k, 1.65× cover: a master lease of the building, sublet — the master rent is owed whatever the subtenants pay; the deal page reads the spread, its cover and the master lease's term",
    );
    // A lease the operator's earnings cover is the brand's; a business sold
    // with its real estate, one not settled, or a coverage under 1.00x warns.
    expect(tone("goingConcern")).toBe("brand");
    for (const words of ["Going concern", "Operating business", "Operator lease, 0.85x coverage"])
      expect(dealTags(slots({ goingConcern: words }))[0], words).toMatchObject({ key: "goingConcern", tone: "caution" });
    expect(dealTags(slots({ goingConcern: "Operator lease" }))[0].tone).toBe("brand");
  });

  it("says the reader's 1031 exchange in the composition's own tone, read off the tag's words (lib/exchange-deal)", () => {
    const today = new Date(Date.UTC(2026, 9, 5, 12));
    const block = { relinquishedTransferOn: "2026-09-15", filer: "partnership" as const };
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "", basis: "na" as const });
    const deal = (interest?: Record<string, string>, metrics: ReturnType<typeof row>[] = []) =>
      ({ dealName: "X", assetClass: "multifamily", totalPages: 40, metrics, ...(interest ? { interest } : {}) }) as unknown as ExtractionResult;
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    // Every tag the reader writes: the clock, each date fact and each question.
    const reads = [
      exchangeForDeal(block, deal(), "2026-10-20", today),
      exchangeForDeal(block, deal(), "2026-11-02", today),
      exchangeForDeal(block, deal(), "2027-04-01", today),
      exchangeForDeal({ relinquishedTransferOn: "2026-08-01" }, deal(), null, today),
      exchangeForDeal({ relinquishedTransferOn: "2026-12-01" }, deal(), null, today),
      exchangeForDeal(block, deal({ kind: "note", ...blank }), null, today),
      exchangeForDeal(block, deal({ kind: "partial_interest", ...blank }), null, today),
      exchangeForDeal(block, deal({ kind: "preferred_equity", ...blank }), null, today),
      exchangeForDeal(block, deal({ kind: "leasehold", ...blank, summary: "Leasehold under a ground lease" }, [row("Ground lease expiration", "June 30, 2049")]), null, today),
    ];
    expect(reads.map((r) => r?.tag)).toEqual([
      "1031: identify by Oct 30",
      "1031: offers due after ID",
      "1031: offers due after close",
      "1031: ID period over",
      "1031: identify by Jan 15",
      "1031: note — ask counsel",
      "1031: share — ask counsel",
      "1031: position — ask counsel",
      "1031: lease under 30 yrs",
    ]);
    for (const r of reads) {
      const t = dealTags(slots({ exchange: r!.tag }))[0];
      expect(t, r!.tag).toMatchObject({ key: "exchange", tone: r!.tone });
      expect(t.title, r!.tag).toMatch(/^1031: [^:]+: your 1031 exchange's deadlines against this deal's offers-due date and what its price buys/);
    }
    expect(reads.map((r) => r!.tone)).toEqual(["brand", "caution", "caution", "caution", "brand", "muted", "muted", "muted", "muted"]);
  });

  it("says a regime that applies, or the memorandum's claim of one, in the warning tone, and one to check in the muted tone (lib/rent-regulation)", () => {
    const tone = (regulation: string) => dealTags(slots({ regulation }))[0];
    expect(tone("Rent-stabilized, 41 of 48")).toMatchObject({ key: "regulation", tone: "caution" });
    expect(tone("LA RSO, 3% cap").tone).toBe("caution");
    expect(tone("Rent-regulated (OM)").tone).toBe("caution");
    expect(tone("Rent rules: check")).toMatchObject({ tone: "muted", title: expect.stringMatching(/^Rent rules: check: the rent rules that reach the building/) });
  });

  it("a deal with nothing to flag carries no tags, and a flood lookup outside a hazard area adds none", () => {
    expect(dealTags(slots({ price: "$9,800,000", cap: "6.4%" }))).toEqual([]);
    expect(dealTags(slots({}), { tag: null })).toEqual([]);
    expect(dealTags(slots({}), null)).toEqual([]);
  });
});

describe("chipWidth — never under the width Chromium draws", () => {
  it("holds every printable character to its class's figure", () => {
    for (const [ch, drawn] of DRAWN_ADVANCE) expect(chipWidth(ch) - 16, JSON.stringify(ch)).toBeGreaterThanOrEqual(drawn - 1e-9);
  });

  it("holds the tags the site writes to the chips Chromium drew, a few percent over at most", () => {
    for (const [text, drawn] of DRAWN_CHIP) {
      expect(chipWidth(text), text).toBeGreaterThanOrEqual(drawn);
      expect(chipWidth(text) / drawn, text).toBeLessThan(1.06);
    }
  });
});

describe("placeTags — the card's picture carries a chip only where it fits whole", () => {
  const tag = (text: string, key = text) => ({ key, text, tone: "brand" as const, title: text });

  it("measures the room on the picture as 58% of its width, the call on its other side", () => {
    expect(PICTURE_TIERS.map(pictureRoom)).toEqual([128, 161, 201]);
  });

  it("sends a chip too wide for the picture to the line under the figures, at every width it is too wide for", () => {
    // 206.6px drawn: more than the 201px a phone's picture has from 390px —
    // the chip the research pass found cut, "Shadow-anchored, 56% rolls in 5 …".
    const roster = tag("Shadow-anchored, 56% rolls in 5 yrs");
    for (const w of PICTURE_TIERS) expect(placeTags([roster], w)).toEqual({ picture: [], line: [roster] });
    // 188.8px drawn: whole on a 348px picture, not on a 278px one.
    const abated = tag("Tax abated, 4 yrs left, +$450k/yr");
    expect(placeTagsByTier([abated])).toEqual([{ tag: abated, onPicture: [false, false, true] }]);
    // A short chip rides on every picture.
    expect(placeTagsByTier([tag("49% share")])[0].onPicture).toEqual([true, true, true]);
  });

  it("carries two chips at most, the first that fit in order, and keeps the rest in order on the line", () => {
    const tags = [tag("Mgmt encumbered, PIP $35k/key"), tag("Flood AE"), tag("49% share"), tag("Note")];
    expect(PICTURE_CHIPS).toBe(2);
    const narrow = placeTags(tags, PICTURE_TIERS[0]);
    expect(narrow.picture.map((t) => t.text)).toEqual(["Flood AE", "49% share"]);
    expect(narrow.line.map((t) => t.text)).toEqual(["Mgmt encumbered, PIP $35k/key", "Note"]);
    const wide = placeTags(tags, PICTURE_TIERS[2]);
    expect(wide.picture.map((t) => t.text)).toEqual(["Mgmt encumbered, PIP $35k/key", "Flood AE"]);
    expect(wide.line.map((t) => t.text)).toEqual(["49% share", "Note"]);
    // Every tag is on the picture or the line at every width, never both
    // and never neither.
    for (const w of PICTURE_TIERS) {
      const { picture, line } = placeTags(tags, w);
      expect([...picture, ...line].map((t) => t.key).sort()).toEqual(tags.map((t) => t.key).sort());
    }
  });

  it("asks of the card's picture the widths it places for: the card's container queries are the tiers'", () => {
    const source = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    const asked = new Set([...source.matchAll(/@min-\[(\d+)px\]\/card:/g)].map((m) => Number(m[1])));
    expect([...asked].sort((a, b) => a - b)).toEqual(PICTURE_TIERS.slice(1));
  });
});
