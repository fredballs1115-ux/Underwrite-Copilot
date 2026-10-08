// Every outside service that receives something of a user's, and what it
// receives — the one list the security page and the privacy policy both
// print, so the two can never disagree. PURE (a string or two derived from
// the public-records config and the support address, nothing else), so a
// test can hold it to the hosts the code actually sends a user's data to
// (lib/data-processors.test.ts).
//
// Read from the code, not from intent: the geocoders get a deal's address,
// the map services a deal's map point, Photon also the addresses of the comps
// an OM lists (the comps map places them from the browser), and the browser
// itself loads map tiles and news pictures straight from their hosts.
//
// Anthropic is handed more than the documents (research pass 39): every
// verdict reads the buy box the deal is judged against (lib/anthropic/
// pipeline hands it `buyBoxLines(box, { exchange: false })`, the free-text
// priorities verbatim), and a deal typed in with no OM is screened from a
// fact sheet of what was typed (`manualFactSheet`). The support inbox is
// named by its address's own provider (lib/support-link's SUPPORT_EMAIL).

import { COVERAGE_SUMMARY } from "@/lib/public-comps/core";
import { SUPPORT_EMAIL } from "@/lib/support-link";

export interface DataProcessor {
  /** who it is, as the page names it */
  name: string;
  /** what it receives, in one short phrase */
  receives: string;
  /** the hosts the code reaches it on — held to the code by the test; empty
   *  where an SDK or the platform picks the host */
  hosts: readonly string[];
}

/**
 * The mail service that holds the support inbox, named only as its address
 * shows it: by the address's own domain. Gmail's is the one named; an
 * address on any other domain answers null, and the test fails until that
 * domain's mail provider is named here by hand, never guessed.
 */
export function supportInboxProvider(address: string): string | null {
  const domain = address.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain === "gmail.com" ? "Gmail" : null;
}

/** Said once under the list: the services a browser reaches directly see
 *  what any site sees. */
export const BROWSER_DIRECT_NOTE =
  "Your browser reaches some of these directly — Supabase, Photon, the map tiles and a news story's picture — and those see your IP address, as any site you visit does.";

export const DATA_PROCESSORS: readonly DataProcessor[] = [
  {
    name: "Supabase",
    receives: "the database, sign-in and file storage: your account, your deals and the documents you upload",
    hosts: ["supabase.co"],
  },
  {
    name: "Render",
    receives: "hosts the app and its background worker, so every request and upload passes through it",
    hosts: [],
  },
  {
    name: "Anthropic (the Claude API)",
    receives:
      "the documents you upload and the questions you ask about them, to write the analysis; the facts you type for a deal with no OM; your buy box, which every verdict is handed: its asset classes, markets, size and price bands, basis cap, return floors, dealbreakers and your priorities as you wrote them, never your 1031 exchange; for a public-web comp search, a deal's name, address and market, for its web search to look up",
    hosts: [],
  },
  {
    name: "Stripe",
    receives: "your email address, and a team's name for a team plan, when you subscribe; card details go to Stripe's checkout, never to us",
    hosts: [],
  },
  {
    name: "Resend",
    // Both emails are on for a new account (migrations 0014 and 0017 default
    // the two columns to true); the account page turns each off.
    receives:
      "your email address, and what our emails carry (two switches, both on by default; each can be turned off on the Account page): deal names, their screening calls with a line of why and their buy-box fit, or the sentence the deal page shows when a screen stops, pipeline counts and offer deadlines",
    hosts: ["api.resend.com"],
  },
  {
    // The code sends nothing here itself: a person's own mail app does, from
    // the support links (lib/support-link's mailto, the pages' address).
    name: `${supportInboxProvider(SUPPORT_EMAIL) ?? "The mail service"} (our support inbox, ${SUPPORT_EMAIL})`,
    receives:
      "what you email us, from your own mail app: your address and what you write; the link under a stopped screen fills in the deal's name and id, the step it stopped at and what the page said",
    hosts: [],
  },
  {
    name: "Photon (photon.komoot.io, a geocoder over OpenStreetMap data)",
    receives:
      "address text only: what you type into an address field, a deal's address, and the addresses of the comps an OM lists, to put them on a map",
    hosts: ["photon.komoot.io"],
  },
  {
    name: "The US Census Bureau's geocoder",
    receives: "a deal's address and its map point, to place the building and read its census tract, county and city",
    hosts: ["geocoding.geo.census.gov"],
  },
  {
    name: "FEMA's flood map service",
    receives: "a deal's map point, for the flood zone there and the flood map around it",
    hosts: ["hazards.fema.gov"],
  },
  {
    name: "USGS (The National Map)",
    receives: "a deal's map point, for the aerial photograph of it; and the area a map shows, as your browser loads its map tiles",
    hosts: ["basemap.nationalmap.gov"],
  },
  {
    name: "OpenStreetMap's tile servers",
    receives: "the area a map shows, when you switch a map to the street map and your browser loads its tiles",
    hosts: ["tile.openstreetmap.org"],
  },
  {
    name: `Public-records open-data services for ${COVERAGE_SUMMARY}`,
    receives: "the area around a deal's map point, to find recorded sales nearby",
    hosts: ["phl.carto.com", "opendata.maryland.gov", "services2.arcgis.com"],
  },
  {
    name: "Google Maps Platform",
    // No satellite view: nothing a reader opens asks Google for one now — the
    // deal page and the compare columns are held off Google's imagery, and the
    // pipeline's cards never draw an overhead (the batch-2 audit).
    receives: "only if we have switched it on (it needs our key): a deal's map point, for a street-level photograph of the building",
    hosts: ["maps.googleapis.com"],
  },
  {
    name: "News publishers",
    receives: "a request for a story's picture, which your browser loads from the publisher's own site on the News page",
    hosts: [],
  },
];
