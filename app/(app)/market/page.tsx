import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import {
  buildComps,
  summarizeMarkets,
  fmtCapRange,
  fmtBasisRange,
  type MarketGroup,
} from "@/lib/market-memory";
import { seedBenchmarks } from "@/lib/research-data";

export const metadata: Metadata = { title: "Market data" };

const CALL_META: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "text-pass" },
  caution: { label: "Caution", cls: "text-caution" },
  pass_on: { label: "No-go", cls: "text-kill" },
};

export default async function MarketDataPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  // Own-account only (Feature 6): the deals THIS user created — never a
  // teammate's, never another account's. RLS also allows team deals, so the
  // explicit user_id filter is what keeps this memory private to the buyer.
  const { data, error } = user
    ? await supabase
        .from("deals")
        .select("id, name, asset_class, created_at, is_sample, verdict, extraction")
        .eq("user_id", user.id)
        .not("extraction", "is", null)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: null, error: null };

  const groups = data
    ? summarizeMarkets(buildComps(data as Parameters<typeof buildComps>[0]))
    : [];
  const totalScreens = groups.reduce((n, g) => n + g.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Your market data</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What your own past screens say about the markets you work — going-in
          caps and basis, grouped by market and asset class. Built only from the
          deals you&apos;ve screened; private to your account, never shared with
          your team.
        </p>
      </div>

      {error && /relation|does not exist|schema/i.test(error.message) ? (
        <p className="rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution">
          Screen a deal or two and your market history builds up here.
        </p>
      ) : error ? (
        <p className="rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          Couldn&apos;t load your market data just now — please refresh in a
          moment.
        </p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-medium">No market data yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Each deal you screen leaves its going-in cap and basis behind. Once
            you&apos;ve screened a few in the same market, your own comp history
            shows up here.
          </p>
          <Link
            href="/deals"
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Go to your pipeline
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">
            {totalScreens} screen{totalScreens === 1 ? "" : "s"} across{" "}
            {groups.length} market{groups.length === 1 ? "" : "s"}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <MarketCard key={`${g.assetClass}|${g.marketKey}`} g={g} />
            ))}
          </div>
        </>
      )}

      <RatesStrip />
      <IntelDigestCard />
    </div>
  );
}

// ── Live rates (research build) ───────────────────────────────────────────────
// Newest observation per FRED series from the rates table (daily cron);
// falls back to the checked-in PMMS snapshot so the strip is never empty.
async function RatesStrip() {
  const supabase = await createSupabaseServerClient();
  let rows: { series_id: string; obs_date: string; value: number; label: string | null }[] = [];
  try {
    const { data } = await supabase
      .from("rates")
      .select("series_id, obs_date, value, label")
      .order("obs_date", { ascending: false })
      .limit(40);
    const newest = new Map<string, (typeof rows)[number]>();
    for (const r of (data as typeof rows | null) ?? []) {
      if (!newest.has(r.series_id)) newest.set(r.series_id, r);
    }
    rows = [...newest.values()];
  } catch {
    // 0023 not migrated — fall through to the snapshot
  }
  if (rows.length === 0) {
    const pmms = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed");
    if (pmms?.low != null) {
      rows = [
        {
          series_id: "MORTGAGE30US",
          obs_date: pmms.as_of,
          value: pmms.low,
          label: "Freddie Mac PMMS 30-Year Fixed",
        },
      ];
    }
  }
  if (rows.length === 0) return null;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">Rates</h2>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {rows.map((r) => (
          <div key={r.series_id}>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {r.label ?? r.series_id}
            </p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
              {r.value}%{" "}
              <span className="text-[11px] font-normal text-muted">as of {r.obs_date}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        FRED, pulled daily by the rates cron; the screen&apos;s debt assumptions
        read these instead of hardcoded numbers.
      </p>
    </section>
  );
}

// ── Daily intel digest (research build) ──────────────────────────────────────
interface DigestHead {
  digest_date: string;
  item_count: number;
}

async function IntelDigestCard() {
  const supabase = await createSupabaseServerClient();
  let digest: DigestHead | null = null;
  let items: {
    url: string;
    title: string;
    source: string | null;
    relevance: number | null;
    action: string | null;
  }[] = [];
  try {
    const [{ data: d }, { data: it }] = await Promise.all([
      supabase
        .from("market_intel_digests")
        .select("digest_date, item_count")
        .order("digest_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("market_intel_items")
        .select("url, title, source, relevance, action")
        .gte("relevance", 6)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    digest = (d as DigestHead | null) ?? null;
    items = (it as typeof items | null) ?? [];
  } catch {
    // 0024 not migrated — render the setup note below
  }

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Daily intel</h2>
        {digest && (
          <span className="text-[11px] text-muted">
            latest digest {digest.digest_date} · {digest.item_count} notable
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          The weekday intel job hasn&apos;t landed anything notable yet. It
          watches rent-regulation news for your jurisdictions plus rates, tax,
          and HUD policy, scores each item for your buy box, and flags likely
          rule changes as red banners.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((it) => (
            <li key={it.url} className="text-sm leading-snug">
              <span className="mr-2 rounded bg-faint px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
                {it.relevance}/10
              </span>
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {it.title}
              </a>
              {it.source && <span className="ml-1 text-xs text-muted">({it.source})</span>}
              {it.action && (
                <p className="ml-12 mt-0.5 text-xs text-muted">→ {it.action}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MarketCard({ g }: { g: MarketGroup }) {
  const calls = (
    [
      ["pass", g.calls.pass],
      ["caution", g.calls.caution],
      ["pass_on", g.calls.pass_on],
    ] as const
  ).filter(([, n]) => n > 0);

  return (
    <section className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {g.market}
          </h2>
          <p className="mt-0.5 text-xs capitalize text-muted">{g.assetClass}</p>
        </div>
        <span className="shrink-0 rounded-full bg-faint px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted">
          {g.count} screen{g.count === 1 ? "" : "s"}
        </span>
      </div>

      <dl className="mt-4 space-y-2.5">
        <Stat label="Going-in cap" value={g.cap ? fmtCapRange(g.cap) : null} />
        <Stat
          label={g.perUnit?.basis === "sf" ? "Basis / SF" : "Basis / unit"}
          value={g.perUnit ? fmtBasisRange(g.perUnit) : null}
        />
      </dl>

      {calls.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
          {calls.map(([key, n]) => (
            <span key={key} className={CALL_META[key].cls}>
              <span className="font-mono tabular-nums">{n}</span> {CALL_META[key].label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">
        {value ?? <span className="text-line">—</span>}
      </dd>
    </div>
  );
}
