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
 * token-scoped aerial route so the picture can never outlive the page. The
 * markup is `ShareView` (share-view.tsx), pure so the render tests draw it
 * on fixtures.
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

  // The building from above, when the deal has a place to frame. The route
  // is scoped by the same token, so the picture lives exactly as long as the
  // link does.
  const address = (deal.address as StructuredAddress | null) ?? null;
  const aerial = address?.label
    ? { src: `/api/share/${token}/aerial?w=960&h=400`, place: address.label }
    : null;

  return (
    <ShareView
      dealName={deal.name}
      assetClass={deal.asset_class ?? null}
      expiresAt={expiresAt}
      verdictStale={staleAfterFailure(latestJob).has("verdict")}
      aerial={aerial}
      extraction={(deal.extraction as ExtractionResult | null) ?? null}
      comps={(deal.comps as BrokerCompsResult | null) ?? null}
      market={(deal.market as MarketResult | null) ?? null}
      verdict={deal.verdict as VerdictResult}
    />
  );
}
