import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import {
  deriveAnalytics,
  fmtUsdCompact,
  middleRead,
  middleText,
  parsedPhrase,
  stageCountLine,
  stageCounts,
  type AnalyticsRow,
  type MiddleRead,
} from "@/lib/analytics";
import { STAGES, STAGE_LABEL, normalizeStage } from "@/lib/stages";
import { isPlanDeal } from "@/lib/deal-strategy";
import { pctText } from "@/lib/plan-facts";
import { DotTimeline, VerdictMix, StageFunnel } from "./charts";

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
  const { data, error } = await supabase
    .from("deals")
    // The first signal too: the deal's kind is read with it, as on its page.
    .select("id, name, asset_class, created_at, is_sample, stage, verdict, extraction, first_signal")
    .not("extraction", "is", null)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) {
    throw new Error(`Couldn't load your portfolio: ${error.message}`);
  }

  const deals = deriveAnalytics((data ?? []) as AnalyticsRow[]);
  const capPoints = deals
    .filter((d) => d.capPct != null)
    .map((d) => ({ at: d.at, value: d.capPct!, name: d.name }));
  const unitPoints = deals
    .filter((d) => d.perUnit != null)
    .map((d) => ({ at: d.at, value: d.perUnit!, name: d.name }));
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
  const goRate =
    decided.length > 0
      ? (decided.filter((d) => d.verdict === "pass").length / decided.length) * 100
      : null;
  const capRead = middleRead(capPoints.map((p) => p.value));
  const unitRead = middleRead(unitPoints.map((p) => p.value));

  const funnel = STAGES.filter((s) => s !== "dead")
    .map((s) => ({
      label: STAGE_LABEL[s] ?? s,
      count: deals.filter((d) => normalizeStage(d.stage) === s).length,
    }))
    .filter((r) => r.count > 0);

  // Markets table — the durable "table view" behind the charts.
  const byMarket = new Map<string, typeof deals>();
  for (const d of deals) {
    const key = d.market.trim() || "Unlabeled";
    byMarket.set(key, [...(byMarket.get(key) ?? []), d]);
  }
  const markets = [...byMarket.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([market, list]) => ({
      market,
      n: list.length,
      cap: middleRead(list.map((d) => d.capPct).filter((v): v is number => v != null)),
      unit: middleRead(list.map((d) => d.perUnit).filter((v): v is number => v != null)),
      go: list.filter((d) => d.verdict === "pass").length,
    }));

  const enough = deals.length >= 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          What your own screens add up to — every figure below was extracted
          from an OM you ran, never restated.
        </p>
      </div>

      {!enough ? (
        <section className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">
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
                    ? `${capPoints.length} parsed · ${planPhrase}`
                    : parsedPhrase(capPoints.length),
              },
              {
                label: unitRead.kind === "median" ? "Median $/unit" : "$/unit",
                value: middleText(unitRead, fmtUsdCompact) ?? "—",
                sub: parsedPhrase(unitPoints.length),
              },
              {
                label: "Go rate",
                value: goRate != null ? `${Math.round(goRate)}%` : "—",
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
                  Going-in cap rate, by screen date
                </h2>
                <p className="mb-2 mt-0.5 text-xs text-muted">
                  One dot per deal — hover for the name.
                  {planDeals.length > 0 &&
                    " Plan deals are judged on yield on total cost and are not plotted."}
                </p>
                <DotTimeline points={capPoints} format={pct} medianLabel="median" />
              </div>
            )}
            {unitPoints.length >= 3 && (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-semibold tracking-tight">
                  Price per unit, by screen date
                </h2>
                <p className="mb-2 mt-0.5 text-xs text-muted">
                  Multifamily deals where price and unit count both parsed.
                  {planDeals.length > 0 &&
                    " A plan deal plots its total cost per planned unit."}
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

          {markets.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">By market</h2>
              <div className="scroll-shadows-x mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                      <th className="py-2 pr-3 font-medium">Market</th>
                      <th className="py-2 pr-3 text-right font-medium">Screens</th>
                      <th className="py-2 pr-3 text-right font-medium">Cap</th>
                      <th className="py-2 pr-3 text-right font-medium">$/unit</th>
                      <th className="py-2 text-right font-medium">Go calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markets.map((m) => (
                      <tr key={m.market} className="border-b border-line/60">
                        <td className="max-w-[16rem] truncate py-2 pr-3 font-medium">
                          {m.market}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.n}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <MiddleCell read={m.cap} fmt={pct} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <MiddleCell read={m.unit} fmt={fmtUsdCompact} />
                        </td>
                        <td className="py-2 text-right tabular-nums">{m.go}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">
                Each figure is the market&rsquo;s median from three deals up; a
                market with one or two shows those deals&rsquo; own, marked.
                Deals whose figures didn&rsquo;t parse are counted in Screens
                but not in the figures.
                {planDeals.length > 0 &&
                  " Plan deals are judged on yield on total cost and sit outside the cap figures."}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** A market's cap or $/unit cell: its median from three deals, and under
 *  that the deals' own figures, marked with how many there are. */
function MiddleCell({ read, fmt }: { read: MiddleRead; fmt: (n: number) => string }) {
  const text = middleText(read, fmt);
  if (text == null) return <>—</>;
  if (read.kind === "median") return <>{text}</>;
  return (
    <>
      {text}{" "}
      <span className="text-[11px] text-muted">{read.kind === "one" ? "1 deal" : "2 deals"}</span>
    </>
  );
}
