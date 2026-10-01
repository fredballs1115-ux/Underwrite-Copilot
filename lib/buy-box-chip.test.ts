/**
 * The buy-box chip, read one way (lib/buy-box-chip) by the deal page's
 * header and by the screen-complete email that links to it. The email had
 * judged the extraction alone — no first signal, no address, no mandate-fit
 * score — so its chip could disagree with the page's: "Outside buy box" in
 * the inbox over a header reading "Fit 100 · Pursue", because the deal's
 * county was on its address and not in the memorandum's words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuyBox, BuyBoxCheck } from "./criteria";
import type { MandateScore } from "./mandate";
import type { ExtractionResult, FirstSignal } from "./anthropic/types";

const boxes = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/criteria-server", () => ({ getBuyBoxForDeal: async () => boxes.current }));
vi.mock("@/lib/deal-picture", () => ({
  pictureMayBeInMemorandum: () => false,
  ensureDealPicture: async () => null,
}));

import { notifyAnalysisReady } from "./email";
import { buyBoxChip, buyBoxRead, dealCheckSource } from "./buy-box-chip";
import { buyBoxCheckSource, evaluateBuyBox } from "./criteria";
import { inferStrategy } from "./deal-strategy";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "./sample-deal";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";

// A deal whose memorandum names its city and not its county; the deal's own
// address (the one the page reads) carries the county.
const EXTRACTION = {
  dealName: "Main Street Flats",
  assetClass: "multifamily",
  market: "North Dallas, TX",
  address: "4200 Main St, Frisco, TX",
  metrics: [
    { label: "Asking price", value: "$40,000,000", flagged: false, page: "p. 2" },
    { label: "Units", value: "200", flagged: false, page: "p. 2" },
  ],
} as unknown as ExtractionResult;
const ROW_ADDRESS = {
  label: "4200 Main St, Frisco, TX 75034",
  street: "4200 Main St",
  city: "Frisco",
  state: "TX",
  zip: "75034",
  county: "Collin County",
  submarket: "",
};
const FIRST_SIGNAL: FirstSignal = {
  dealName: "Main Street Flats",
  assetClass: "multifamily",
  market: "North Dallas, TX",
  askPrice: "$40,000,000",
  size: "200 units",
  goingInCap: "",
  perUnit: "$200,000/unit",
  take: "A stabilized garden community; check the tax line.",
};
const COUNTY_BOX: BuyBox = { assetClasses: ["multifamily"], markets: "Collin County" };

const env: Record<string, string | undefined> = {};
let sent: { text: string }[] = [];

function adminFor(row: Record<string, unknown>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === "deals" ? row : { email_on_analysis: true }, error: null }),
        }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "buyer@example.com" } } }) } },
  } as unknown as SupabaseClient;
}

/** The label the email handed Resend, off its plain-text part. */
async function emailedChip(row: Record<string, unknown>): Promise<string> {
  sent = [];
  await notifyAnalysisReady(adminFor(row), DEAL);
  expect(sent).toHaveLength(1);
  return sent[0].text.match(/^Buy box: (.+)$/m)?.[1] ?? "";
}

