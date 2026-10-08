import Link from "next/link";
import { ruleName } from "@/lib/research-data";
import { dayOf } from "@/lib/utc-day";

/** One story the weekday intel sweep gathered and scored for this buyer. */
export interface ItemRow {
  url: string;
  title: string;
  source: string | null;
  sector: string;
  relevance: number | null;
  summary: string | null;
  action: string | null;
  published_at: string | null;
  created_at: string;
}

/** A law or rule change the sweep detected — dismissed from a banner or not;
 *  this strip is the record. */
export interface AlertRow {
  id: string;
  rule_id: string | null;
  headline: string;
  url: string | null;
  detail: string | null;
  detected_at: string;
}

export const SECTOR_LABEL: Record<string, string> = {
  "regulation-dc": "DC regulation",
  "regulation-md": "MD regulation",
  "regulation-va": "VA regulation",
  "regulation-east": "East Coast regulation",
  multifamily: "multifamily",
  "capital-markets": "capital markets",
  tax: "tax",
  "housing-policy": "housing policy",
  "national-markets": "national markets",
  "deal-flow": "deal flow",
  "construction-supply": "construction",
};

/** "Sep 14, 2026 UTC" — the day the sweep picked a story up, as its
 *  group's heading says it, and the day an alert was detected: the sweep's
 *  days are UTC's, said so (lib/utc-day, the helper every feed's date
 *  prints through). A story picked up at 9 pm Eastern sits under the next
 *  day's heading; the "UTC" says why. */
const fmtDay = (iso: string): string => dayOf(iso) ?? iso;

/** Stories the page reads: the sweep's newest. */
export const SCORED_READ = 200;
/** Stories the feed lists, newest first. */
export const SCORED_SHOWN = 120;

/**
 * What the feed lists, said where it is a cut (research pass 42): the page
 * reads the newest SCORED_READ stories and lists the newest SCORED_SHOWN of
 * them — of a sector, those among the read ones — and the sector chips are
 * the sectors among the read ones. Null where the list is every story.
 */
export function scoredScopeLine({
  shown,
  matched,
  read,
  total,
  sector,
}: {
  shown: number;
  /** the read stories in the sector asked for (all of them, with none) */
  matched: number;
  read: number;
  /** every story the sweep has scored, where the count was read */
  total: number | null;
  sector: string | null;
}): string | null {
  const all = total != null && read >= total;
  const count = (n: number) => n.toLocaleString("en-US");
  if (sector) {
    const label = SECTOR_LABEL[sector] ?? sector;
    if (all && shown >= matched) return null;
    if (all) return `The newest ${count(shown)} of the ${count(matched)} ${label} stories the sweep has scored.`;
    return `The newest ${count(shown)} ${label} stories among the ${count(read)} newest the sweep has scored${total != null ? ` (of ${count(total)})` : ""} — an older one is not read here.`;
  }
  if (all && shown >= read) return null;
  const of = total != null ? `of the ${count(total)} stories the sweep has scored` : `of the stories the sweep has scored`;
  const chips = all ? "" : `; the sectors are those among the newest ${count(read)}`;
  return `The newest ${count(shown)} ${of}${chips}.`;
}

/**
 * The scored feed as a pure view of the sweep's rows: the law-and-rule
 * strip, the sector chips (only when there is more than one sector to
 * choose from), and the stories by the day the sweep picked them up,
 * highest relevance first within a day — or the one quiet line while the
 * sweep has not run. `wantSector` is the query string's ask; a sector the
 * rows have never seen is ignored rather than shown empty. No I/O here:
 * the page reads the rows and hands them in, and the render tests hand
 * it a fixture.
 */
