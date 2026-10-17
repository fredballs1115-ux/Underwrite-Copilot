// The brokerage scorecard's footnote says how the rate is counted, and the
// count is lib/brokerage's (audit C9, L1: the note had read as "a deal that
// misses outright fits", and spoke of passed deals alone where near-misses
// on part of the box are set apart too).
import { describe, expect, it } from "vitest";
import { brokerScorecard, type BrokerDeal } from "@/lib/brokerage";
import { scorecardNote } from "@/app/(app)/analytics/scorecard-note";

const firm = [{ key: "cbre", name: "CBRE" }];
const deal = (fit: BrokerDeal["fit"], partial: boolean): BrokerDeal => ({ firms: firm, fit, partial, verdict: null });

describe("scorecardNote", () => {
  it("says what is judged and what is counted apart", () => {
    const note = scorecardNote(0);
    expect(note).toContain(
      "A deal is judged only where the screen could check every criterion of your buy box, or where it misses one outright; a fit or near-miss with criteria left unchecked is counted apart.",
    );
    expect(note).not.toContain("fits only where");
    expect(scorecardNote(1)).toMatch(/ 1 deal names no firm\.$/);
    expect(scorecardNote(3)).toMatch(/ 3 deals name no firm\.$/);
  });

  it("is true of the count: a partial fit or near-miss is apart, a partial miss outright is judged", () => {
    const { rows } = brokerScorecard([
      deal("fits", false),
      deal("near", false),
      deal("outside", false),
      deal("fits", true),
      deal("near", true),
      deal("outside", true),
    ]);
    expect(rows[0].judged).toBe(4);
    expect(rows[0].fits).toBe(1);
    expect(rows[0].partial).toBe(2);
  });
});
