import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ExtractionResult,
  BrokerCompsResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { staleAfterFailure } from "@/lib/screen-run";
import { senderStillHasAccess } from "@/lib/share-access";
import { Expired, ShareView } from "./share-view";

// Every render checks expiry/revocation against the database.
export const dynamic = "force-dynamic";

// Shared screens are for the people holding the link, not search engines.
export const metadata: Metadata = {
  title: "Shared deal screen",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Module-scope on purpose: the page is force-dynamic, and the react-hooks
// purity rule (correctly) refuses clock reads inside a component render.
function linkExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * The loader for the read-only shared screen: the token, the link's expiry
 * and revocation, the deal, the sender's standing access and the latest
 * run's state. The markup is `ShareView` (share-view.tsx), pure so the
 * render tests draw it on fixtures.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_RE.test(token)) {
    return <Expired reason="The link looks malformed — ask the sender to copy it again." />;
  }

  const admin = createSupabaseAdminClient();
  const { data: share } = await admin
    .from("deal_shares")
    .select("id, deal_id, expires_at, revoked, created_by")
    .eq("id", token)
    .maybeSingle();

  if (!share) {
    return <Expired reason="The link doesn't exist — ask the sender for a fresh one." />;
  }
  if (share.revoked) {
    return <Expired reason="The sender revoked this link." />;
  }
  if (linkExpired(share.expires_at as string)) {
    return <Expired reason="The link expired — share links live for 30 days. Ask the sender for a fresh one." />;
  }

  const { data: deal } = await admin
    .from("deals")
    .select("name, asset_class, extraction, comps, market, verdict, updated_at, user_id, team_id")
    .eq("id", share.deal_id as string)
    .maybeSingle();
  if (!deal?.verdict) {
    return <Expired reason="The deal behind this link is no longer available." />;
  }
  // The link is only as good as its sender's own access: a teammate who has
  // since left (or been removed) must not keep reading the deal through a
  // link they minted while they were on the team.
  if (!(await senderStillHasAccess(admin, share.created_by as string | null, deal))) {
    return <Expired reason="The sender no longer has access to this deal." />;
  }
  // The sender's latest screen may have failed before reaching the verdict:
  // the call shown then belongs to the previous completed screen — say so,
  // the same way the sender's own deal page does.
  const { data: latestJob } = await admin
    .from("analysis_jobs")
    .select("status, step")
    .eq("deal_id", share.deal_id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <ShareView
      dealName={deal.name as string}
      assetClass={(deal.asset_class as string | null) ?? null}
      expiresAt={share.expires_at as string}
      verdictStale={staleAfterFailure(latestJob).has("verdict")}
      extraction={(deal.extraction as ExtractionResult | null) ?? null}
      comps={(deal.comps as BrokerCompsResult | null) ?? null}
      market={(deal.market as MarketResult | null) ?? null}
      verdict={deal.verdict as VerdictResult}
    />
  );
}
