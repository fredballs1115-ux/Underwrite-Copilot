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

const boxes = vi.hoisted(() => ({ current: null as unknown, unreadable: false, asked: [] as unknown[] }));
vi.mock("@/lib/criteria-server", () => ({
  getBuyBoxForDeal: async (...args: unknown[]) => {
    boxes.asked.push(args[2]);
    if (boxes.unreadable) throw new Error("the buy box could not be read: connection reset");
    return boxes.current;
  },
}));
vi.mock("@/lib/deal-picture", () => ({
  pictureMayBeInMemorandum: () => false,
  ensureDealPicture: async () => null,
}));

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BUY_BOX_NOT_READ, notifyAnalysisReady } from "./email";
import { buyBoxChip, buyBoxChipText, buyBoxRead, dealCheckSource, sourceReadsOf } from "./buy-box-chip";
import { FOLD_WORD, fitCellText, fitScoreLabel } from "./fit-label";
import { buyBoxCheckSource, buyBoxCoverage, evaluateBuyBox } from "./criteria";
import { evalDealbreakers } from "./mandate";
import { inferStrategy } from "./deal-strategy";
import { capSlotWithheld, goingInCapFigure, modelReturnsRead, statedCapRead } from "./compare-interest";
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
    // The score, then its call or a miss outright — and how many of the
    // box's criteria it stands on where not every one could be checked.
    expect(page.chip.label).toMatch(/^Fit \d+ · (Pursue|Watch|Pass|Outside box|\d+ of \d+ checked)( · \d+ of \d+ checked)?$/);
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

  it("says the box was not read where its read failed — never \"unverified\", a claim about the deal, nor \"no buy box set\"", async () => {
    boxes.unreadable = true;
    boxes.asked = [];
    try {
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
      expect(chip).toBe(BUY_BOX_NOT_READ);
      expect(chip).not.toMatch(/unverified|no buy box/i);
      // The email asks for a read that fails loudly rather than reading as "none".
      expect(boxes.asked).toEqual([{ strict: true }]);
    } finally {
      boxes.unreadable = false;
    }
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
    // A low score and a miss outright: the miss wins the words too, as on the
    // pipeline card (lib/fit-label) — the header had read "Fit 30 · Pass"
    // beside the card's "Fit 30 · Outside box" (research pass 34).
    expect(buyBoxChip([check("miss")], score(30, "PASS"))).toEqual({ label: "Fit 30 · Outside box", tone: "kill" });
    expect(buyBoxChip([check("miss")], score(30, "PASS")).label).toBe(fitScoreLabel(30, "PASS", true));
    // A low score with nothing missed outright keeps the score's own call.
    expect(buyBoxChip([check("pass"), check("near")], score(30, "PASS"))).toEqual({ label: "Fit 30 · Pass", tone: "kill" });
  });

  it("folds the checks where there is no score, in the words the CSV and the meeting workbook's cell write (lib/fit-label)", () => {
    expect(buyBoxChip([check("pass"), check("miss")], null)).toEqual({ label: "Outside", tone: "kill" });
    expect(buyBoxChip([check("pass"), check("near")], null)).toEqual({ label: "Near", tone: "caution" });
    expect(buyBoxChip([check("pass")], null)).toEqual({ label: "Fits", tone: "pass" });
    // A pass beside a criterion it could not check: the cell's "Fits (1 of
    // 2)", never "unverified" over a deal the cell calls a fit (the audit of
    // 2026-10-05, LOW-10).
    expect(buyBoxChip([check("pass"), check("unknown")], null).label).toBe("Fits (1 of 2)");
    expect(buyBoxChip([], score(0, null)).label).toBe("Buy box unverified");
  });

  it("names the buy box on the header's chip where its words do not (audit C3b LOW-2)", () => {
    // The fold's words are the cell's, which sits under a "Buy box" heading
    // and in the email's "Buy box:" line; the header's chip stands alone, and
    // read "Outside (2 of 3)" to the eye and to a screen reader alike.
    const fold = buyBoxChip([check("pass"), check("miss"), check("unknown")], null);
    expect(fold.label).toBe("Outside (2 of 3)");
    expect(buyBoxChipText(fold)).toBe("Buy box: Outside (2 of 3)");
    expect(buyBoxChipText(buyBoxChip([check("pass"), check("unknown")], null))).toBe("Buy box: Fits (1 of 2)");
    // A score's words already say what they are, and so does "unverified".
    expect(buyBoxChipText(buyBoxChip([check("miss")], score(30, "PASS")))).toBe("Fit 30 · Outside box");
    expect(buyBoxChipText(buyBoxChip([], score(0, null)))).toBe("Buy box unverified");
    // The deal header draws these words.
    const page = readFileSync(join(__dirname, "..", "app/(app)/deals/[id]/page.tsx"), "utf8");
    expect(page).toContain("label: buyBoxChipText(boxRead.chip)");
  });
});

