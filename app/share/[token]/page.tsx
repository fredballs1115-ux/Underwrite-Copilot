import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ExtractionResult,
  BrokerCompsResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";
import { keyTermRows } from "@/lib/key-terms";
import { staleAfterFailure } from "@/lib/screen-run";
import { SharePlan } from "./plan-facts";

// A range's confidence, in the deal page's colours (RANGE_CONF there).
const RANGE_CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};

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

const VERDICT_META = {
  pass: { label: "Go", cls: "text-pass", border: "border-pass" },
  caution: { label: "Caution", cls: "text-caution", border: "border-caution" },
  pass_on: { label: "No-go", cls: "text-kill", border: "border-kill" },
} as const;

function Expired({ reason }: { reason: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-tight">Underwrite Copilot</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        This link isn&rsquo;t available
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{reason}</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
      >
        What is Underwrite Copilot?
      </Link>
    </main>
  );
}

/**
 * The read-only shared screen: verdict, the ranges/deal-killers/sensitivity
 * block, key terms, and the comp/market summaries. Deliberately excluded:
 * documents, notes, the buyer's buy box, and anything editable — this is the
 * page an analyst forwards to a partner or lender.
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
    .select("id, deal_id, expires_at, revoked")
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
    .select("name, asset_class, extraction, comps, market, verdict, updated_at")
    .eq("id", share.deal_id as string)
    .maybeSingle();
  if (!deal?.verdict) {
    return <Expired reason="The deal behind this link is no longer available." />;
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
  const verdictStale = staleAfterFailure(latestJob).has("verdict");

  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  const comps = (deal.comps as BrokerCompsResult | null) ?? null;
  const market = (deal.market as MarketResult | null) ?? null;
  const verdict = deal.verdict as VerdictResult;
  const vmeta = VERDICT_META[verdict.verdict] ?? {
    label: "Screened",
    cls: "text-ink",
    border: "border-line",
  };

  const screen = verdict.screen;
  // The deal's kind first — a partner reading "$21M stabilized NOI" beside a
  // $20M price needs to know it is a conversion's finished-project figure.
  const safeExtraction = extraction
    ? { ...extraction, metrics: extraction.metrics ?? [] }
    : null;
  const strategy = inferStrategy(safeExtraction);
  const plan = planSummary(safeExtraction, strategy);
  // The deal-defining rows first, as the memo orders them (lib/key-terms.ts).
  const metrics = keyTermRows(safeExtraction?.metrics ?? [], strategy.kind, 8);

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">
          Underwrite Copilot
        </p>
        <p className="text-xs text-muted">
          Shared read-only screen · expires{" "}
          {new Date(share.expires_at as string).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </header>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {deal.name as string}
      </h1>
      <p className="mt-1 text-sm capitalize text-muted">
        {[
          extraction?.market,
          deal.asset_class as string,
          strategy.kind !== "unknown" ? strategy.label : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <section
        className={`mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm border-l-4 ${vmeta.border}`}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          First-pass verdict
        </p>
        <p className={`mt-1 text-2xl font-semibold ${vmeta.cls}`}>
          {vmeta.label}
        </p>
        {verdictStale && (
          <p className="mt-1 text-xs text-caution">
            From the previous completed screen — the sender&rsquo;s latest run of this
            deal did not finish.
          </p>
        )}
        {verdict.reason && (
          <p className="mt-2 text-sm leading-relaxed">{verdict.reason}</p>
        )}
        {(verdict.topRisks ?? []).length > 0 && (
          <ul className="mt-3 space-y-1">
            {verdict.topRisks.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted">
                <span aria-hidden className="text-kill">
                  •
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SharePlan strategy={strategy} plan={plan} />

      {screen && (screen.ranges ?? []).length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            The screen — ranges, not hero numbers
          </h2>
          <div className="scroll-shadows-x mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-1.5 pr-3 font-medium">Assumption</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Low</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Base</th>
                  <th className="py-1.5 pr-3 text-right font-medium">High</th>
                  <th className="py-1.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {screen.ranges.slice(0, 6).map((r, i) => {
                  // The honesty markers the deal page shows on every range
                  // card: the model's confidence, and what drives the spread.
                  const conf = RANGE_CONF[r.confidence];
                  return (
                    <tr key={i} className="border-b border-line/60 align-top">
                      <td className="py-2 pr-3 font-medium">
                        {r.label}
                        {conf && (
                          <>
                            {" "}
                            <span
                              className={`ml-1 inline-block rounded-full px-1.5 py-px align-middle text-[10px] font-medium uppercase ${conf.cls}`}
                              title={`${conf.label} confidence`}
                            >
                              {conf.label}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.low}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-brand">
                        {r.base}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.high}</td>
                      <td className="py-2 text-xs text-muted">
                        {r.source}
                        {r.basis && <p className="mt-0.5 text-[11px] text-muted">{r.basis}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(screen.dealKillers ?? []).length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {screen.dealKillers.slice(0, 3).map((k, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                    {i + 1}. {k.lever}
                  </p>
                  <p className="mt-1 text-sm text-muted">{k.read}</p>
                  {k.risk && (
                    <p className="mt-1 text-xs text-kill">Breaks if: {k.risk}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {metrics.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">Key terms</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map((m, i) => (
              <div key={i}>
                <p className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted">
                  <span className="truncate">{m.label}</span>
                  {/* The same badge the deal page puts on every metric card:
                      a bare "NOI" or "Cap rate" label says nothing about
                      whether the figure is today's or the sponsor's story. */}
                  {m.basis === "pro_forma" && (
                    <span className="shrink-0 rounded bg-caution/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-caution">
                      pro forma
                    </span>
                  )}
                  {m.basis === "in_place" && (
                    <span className="shrink-0 rounded bg-pass/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-pass">
                      in place
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-semibold tabular-nums">{m.value}</p>
                {m.flagged && (
                  <p className="text-[11px] text-caution">verify vs. source</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(comps?.summary || market?.summary) && (
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          {comps?.summary && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">
                Comp read
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {comps.summary}
              </p>
            </div>
          )}
          {market?.summary && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">
                Market read
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {market.summary}
              </p>
            </div>
          )}
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-5 text-center">
        <p className="text-xs text-muted">
          First-pass screen, not investment advice. Figures flagged
          &ldquo;verify vs. source&rdquo; deserve independent confirmation.
        </p>
        <p className="mt-3 text-sm">
          Screened with{" "}
          <Link
            href="/"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Underwrite Copilot
          </Link>{" "}
          — the disciplined first pass for CRE deals.
        </p>
      </footer>
    </main>
  );
}
