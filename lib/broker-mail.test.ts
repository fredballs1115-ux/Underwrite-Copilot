// Writing to the listing team from the deal (research pass 24, B15).
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MAILTO_MAX, documentProfileOf, documentRequestEmail, emailCopyText, mailtoHref, splitEmail } from "./broker-mail";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => "/deals/d1", useSearchParams: () => new URLSearchParams() }));

describe("mailtoHref", () => {
  it("addresses the brokers and fills the subject and body, encoded", () => {
    const href = mailtoHref(["jane@cbre.com", "sam@cbre.com"], "The Maddox — questions", "Hi,\n\n1. Why?")!;
    expect(href).toBe("mailto:jane@cbre.com,sam@cbre.com?subject=The%20Maddox%20%E2%80%94%20questions&body=Hi%2C%0A%0A1.%20Why%3F");
  });

  it("builds no link with no one to write to, or one past what a mail program opens", () => {
    expect(mailtoHref([], "s", "b")).toBeNull();
    expect(mailtoHref(["jane@cbre.com"], "s", "x".repeat(MAILTO_MAX))).toBeNull();
  });

  it("splits the challenger's email into its subject and body", () => {
    expect(splitEmail("Subject: The Maddox — questions\n\nHi,\n\nThanks,")).toEqual({ subject: "The Maddox — questions", body: "Hi,\n\nThanks," });
  });
});

describe("documentRequestEmail", () => {
  it("asks for what the deal does not hold, never a document already on it", () => {
    const all = documentRequestEmail("The Maddox", {});
    expect(all.subject).toBe("The Maddox — document request");
    expect(all.body).toContain("1. The current rent roll");
    expect(all.body).toContain("2. The trailing-12-month operating statement (T-12)");
    const some = documentRequestEmail("The Maddox", { rentRoll: true, t12: true });
    expect(some.asked).toEqual(["the confidentiality agreement, if one is required for the data room"]);
    expect(some.body).not.toContain("rent roll");
  });
});

// Audit C8, L6: a hotel was asked for a rent roll, and land for a rent roll
// and a T-12.
describe("the request asks for what the class keeps", () => {
  it("a hotel's P&L and STR reports, land's survey, title and entitlements, never a rent roll", () => {
    expect(documentProfileOf("hospitality_str")).toBe("lodging");
    expect(documentProfileOf("land_infill")).toBe("land");
    expect(documentProfileOf("office")).toBe("income");
    expect(documentProfileOf(null)).toBe("income");
    const hotel = documentRequestEmail("The Inn", {}, "lodging");
    expect(hotel.body).not.toContain("rent roll");
    expect(hotel.body).toContain("1. The trailing-12-month P&L, by department (T-12)");
    expect(hotel.body).toContain("2. The STR reports for the last 12 months");
    // A T-12 already on the deal is not asked for again.
    expect(documentRequestEmail("The Inn", { t12: true }, "lodging").body).not.toContain("P&L");
    // A short-term rental is filed with the hotels, but has no franchise,
    // no PIP and no STR report (audit C9, L8): its bookings and permits.
    expect(documentProfileOf("hospitality_str", "Short-term rental portfolio")).toBe("rental");
    expect(documentProfileOf("hospitality_str", "Vacation rentals (Airbnb)")).toBe("rental");
    expect(documentProfileOf("hospitality_str", "Boutique hotel")).toBe("lodging");
    expect(documentProfileOf("hospitality_str", "Hotel")).toBe("lodging");
    expect(documentProfileOf("hospitality_str", "Hospitality")).toBe("lodging");
    const rental = documentRequestEmail("The Cottages", {}, "rental");
    expect(rental.body).not.toMatch(/STR report|franchise|PIP|rent roll/);
    expect(rental.body).toContain("1. The trailing-12-month P&L (T-12)");
    expect(rental.body).toContain("The booking history for the last 12 months");
    expect(rental.body).toContain("The short-term rental permits and the local rules they are held under");
    expect(documentRequestEmail("The Cottages", { t12: true }, "rental").body).not.toContain("P&L");
    const land = documentRequestEmail("The Parcel", { rentRoll: false, t12: false }, "land");
    expect(land.body).not.toMatch(/rent roll|T-12/);
    expect(land.asked).toEqual([
      "the survey",
      "the title commitment",
      "the entitlement record: approvals, conditions and the zoning",
      "the confidentiality agreement, if one is required for the data room",
    ]);
  });
});

// Audit C8, L7: an email too long for a link was copied with its subject
// and body and no recipients.
describe("an email too long for a link", () => {
  it("is copied with its addresses, beside a short link that opens it addressed and titled", async () => {
    expect(emailCopyText(["jane@cbre.com", "sam@cbre.com"], "The Maddox — questions", "Hi,")).toBe(
      "To: jane@cbre.com, sam@cbre.com\nSubject: The Maddox — questions\n\nHi,",
    );
    expect(emailCopyText([], "S", "B")).toBe("Subject: S\n\nB");
    const { BrokerEmailActions } = await import("@/app/(app)/deals/[id]/broker-email-actions");
    const many = Array.from({ length: 30 }, (_, i) => ({
      assumption: `Assumption ${i}`,
      severity: "high" as const,
      challenge: "Too high",
      question: `What supports figure number ${i} on the page, and where is the evidence for it in the data room?`,
      page: "p. 12",
    }));
    const html = renderToStaticMarkup(
      React.createElement(BrokerEmailActions, { to: ["jane@cbre.com"], dealName: "The Maddox", challenges: many, totalPages: 40, have: { rentRoll: true, t12: true } }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(visibleText(html)).toContain("Email the questions (copy)");
    expect(html).toContain('href="mailto:jane@cbre.com?subject=The%20Maddox%20%E2%80%94%20questions%20from%20our%20initial%20screen');
    expect(html).toContain("Open an email to them");
  });
});

describe("BrokerEmailActions", () => {
  it("opens each email addressed to the brokers, and draws nothing with no address", async () => {
    const { BrokerEmailActions } = await import("@/app/(app)/deals/[id]/broker-email-actions");
    const html = renderToStaticMarkup(
      React.createElement(BrokerEmailActions, {
        to: ["jane@cbre.com"],
        dealName: "The Maddox",
        challenges: [{ assumption: "Rent growth", severity: "high", challenge: "Too high", question: "What supports 4% rent growth?", page: "p. 12" }],
        totalPages: 40,
        have: { rentRoll: false, t12: true },
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(html).toContain('href="mailto:jane@cbre.com?subject=The%20Maddox%20%E2%80%94%20questions%20from%20our%20initial%20screen');
    expect(visibleText(html)).toContain("Email the questions");
    expect(visibleText(html)).toContain("Request documents");
    expect(
      renderToStaticMarkup(
        React.createElement(BrokerEmailActions, { to: [], dealName: "X", challenges: [], totalPages: null, have: { rentRoll: false, t12: false } }),
      ),
    ).toBe("");
  });
});
