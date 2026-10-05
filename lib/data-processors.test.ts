import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_DIRECT_NOTE, DATA_PROCESSORS, supportInboxProvider } from "./data-processors";
import { censusUrl, photonUrl } from "./geocode";
import { BASEMAP_IMG_HOSTS, BASEMAPS, NFHL_ROOT, usgsAerialUrl } from "./basemaps";
import { COVERAGE_LIVE } from "./public-comps/core";
import { buyBoxLines, type BuyBox } from "./criteria";
import { SUPPORT_EMAIL, supportMailto } from "./support-link";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import SecurityPage from "@/app/security/page";
import PrivacyPage from "@/app/privacy/page";

// The security page and the privacy policy list every outside service that
// receives something of a user's. They listed five, and said Photon received
// "only the address text you type" — while the code sent deal addresses to
// the Census geocoder and Photon, map points to FEMA, USGS and Google, the
// OM's comp addresses to Photon from the browser, and emails through Resend.
// This holds the one list to the hosts the code actually reaches.

const root = join(__dirname, "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");
const hostOf = (url: string) => new URL(url.replace("{z}", "1").replace("{x}", "1").replace("{y}", "1")).hostname;

/** Whether a processor's listed hosts cover a host (a listed "a.b" covers "x.a.b"). */
const covered = (host: string) =>
  DATA_PROCESSORS.some((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));

describe("the outside services a user's data reaches, one list held to the code", () => {
  it("covers every host the server sends a deal's address, point or a user's email to", () => {
    const hosts = [
      hostOf(photonUrl("1 Main St")), // lib/geocode's fallback
      hostOf(censusUrl("1 Main St")), // lib/geocode's first choice
      hostOf(NFHL_ROOT), // FEMA: the flood zone and the flood map
      hostOf(usgsAerialUrl({ center: { lat: 39.95, lng: -75.16 }, zoom: 17, width: 640, height: 400 })),
    ];
    // Hosts written inline where the request is made.
    for (const [file, re] of [
      ["lib/public-comps/run.ts", /https:\/\/(photon\.komoot\.io)/],
      ["lib/site-flags/run.ts", /https:\/\/(geocoding\.geo\.census\.gov)/],
      ["lib/imagery.ts", /https:\/\/(maps\.googleapis\.com)/],
      ["lib/email-send.ts", /https:\/\/(api\.resend\.com)/],
      ["app/(app)/address-autocomplete.tsx", /https:\/\/(photon\.komoot\.io)/],
      ["app/(app)/deals/[id]/comps-map.tsx", /https:\/\/(photon\.komoot\.io)/],
    ] as const) {
      const m = src(file).match(re);
      expect(m, file).not.toBeNull();
      hosts.push(m![1]);
    }
    for (const h of hosts) expect(covered(h), h).toBe(true);
  });

  it("covers every host the browser is allowed to fetch from or load map tiles from", () => {
    const csp = src("next.config.ts");
    const connect = csp.match(/"connect-src ([^"]+)"/)![1].split(/\s+/).filter((t) => t.startsWith("https://"));
    expect(connect.length).toBeGreaterThan(0);
    for (const t of connect) expect(covered(t.replace("https://", "").replace(/^\*\./, "")), t).toBe(true);
    for (const t of BASEMAP_IMG_HOSTS) expect(covered(t.replace("https://", "").replace(/^\*\./, "")), t).toBe(true);
    for (const b of Object.values(BASEMAPS)) expect(covered(hostOf(b.url)), b.id).toBe(true);
  });

  it("names every public-records service a comp pull queries, by the host it queries", () => {
    const probe = { lat: 39.95, lng: -75.16, radiusKm: 1, monthsBack: 12, assetClass: "multifamily", nowIso: "2026-01-01T00:00:00Z" };
    const queried = [...new Set(COVERAGE_LIVE.map((p) => hostOf(p.buildUrl(probe))))].sort();
    const listed = DATA_PROCESSORS.find((p) => p.name.startsWith("Public-records"))!;
    expect([...listed.hosts].sort()).toEqual(queried);
    for (const p of COVERAGE_LIVE) expect(listed.name).toContain(p.regionLabel);
  });

  it("the two pages print the one list, and neither says Photon gets only what you type", () => {
    for (const [name, Page] of [
      ["security", SecurityPage],
      ["privacy", PrivacyPage],
    ] as const) {
      const html = renderToStaticMarkup(React.createElement(Page));
      const text = visibleText(html);
      for (const p of DATA_PROCESSORS) {
        expect(text, `${name}: ${p.name}`).toContain(p.name);
        expect(text, `${name}: ${p.name}`).toContain(p.receives);
      }
      expect(text).toContain(BROWSER_DIRECT_NOTE);
      expect(text).not.toMatch(/receives only the address text you type/i);
      // Each page dated by its own last change: both print the list, which
      // named the buy box, the typed facts and the support inbox on
      // October 5 (research pass 39).
      expect(text).toContain("Last updated: October 5, 2026");
      expect(a11yIssues(html), name).toEqual([]);
      expect(gluedWords(text), name).toEqual([]);
    }
  });
});

