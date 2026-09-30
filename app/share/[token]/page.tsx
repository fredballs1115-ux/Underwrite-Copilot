import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StructuredAddress } from "@/lib/address";
import type {
  ExtractionResult,
  BrokerCompsResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { staleAfterFailure } from "@/lib/screen-run";
import { SHARE_REFUSAL_COPY, resolveShare } from "@/lib/share-resolve";
import { Expired, ShareView } from "./share-view";
import { floodShortLine, type SiteFlagsResult } from "@/lib/site-flags/core";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT } from "@/lib/deal-picture";
import type { SharePictureSource } from "./share-picture";

/** The aerial's credit on the public screen: The National Map is a US
 *  federal work in the public domain, and the line says so. */
const SHARE_AERIAL_CREDIT = "aerial imagery: USGS The National Map (public domain)";

// Every render checks expiry/revocation against the database.
export const dynamic = "force-dynamic";

// Shared screens are for the people holding the link, not search engines.
export const metadata: Metadata = {
  title: "Shared deal screen",
  robots: { index: false, follow: false },
};

/**
 * The loader for the read-only shared screen. The token's resolution — its
 * shape, the link's expiry and revocation, the deal, the sender's standing
 * access — is `resolveShare` (lib/share-resolve), shared with the
 * token-scoped picture and aerial routes so the picture can never outlive
 * the page. The markup is `ShareView` (share-view.tsx), pure so the render
 * tests draw it on fixtures.
 */
/** FEMA's flood zone at the building from the stored lookup, one line
 *  (#426); null while the lookup is pending or has nothing to say. */
function floodLineOf(raw: unknown): string | null {
  const flags = (raw as SiteFlagsResult | null) ?? null;
  if (!flags || flags.status === "pending") return null;
  return floodShortLine(flags.flood);
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const resolved = await resolveShare(admin, token);
  if (!resolved.ok) return <Expired reason={SHARE_REFUSAL_COPY[resolved.reason]} />;
  const { dealId, expiresAt, deal } = resolved.share;

  // The sender's latest screen may have failed before reaching the verdict:
  // the call shown then belongs to the previous completed screen — say so,
  // the same way the sender's own deal page does.
  const { data: latestJob } = await admin
    .from("analysis_jobs")
    .select("status, step")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The building (#434): its own photograph where the deal has one — the
  // order the sender's deal page leads with — then the aerial where the deal
  // has a place to frame. Each route is scoped by the same token, so the
  // picture lives exactly as long as the link does, and each carries its own
  // credit, so the line under the frame is the picture in it.
  const address = (deal.address as StructuredAddress | null) ?? null;
  const stored = ((deal.photo as DealVisualCache | null) ?? null)?.picture ?? null;
  const sources: SharePictureSource[] = [
    ...(stored
      ? [
          {
            kind: "photo" as const,
            src: `/api/share/${token}/picture?size=hero`,
            credit: PICTURE_CREDIT[stored.source],
            // Its colours before its pixels (#463).
            preview: stored.preview ?? null,
            // Where its subject is: the strip crops it there, not at its centre.
            focus: stored.focus ?? null,
          },
        ]
      : []),
    ...(address?.label
      ? [{ kind: "aerial" as const, src: `/api/share/${token}/aerial?w=960&h=400`, credit: SHARE_AERIAL_CREDIT }]
      : []),
  ];
  const picture = sources.length > 0 ? { sources, place: address?.label || deal.name } : null;

  return (
    <ShareView
      dealName={deal.name}
      assetClass={deal.asset_class ?? null}
      expiresAt={expiresAt}
      verdictStale={staleAfterFailure(latestJob).has("verdict")}
      picture={picture}
      extraction={(deal.extraction as ExtractionResult | null) ?? null}
      comps={(deal.comps as BrokerCompsResult | null) ?? null}
      market={(deal.market as MarketResult | null) ?? null}
      verdict={deal.verdict as VerdictResult}
      floodLine={floodLineOf(deal.site_flags)}
    />
  );
}
