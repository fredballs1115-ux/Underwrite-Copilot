import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  brokerageOf,
  initialsOf,
  listingTeamOf,
  offersDueEventText,
  offersDueOf,
  offersDueTimeOf,
  offersDueUpgrade,
  telOf,
} from "./offering";
import { allDayEventIcs, foldLine, icsText } from "./ics";

const row = (label: string, value: string, page = "p. 2") => ({ label, value, page, flagged: false });
const deal = (over: Partial<ExtractionResult> & { metrics?: ReturnType<typeof row>[] } = {}): ExtractionResult =>
  ({ dealName: "The Maddox", assetClass: "multifamily", totalPages: 60, metrics: [], ...over }) as unknown as ExtractionResult;

describe("when offers are due (#467)", () => {
  it("reads a whole date as the deadline and anything less as words", () => {
    expect(offersDueOf(deal({ metrics: [row("Offers due", "Thursday, October 15, 2026 at 5:00 PM ET")] }))).toEqual({
      iso: "2026-10-15",
      stated: "Thursday, October 15, 2026 at 5:00 PM ET",
      asReceived: false,
      page: "p. 2",
    });
    expect(offersDueOf(deal({ metrics: [row("Call for offers", "10/15/2026")] }))?.iso).toBe("2026-10-15");
    // No year, or no day: shown as written, never stored.
    expect(offersDueOf(deal({ metrics: [row("Offers due", "October 15th")] }))).toMatchObject({ iso: null, stated: "October 15th" });
    expect(offersDueOf(deal({ metrics: [row("Offers due", "October 2026")] }))?.iso).toBeNull();
    // Reviewed as received: no deadline to count down to.
    expect(offersDueOf(deal({ metrics: [row("Offers due", "Offers reviewed as received")] }))).toMatchObject({ iso: null, asReceived: true });
    // A row that states nothing is no row; a page the memorandum lacks is dropped.
    expect(offersDueOf(deal({ metrics: [row("Offers due", "TBD")] }))).toBeNull();
    expect(offersDueOf(deal({ metrics: [row("Offers due", "10/15/2026", "p. 212")] }))?.page).toBe("");
    expect(offersDueOf(deal())).toBeNull();
    expect(offersDueOf(null)).toBeNull();
  });

  it("fills a deal's deadline only where nobody has set one", () => {
    const ex = deal({ metrics: [row("Offers due", "October 15, 2026")] });
    expect(offersDueUpgrade(null, ex)).toBe("2026-10-15");
    expect(offersDueUpgrade("", ex)).toBe("2026-10-15");
    expect(offersDueUpgrade("2026-10-20", ex)).toBeNull();
    expect(offersDueUpgrade(null, deal({ metrics: [row("Offers due", "October 15th")] }))).toBeNull();
  });
});

describe("the listing team (#467)", () => {
  const team = [
    { name: "Jane Q. Doe", title: "Executive Vice President", firm: "CBRE", phone: "(215) 555-0100", email: "jane.doe@cbre.com", page: "p. 2" },
    { name: "John Roe", title: "Senior Associate", firm: "CBRE", phone: "+1 215.555.0101 x204", email: "not an email", page: "p. 2" },
    { name: "jane q. doe", title: "", firm: "", phone: "", email: "", page: "" },
    { name: "", title: "Analyst", firm: "JLL", phone: "", email: "", page: "" },
    { name: "Ana Lima", title: "Managing Director", firm: "JLL", phone: "555-0102", email: "mailto:ana.lima@jll.com", page: "p. 99" },
  ];

  it("reads each broker as printed, linking only a whole phone number and a real email", () => {
    const read = listingTeamOf(deal({ listingTeam: team } as never));
    expect(read.map((b) => b.name)).toEqual(["Jane Q. Doe", "John Roe", "Ana Lima"]);
    expect(read[0]).toMatchObject({ tel: "tel:+12155550100", email: "jane.doe@cbre.com", page: "p. 2" });
    // The extension stays in the words and off the link.
    expect(read[1]).toMatchObject({ phone: "+1 215.555.0101 x204", tel: "tel:+12155550101", email: null });
    // Seven digits is no number to dial from anywhere; a page past the end is dropped.
    expect(read[2]).toMatchObject({ tel: null, email: "ana.lima@jll.com", page: "" });
    expect(brokerageOf(deal({ listingTeam: team } as never))).toBe("CBRE · JLL");
    expect(listingTeamOf(deal())).toEqual([]);
    expect(brokerageOf(deal())).toBeNull();
  });

  it("dials North American numbers only and draws initials", () => {
    expect(telOf("215-555-0100")).toBe("tel:+12155550100");
    expect(telOf("1 (215) 555-0100 ext. 12")).toBe("tel:+12155550100");
    expect(telOf("+44 20 7946 0958")).toBeNull();
    expect(initialsOf("Jane Q. Doe")).toBe("JD");
    expect(initialsOf("Madonna")).toBe("M");
    expect(initialsOf("J. R. Smith, CCIM")).toBe("JS");
  });
});

