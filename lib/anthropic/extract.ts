import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "./client";
import { structured } from "./failure";
import { MODELS, MAX_TOKENS } from "./models";
import { ANALYST_SYSTEM, extractionInstruction } from "./prompts";
import { omDocument, omRequestOptions, type OmSource } from "./om-source";
import { todayLine } from "./today";
import type { AssetClass, ExtractionResult } from "./types";

// The schema Claude must fill. `zodOutputFormat` turns this into a strict
// JSON-schema the model is FORCED to match, so the result is always valid —
// no "please respond with JSON" guesswork, no parsing failures.
const ExtractionSchema = z.object({
  dealName: z.string(),
  assetClass: z.string(),
  market: z.string(),
  address: z.string(),
  // The OM's total page count, as the model sees the native PDF. Used to
  // VALIDATE cited pages (a byte-level counter mis-reads object-stream and
  // bookmarked PDFs); 0 if the model can't tell.
  totalPages: z.number(),
  // What kind of deal this is. Read BEFORE the figures, because it decides
  // what they mean: a stabilized pro forma on a conversion is a yield on
  // total cost years out, not a going-in cap on the price.
  strategy: z.object({
    kind: z.enum(["stabilized", "value_add", "lease_up", "conversion", "development", "unknown"]),
    summary: z.string(),
    capitalBudget: z.string(),
    timeline: z.string(),
  }),
  // WHAT IS BEING SOLD, read before the figures for the same reason as the
  // strategy: the price of a 49% stake or of a discounted note set against
  // the whole building's NOI is a cap rate nobody earns. Read by lib/interest.
  interest: z.object({
    kind: z.enum(["fee_simple", "leasehold", "leased_fee", "note", "partial_interest", "unknown"]),
    summary: z.string(),
    share: z.string(),
    groundLease: z.string(),
    loan: z.string(),
    page: z.string(),
  }),
  // WHETHER A COVENANT OR A CONTRACT SETS THE RENTS (#453): a LIHTC
  // regulatory agreement, a Section 8 HAP contract, a bond set-aside, a tax
  // exemption's covenant — only a recorded restriction or a contract, never
  // marketing words, and an empty list on a market-rate deal. Read by
  // lib/affordable.
  affordable: z.object({
    programs: z.array(z.enum(["lihtc", "section8", "bond", "tax_exemption", "inclusionary", "other"])),
    summary: z.string(),
    agreement: z.string(),
    assistance: z.string(),
    tiers: z.array(
      z.object({
        label: z.string(),
        units: z.string(),
        rent: z.string(),
        maxRent: z.string(),
      }),
    ),
    page: z.string(),
  }),
  // WHETHER ONE TENANT LEASES THE WHOLE PROPERTY (#454): a single-tenant
  // net lease, a build-to-suit, a sale-leaseback — the tenant, its
  // guarantor and the lease's own words; a blank tenant on a multi-tenant
  // or vacant property and on a leased fee. The lease's figures are rows.
  // Read by lib/single-tenant.
  singleTenant: z.object({
    tenant: z.string(),
    guarantor: z.string(),
    leaseType: z.string(),
    landlordObligations: z.string(),
    tenantRights: z.string(),
    page: z.string(),
  }),
  // WHAT A HOTEL IS SOLD WITH (#455): the flag, the franchise, the
  // management, whether the sale is encumbered by them, and the brand's
  // PIP — as stated; blank on anything but a hotel. The PIP, the
  // agreements' ends and the room figures are rows. Read by lib/hotel-deal.
  hotel: z.object({
    brand: z.string(),
    franchise: z.string(),
    management: z.string(),
    encumbrance: z.enum(["unencumbered", "brand", "management", "brand_and_management", "unknown"]),
    pip: z.string(),
    page: z.string(),
  }),
  // HOW THE PROPERTY IS SOLD (#456): negotiated, at auction, by a
  // receiver, out of a bankruptcy or by a lender (REO) — with its terms and
  // the condition it is sold in, as stated. The auction's figures are rows.
  // Read by lib/sale-terms.
  sale: z.object({
    method: z.enum(["negotiated", "auction", "receivership", "bankruptcy", "reo", "unknown"]),
    terms: z.string(),
    condition: z.string(),
    page: z.string(),
  }),
  // THE MAJOR TENANTS OF A MULTI-TENANT PROPERTY (#457), as its tenant
  // summary lists them — each with what the OM states for THAT tenant and
  // "" where it states nothing, an anchor the OM says is not part of the
  // offering marked so; an empty list on a single-tenant property, housing,
  // a hotel, storage and land. Read by lib/tenant-roster.
  tenants: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["anchor", "inline", "outparcel", "other"]),
      inSale: z.enum(["yes", "no", "unknown"]),
      sf: z.string(),
      rent: z.string(),
      leaseExpiration: z.string(),
      options: z.string(),
      earlyTermination: z.string(),
      rights: z.string(),
      page: z.string(),
    }),
  ),
  // THE LISTING TEAM (#467): the brokers the OM names to contact, each as
  // printed and "" where it prints nothing; an empty list where it names
  // no one. Read by lib/offering.
  listingTeam: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      firm: z.string(),
      phone: z.string(),
      email: z.string(),
      page: z.string(),
    }),
  ),
  // Each property of a PORTFOLIO OM (two or more separately addressed
  // buildings or sites), with what the OM states for THAT property and ""
  // where it states nothing; an empty list for a single-property OM. The
  // whole portfolio's figures stay in `metrics`. Read by lib/portfolio.
  properties: z.array(
    z.object({
      name: z.string(),
      address: z.string(),
      count: z.string(),
      area: z.string(),
      noi: z.string(),
      occupancy: z.string(),
      yearBuilt: z.string(),
      allocatedPrice: z.string(),
      page: z.string(),
    }),
  ),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      flagged: z.boolean(),
      page: z.string(),
      basis: z.enum(["in_place", "pro_forma", "na"]),
      // ≤10-word verbatim quote of the surrounding text, for the source-chip
      // hover. Empty when the model can't quote it — never invented.
      locatorSnippet: z.string(),
    }),
  ),
});