beforeEach(() => {
  for (const k of ["RESEND_API_KEY", "RESEND_FROM", "RESEND_BASE_URL", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY"]) env[k] = process.env[k];
  process.env.RESEND_API_KEY = "re_test";
  // A sender on a verified domain: without one the emails are paused (lib/email).
  process.env.RESEND_FROM = "Underwrite Copilot <notify@underwrite.example>";
  process.env.RESEND_BASE_URL = "https://resend.test";
  process.env.NEXT_PUBLIC_APP_URL = "https://underwrite.example";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

describe("the screen-complete email's chip is the deal header's", () => {
  it("reads the deal's own address, as the page does, where the memorandum names no county", async () => {
    boxes.current = COUNTY_BOX;
    const page = buyBoxRead("multifamily", dealCheckSource(EXTRACTION, FIRST_SIGNAL, ROW_ADDRESS), COUNTY_BOX);
    expect(page.checks.find((c) => c.label === "Geography")?.status).toBe("pass");
    // What the email used to judge — the extraction alone — misses the county.
    const before = evaluateBuyBox(
      "multifamily",
      buyBoxCheckSource(EXTRACTION, null, null, inferStrategy(EXTRACTION).kind),
      COUNTY_BOX,
    );
    expect(before.find((c) => c.label === "Geography")?.status).toBe("miss");

    const chip = await emailedChip({
      name: "Main Street Flats",
      user_id: "u1",
      team_id: null,
      asset_class: "multifamily",
      extraction: EXTRACTION,
      first_signal: FIRST_SIGNAL,
      address: ROW_ADDRESS,
      verdict: { verdict: "pass", reason: "Priced under the range." },
      is_sample: false,
      photo: null,
      om_storage_path: `u1/${DEAL}.pdf`,
    });
    expect(chip).toBe(page.chip.label);
    expect(chip).not.toBe("Outside buy box");
  });

  it("leads with the mandate-fit score, as the header does", async () => {
    boxes.current = SAMPLE_DEMO_BOX;
    const page = buyBoxRead(
      SAMPLE_DEAL.asset_class,
      dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address),
      SAMPLE_DEMO_BOX,
    );
    expect(page.mandate?.score).not.toBeNull();
    expect(page.chip.label).toMatch(/^Fit \d+ · (Pursue|Watch|Pass|Outside box)$/);
    const chip = await emailedChip({
      name: SAMPLE_DEAL.name,
      user_id: "u1",
      team_id: null,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      first_signal: null,
      address: SAMPLE_DEAL.address,
      verdict: SAMPLE_DEAL.verdict,
      is_sample: false,
      photo: null,
      om_storage_path: `u1/${DEAL}.pdf`,
    });
    expect(chip).toBe(page.chip.label);
  });

  it("says there is no buy box where the account has none", async () => {
    boxes.current = null;
    const chip = await emailedChip({
      name: "Main Street Flats",
      user_id: "u1",
      team_id: null,
      asset_class: "multifamily",
      extraction: EXTRACTION,
      first_signal: null,
      address: null,
      verdict: { verdict: "caution", reason: "" },
      is_sample: false,
      photo: null,
      om_storage_path: null,
    });
    expect(chip).toBe("No buy box set");
  });
});

describe("the chip's fold", () => {
  const check = (status: BuyBoxCheck["status"]): BuyBoxCheck => ({ label: "x", status, detail: "" });
  const score = (s: number, verdict: MandateScore["verdict"]): MandateScore => ({
    score: s,
    verdict,
    dimensions: [],
    dealbreakerTripped: false,
    unresolvedDealbreakers: 0,
  });

  it("leads with the score, unless a hard miss outside it wins", () => {
    expect(buyBoxChip([check("pass")], score(82, "PURSUE"))).toEqual({ label: "Fit 82 · Pursue", tone: "pass" });
    expect(buyBoxChip([check("near")], score(64, "WATCH"))).toEqual({ label: "Fit 64 · Watch", tone: "caution" });
    expect(buyBoxChip([check("pass"), check("miss")], score(82, "PURSUE"))).toEqual({
      label: "Fit 82 · Outside box",
      tone: "kill",
    });
    expect(buyBoxChip([check("miss")], score(30, "PASS"))).toEqual({ label: "Fit 30 · Pass", tone: "kill" });
  });

  it("folds the checks where there is no score", () => {
    expect(buyBoxChip([check("pass"), check("miss")], null).label).toBe("Outside buy box");
    expect(buyBoxChip([check("pass"), check("near")], null).label).toBe("Near buy box");
    expect(buyBoxChip([check("pass")], null).label).toBe("Fits buy box");
    expect(buyBoxChip([check("pass"), check("unknown")], null).label).toBe("Buy box unverified");
    expect(buyBoxChip([], score(0, null)).label).toBe("Buy box unverified");
  });
});
