import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import type {
  ExtractionResult,
  BrokerCompsResult,
  FirstSignal,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { previousScreenResults, verdictBehind } from "@/lib/screen-run";
import { shownAssetClass } from "@/lib/pipeline-slots";
import { SHARE_REFUSAL_COPY, resolveShare } from "@/lib/share-resolve";
import { Expired, ShareView } from "./share-view";
import { storedFloodShortLine, type SiteFlagsResult } from "@/lib/site-flags/core";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT } from "@/lib/deal-picture";
import { SHARE_AERIAL } from "@/lib/image-frames";
import { SITE_NAME } from "@/lib/page-meta";
import { PLAIN_CARD } from "@/lib/public-pages";
import type { SharePictureSource } from "./share-picture";
import { regulationForDeal } from "@/lib/rent-regulation";

/** The aerial's credit on the public screen: The National Map is a US
 *  federal work in the public domain, and the line says so. */
const SHARE_AERIAL_CREDIT = "aerial imagery: USGS The National Map (public domain)";

// Every render checks expiry/revocation against the database.
export const dynamic = "force-dynamic";

// Shared screens are for the people holding the link, not search engines.
// The link's preview says what it is and nothing of the deal: a page that
// states no openGraph or twitter inherits the root layout's whole, so a
// shared screen had gone out in chat apps as the homepage's advert ("Stop
// underwriting like a coin flip…"). It never names the deal or draws its
// figures or picture — a chat app caches a preview past the link's
// revocation — so the picture is the site's plain card (lib/plain-card).
const SHARED_TITLE = "A deal screen shared with you";
const SHARED_DESCRIPTION = "A read-only deal screen, shared by its sender from Underwrite Copilot.";
export const metadata: Metadata = {
  title: SHARED_TITLE,
  description: SHARED_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SHARED_TITLE,
    description: SHARED_DESCRIPTION,
    images: [PLAIN_CARD],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARED_TITLE,
    description: SHARED_DESCRIPTION,
    images: [PLAIN_CARD],
  },
};

/**
 * The loader for the read-only shared screen. The token's resolution — its
 * shape, the link's expiry and revocation, the deal, the sender's standing
 * access — is `resolveShare` (lib/share-resolve), shared with the
 * token-scoped picture and aerial routes so the picture can never outlive
 * the page. The markup is `ShareView` (share-view.tsx), pure so the render
 * tests draw it on fixtures.
 */
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

  // The sender's latest screen may have failed before reaching the verdict,
  // or still be running toward it: the call shown then belongs to the
  // previous completed screen, and so may the comp and market reads — say
  // so, the same way the sender's own deal page does (lib/screen-run).
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
          },
        ]
      : []),
    // The one frame the aerial route draws (lib/image-frames).
    ...(address?.label
      ? [
          {
            kind: "aerial" as const,
            src: `/api/share/${token}/aerial?w=${SHARE_AERIAL.w}&h=${SHARE_AERIAL.h}`,
            credit: SHARE_AERIAL_CREDIT,
          },
        ]
      : []),
  ];
  const picture = sources.length > 0 ? { sources, place: address?.label || deal.name } : null;
  const behind = verdictBehind(latestJob);
  const previous = previousScreenResults(latestJob);
  // The rent rules that reach the building (lib/rent-regulation), through the
  // one call every surface makes, at the address the sender's page reads the
  // deal at, on this page's UTC day — handed to the view with that day, since
  // the view reads no clock.
  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const regulation = regulationForDeal(
    {
      extraction,
      address: addressUpgrade(deal.address, extraction) ?? address,
      siteFlags: (deal.site_flags as SiteFlagsResult | null) ?? null,
      assetClass: (deal.asset_class as string | null) ?? null,
    },
    today,
  );

  return (
    <ShareView
      dealName={deal.name}
      // The class as every page shows it: the sender's where they filed one,
      // the deck's where they left "Auto" (which read as no class here).
      assetClass={shownAssetClass(deal.asset_class ?? null, (deal.extraction as ExtractionResult | null) ?? null) || null}
      expiresAt={expiresAt}
      verdictStale={behind != null}
      staleWhy={behind ?? "failed"}
      staleReads={(["comps", "market"] as const).filter((k) => previous.has(k))}
      picture={picture}
      extraction={(deal.extraction as ExtractionResult | null) ?? null}
      // The kind of deal as the sender's page reads it: the extraction and
      // the first signal.
      firstSignal={(deal.first_signal as FirstSignal | null) ?? null}
      comps={(deal.comps as BrokerCompsResult | null) ?? null}
      market={(deal.market as MarketResult | null) ?? null}
      verdict={deal.verdict as VerdictResult}
      // FEMA's zone at the building from the stored lookup (#426): nothing
      // while it is pending or has nothing to say, and nothing where it was
      // made for an address the deal has since changed from — read against
      // the address the sender's page reads the deal at, as that page does.
      floodLine={storedFloodShortLine(
        (deal.site_flags as SiteFlagsResult | null) ?? null,
        (addressUpgrade(deal.address, (deal.extraction as ExtractionResult | null) ?? null) ?? address)?.label,
      )}
      regulation={regulation}
      today={today}
    />
  );
}