export function ScoredFeedView({
  items,
  alerts,
  wantSector,
  total = null,
}: {
  items: ItemRow[];
  alerts: AlertRow[];
  wantSector: string;
  /** every story the sweep has scored (an exact count), where it was read */
  total?: number | null;
}) {
  const sectors = [...new Set(items.map((i) => i.sector))].sort();
  const want = wantSector.slice(0, 40);
  const active = sectors.includes(want) ? want : null;
  const shown = (active ? items.filter((i) => i.sector === active) : items)
    // High-signal first within the feed, but keep day order dominant below.
    .slice(0, SCORED_SHOWN);
  const scope = items.length
    ? scoredScopeLine({
        shown: shown.length,
        matched: active ? items.filter((i) => i.sector === active).length : items.length,
        read: items.length,
        total,
        sector: active,
      })
    : null;

  // Group by the day the sweep picked the story up.
  const byDay = new Map<string, ItemRow[]>();
  for (const it of shown) {
    const day = it.created_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(it);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (b.relevance ?? -1) - (a.relevance ?? -1));
  }

  return (
    <>
      {alerts.length > 0 && (
        <section className="rounded-xl border border-kill/30 bg-kill/5 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-kill">
            Law &amp; rule changes
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {alerts.map((a) => {
              // The rule the sweep matched, by its name in the research file
              // (lib/research-data `ruleName`) — an id the file does not hold
              // says nothing rather than print itself.
              const rule = ruleName(a.rule_id);
              return (
                <li key={a.id} className="leading-snug">
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2 hover:text-brand"
                    >
                      {a.headline}
                    </a>
                  ) : (
                    a.headline
                  )}{" "}
                  <span className="ml-1 text-[11px] text-muted">
                    <time dateTime={a.detected_at} className="whitespace-nowrap">
                      {fmtDay(a.detected_at)}
                    </time>
                    {rule ? ` · affects ${rule}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sectors.length > 1 && (
        <nav aria-label="Sectors" className="flex flex-wrap gap-1.5 text-xs">
          <Link
            href="/news"
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              !active
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            All
          </Link>
          {sectors.map((s) => (
            <Link
              key={s}
              href={`/news?sector=${encodeURIComponent(s)}`}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                active === s
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {SECTOR_LABEL[s] ?? s}
            </Link>
          ))}
        </nav>
      )}

      {scope && (
        <p data-qa="scored-scope" className="text-[12px] text-muted">
          {scope}
        </p>
      )}

      {items.length === 0 ? (
        // No box for what has not started: the headlines above are the
        // page; one quiet line says what the sweep will add.
        <p className="text-[12px] leading-relaxed text-muted">
          The scored feed — every story rated 0–10 for a small East Coast
          buyer of 2–4 unit buildings, law and rule changes flagged — starts
          with the weekday sweep once its GitHub secret is set. Until then the
          headlines above are the news, unscored.
        </p>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {fmtDay(day)}
            </h2>
            <ul className="mt-2 space-y-2.5">
              {list.map((it) => (
                <li
                  key={it.url}
                  className="rounded-xl border border-line bg-surface p-3.5 text-sm leading-snug"
                >
                  <div className="flex items-start gap-2.5">
                    {it.relevance !== null && (
                      <span
                        className={`mt-px shrink-0 rounded px-1.5 py-px font-mono text-[11px] tabular-nums ${
                          it.relevance >= 6
                            ? "bg-brand/10 text-brand"
                            : "bg-faint text-muted"
                        }`}
                        title={`Relevance ${it.relevance} of 10, scored for one buyer profile (a small East Coast buyer of 2–4 unit buildings), not your buy box`}
                      >
                        {it.relevance}/10
                      </span>
                    )}
                    <div className="min-w-0">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                      >
                        {it.title}
                      </a>{" "}
                      <span className="ml-1 text-[11px] text-muted">
                        {it.source ?? "source"}
                        {" · "}
                        {SECTOR_LABEL[it.sector] ?? it.sector}
                      </span>
                      {it.summary && (
                        <p className="mt-1 text-[13px] text-muted">{it.summary}</p>
                      )}
                      {it.action && (
                        <p className="mt-1 text-[13px] font-medium text-ink/80">
                          → {it.action}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