// The security page said a bug in any page could not leak another firm's
// pipeline because the database would not serve it, while a shared link's
// page and pictures, the email pictures and the background screens read
// with the server's own key, behind the site's own checks (research pass
// 39). The page names them, and this holds the names to the code.
describe("the security page names the reads that go round row-level security", () => {
  it("names each reader that uses the server's key, and no longer says every page reads through the database's rules", () => {
    for (const file of [
      "app/share/[token]/page.tsx",
      "app/api/share/[token]/picture/route.ts",
      "app/api/share/[token]/aerial/route.ts",
      "app/api/email/picture/[token]/route.ts",
      "worker/index.ts",
      "lib/anthropic/pipeline.ts",
    ]) {
      expect(src(file), file).toContain("createSupabaseAdminClient");
    }
    const text = visibleText(renderToStaticMarkup(React.createElement(SecurityPage))).replace(/\s+/g, " ");
    expect(text).toContain(
      "Three things read with the server's own key instead, behind the site's own checks rather than the database's: a shared link's page and its pictures, the pictures in our emails, and the background work that runs your screens.",
    );
    expect(text).toContain("so a bug in one of those pages can't leak another firm's pipeline");
    expect(text).not.toContain("A bug in a page can't leak another firm's pipeline, because the database itself won't serve it.");
    expect(text).toContain("Isolation is enforced in the database itself (the few reads that go round it are named below)");
  });
});

// The list said Anthropic received the documents and the questions asked
// about them, while every verdict is also handed the buy box and a deal with
// no OM is screened from the facts typed for it; and it left out the support
// inbox the stopped-screen link writes to (research pass 39).
describe("what Anthropic and the support inbox receive, held to the code", () => {
  const anthropic = DATA_PROCESSORS.find((p) => p.name.startsWith("Anthropic"))!;

  it("names every kind of line of the buy box a verdict is handed, and leaves the 1031 exchange out as the code does", () => {
    expect(src("lib/anthropic/pipeline.ts")).toContain("buyBoxLines(box, { exchange: false })");
    // Each line a full box hands a Claude step, by its label, against the
    // words the list names it by: a new kind of line fails here until the
    // list names it too.
    const words: Record<string, string> = {
      "Asset classes": "asset classes",
      Geography: "markets",
      Size: "size and price bands",
      Count: "size and price bands",
      Price: "size and price bands",
      "Max basis per unit": "basis cap",
      "Min going-in cap": "return floors",
      "Min year-one cash-on-cash": "return floors",
      "Target base-case IRR": "return floors",
      Dealbreakers: "dealbreakers",
      Priorities: "your priorities as you wrote them",
    };
    const full: BuyBox = {
      assetClasses: ["multifamily"],
      markets: "Anytown",
      sfMin: 10_000,
      sfMax: 90_000,
      unitsMin: 20,
      unitsMax: 200,
      priceMinM: 5,
      priceMaxM: 50,
      maxPerUnitK: 250,
      minCapPct: 5.5,
      minCoCPct: 6,
      minIrrPct: 14,
      dealbreakers: { requireGeography: true },
      notes: "value-add only",
      exchange: { relinquishedTransferOn: "2026-09-15", filer: "partnership" },
    };
    const lines = buyBoxLines(full, { exchange: false });
    expect(lines).toHaveLength(Object.keys(words).length);
    for (const line of lines) {
      const label = line.slice(0, line.indexOf(":"));
      expect(words[label], line).toBeDefined();
      expect(anthropic.receives, line).toContain(words[label]);
    }
    expect(anthropic.receives).toContain("your buy box, which every verdict is handed");
    expect(lines.some((l) => /1031/.test(l))).toBe(false);
    expect(anthropic.receives).toContain("never your 1031 exchange");
  });

  it("names the facts typed for a deal with no OM, which its screen reads as a fact sheet", () => {
    expect(src("lib/anthropic/pipeline.ts")).toMatch(/omFromText\(manualFactSheet\(/);
    expect(anthropic.receives).toContain("the facts you type for a deal with no OM");
  });

  it("names the support inbox by its address and the provider its address shows, and what the stopped-screen link fills in", () => {
    const inbox = DATA_PROCESSORS.find((p) => p.name.includes(SUPPORT_EMAIL));
    expect(inbox, "the support inbox is listed").toBeDefined();
    // A support address on any other domain names its mail provider by hand.
    const provider = supportInboxProvider(SUPPORT_EMAIL);
    expect(provider, `name the mail provider of ${SUPPORT_EMAIL} in lib/data-processors`).not.toBeNull();
    expect(inbox!.name.startsWith(`${provider} `)).toBe(true);
    expect(inbox!.hosts).toEqual([]);
    expect(supportInboxProvider("someone@Gmail.com")).toBe("Gmail");
    expect(supportInboxProvider("help@example.com")).toBeNull();
    expect(supportInboxProvider("not an address")).toBeNull();
    // What the link under a stopped screen writes into the email.
    const mail = decodeURIComponent(
      supportMailto({ dealId: "deal-id-1", dealName: "Deal name", step: "market", error: "The page's sentence" }),
    );
    for (const part of ["Deal: Deal name", "Deal id: deal-id-1", "Stopped at the market step", "What the page said: The page's sentence"]) {
      expect(mail).toContain(part);
    }
    expect(inbox!.receives).toContain("the deal's name and id, the step it stopped at and what the page said");
  });
});
