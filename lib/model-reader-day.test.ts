// Research pass 40, item 14: the model's lines read the reader's day. The
// derivation's dated readers (a lease's end, a note's maturity, a bid
// deadline) read the server's clock, while the deal page draws the same
// reader's panel on the reader's day (`readerNoon`, lib/reader-day): for a
// reader in Los Angeles at 8 pm, the server's UTC day is already tomorrow,
// and a lease ending today read as ended in the model's line beside a panel
// saying it ends today. The derivation now takes the caller's day
// (DealForModel.asOf). Every name is invented.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { readSingleTenant, singleTenantModelLine } from "@/lib/single-tenant";

const row = (label: string, value: string, page = "p. 4") => ({ label, value, flagged: false, page, basis: "na" as const });
// A single tenant's lease that ends on the reader's day, October 5, 2026.
const LEASE: ExtractionResult = {
  dealName: "Walgreens | Tulsa, OK",
  assetClass: "net_lease",
  totalPages: 30,
  singleTenant: {
    tenant: "Walgreens Co.",
    guarantor: "Walgreens Boots Alliance, Inc.",
    leaseType: "Absolute NNN",
    landlordObligations: "",
    tenantRights: "",
    page: "p. 4",
  },
  metrics: [
    row("Asking price", "$6,500,000", "p. 2"),
    row("Going-in cap rate", "6.00%", "p. 2"),
    row("Lease expiration", "October 5, 2026"),
    row("Rent increases", "Flat"),
  ],
} as unknown as ExtractionResult;

describe("the model's lines read the reader's day (research pass 40, item 14)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a lease ending on the reader's day reads the same in the panel's sentence and in the model's line", () => {
    // 8 pm in Los Angeles on October 5 is 3 am UTC on October 6.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T03:00:00Z"));
    const readerNoon = new Date("2026-10-05T12:00:00Z");
    const derived = deriveUnderwriteInputs(LEASE, "x", undefined, undefined, { asOf: readerNoon });
    // The deal page's panel: the lease read on the reader's noon, its model
    // line struck on the derived model's own figures.
    const lease = readSingleTenant(LEASE, readerNoon)!;
    const panel = singleTenantModelLine(lease, {
      holdMonths: derived.inputs.holdMonths,
      rentGrowthPct: derived.inputs.rentGrowthPct,
      vacancyPct: derived.inputs.vacancyPct,
      exitCapPct: derived.inputs.exitCapPct,
    });
    expect(derived.meta.singleTenant?.read).toBe(panel);
    // And it is the reader's day's sentence, not the server's: the same
    // lease read on the server's UTC day says another thing.
    const serverDay = singleTenantModelLine(readSingleTenant(LEASE, new Date())!, {
      holdMonths: derived.inputs.holdMonths,
      rentGrowthPct: derived.inputs.rentGrowthPct,
      vacancyPct: derived.inputs.vacancyPct,
      exitCapPct: derived.inputs.exitCapPct,
    });
    expect(serverDay).not.toBe(panel);
  });
});