describe("the chip says how much of the box it was judged on (research pass 35)", () => {
  const check = (label: string, status: BuyBoxCheck["status"], onPrice = false): BuyBoxCheck => ({
    label,
    status,
    detail: "",
    ...(onPrice ? { onPrice: true } : {}),
  });
  const score = (s: number, verdict: MandateScore["verdict"]): MandateScore => ({
    score: s,
    verdict,
    dimensions: [],
    dealbreakerTripped: false,
    unresolvedDealbreakers: 0,
  });
  const NOTE = {
    ...SAMPLE_DEAL.extraction,
    interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
  } as unknown as ExtractionResult;

  it("a note against a property box: the count in the call's place, muted, and the criteria named — on the header and in the email", async () => {
    const page = buyBoxRead(SAMPLE_DEAL.asset_class, dealCheckSource(NOTE, null, SAMPLE_DEAL.address), SAMPLE_DEMO_BOX);
    // Two known passes scored 100 and PURSUE; the box's cap and return,
    // which a note's price cannot be judged by, were never checked — nor its
    // cash-on-cash floor, which the memorandum states no figure for.
    expect(page.mandate?.score).toBe(100);
    expect(page.mandate?.verdict).toBe("PURSUE");
    expect(page.chip).toEqual({
      label: "Fit 100 · 2 of 5 checked",
      tone: "muted",
      note: "Judged on 2 of the buy box's 5 criteria; going-in cap, target return and cash-on-cash could not be checked.",
    });
    boxes.current = SAMPLE_DEMO_BOX;
    const chip = await emailedChip({
      name: "Harbor Point — Performing First Mortgage",
      user_id: "u1",
      team_id: null,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: NOTE,
      first_signal: null,
      address: SAMPLE_DEAL.address,
      verdict: { verdict: "caution", reason: "A performing note." },
      is_sample: false,
      photo: null,
      om_storage_path: `u1/${DEAL}.pdf`,
    });
    expect(chip).toBe("Fit 100 · 2 of 5 checked");
    expect(chip).not.toContain("Pursue");
  });

  it("a miss outright keeps its words and its red, the count after it", () => {
    const sample = buyBoxRead(
      SAMPLE_DEAL.asset_class,
      dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address),
      SAMPLE_DEMO_BOX,
    ).chip;
    // The sample misses the 5.75% floor; its memorandum states no IRR and
    // no cash-on-cash.
    expect(sample).toEqual({
      label: "Fit 63 · Outside box · 3 of 5 checked",
      tone: "kill",
      note: "Judged on 3 of the buy box's 5 criteria; target return and cash-on-cash could not be checked.",
    });
  });

  it("a box checked whole reads exactly as before, with no note", () => {
    const whole = [check("Asset class", "pass"), check("Going-in cap", "pass", true), check("Target return", "pass", true)];
    expect(buyBoxChip(whole, score(100, "PURSUE"))).toEqual({ label: "Fit 100 · Pursue", tone: "pass" });
    expect(buyBoxChip([...whole.slice(0, 2), check("Target return", "near", true)], score(64, "WATCH"))).toEqual({
      label: "Fit 64 · Watch",
      tone: "caution",
    });
  });

  it("is green only while every criterion the price decides was checked; a near miss keeps its amber", () => {
    // Only the place is unknown: the count, and the call's own green.
    const place = buyBoxChip([check("Geography", "unknown"), check("Going-in cap", "pass", true)], score(100, "PURSUE"));
    expect(place).toEqual({
      label: "Fit 100 · 1 of 2 checked",
      tone: "pass",
      note: "Judged on 1 of the buy box's 2 criteria; geography could not be checked.",
    });
    // The return is unknown: no green.
    expect(buyBoxChip([check("Asset class", "pass"), check("Target return", "unknown", true)], score(100, "PURSUE")).tone).toBe("muted");
    // A near miss with the cap unknown stays a warning.
    const near = buyBoxChip([check("Units", "near"), check("Going-in cap", "unknown", true)], score(64, "WATCH"));
    expect(near.label).toBe("Fit 64 · 1 of 2 checked");
    expect(near.tone).toBe("caution");
  });

  it("the fold without a score says the count beside its word, as the cell does; a box it could judge none of stays unverified", () => {
    expect(buyBoxChip([check("Price", "near", true), check("Basis / unit", "unknown", true)], null)).toEqual({
      label: "Near (1 of 2)",
      tone: "caution",
      note: "Judged on 1 of the buy box's 2 criteria; basis / unit could not be checked.",
    });
    expect(buyBoxChip([check("Price", "miss", true), check("Basis / unit", "unknown", true)], null).label).toBe("Outside (1 of 2)");
    // The audit's case: a $24M deal inside a $10-50M band, its cap unstated.
    // The chip and the CSV cell say one thing, muted, the cap named.
    const unpriced = [check("Price", "pass", true), check("Going-in cap", "unknown", true)];
    expect(buyBoxChip(unpriced, null)).toEqual({
      label: "Fits (1 of 2)",
      tone: "muted",
      note: "Judged on 1 of the buy box's 2 criteria; going-in cap could not be checked.",
    });
    expect(buyBoxChip(unpriced, null).label).toBe(fitCellText(FOLD_WORD.fits, buyBoxCoverage(unpriced, null)));
    // Only the place unchecked: the cell's own green.
    expect(buyBoxChip([check("Price", "pass", true), check("Geography", "unknown")], null)).toMatchObject({ label: "Fits (1 of 2)", tone: "pass" });
    expect(buyBoxChip([check("Price", "unknown", true)], null)).toEqual({
      label: "Buy box unverified",
      tone: "muted",
      note: "The buy box's one criterion could not be checked.",
    });
  });
});

