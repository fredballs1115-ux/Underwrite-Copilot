import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicRecordSubject, SAMPLE_PUBLIC_RECORD_LINE } from "./public-record-subject";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { SAMPLE_DEAL } from "./sample-deal";

// The card's database client is never reached on the sample; a call would
// fail the test rather than read a parcel.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => {
    throw new Error("the sample must look no parcel up");
  },
}));

const P = { lat: 39.98, lng: -75.18 };

describe("the public-record card's point (lib/public-record-subject)", () => {
  it("takes the deal's own point where it is the building's", () => {
    expect(publicRecordSubject({ isSample: false, buildingPoint: P })).toEqual(P);
  });

  it("takes the comps pull's point only where it was placed at the building", () => {
    const base = { isSample: false, buildingPoint: null };
    expect(publicRecordSubject({ ...base, compsSubject: { ...P, precision: "street" } })).toEqual(P);
    expect(publicRecordSubject({ ...base, compsSubject: { ...P, precision: "block" } })).toBeNull();
    expect(publicRecordSubject({ ...base, compsSubject: { ...P, precision: "area" } })).toBeNull();
    // A result stored before its precision was recorded is not the building's.
    expect(publicRecordSubject({ ...base, compsSubject: { ...P } })).toBeNull();
  });

  it("never takes a neighbourhood centre from the site flags", () => {
    const base = { isSample: false, buildingPoint: null, siteFlagsSubject: P };
    expect(publicRecordSubject(base)).toBeNull();
    expect(publicRecordSubject({ ...base, siteFlagsPointIsBuilding: false })).toBeNull();
    expect(publicRecordSubject({ ...base, siteFlagsPointIsBuilding: true })).toEqual(P);
  });

  it("looks nothing up on the sample deal, whatever points it has", () => {
    expect(
      publicRecordSubject({
        isSample: true,
        buildingPoint: P,
        compsSubject: { ...P, precision: "street" },
        siteFlagsSubject: P,
        siteFlagsPointIsBuilding: true,
      }),
    ).toBeNull();
  });

  it("says why in the card's place on the sample, and reads no parcel", async () => {
    const { PublicRecordCard } = await import("@/app/(app)/deals/[id]/public-record-card");
    const el = await PublicRecordCard({
      address: SAMPLE_DEAL.address as never,
      subject: P,
      sample: true,
    });
    const html = renderToStaticMarkup(el as React.ReactElement);
    expect(visibleText(html)).toContain(SAMPLE_PUBLIC_RECORD_LINE);
    expect(html).not.toMatch(/Owner|Parcel</);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });
});
