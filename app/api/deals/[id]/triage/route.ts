import { type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import {
  evaluateBuyBox,
  buyBoxCheckSource,
  foldBuyBoxChecks,
} from "@/lib/criteria";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same fit vocabulary the pipeline table persists ("outside", not "miss").
export type TriageFit =
  | "fits"
  | "near"
  | "outside"
  | "unverified"
  | "nobox"
  | "pending";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Instant buy-box triage for a deal mid-screen: judged against the full
 * extraction when it's in, else the ~30s first signal. The batch panel polls
 * this so a call-for-offers stack self-sorts before the deep screens finish.
 * RLS scopes the read to the caller's own deals.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ fit: "pending" as TriageFit }, { headers: NO_STORE });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { fit: "pending" as TriageFit },
      { status: 401, headers: NO_STORE },
    );
  }

  const { data: deal } = await supabase
    .from("deals")
    .select("id, asset_class, address, first_signal, extraction, user_id, team_id")
    .eq("id", id)
    .maybeSingle();
  if (!deal) {
    return Response.json(
      { fit: "pending" as TriageFit },
      { status: 404, headers: NO_STORE },
    );
  }

  let fit: TriageFit;
  let provisional = true;
  try {
    const box = await getBuyBoxForDeal(
      deal.user_id as string,
      (deal.team_id as string) ?? null,
    );
    if (!box) {
      fit = "nobox";
    } else {
      const extraction = (deal.extraction as ExtractionResult | null) ?? null;
      const source = buyBoxCheckSource(
        extraction,
        (deal.first_signal as FirstSignal | null) ?? null,
        (deal.address as StructuredAddress | null) ?? null,
      );
      provisional = !extraction;
      if (!source) {
        fit = "pending";
      } else {
        // The pipeline table's exact fold — adjacent surfaces must agree.
        fit =
          foldBuyBoxChecks(
            evaluateBuyBox((deal.asset_class as string) ?? "auto", source, box),
          ) ?? "unverified";
      }
    }
  } catch (err) {
    // Eternal "pending" chips with silent logs would be undebuggable.
    console.error(`triage failed for deal ${id}:`, err);
    fit = "pending";
  }

  return Response.json({ fit, provisional }, { headers: NO_STORE });
}
