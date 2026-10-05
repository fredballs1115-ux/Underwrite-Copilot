import { describe, expect, it } from "vitest";
import type { ExtractedHotel, ExtractionResult } from "@/lib/anthropic/types";
import {
  hotelContextLine,
  hotelModelLine,
  hotelNote,
  hotelShortLine,
  hotelTag,
  hotelTermRows,
  readHotelDeal,
} from "./hotel-deal";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";

// Every read is on one day, so every "years from today" is fixed.
const TODAY = new Date(Date.UTC(2026, 8, 30));

const hotel = (over: Partial<ExtractedHotel> = {}): ExtractedHotel => ({
  brand: "Courtyard by Marriott",
  franchise: "Marriott franchise agreement through June 30, 2034; transfer subject to Marriott's approval and a PIP",
  management: "Third-party managed by a regional operator under an agreement that survives the sale",
  encumbrance: "management",
  pip: "",
  page: "p. 6",
  ...over,
});

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 6"): Row => ({ label, value, flagged: false, page, basis: "na" });

const ex = (metrics: Row[], over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  dealName: "Courtyard Nashville Downtown",
  assetClass: "hospitality_str",
  totalPages: 40,
  hotel: hotel(),
  metrics: [row("Asking price", "$26,000,000", "p. 2"), row("Keys", "120", "p. 2"), ...metrics],
  ...over,
});

/** The Courtyard fixture: a flagged, management-encumbered hotel with a PIP. */
const COURTYARD = ex([
  row("PIP cost", "$4,200,000"),
  row("Franchise expiration", "June 30, 2034"),
  row("Management agreement expiration", "2031"),
  row("ADR", "$189.50"),
  row("Occupancy", "74.0%"),
  row("RevPAR", "$140.23"),
  row("RevPAR index", "92.4"),
  row("FF&E reserve", "4% of revenue"),
]);

