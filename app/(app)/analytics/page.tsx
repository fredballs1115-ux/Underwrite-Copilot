import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { shownAssetClass } from "@/lib/asset-class";
import {
  analyticsScope,
  deriveAnalytics,
  fmtUsdCompact,
  goRateText,
  middleRead,
  middleText,
  parsedPhrase,
  stageCountLine,
  stageCounts,
  marketRows,
  marketCount,
  BROKER_ROWS_SHOWN,
  unitTileSub,
  type AnalyticsRow,
} from "@/lib/analytics";
import { STAGES, STAGE_LABEL, normalizeStage, parseStageHistory } from "@/lib/stages";
import { deathReasons } from "@/lib/deal-outcome";
import { brokerDealFit, brokerScorecard, dealFirms } from "@/lib/brokerage";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox } from "@/lib/criteria";
import { scoreMandateFit } from "@/lib/mandate";
import { dealCheckSource } from "@/lib/buy-box-chip";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import { getTeam } from "@/lib/teams";
import { isPlanDeal } from "@/lib/deal-strategy";
import { pctText } from "@/lib/plan-facts";
import { ANALYTICS_MIN_DEALS, AnalyticsEmptyPicture, DotTimeline, VerdictMix, StageFunnel } from "./charts";
import { MarketTable } from "./market-table";
import { BrokerageTable } from "./brokerage-table";
import { readAll, readAllResult } from "@/lib/read-all";
import { typedByHand } from "@/lib/manual-deal";
import type { Challenge, ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import type { RentRollSummary } from "@/lib/actuals/types";
import { t12SummaryOf } from "@/lib/actuals/analyze";
import { askingPriceOf } from "@/lib/deal-strategy";
import { accountRecord, arrivalOf, scoreDeal, type PriorScreenLike } from "@/lib/track-record";
import { stabilizedVacancyStated } from "@/lib/stress-test";
import { TrackRecordSection } from "./track-record";

/** A stored rent roll or T-12 row as the track record reads it. */
interface ActualsRowLike {
  id: string;
  deal_id: string;
  as_of_date?: string | null;
  period_end_date?: string | null;
  summary?: unknown;
  created_at?: string | null;
  source_document_id?: string | null;
}

export const metadata: Metadata = { title: "Analytics" };

// A going-in cap and a yield on cost to two decimals, as each deal's own
// header and pipeline card print it (lib/plan-facts): a dot labelled "5.5%"
// was a deal whose card said "5.45%".
const pct = pctText;

/**
 * Portfolio analytics: what the user's own screens add up to. Every number
 * derives from figures the pipeline actually extracted — deals whose figure
 * didn't parse simply don't plot, and the sample deal never counts.
 */
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/analytics");

  const supabase = await createSupabaseServerClient();
  // Every screened deal the reader can see — their own and their team's, as
  // row-level security hands them over — newest first, a page at a time
  // (lib/read-all). The read had been the OLDEST 300: past them every newer
  // screen, the ones a reader looks for, was missing from every figure, and
  // nothing said so (research pass 42).
  const { data, error } = await readAllResult<
    AnalyticsRow & { user_id?: string | null; stage_history?: unknown; address?: unknown; team_id?: string | null; challenges?: unknown; prior_screen?: unknown }
  >((from, to) =>
    supabase
      .from("deals")
      // The first signal too: the deal's kind is read with it, as on its page.
      // The stage moves too: why each dead deal died (lib/deal-outcome).
      // …and the address and the team, for each deal's buy-box fit by its
      // brokerage, judged as the pipeline judges it.
      // …and the challenges, which the track record scores against what
      // arrived after each screen (lib/track-record) — with the previous
      // screen's snapshot, whose challenges score against what arrived
      // between the two screens.
      .select("id, name, asset_class, created_at, is_sample, stage, verdict, user_id, team_id, address, stage_history, challenges, extraction, first_signal, prior_screen")
      .not("extraction", "is", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (error || !data) {
    throw new Error(`Couldn't load your portfolio: ${(error as { message?: string } | null)?.message ?? "the read failed"}`);
  }

  const deals = deriveAnalytics(data);
  // Whose screens the figures are, as the read finds them: the page says
  // the team's where any is among them, never "an OM you ran" over a
  // teammate's deal. Counted as deriveAnalytics counts: screened, not the
  // sample.
  const pooled = data.filter((r) => !r.is_sample && r.extraction != null);
  const own = pooled.filter((r) => r.user_id === user.id).length;
  // A deal typed by hand was extracted from no OM, and the words say so.
  const typed = pooled.filter((r) => typedByHand(r.extraction as ExtractionResult | null)).length;
  const capPoints = deals
    .filter((d) => d.capPct != null)
    .map((d) => ({ at: d.at, value: d.capPct!, name: d.name, id: d.id }));
  // A standing multifamily building's price per unit only: a plan deal's
  // all-in cost per unit is another basis (lib/analytics
  // `costPerUnit`), and the two pooled had read as one median.
  const unitPoints = deals
    .filter((d) => d.perUnit != null)
    .map((d) => ({ at: d.at, value: d.perUnit!, name: d.name, id: d.id }));
  const planCostCount = deals.filter((d) => d.costPerUnit != null).length;
  // Plan deals have no going-in cap — their stabilized figure is the finished
  // project's, judged on yield on total cost — so they sit outside the cap
  // series and are counted, and read, on their own.
  const planDeals = deals.filter((d) => isPlanDeal(d.kind));
  // A median needs three figures (lib/public-comps' floor, through
  // lib/analytics `middleRead`); one or two are said as what they are.
  const yocValues = planDeals.map((d) => d.yieldOnCostPct).filter((v): v is number => v != null);
  const yocRead = middleRead(yocValues);
  const yocText = middleText(yocRead, pct);
  // The plan deals said as the figures cover them: "judged on yield on cost"
  // only where every one has one — five plan deals and a median of two had
  // read as five judged.
  const planPhrase = (() => {
    const n = planDeals.length;
    const counted = `${n} plan deal${n === 1 ? "" : "s"}`;
    const figure = yocText != null ? ` (${yocRead.kind === "median" ? `median ${yocText}` : yocText})` : "";
    if (yocValues.length === n) return `${counted} judged on yield on cost${figure}`;
    if (yocValues.length === 0) return `${counted}, none with a yield on cost`;
    return `${counted}, ${yocValues.length} with a yield on cost${figure}`;
  })();

  // Live is still in play (lib/analytics `stageCounts`, through lib/stages
  // `isOpenStage`): a closed deal is counted as closed, never live.
  const counts = stageCounts(deals);
  const decided = deals.filter((d) => d.verdict !== null);
  // A share only on three calls or more; under that the count (lib/analytics
  // `goRateText`, the scorecard's "1 of 2").
  const goCount = decided.filter((d) => d.verdict === "pass").length;
  const capRead = middleRead(capPoints.map((p) => p.value));
  const unitRead = middleRead(unitPoints.map((p) => p.value));

  const funnel = STAGES.filter((s) => s !== "dead")
    .map((s) => ({
      label: STAGE_LABEL[s] ?? s,
      count: deals.filter((d) => normalizeStage(d.stage) === s).length,
    }))
    .filter((r) => r.count > 0);

  // Markets table — the durable "table view" behind the charts — grouped as
  // /market's own memory groups them (lib/analytics `marketRows`), so one
  // market's spellings are one row on both pages.
  const markets = marketRows(deals);
  // The markets the table leaves off, said under it.
  const marketsMore = marketCount(deals) - markets.length;

  const enough = deals.length >= ANALYTICS_MIN_DEALS;

  // Why deals die (research pass 24, B4): each reason's count over the dead
  // deals, read off the move that killed each one; a dead deal with no
  // reason recorded is counted as such, never folded into one.
  const dying = deathReasons(
    data.filter((r) => !r.is_sample).map((r) => ({ stage: r.stage ?? null, history: parseStageHistory(r.stage_history) })),
  );
  const recordedDeaths = dying.dead - dying.unrecorded;
  const maxReason = Math.max(1, ...dying.reasons.map((r) => r.count));

  // By brokerage (research pass 24, B13): the firms the memoranda name, the
  // deals each sent, how many fit the buy box of the deal's own scope (its
  // team's, else the reader's) and how many the screen called Go — the fit
  // read off the pipeline card's check source (lib/buy-box-chip
  // `dealCheckSource`) and, as the card says it, a call only on the whole
  // box: a fit on part of the box is counted apart (lib/brokerage
  // `brokerDealFit`). A box that cannot be read judges nothing.
  const team = await getTeam(supabase, user.id).catch(() => null);
  const [personalBox, teamBox] = await Promise.all([
    getBuyBoxForDeal(user.id, null).catch(() => null),
    team ? getBuyBoxForDeal("", team.id).catch(() => null) : Promise.resolve(null),
  ]);
  const brokers = brokerScorecard(
    pooled.map((r) => {
      const extraction = r.extraction as ExtractionResult | null;
      const box = r.team_id ? teamBox : personalBox;
      const address = addressUpgrade(r.address, extraction) ?? ((r.address as StructuredAddress | null | undefined) ?? null);
      const source = box ? dealCheckSource(extraction, (r.first_signal as FirstSignal | null) ?? null, address) : null;
      const judged =
        box && source
          ? brokerDealFit(evaluateBuyBox(r.asset_class ?? "auto", source, box), scoreMandateFit(r.asset_class ?? "", source, box))
          : null;
      return {
        firms: dealFirms(extraction),
        fit: judged?.fit ?? null,
        partial: judged?.partial ?? false,
        verdict: (r.verdict as { verdict?: string } | null)?.verdict ?? null,
      };
    }),
  );

  // The track record (lib/track-record): every pooled deal's stored
  // challenges against what arrived AFTER its verdict — its rent roll and
  // T-12 by their documents' upload, the decision and the trade off the
  // move that ended it. Best-effort reads of the actuals tables (0020): on
  // an older schema they error and read as none, and the record is scored
  // on decisions and trades alone.
  const ids = new Set(pooled.map((r) => r.id));
  const [rollRows, t12Rows, docRows] = await Promise.all([
    readAll<ActualsRowLike>((from, to) =>
      supabase.from("deal_rent_rolls").select("id, deal_id, as_of_date, summary, created_at, source_document_id").order("created_at", { ascending: false }).order("id").range(from, to),
    ),
    readAll<ActualsRowLike>((from, to) =>
      supabase.from("deal_t12_statements").select("id, deal_id, period_end_date, summary, created_at, source_document_id").order("created_at", { ascending: false }).order("id").range(from, to),
    ),
    readAll<{ id: string; deal_id: string; created_at: string }>((from, to) =>
      supabase.from("deal_documents").select("id, deal_id, created_at").in("kind", ["rent_roll", "t12"]).order("created_at", { ascending: false }).order("id").range(from, to),
    ),
  ]);
  const newestByDeal = (rows: ActualsRowLike[] | null) => {
    const out = new Map<string, ActualsRowLike>();
    for (const r of rows ?? []) if (ids.has(r.deal_id) && !out.has(r.deal_id)) out.set(r.deal_id, r);
    return out;
  };
  const rollByDeal = newestByDeal(rollRows);
  const t12ByDeal = newestByDeal(t12Rows);
  const docs = docRows ?? [];
  const trackRecord = accountRecord(
    pooled.map((r) => {
      const extraction = r.extraction as ExtractionResult | null;
      const roll = rollByDeal.get(r.id);
      const t12Row = t12ByDeal.get(r.id);
      const t12Summary = t12SummaryOf(t12Row?.summary);
      return scoreDeal({
        screenedAt: (r.verdict as { generatedAt?: string } | null)?.generatedAt ?? null,
        challenges: (r.challenges as { challenges?: Challenge[] } | null)?.challenges,
        priorScreen: (r.prior_screen as PriorScreenLike | null | undefined) ?? null,
        rentRoll: roll?.summary ? { arrivedAt: arrivalOf(roll, docs), dated: roll.as_of_date ?? null, summary: roll.summary as RentRollSummary } : null,
        t12: t12Row && t12Summary ? { arrivedAt: arrivalOf(t12Row, docs), dated: t12Row.period_end_date ?? null, summary: t12Summary } : null,
        stage: r.stage ?? null,
        history: parseStageHistory(r.stage_history),
        askingPrice: askingPriceOf(extraction),
        assetClass: shownAssetClass(r.asset_class as string | null, extraction),
        // The account's record builds no stress test a deal, so it cannot
        // tell whether the market or the documents decided a stabilized
        // vacancy (lib/stress-test `vacancyDecidedBy`, which the deal page
        // reads): every stated one is held back as the market's, and the
        // section says so (lib/track-record `ACCOUNT_VACANCY_NOTE`).
        vacancyHeldToMarket: stabilizedVacancyStated(extraction, (r.first_signal as FirstSignal | null) ?? null),
      });
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted" data-qa="analytics-scope">
          {analyticsScope(own, pooled.length - own, typed)}
        </p>
      </div>

      {!enough ? (
        <section className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center shadow-sm">
          <AnalyticsEmptyPicture screened={deals.length} />
          <h2 className="mt-5 text-lg font-semibold tracking-tight">
            Screen a few deals first
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            Analytics needs at least three screened deals — then cap-rate trends, pricing over time
            and where the funnel thins show here.
          </p>
          <Link
            href="/deals"
            className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Go to the pipeline
          </Link>
        </section>
      ) : (
        <>
          {/* Headline tiles — numbers, not charts. */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Deals screened", value: String(deals.length), sub: stageCountLine(counts) },
              {
                label: capRead.kind === "median" ? "Median going-in cap" : "Going-in cap",
                value: middleText(capRead, pct) ?? "—",
                sub:
                  planDeals.length > 0
                    ? `${parsedPhrase(capPoints.length)} · ${planPhrase}`
                    : parsedPhrase(capPoints.length),
              },
              {
                label: unitRead.kind === "median" ? "Median price / unit" : "Price / unit",
                value: middleText(unitRead, fmtUsdCompact) ?? "—",
                sub: unitTileSub(unitPoints.length, planCostCount),
              },
              {
                label: "Go rate",
                value: goRateText(goCount, decided.length),
                sub: `${decided.length} verdict${decided.length === 1 ? "" : "s"}`,
              },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  {t.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</p>
                <p className="mt-0.5 text-xs text-muted">{t.sub}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            {capPoints.length >= 3 && (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-semibold tracking-tight">
                  Going-in cap rate, by date added
                </h2>
                <p className="mb-2 mt-0.5 text-xs text-muted">
                  One dot per deal; each opens its deal.
                  {planDeals.length > 0 &&
                    " Plan deals are judged on yield on total cost and are not plotted."}
                </p>
                <DotTimeline points={capPoints} format={pct} medianLabel="median" />
              </div>
            )}
            {unitPoints.length >= 3 && (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-semibold tracking-tight">
                  Price per unit, by date added
                </h2>
                <p className="mb-2 mt-0.5 text-xs text-muted">
                  Multifamily deals where price and unit count both parsed.
                  {planCostCount > 0 &&
                    " A plan deal's all-in cost per unit is another basis and is not plotted."}
                </p>
                <DotTimeline
                  points={unitPoints}
                  format={fmtUsdCompact}
                  medianLabel="median"
                />
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            {decided.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-semibold tracking-tight">Verdict mix</h2>
                <p className="mb-3 mt-0.5 text-xs text-muted">
                  Every completed screen&rsquo;s first-pass call.
                </p>
                <VerdictMix deals={deals} />
              </div>
            )}
            {funnel.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-semibold tracking-tight">
                  Pipeline by stage
                </h2>
                <p className="mb-3 mt-0.5 text-xs text-muted">
                  {`${counts.closed > 0 ? "Live deals in ladder order, then the closed" : "Live deals in ladder order"}${
                    counts.dead > 0 ? ` — ${counts.dead} dead not shown` : ""
                  }.`}
                </p>
                <StageFunnel rows={funnel} />
              </div>
            )}
          </section>

          {dying.dead > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="why-deals-die">
              <h2 className="text-sm font-semibold tracking-tight">Why deals die</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted">
                {recordedDeaths > 0
                  ? `${recordedDeaths} of ${dying.dead} dead deal${dying.dead === 1 ? "" : "s"} with a reason recorded.`
                  : `${dying.dead} dead deal${dying.dead === 1 ? "" : "s"}, none with a reason recorded yet — tap one on the deal's page.`}
              </p>
              {recordedDeaths > 0 && (
                <ul className="space-y-1.5">
                  {dying.reasons.map((r) => (
                    <li key={r.reason} className="flex items-center gap-2 text-sm">
                      <span className="w-40 shrink-0 truncate text-xs text-muted">{r.label}</span>
                      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                        <span
                          data-bar="why-dead"
                          className="absolute inset-y-0 left-0 rounded-full bg-kill"
                          style={{ width: `${Math.round((r.count / maxReason) * 100)}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {brokers.rows.length > 0 && <BrokerageTable rows={brokers.rows} unnamed={brokers.unnamed} limit={BROKER_ROWS_SHOWN} />}

          {markets.length > 0 && <MarketTable rows={markets} planNote={planDeals.length > 0} more={marketsMore} />}
        </>
      )}

      {/* The track record stands whatever the count: under three screened
          deals it says, in its own words, that none is claimed. */}
      <TrackRecordSection record={trackRecord} />
    </div>
  );
}
