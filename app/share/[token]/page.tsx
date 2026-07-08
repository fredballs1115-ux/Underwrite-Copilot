import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ExtractionResult,
  BrokerCompsResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";

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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
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

  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  const comps = (deal.comps as BrokerCompsResult | null) ?? null;
  const market = (deal.market as MarketResult | null) ?? null;
  const verdict = deal.verdict as VerdictResult;
  const vmeta = VERDICT_META[verdict.verdict] ?? {
    label: "Screened",
    cls: "text-ink",
    border: "border-line",
  };

  const metrics = (extraction?.metrics ?? []).slice(0, 8);
  const screen = verdict.screen;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
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
        {[extraction?.market, deal.asset_class as string]
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
                {screen.ranges.slice(0, 6).map((r, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium">{r.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.low}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-brand">
                      {r.base}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.high}</td>
                    <td className="py-2 text-xs text-muted">{r.source}</td>
                  </tr>
                ))}
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
                <p className="text-xs uppercase tracking-wider text-muted">
                  {m.label}
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
