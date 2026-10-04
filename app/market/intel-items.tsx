import { datedLong } from "@/lib/debt-index";

/** One news item the weekday intel job kept, as the page reads it. */
export interface IntelItem {
  url: string;
  title: string;
  source: string | null;
  relevance: number | null;
  action: string | null;
  /** when the publisher dated the item, where the feed said */
  published_at?: string | null;
  /** when the job first saw it */
  created_at?: string | null;
}

/**
 * "Oct 1, 2026 UTC" from a timestamp, or null: the day it falls on in UTC,
 * said so. The site states no time zone of its own, and a bare day read as
 * the reader's was a day late for anything published in a US evening — an
 * item a publisher dated 9pm Eastern on Sep 30 is Oct 1 in UTC (the audit
 * of 2026-10-04).
 */
export function dayOf(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const at = Date.parse(ts);
  return Number.isFinite(at) ? `${datedLong(new Date(at).toISOString().slice(0, 10))} UTC` : null;
}

/**
 * The weekday intel job's notable items (scripts/daily-intel.mjs), each
 * dated, and each score and next step labelled for what it is.
 *
 * The research pass of 2026-10-01 found the items undated and their "7/10"
 * and "→ action" shown with no word that they are Claude's scoring of each
 * headline against one investor's criteria — the job's prompt scores
 * "decision-usefulness" to a small buyer of 2–4 unit buildings on the East
 * Coast. A reader with other criteria would read them as the site's advice.
 * The section stays (whether it is public is the owner's question); it now
 * says whose read it is, and that it is not advice. Pure.
 */
export function IntelItems({ items }: { items: readonly IntelItem[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="mt-2 text-[11px] leading-relaxed text-muted" data-qa="intel-label">
        The score and the next step on each item are an AI&apos;s read (Claude&apos;s) of the headline against one
        investor&apos;s criteria — a small buyer of 2–4 unit buildings on the East Coast — not advice, and not a
        read of your deals.
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((it) => {
          const published = dayOf(it.published_at);
          const seen = dayOf(it.created_at);
          const when = published ? published : seen ? `seen ${seen}` : "undated";
          return (
            <li key={it.url} className="text-sm leading-snug" data-intel-item>
              {it.relevance !== null && (
                <span
                  className="mr-2 rounded bg-faint px-1.5 py-px font-mono text-[11px] tabular-nums text-muted"
                  title="An AI's 0-10 score of how useful the headline is to one investor's criteria — not advice"
                >
                  {`AI score ${it.relevance}/10`}
                </span>
              )}
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {it.title}
              </a>
              <span className="ml-1 text-xs text-muted">{`(${[it.source, when].filter(Boolean).join(", ")})`}</span>
              {it.action && <p className="mt-0.5 text-xs text-muted">{`AI's suggested next step for that investor: ${it.action}`}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