describe("readHotelDeal — what a hotel is sold with", () => {
  it("reads the flag, the encumbrance, the PIP per key, the two clocks and the room revenue", () => {
    const r = readHotelDeal(COURTYARD, TODAY)!;
    expect(r.brand).toBe("Courtyard by Marriott");
    expect(r.encumbrance).toBe("management");
    expect(r.keys).toBe(120);
    expect(r.keyNoun).toBe("keys");
    expect(r.pipTotal).toBe(4_200_000);
    expect(r.pipPerKey).toBe(35_000);
    expect(r.pipStated).toBe("total");
    // The franchise's stated date; the management agreement's year alone is
    // its LAST day — the buyer is never counted free of the manager early.
    expect(r.franchiseEnds?.ends).toBe("2034-06-30");
    expect(r.managementEnds?.ends).toBe("2031-12-31");
    expect(r.revparComputed).toBeCloseTo(140.23, 2);
    expect(r.ties).toBe(true);
    expect(r.revparIndex).toBeCloseTo(92.4, 5);
    expect(r.ffeReservePct).toBe(4);
    expect(r.page).toBe("p. 6");
  });

  it("says the sale, the PIP, the clocks and the room revenue", () => {
    const r = readHotelDeal(COURTYARD, TODAY)!;
    expect(r.headline).toBe(
      "The hotel is flagged Courtyard by Marriott, as stated. " +
        "It is sold encumbered by its management agreement: the buyer keeps the manager, its fee and its term rather than choosing its own. " +
        "The brand's property improvement plan is $4.2M, $35k a key across its 120 keys — capital the buyer funds on top of the price. " +
        "The franchise ends Jun 2034, 7.8 years from today. " +
        "The management agreement ends in 2031, 5.3 years from today. " +
        "Room revenue per available room is $140.23: $189.50 a night at 74.0% occupancy. " +
        "Its RevPAR index is 92: it earns 8% less per available room than its competitive set, so the market is not the whole story.",
    );
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("a per-key PIP is multiplied out over the key count, in the count's own noun", () => {
    const rooms = ex([row("PIP cost per key", "$12,500")], {
      metrics: [row("Asking price", "$26,000,000"), row("Rooms", "200"), row("PIP cost per key", "$12,500")],
    });
    const r = readHotelDeal(rooms, TODAY)!;
    expect(r.keyNoun).toBe("rooms");
    expect(r.pipTotal).toBe(2_500_000);
    expect(r.pipStated).toBe("per_key");
    expect(r.headline).toContain("The brand's property improvement plan is $12.5k a room as stated, $2.5M across its 200 rooms");
    expect(hotelTag(rooms, TODAY)).toBe("Mgmt encumbered, PIP $12.5k/room");
  });

  it("reads a PIP total and a PIP a key with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no PIP.
    expect(readHotelDeal(ex([row("PIP cost", "$4,200,000 (brand-mandated)")]), TODAY)?.pipTotal).toBe(4_200_000);
    expect(readHotelDeal(ex([row("PIP cost per key", "$35,000 (brand-mandated)")]), TODAY)?.pipPerKey).toBe(35_000);
    expect(readHotelDeal(ex([row("PIP cost", "$4.2M-$5M")]), TODAY)?.pipTotal).toBeNull();
  });

  it("a RevPAR that does not tie to its ADR and occupancy is said, never chosen between", () => {
    const off = ex([row("ADR", "$189.50"), row("Occupancy", "74%"), row("RevPAR", "$155.00")]);
    const r = readHotelDeal(off, TODAY)!;
    expect(r.ties).toBe(false);
    expect(r.headline).toContain(
      "The memorandum's RevPAR of $155.00 does not tie to its ADR and occupancy — $189.50 × 74.0% is $140.23 — so one of the three is wrong; ask which.",
    );
    expect(hotelNote(r)).toContain("(d) THE ROOM REVENUE — the memorandum's RevPAR does not tie");
  });

  it("a pro forma ADR or RevPAR is the sponsor's and never read as today's", () => {
    const r = readHotelDeal(ex([row("ADR (pro forma)", "$210.00"), row("Stabilized occupancy", "80%"), row("Pro forma RevPAR", "$168.00")]), TODAY)!;
    expect(r.adr).toBeNull();
    expect(r.revpar).toBeNull();
    expect(r.revparComputed).toBeNull();
  });

  it("a flagged hotel with no PIP stated is told to ask; an independent one is not", () => {
    const none = readHotelDeal(ex([]), TODAY)!;
    expect(none.headline).toContain("The memorandum states no PIP — a brand may require one on a change of ownership");
    expect(hotelShortLine(none)).toBe("Hotel: flagged Courtyard by Marriott, sold encumbered by management; no PIP stated");
    const independent = readHotelDeal(ex([], { hotel: hotel({ brand: "Independent", encumbrance: "unencumbered" }) }), TODAY)!;
    expect(independent.independent).toBe(true);
    expect(independent.headline).toContain("The hotel is independent, as stated");
    expect(independent.headline).not.toContain("states no PIP");
    expect(hotelTag(ex([], { hotel: hotel({ brand: "Independent", encumbrance: "unknown" }) }), TODAY)).toBe("Independent");
  });

  it("a year alone: the franchise's first day, never a flag counted for months it may not fly", () => {
    const r = readHotelDeal(ex([row("Franchise expiration", "2029")]), TODAY)!;
    expect(r.franchiseEnds?.ends).toBe("2029-01-01");
    expect(r.headline).toContain("The franchise ends in 2029, 2.3 years from today.");
  });

  it("nothing on anything but a hotel, or an extraction from before", () => {
    const blank: ExtractedHotel = { brand: "", franchise: "", management: "", encumbrance: "unknown", pip: "", page: "" };
    expect(readHotelDeal(ex([], { hotel: blank }), TODAY)).toBeNull();
    expect(readHotelDeal(ex([], { hotel: undefined }), TODAY)).toBeNull();
    expect(hotelTag(ex([], { hotel: blank }), TODAY)).toBeNull();
    expect(hotelTag(null, TODAY)).toBeNull();
    // A PIP row alone still reads as a hotel's.
    expect(readHotelDeal(ex([row("PIP cost", "$3,000,000")], { hotel: blank }), TODAY)?.pipTotal).toBe(3_000_000);
  });

  it("a page is cited only inside the memorandum", () => {
    expect(readHotelDeal(ex([], { hotel: hotel({ page: "p. 55" }) }), TODAY)?.page).toBe("");
  });
});

describe("the hotel against the model, and on every summary", () => {
  it("the PIP against the model's capital, a flag ending inside the hold, a manager outlasting the sale", () => {
    const r = readHotelDeal(COURTYARD, TODAY)!;
    expect(hotelModelLine(r, { holdMonths: 60, capitalYr1: 4_200_000, capitalIsPip: true })).toBe(
      "The model carries the $4.2M PIP as its first year's capital, so its returns pay for it. " +
        "The management agreement runs past the model's sale, to 2031: the next buyer inherits the manager too.",
    );
    expect(hotelModelLine(r, { holdMonths: 60, capitalYr1: 6_000_000, capitalIsPip: false })).toContain(
      "The model carries $6.0M of capital, the memorandum's own budget, read as including the $4.2M PIP rather than added to it.",
    );
    expect(hotelModelLine(r, { holdMonths: 60, capitalYr1: 0, capitalIsPip: false })).toContain(
      "The model carries $0 of capital against the $4.2M PIP — enter the PIP as the capital improvements",
    );
    // A management agreement ending inside the hold hands the next buyer nothing.
    expect(hotelModelLine(r, { holdMonths: 84, capitalYr1: 4_200_000, capitalIsPip: true })).not.toContain("inherits the manager");
    const early = readHotelDeal(ex([row("Franchise expiration", "2029")]), TODAY)!;
    expect(hotelModelLine(early, { holdMonths: 60, capitalYr1: 0, capitalIsPip: false })).toContain(
      "The franchise ends in 2029, inside the model's 5-year hold: a relicensing then brings its own PIP, or the hotel goes independent.",
    );
  });

  it("the tag, the short line, the context and the traps", () => {
    expect(hotelTag(COURTYARD, TODAY)).toBe("Mgmt encumbered, PIP $35k/key");
    const r = readHotelDeal(COURTYARD, TODAY)!;
    expect(hotelShortLine(r)).toBe(
      "Hotel: flagged Courtyard by Marriott, sold encumbered by management; PIP $4.2M ($35k a key); the franchise ends Jun 2034",
    );
    const context = hotelContextLine(r);
    expect(context.startsWith("Hotel: The hotel is flagged Courtyard by Marriott, as stated.")).toBe(true);
    expect(context).toContain("FF&E reserve as stated: 4% of revenue.");
    expect(context.endsWith("(p. 6)")).toBe(true);
    const note = hotelNote(r);
    expect(note).toContain("HOTEL CONTRACT TRAPS, checked by name");
    expect(note).toContain("(a) THE PIP — $4.2M, $35k a key");
    expect(note).toContain("(b) THE MANAGEMENT ENCUMBRANCE");
    expect(note).toContain("(c) THE FLAG'S TERM — the franchise ends Jun 2034, 7.8 years from today");
    expect(note).toContain("(d) THE INDEX — a RevPAR index of 92 against 100");
    expect(gluedWords(note)).toEqual([]);
  });

  it("says each trap as the facts above it say, never 'none stated' over what the memorandum gives (research pass 18)", () => {
    // A brand encumbrance had fallen through to "the memorandum does not say
    // whether the sale is encumbered", under a line saying it was.
    const branded = readHotelDeal(ex([row("Franchise expiration", "June 30, 2034")], { hotel: hotel({ encumbrance: "brand" }) }), TODAY)!;
    const brandNote = hotelNote(branded);
    expect(brandNote).toContain("(b) THE BRAND ENCUMBRANCE — the sale carries the franchise");
    expect(brandNote).not.toContain("does not say whether the sale is encumbered");
    // A PIP stated in words, with no cost, is the memorandum's words.
    const worded = readHotelDeal(ex([], { hotel: hotel({ pip: "Marriott will require a change-of-ownership PIP" }) }), TODAY)!;
    expect(hotelNote(worded)).toContain('(a) THE PIP — stated in words, with no cost ("Marriott will require a change-of-ownership PIP")');
    // A franchise whose stated end has passed may run on: asked, never "none stated" or "cannot be right".
    const lapsed = readHotelDeal(ex([row("Franchise expiration", "March 31, 2025")]), TODAY)!;
    expect(hotelNote(lapsed)).toContain("(c) THE FLAG'S TERM — the franchise's stated end, Mar 2025, has passed: ask whether the hotel runs on an extension or month to month");
    expect(lapsed.headline).toContain("it may run on an extension or month to month");
    expect(lapsed.headline).not.toContain("cannot be right");
    // A franchise stated in words with no end read as a date says the words.
    const noEnd = readHotelDeal(ex([]), TODAY)!;
    expect(hotelNote(noEnd)).toContain('(c) THE FLAG\'S TERM — the franchise as stated ("Marriott franchise agreement through June 30, 2034');
    // An independent hotel has no flag's term and no brand's PIP to ask about.
    const indie = readHotelDeal(ex([], { hotel: hotel({ brand: "Independent", franchise: "", encumbrance: "unencumbered" }) }), TODAY)!;
    expect(hotelNote(indie)).toContain("(c) NO FLAG — the hotel is independent");
    expect(hotelNote(indie)).toContain("(a) NO BRAND'S PIP");
  });

  it("the key terms lead with the PIP, the franchise's end and RevPAR", () => {
    expect(hotelTermRows(COURTYARD.metrics).map((m) => m.label)).toEqual(["PIP cost", "Franchise expiration", "RevPAR"]);
  });

  it("every label the prompt asks for is one the reader reads", () => {
    const prompt = extractionInstruction("hospitality_str" as never);
    for (const label of ["PIP cost", "PIP cost per key", "Franchise expiration", "Management agreement expiration", "ADR", "RevPAR", "RevPAR index", "FF&E reserve"]) {
      expect(prompt).toContain(`"${label}"`);
    }
    const r = readHotelDeal(COURTYARD, TODAY)!;
    expect([r.pipTotal, r.franchiseEnds, r.managementEnds, r.adr, r.revpar, r.revparIndex, r.ffeReservePct].every((v) => v != null)).toBe(true);
    expect(readHotelDeal(ex([row("PIP cost per key", "$35,000")]), TODAY)?.pipPerKey).toBe(35_000);
  });
});