/**
 * Send the OM PDF to Claude and extract the key terms. The PDF is read natively
 * (Claude sees the actual pages, text + layout), and the output is constrained
 * to the schema above.
 */
export async function extractTerms(
  om: OmSource,
  assetClass: AssetClass,
): Promise<ExtractionResult> {
  const client = getAnthropic();

  const out = await structured("Extraction", () => client.messages.parse({
    model: MODELS.extraction,
    max_tokens: MAX_TOKENS.extraction,
    system: ANALYST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          // Document first, then the instruction (recommended ordering).
          // The cache_control inside omDocument caches the prefix up to here —
          // the system prompt + this OM — so the next pipeline steps
          // (challenge / comps / market), which re-send the same OM
          // back-to-back, read it from cache at a fraction of the input cost.
          omDocument(om),
          { type: "text", text: extractionInstruction(assetClass) },
          // Today's date rides last, after the cached prefix
          // (lib/anthropic/today).
          { type: "text", text: todayLine() },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  }, omRequestOptions(om)));

  return {
    dealName: out.dealName.trim() ? out.dealName.trim() : null,
    assetClass: out.assetClass,
    market: out.market,
    // The buy-box market check matches against market AND address — dropping
    // this field made "Dallas" fail on a deal whose street address is Dallas.
    address: out.address,
    totalPages: Number.isFinite(out.totalPages) && out.totalPages > 0 ? Math.round(out.totalPages) : 0,
    strategy: {
      kind: out.strategy.kind,
      summary: out.strategy.summary.trim(),
      capitalBudget: out.strategy.capitalBudget.trim(),
      timeline: out.strategy.timeline.trim(),
    },
    interest: {
      kind: out.interest.kind,
      summary: out.interest.summary.trim(),
      share: out.interest.share.trim(),
      groundLease: out.interest.groundLease.trim(),
      loan: out.interest.loan.trim(),
      page: out.interest.page.trim(),
    },
    affordable: {
      // Each program once, whatever the model repeated.
      programs: [...new Set(out.affordable.programs)],
      summary: out.affordable.summary.trim(),
      agreement: out.affordable.agreement.trim(),
      assistance: out.affordable.assistance.trim(),
      tiers: out.affordable.tiers
        .map((t) => ({ label: t.label.trim(), units: t.units.trim(), rent: t.rent.trim(), maxRent: t.maxRent.trim() }))
        .filter((t) => t.label || t.units),
      page: out.affordable.page.trim(),
    },
    singleTenant: {
      tenant: out.singleTenant.tenant.trim(),
      guarantor: out.singleTenant.guarantor.trim(),
      leaseType: out.singleTenant.leaseType.trim(),
      landlordObligations: out.singleTenant.landlordObligations.trim(),
      tenantRights: out.singleTenant.tenantRights.trim(),
      page: out.singleTenant.page.trim(),
    },
    hotel: {
      brand: out.hotel.brand.trim(),
      franchise: out.hotel.franchise.trim(),
      management: out.hotel.management.trim(),
      encumbrance: out.hotel.encumbrance,
      pip: out.hotel.pip.trim(),
      page: out.hotel.page.trim(),
    },
    sale: {
      method: out.sale.method,
      terms: out.sale.terms.trim(),
      condition: out.sale.condition.trim(),
      page: out.sale.page.trim(),
    },
    // A one-entry list is one tenant restated, not a roster; the roster's
    // reader drops it too, and a nameless entry.
    tenants:
      (out.tenants ?? []).length >= 2
        ? out.tenants
            .map((t) => ({
              name: t.name.trim(),
              role: t.role,
              inSale: t.inSale,
              sf: t.sf.trim(),
              rent: t.rent.trim(),
              leaseExpiration: t.leaseExpiration.trim(),
              options: t.options.trim(),
              earlyTermination: t.earlyTermination.trim(),
              rights: t.rights.trim(),
              page: t.page.trim(),
            }))
            .filter((t) => t.name)
        : [],
    // Every broker named, at most six — a contacts page names two to four.
    listingTeam: (out.listingTeam ?? [])
      .map((b) => ({
        name: b.name.trim(),
        title: b.title.trim(),
        firm: b.firm.trim(),
        phone: b.phone.trim(),
        email: b.email.trim(),
        page: b.page.trim(),
      }))
      .filter((b) => b.name)
      .slice(0, 6),
    // A one-entry list is a single property restated, not a portfolio.
    properties:
      (out.properties ?? []).length >= 2
        ? out.properties.map((p) => ({
            name: p.name.trim(),
            address: p.address.trim(),
            count: p.count.trim(),
            area: p.area.trim(),
            noi: p.noi.trim(),
            occupancy: p.occupancy.trim(),
            yearBuilt: p.yearBuilt.trim(),
            allocatedPrice: p.allocatedPrice.trim(),
            page: p.page.trim(),
          }))
        : [],
    metrics: out.metrics.map((m) => ({
      ...m,
      // Guard the ≤10-word cap even if the model over-quotes.
      locatorSnippet: m.locatorSnippet?.split(/\s+/).slice(0, 10).join(" ") ?? "",
    })),
  };
}
