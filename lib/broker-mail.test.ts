// Writing to the listing team from the deal (research pass 24, B15).
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MAILTO_MAX, documentRequestEmail, mailtoHref, splitEmail } from "./broker-mail";
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