describe("the call for offers in a calendar (#467)", () => {
  it("writes one all-day event with a reminder, CRLF throughout", () => {
    const ics = allDayEventIcs({
      uid: "offers-due-d1@underwrite-copilot",
      date: "2026-10-15",
      summary: "Offers due — The Maddox, Brewerytown",
      description: "https://underwrite.example/deals/d1",
      url: "https://underwrite.example/deals/d1",
      remindDaysBefore: 2,
      now: new Date("2026-09-30T14:00:00Z"),
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261016\r\n");
    expect(ics).toContain("DTSTAMP:20260930T140000Z\r\n");
    expect(ics).toContain("SUMMARY:Offers due — The Maddox\\, Brewerytown\r\n");
    expect(ics).toContain("TRIGGER:-P2D\r\n");
    // Month's end rolls over.
    expect(allDayEventIcs({ uid: "u", date: "2026-12-31", summary: "x", now: new Date(0) })).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("escapes every line break, a lone carriage return included, and drops the controls TEXT forbids", () => {
    expect(icsText("a\rb")).toBe("a\\nb");
    expect(icsText("a\r\nb\nc\rd")).toBe("a\\nb\\nc\\nd");
    expect(icsText("a\u0000b\u0007c\u001bd\u007fe\tf")).toBe("abcde\tf");
    // A deal's name is whatever its owner typed: a CR in it must not start a
    // content line of its own.
    const ics = allDayEventIcs({
      uid: "u",
      date: "2026-10-15",
      summary: "Offers due — The Maddox\rATTENDEE:mailto:someone@example.test",
      now: new Date(0),
    });
    const lines = ics.split("\r\n");
    expect(lines.every((l) => !/[\r\n]/.test(l))).toBe(true);
    expect(lines.some((l) => l.startsWith("ATTENDEE"))).toBe(false);
    expect(ics).toContain("SUMMARY:Offers due — The Maddox\\nATTENDEE:mailto:someone@example.test\r\n");
  });

  // Research pass 35, F14: the file was an all-day event whose description
  // was the deal's link alone, so a deadline at 5:00 PM ET — which the deal
  // page prints — was dropped from the file a bidder keeps.
  it("reads the time of day the memorandum's words give, with its zone, and none from a window", () => {
    expect(offersDueTimeOf("Thursday, October 22, 2026 at 5:00 PM ET")).toBe("5:00 PM ET");
    expect(offersDueTimeOf("October 22, 2026 by 3 p.m. Eastern Time")).toBe("3 p.m. Eastern Time");
    expect(offersDueTimeOf("10/22/2026, 12:00 noon (EST)")).toBe("12:00 noon (EST)");
    expect(offersDueTimeOf("October 22, 2026 at 17:00 local time")).toBe("17:00 local time");
    expect(offersDueTimeOf("October 22, 2026 at 5pm")).toBe("5pm");
    // No time, or two different ones: none.
    expect(offersDueTimeOf("October 22, 2026")).toBeNull();
    expect(offersDueTimeOf("October 22, 2026, between 9:00 AM and 5:00 PM ET")).toBeNull();
    // The same time said twice is one.
    expect(offersDueTimeOf("5:00 PM ET, October 22, 2026 (5:00 PM ET)")).toBe("5:00 PM ET");
    // A word that only starts like a time is none.
    expect(offersDueTimeOf("October 22, 2026; 5 amenity tours")).toBeNull();
  });

  it("puts the memorandum's own words, time and page in the event where its day is the deal's", () => {
    const link = "https://underwrite.example/deals/d1";
    const ex = deal({ metrics: [row("Offers due", "Thursday, October 22, 2026 at 5:00 PM ET")] });
    expect(offersDueEventText("2026-10-22", "The Maddox", link, ex)).toEqual({
      summary: "Offers due 5:00 PM ET — The Maddox",
      description: `Offers due as the memorandum states it: Thursday, October 22, 2026 at 5:00 PM ET (OM p. 2)\n${link}`,
    });
    // A page the memorandum does not have is left off; no time, no time in
    // the summary.
    const noPage = deal({ metrics: [row("Offers due", "October 22, 2026", "p. 212")] });
    expect(offersDueEventText("2026-10-22", "The Maddox", link, noPage)).toEqual({
      summary: "Offers due — The Maddox",
      description: `Offers due as the memorandum states it: October 22, 2026\n${link}`,
    });
    // A day the reader set that is not the memorandum's: the link alone.
    expect(offersDueEventText("2026-10-29", "The Maddox", link, ex)).toEqual({ summary: "Offers due — The Maddox", description: link });
    // No memorandum date at all: the link alone.
    expect(offersDueEventText("2026-10-22", "The Maddox", link, null)).toEqual({ summary: "Offers due — The Maddox", description: link });
    expect(
      offersDueEventText("2026-10-22", "The Maddox", link, deal({ metrics: [row("Offers due", "Offers reviewed as received")] })),
    ).toEqual({ summary: "Offers due — The Maddox", description: link });
  });

  it("escapes text and folds a long line at 75 octets without splitting a character", () => {
    expect(icsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const long = `SUMMARY:${"Offers due — ".repeat(10)}`;
    const folded = foldLine(long);
    const enc = new TextEncoder();
    for (const [i, part] of folded.split("\r\n").entries()) {
      expect(enc.encode(part).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(" ")).toBe(true);
    }
    expect(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(long);
  });
});

describe("the prompt asks for what the reader reads (#467)", () => {
  it("names the deadline's row and the team's fields", () => {
    const prompt = extractionInstruction("multifamily" as never);
    expect(prompt).toContain('"Offers due"');
    for (const f of ["listingTeam", "name", "title", "firm", "phone", "email"]) expect(prompt).toContain(`\`${f}\``);
  });
});
