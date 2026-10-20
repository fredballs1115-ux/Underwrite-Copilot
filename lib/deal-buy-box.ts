import "server-only";
// The buy box a deal is judged against, for every surface that judges one
// deal: the deal page (its header's fit chip, its Buy box tab, the
// playground's max bid and live fit, the sale's ceiling, the 1031 chip),
// the memo, the full report and the workbook. A deal of the reader's own is
// judged against the box that applies to it (lib/criteria-server: the
// team's on a team deal, the creator's otherwise). The sample deal is
// judged against the public sample's box (lib/sample-deal
// `SAMPLE_DEMO_BOX`), whoever reads it, so the signed-in sample shows the
// fit, the checks and the max bid the homepage's walkthrough and /demo
// show — the owner's rule that the three surfaces say one thing.
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import type { BuyBox } from "@/lib/criteria";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";

export async function buyBoxForDealRow(
  row: { is_sample?: boolean | null; user_id: string; team_id: string | null },
  opts?: { strict?: boolean },
): Promise<BuyBox | null> {
  if (row.is_sample) return SAMPLE_DEMO_BOX;
  return getBuyBoxForDeal(row.user_id, row.team_id, opts);
}