// What the price buys decides what the box may hold it to (the audit of
// 2026-10-05, HIGH-1): the header's cap slot withholds a preferred equity
// position's cap and a share's beside its entity's loan, and no surface
// strikes a building basis on a note's, a position's, the land's or a
// share's price — but the box had held both to its cap floor and its basis
// ceiling, so the chip beside "n/a — share" read "Fit 100 · Pursue".
describe("the box holds a deal only to the figures its price buys", () => {
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 2", basis: "na" as const });
  const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
  const deal = (kind: string, rows: [string, string][], share = "") =>
    ({
      dealName: "Main Street Flats",
      assetClass: "multifamily",
      market: "Dallas, TX",
      address: "100 Main St, Dallas, TX",
      interest: { ...blank, kind, share },
      metrics: rows.map(([l, v]) => row(l, v)),
    }) as unknown as ExtractionResult;
  // The building's own figures, which none of the deals below buys outright:
  // a 6.50% cap over a 6% floor, and a $400k basis over a $300k ceiling.
  const BUILDING: [string, string][] = [
    ["Going-in cap rate", "6.50%"],
    ["Price per unit", "$400,000"],
    ["Units", "200"],
  ];
  const BOX: BuyBox = {
    assetClasses: ["multifamily"],
    minCapPct: 6,
    maxPerUnitK: 300,
    dealbreakers: { minCapPct: 6, maxPerUnitK: 300 },
  };
  const read = (ex: ExtractionResult) => buyBoxRead("multifamily", dealCheckSource(ex, null, null), BOX);
  const checkOf = (r: ReturnType<typeof read>, label: string) => r.checks.find((c) => c.label === label);
  const dimOf = (r: ReturnType<typeof read>, key: string) => r.mandate?.dimensions.find((d) => d.key === key);
  const redLines = (ex: ExtractionResult) => evalDealbreakers("multifamily", dealCheckSource(ex, null, null), BOX);

  it("a fee simple is held to both, its cap passing and its basis tripping the red line", () => {
    const r = read(deal("fee_simple", [["Asking price", "$80,000,000"], ...BUILDING]));
    expect(checkOf(r, "Going-in cap")?.status).toBe("pass");
    expect(checkOf(r, "Basis / unit")?.status).toBe("miss");
    expect(r.mandate?.dealbreakerTripped).toBe(true);
  });

  it("a note: its cap and its basis are the collateral's, held to neither", () => {
    const r = read(deal("note", [["Asking price", "$12,000,000"], ["Unpaid principal balance", "$15,000,000"], ...BUILDING]));
    expect(checkOf(r, "Going-in cap")).toMatchObject({ status: "unknown", onPrice: true });
    expect(checkOf(r, "Going-in cap")?.detail).toContain("this is a note: its price is a loan's");
    expect(checkOf(r, "Basis / unit")).toMatchObject({ status: "unknown", onPrice: true });
    expect(checkOf(r, "Basis / unit")?.detail).toContain("this is a note");
    expect(checkOf(r, "Basis / unit")?.detail).not.toContain("$400k");
    expect(redLines(deal("note", [["Asking price", "$12,000,000"], ...BUILDING]))).toMatchObject({ tripped: [], unknown: ["cap rate", "basis / unit"] });
  });

  it("a preferred equity position: no cap, no basis, no red line tripped on the building's figures", () => {
    const ex = deal("preferred_equity", [
      ["Asking price", "$15,000,000"],
      ["Preferred equity amount", "$15,000,000"],
      ["Preferred return", "12% preferred return, 8% current pay"],
      ...BUILDING,
    ]);
    const r = read(ex);
    expect(checkOf(r, "Going-in cap")?.status).toBe("unknown");
    expect(checkOf(r, "Going-in cap")?.detail).toContain("this is a preferred equity position: its price buys a rate and a redemption");
    expect(checkOf(r, "Going-in cap")?.detail).not.toContain("6.50%");
    expect(checkOf(r, "Basis / unit")?.status).toBe("unknown");
    expect(checkOf(r, "Basis / unit")?.detail).toContain("preferred equity position");
    expect(dimOf(r, "cap")?.status).toBe("unknown");
    expect(dimOf(r, "cap")?.detail).toBe(checkOf(r, "Going-in cap")?.detail);
    expect(r.mandate?.dealbreakerTripped).toBe(false);
    expect(redLines(ex)).toMatchObject({ tripped: [], unknown: ["cap rate", "basis / unit"] });
    // The chip beside the header's "To redemption" slot is no green Pursue.
    expect(r.chip.tone).toBe("muted");
    expect(r.chip.label).not.toContain("Pursue");
  });

  it("a share the extraction filed whose rows say a position is read as the position lib/interest reads", () => {
    const ex = deal("partial_interest", [
      ["Asking price", "$15,000,000"],
      ["Preferred equity amount", "$15,000,000"],
      ["Current pay rate", "8%"],
      ...BUILDING,
    ]);
    expect(sourceReadsOf(ex, null)).toEqual({ interestKind: "preferred_equity", capWithheld: "position", statedBasisIsBuildings: false, share: null, signalCap: null });
    expect(checkOf(read(ex), "Going-in cap")?.detail).toContain("preferred equity position");
  });

  it("a share beside its entity's loan: the equity's whole, no building's cap or basis", () => {
    const ex = deal(
      "partial_interest",
      [["Asking price", "$20,580,000"], ["Entity loan balance", "$56,500,000"], ...BUILDING],
      "A 49% limited partnership interest",
    );
    expect(sourceReadsOf(ex, null)).toEqual({ interestKind: "partial_interest", capWithheld: "share", statedBasisIsBuildings: false, share: { gpStake: false, pctStated: true, tic: false, all: false }, signalCap: null });
    const r = read(ex);
    expect(checkOf(r, "Going-in cap")?.status).toBe("unknown");
    expect(checkOf(r, "Going-in cap")?.detail).toContain("beside the loan its entity carries, this share's price grossed up is the equity's whole");
    expect(checkOf(r, "Basis / unit")?.status).toBe("unknown");
    expect(checkOf(r, "Basis / unit")?.detail).toContain("a share of the owning entity");
    expect(redLines(ex)).toMatchObject({ tripped: [], unknown: ["cap rate", "basis / unit"] });
    expect(r.chip.label).not.toContain("Pursue");
  });

  it("a share of no stated percentage beside its entity's loan is said to gross up to nothing, as the report and the workbook say (audit C6, MED-4)", () => {
    const IRR: [string, string][] = [["Levered IRR", "14.0%"]];
    const box: BuyBox = { ...BOX, minIrrPct: 15 };
    const readBox = (ex: ExtractionResult) => buyBoxRead("multifamily", dealCheckSource(ex, null, null), box);
    const lp = deal(
      "partial_interest",
      [["Asking price", "$20,000,000"], ["Entity loan balance", "$30,000,000"], ...BUILDING, ...IRR],
      "A limited partnership interest in the owning entity",
    );
    const r = readBox(lp);
    expect(checkOf(r, "Going-in cap")?.status).toBe("unknown");
    expect(checkOf(r, "Going-in cap")?.detail).toBe(
      "Mandate wants ≥6% going-in, but this share's price, which no stated percentage grosses up, sits beside the loan its entity carries: it is no building's price, and a cap stated against it is on a basis the memorandum never says.",
    );
    expect(checkOf(r, "Target return")?.detail).toBe(
      "Mandate targets ≥15% IRR, but this share states no percentage of the owning entity: its price grosses up to no building's, the loan its entity carries stated beside it, so an IRR the memorandum states is not read as this share's return.",
    );
    // A tenancy in common of no stated percentage, the same way.
    const tic = deal(
      "partial_interest",
      [["Asking price", "$6,000,000"], ["Entity loan balance", "$14,000,000"], ...BUILDING, ...IRR],
      "An undivided tenant-in-common interest",
    );
    const t = readBox(tic);
    expect(checkOf(t, "Going-in cap")?.detail).toBe(
      "Mandate wants ≥6% going-in, but this interest's price, which no stated percentage grosses up, sits beside the stated $14.0M loan on the property: it is no building's price, and a cap stated against it is on a basis the memorandum never says.",
    );
    expect(checkOf(t, "Target return")?.detail).toBe(
      "Mandate targets ≥15% IRR, but this undivided interest states no percentage of the property: its price grosses up to no building's, the stated $14.0M loan on the property beside it, so an IRR the memorandum states is not read as this interest's return.",
    );
    for (const ex of [lp, tic]) {
      const rr = readBox(ex);
      for (const label of ["Going-in cap", "Target return"]) expect(checkOf(rr, label)?.detail, label).not.toContain("grossed up");
      expect(dimOf(rr, "irr")?.detail).toBe(checkOf(rr, "Target return")?.detail);
      // The model-returns line (the deal page's tiles, the compare table).
      const line = modelReturnsRead(ex, { purchasePrice: 20_000_000, year1Noi: 1_300_000, goingInCapPct: 6.5 }).line!;
      expect(line).toContain("states no percentage to gross it up by");
      expect(line).not.toContain("grossed up beside");
    }
  });

  it("a tenancy in common and a GP stake are said as what they are, never a share of the owning entity (audit C3b MED-4)", () => {
    // A TIC is title to the property, and its stated loan is the property's.
    const tic = deal(
      "partial_interest",
      [["Asking price", "$6,000,000"], ["Entity loan balance", "$14,000,000"], ...BUILDING],
      "30% undivided tenant-in-common interest",
    );
    const t = read(tic);
    expect(checkOf(t, "Going-in cap")?.status).toBe("unknown");
    expect(checkOf(t, "Going-in cap")?.detail).toBe(
      "Mandate wants ≥6% going-in, but beside the stated $14.0M loan on the property, this interest's price grossed up is the equity's whole, not the building's: a cap stated against that price is on a basis the memorandum never says.",
    );
    expect(dimOf(t, "cap")?.detail).toBe(checkOf(t, "Going-in cap")?.detail);
    expect(checkOf(t, "Basis / unit")?.detail).toContain(
      "this sells an undivided interest held as a tenant in common: a per-unit figure the memorandum states is on a basis it never says, the whole's or the interest's",
    );
    for (const c of [checkOf(t, "Going-in cap"), checkOf(t, "Basis / unit")]) expect(c?.detail).not.toContain("owning entity");
    // A share of the general partner's interest is a share of a share. Where
    // its cap slot is withheld (beside an entity's loan), the box holds it to
    // no building cap or basis, and says why in its own words.
    const gp = deal(
      "partial_interest",
      [["Asking price", "$3,000,000"], ["Entity loan balance", "$40,000,000"], ...BUILDING],
      "50% of the general partner interest",
    );
    const g = read(gp);
    expect(checkOf(g, "Going-in cap")?.status).toBe("unknown");
    expect(checkOf(g, "Going-in cap")?.detail).toBe(
      "Mandate wants ≥6% going-in, but this sells a share of the general partner's interest, a share of a share: no figure grosses its price up to the building's, and the building's cap is not a return its buyer earns.",
    );
    expect(checkOf(g, "Basis / unit")?.status).toBe("unknown");
    expect(checkOf(g, "Basis / unit")?.detail).toContain(
      "this sells a share of the general partner's interest, a share of a share: its price is never grossed up or divided over the building, and no per-unit basis is struck on it",
    );
    expect(redLines(gp)).toMatchObject({ tripped: [], unknown: ["cap rate", "basis / unit"] });
    // With no entity loan a GP stake is still a share of a share: no
    // building cap stands in its slot or is judged by the box, whatever the
    // loan (audit C6, MED-5: the box had passed its building's 6.50% beside
    // a return it withheld as a share of a share).
    const gpNoLoan = deal("partial_interest", [["Asking price", "$3,000,000"], ...BUILDING], "50% of the general partner interest");
    expect(sourceReadsOf(gpNoLoan, null).capWithheld).toBe("share");
    expect(checkOf(read(gpNoLoan), "Going-in cap")).toMatchObject({ status: "unknown", detail: checkOf(g, "Going-in cap")?.detail });
    expect(checkOf(read(gpNoLoan), "Basis / unit")?.detail).toContain("a share of the general partner's interest");
    expect(redLines(gpNoLoan)).toMatchObject({ tripped: [], unknown: ["cap rate", "basis / unit"] });
    // The header, the pipeline's slots and the memories say "n/a — share",
    // and pool no cap.
    expect(capSlotWithheld(gpNoLoan)).toBe("share");
    expect(goingInCapFigure(gpNoLoan, "6.50%").value).toBe("n/a — share");
    expect(statedCapRead(gpNoLoan, false)).toBeNull();
    // A share of a stated percentage with no loan keeps its cap, as before.
    const lpNoLoan = deal("partial_interest", [["Asking price", "$20,580,000"], ...BUILDING], "A 49% limited partnership interest");
    expect(capSlotWithheld(lpNoLoan)).toBeNull();
  });

  it("a share with a stated percentage and no entity loan keeps its cap, the grossed-up whole's — its stated per-unit figure is no basis", () => {
    const ex = deal("partial_interest", [["Asking price", "$20,580,000"], ...BUILDING], "A 49% limited partnership interest");
    expect(sourceReadsOf(ex, null)).toEqual({ interestKind: "partial_interest", capWithheld: null, statedBasisIsBuildings: false, share: { gpStake: false, pctStated: true, tic: false, all: false }, signalCap: null });
    const r = read(ex);
    // The header prints the memorandum's cap for this share, and the box
    // judges the same figure.
    expect(checkOf(r, "Going-in cap")?.status).toBe("pass");
    expect(dimOf(r, "cap")?.status).toBe("pass");
    // The per-unit row is on a basis the memorandum never says.
    expect(checkOf(r, "Basis / unit")?.status).toBe("unknown");
    expect(redLines(ex)).toMatchObject({ tripped: [], clear: ["cap rate"], unknown: ["basis / unit"] });
  });

  // Research pass 41's H3: the target-return check read the memorandum's IRR
  // — the property's — on a note, a position, a share beside its entity's
  // loan and a leased fee, beside a cap and a basis it held to nothing, so a
  // note could read "Outside box" on its collateral's IRR.
  it("holds an IRR the memorandum states to the target only where the price buys the building", () => {
    const IRR: [string, string][] = [...BUILDING, ["Unlevered IRR", "8.9%"]];
    const box: BuyBox = { assetClasses: ["multifamily"], minIrrPct: 14 };
    const readIrr = (ex: ExtractionResult) => buyBoxRead("multifamily", dealCheckSource(ex, null, null), box);
    const fee = readIrr(deal("fee_simple", [["Asking price", "$80,000,000"], ...IRR]));
    expect(checkOf(fee, "Target return")).toMatchObject({ status: "miss", onPrice: true });
    expect(fee.mandate?.dimensions.find((d) => d.key === "irr")?.status).toBe("miss");
    const withheld: [string, ExtractionResult, string][] = [
      ["note", deal("note", [["Asking price", "$12,000,000"], ["Unpaid principal balance", "$15,000,000"], ...IRR]), "this is a note: its price is a loan's"],
      [
        "position",
        deal("preferred_equity", [["Asking price", "$15,000,000"], ["Preferred equity amount", "$15,000,000"], ["Preferred return", "12% preferred return"], ...IRR]),
        "this is a preferred equity position",
      ],
      [
        "share",
        deal("partial_interest", [["Asking price", "$20,580,000"], ["Entity loan balance", "$56,500,000"], ...IRR], "A 49% limited partnership interest"),
        "this share's price grossed up is the equity's whole",
      ],
      ["leased fee", deal("leased_fee", [["Asking price", "$24,000,000"], ["Ground rent", "$1,200,000"], ...IRR]), "the price buys the land under the ground lease"],
    ];
    for (const [name, ex, words] of withheld) {
      const r = readIrr(ex);
      const check = checkOf(r, "Target return");
      expect(check, name).toMatchObject({ status: "unknown", onPrice: true });
      expect(check?.detail, name).toContain(words);
      expect(check?.detail, name).not.toContain("8.9%");
      const dim = r.mandate?.dimensions.find((d) => d.key === "irr");
      expect(dim?.status, name).toBe("unknown");
      expect(dim?.detail, name).toBe(check?.detail);
      // The fit says it was not judged on it.
      expect(r.chip.note, name).toContain("target return could not be checked");
      expect(r.chip.label, name).not.toContain("Outside box");
    }
    // A share with a stated percentage and no entity loan keeps its cap and
    // its IRR, as its cap slot does.
    const share = readIrr(deal("partial_interest", [["Asking price", "$20,580,000"], ...IRR], "A 49% limited partnership interest"));
    expect(checkOf(share, "Target return")?.status).toBe("miss");
  });

  it("a cap-rate red line the box could not check leaves no green Pursue (HIGH-2)", () => {
    // The note's cap is withheld, so the red line on it cannot be checked;
    // a fee simple that states no cap reads the same.
    const box: BuyBox = { assetClasses: ["multifamily"], dealbreakers: { requireAssetClass: true, minCapPct: 6 } };
    for (const ex of [
      deal("note", [["Asking price", "$12,000,000"], ["Unpaid principal balance", "$15,000,000"], ["Going-in cap rate", "5.10%"], ["Units", "200"]]),
      deal("fee_simple", [["Asking price", "$12,000,000"], ["Units", "200"]]),
    ]) {
      const r = buyBoxRead("multifamily", dealCheckSource(ex, null, null), box);
      expect(r.mandate?.dimensions.find((d) => d.key === "dealbreakers")?.status).toBe("unknown");
      expect(r.chip).toEqual({
        label: "Fit 100 · 2 of 3 checked",
        tone: "muted",
        note: "Judged on 2 of the buy box's 3 criteria; cap-rate dealbreaker could not be checked.",
      });
    }
  });

  it("a cash-on-cash floor the memorandum gives no figure for is counted and leaves no green Pursue (HIGH-2)", () => {
    const ex = deal("fee_simple", [["Asking price", "$15,000,000"], ["NOI (in-place)", "$900,000"], ["Units", "100"]]);
    const r = buyBoxRead("multifamily", dealCheckSource(ex, null, null), { assetClasses: ["multifamily"], minCoCPct: 8 });
    expect(r.chip).toEqual({
      label: "Fit 100 · 1 of 2 checked",
      tone: "muted",
      note: "Judged on 1 of the buy box's 2 criteria; cash-on-cash could not be checked.",
    });
  });

  it("every page, route and document builds its source through dealCheckSource", () => {
    // lib/criteria cannot read what the price buys itself (lib/deal-strategy
    // imports it, and the pipeline's client bundle must not load the
    // interest reader), so a source built anywhere else would judge a
    // position's cap again.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(p);
      }
    };
    walk("app");
    walk("lib");
    const direct = files.filter(
      (f) => !/lib[\\/](criteria|buy-box-chip)\.ts$/.test(f) && /\bbuyBoxCheckSource\(/.test(readFileSync(f, "utf8")),
    );
    expect(direct).toEqual([]);
    // And every surface that counts a fit's coverage hands it the score, so
    // the cash-on-cash floor and the red lines are counted on each (HIGH-2):
    // the header, the email, the pipeline's card, list and CSV, the meeting
    // workbook, the compare table, the batch triage and the verdict's brief.
    const counting = files.filter((f) => /\bbuyBoxCoverage\(/.test(readFileSync(f, "utf8")));
    expect(counting.length).toBeGreaterThanOrEqual(7);
    const scoreless = counting.filter((f) => /\bbuyBoxCoverage\([^()]*,\s*null\s*\)/.test(readFileSync(f, "utf8")));
    expect(scoreless).toEqual([]);
  });

  // Audit C4, L2: a GP stake's price buys a share of a share, and a share of
  // no stated percentage grosses up to nothing: neither buys the building,
  // and an IRR the memorandum states is no return of their buyers'. The box
  // had held each to its target ("near — the OM projects 14.0%").
  it("holds no stated IRR to the target on a GP stake or a share of no stated percentage", () => {
    const IRR: [string, string][] = [["Units", "200"], ["Levered IRR", "14.0%"]];
    const box: BuyBox = { assetClasses: ["multifamily"], minIrrPct: 15 };
    const readIrr = (ex: ExtractionResult) => buyBoxRead("multifamily", dealCheckSource(ex, null, null), box);
    const cases: [string, ExtractionResult, string][] = [
      [
        "GP stake",
        deal("partial_interest", [["Asking price", "$5,000,000"], ...IRR], "A 50% interest in the general partner of the owning partnership"),
        "this is a share of the general partner's interest: a share of a share",
      ],
      [
        "no percentage",
        deal("partial_interest", [["Asking price", "$20,000,000"], ...IRR], "A limited partnership interest in the owning entity"),
        "this share states no percentage",
      ],
    ];
    for (const [name, ex, words] of cases) {
      const r = readIrr(ex);
      const check = checkOf(r, "Target return");
      expect(check, name).toMatchObject({ status: "unknown", onPrice: true });
      expect(check?.detail, name).toContain(words);
      expect(check?.detail, name).not.toContain("14.0%");
      const dim = r.mandate?.dimensions.find((d) => d.key === "irr");
      expect(dim?.status, name).toBe("unknown");
      expect(dim?.detail, name).toBe(check?.detail);
    }
    // A share of a stated percentage with no entity loan stands, as before:
    // whether its deal-level IRR is the share's is the owner's call.
    const lp = readIrr(deal("partial_interest", [["Asking price", "$9,800,000"], ...IRR], "A 49% limited partnership interest"));
    expect(checkOf(lp, "Target return")?.status).toBe("near");
  });

  // Audit C4, L3: a tenancy in common's loan is the property's, and no
  // entity owns the property (research pass 37).
  it("says a TIC's loan is the property's, and its share an interest, in both withheld checks", () => {
    const tic = deal(
      "partial_interest",
      [["Asking price", "$4,200,000"], ["Entity loan balance", "$9,000,000"], ["Levered IRR", "14.0%"], ...BUILDING],
      "30% tenant-in-common interest",
    );
    const r = buyBoxRead("multifamily", dealCheckSource(tic, null, null), { ...BOX, minIrrPct: 15 });
    for (const label of ["Going-in cap", "Target return"]) {
      const detail = checkOf(r, label)?.detail ?? "";
      // The cap's words name the stated loan (lib/interest's entityLoanWords);
      // the return's say "the loan on the property". Both are the property's.
      expect(detail, label).toMatch(/beside the (?:stated \$[\d.]+M )?loan on the property, this interest's price grossed up is the equity's whole/);
      expect(detail, label).not.toMatch(/its entity|this share/);
    }
    // All the tenant-in-common interests: the price is the whole's,
    // nothing grossed up, as the deal's own lead says (audit C5, LOW-7).
    const all = deal(
      "partial_interest",
      [["Asking price", "$14,000,000"], ["Entity loan balance", "$9,000,000"], ["Levered IRR", "14.0%"], ...BUILDING],
      "100% tenant-in-common interests",
    );
    const ra = buyBoxRead("multifamily", dealCheckSource(all, null, null), { ...BOX, minIrrPct: 15 });
    for (const label of ["Going-in cap", "Target return"]) {
      const detail = checkOf(ra, label)?.detail ?? "";
      expect(detail, label).toContain(
        "beside the loan on the property, the price for all the tenant-in-common interests is the equity's whole, nothing grossed up, not the building's",
      );
      expect(detail, label).not.toMatch(/grossed up is|this interest|its entity/);
    }
    expect(checkOf(ra, "Target return")?.detail).toContain("not read as these interests' return");
  });
});
