import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { senderStillHasAccess } from "./share-access";

/**
 * One resolution of a share token, for the shared page AND for the
 * token-scoped routes that serve that page's assets (the aerial). The same
 * six refusals in the same order, so a picture can never be fetched through
 * a link the page itself would refuse — a revoked link, an expired one, one
 * whose sender has since lost the deal.
 *
 * Pure apart from the reads: the clock is a parameter, the client is the
 * caller's, so the tests drive it with a fake admin client.
 */
export type ShareRefusal =
  | "malformed"
  | "missing"
  | "revoked"
  | "expired"
  | "unavailable"
  | "sender_lost_access";

/** What the page says for each refusal — one sentence the holder can act on. */
export const SHARE_REFUSAL_COPY: Record<ShareRefusal, string> = {
  malformed: "The link looks malformed — ask the sender to copy it again.",
  missing: "The link doesn't exist — ask the sender for a fresh one.",
  revoked: "The sender revoked this link.",
  expired:
    "The link expired — share links live for 30 days. Ask the sender for a fresh one.",
  unavailable: "The deal behind this link is no longer available.",
  sender_lost_access: "The sender no longer has access to this deal.",
};

/** The deal columns a share may read: the screen's results, the address
 *  and the visual cache (for the aerial), and the ownership the sender check
 *  needs. Never the OM's storage path, the notes, the model or the buy box. */
export const SHARED_DEAL_COLUMNS =
  "name, asset_class, address, photo, extraction, comps, market, verdict, updated_at, user_id, team_id";

export interface SharedDealRow {
  name: string;
  asset_class: string | null;
  address: unknown;
  photo: unknown;
  extraction: unknown;
  comps: unknown;
  market: unknown;
  verdict: unknown;
  updated_at: string | null;
  user_id: string | null;
  team_id: string | null;
}

export interface ResolvedShare {
  token: string;
  dealId: string;
  /** the link's expiry, ISO */
  expiresAt: string;
  deal: SharedDealRow;
}

export type ShareResolution =
  | { ok: true; share: ResolvedShare }
  | { ok: false; reason: ShareRefusal };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveShare(
  admin: SupabaseClient,
  token: string,
  now: number = Date.now(),
): Promise<ShareResolution> {
  if (!UUID_RE.test(token)) return { ok: false, reason: "malformed" };

  const { data: share } = await admin
    .from("deal_shares")
    .select("id, deal_id, expires_at, revoked, created_by")
    .eq("id", token)
    .maybeSingle();
  if (!share) return { ok: false, reason: "missing" };
  if (share.revoked) return { ok: false, reason: "revoked" };
  if (new Date(share.expires_at as string).getTime() < now) {
    return { ok: false, reason: "expired" };
  }

  const { data: deal } = await admin
    .from("deals")
    .select(SHARED_DEAL_COLUMNS)
    .eq("id", share.deal_id as string)
    .maybeSingle();
  // A deal that was deleted, or never reached a verdict, has nothing to show.
  if (!deal?.verdict) return { ok: false, reason: "unavailable" };

  // The link is only as good as its sender's own access: a teammate who has
  // since left (or been removed) must not keep reading the deal through a
  // link they minted while they were on the team.
  if (!(await senderStillHasAccess(admin, share.created_by as string | null, deal))) {
    return { ok: false, reason: "sender_lost_access" };
  }

  return {
    ok: true,
    share: {
      token,
      dealId: share.deal_id as string,
      expiresAt: share.expires_at as string,
      deal: deal as SharedDealRow,
    },
  };
}
