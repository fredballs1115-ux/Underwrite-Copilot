import Link from "next/link";
import type { RankedHeadline } from "@/lib/news/feeds";
import { dayOf } from "@/lib/utc-day";
import { Picture } from "../news/live-headlines";

/** How many headlines the strip draws: one row of three on a laptop. */
export const STRIP_SIZE = 3;

/** "Sep 29, 2026 UTC" — a story's day as the /news page reads days, in UTC
 *  and said so (lib/utc-day, the helper every feed's date prints through);
 *  null for a value that is not a date. */
export function storyDate(iso: string | null): string | null {
  return dayOf(iso);
}

/** The strip's headlines: the live layer's own ranking (lib/news/feeds
 *  `rankHeadlines`, recency and what each touches), the ones whose feed
 *  carries the publisher's picture first, so a row of three is a row of
 *  pictures wherever the press allows; a story with none fills a slot only
 *  where too few have one. Ranked order is kept within the pick. */
export function stripHeadlines(headlines: readonly RankedHeadline[], n = STRIP_SIZE): RankedHeadline[] {
  const pictured = headlines.filter((h) => h.image);
  const picked = new Set(pictured.slice(0, n));
  for (const h of headlines) {
    if (picked.size >= n) break;
    picked.add(h);
  }
  return headlines.filter((h) => picked.has(h));
}

/**
 * The newest live headlines under the pipeline, drawn as the News page's
 * live layer draws them (app/(app)/news/live-headlines.tsx): the
 * publisher's own picture, the headline as its link, and the publisher and
 * the story's day under it. It had listed the weekday sweep's stories with
 * their relevance scores and a line saying whose buyer profile scored them
 * (a small East Coast 2–4 unit buyer, never the reader's box), which read as
 * broken on a new reader's first screen (signed-in gaps, H6): the live
 * layer is everyone's news, scored for nobody. Pure: the page fetches
 * (lib/news/live) and hands the headlines in; nothing renders until a
 * publisher has answered.
 */
export function NewsStrip({ headlines }: { headlines: readonly RankedHeadline[] }) {
  const shown = stripHeadlines(headlines);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="pipeline-news" className="mt-6 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline-news" className="text-sm font-semibold">
          CRE news
        </h2>
        <Link
          href="/news"
          className="text-xs font-medium text-brand underline decoration-dotted underline-offset-2"
        >
          All stories →
        </Link>
      </div>
      <ul className="mt-3 grid gap-4 sm:grid-cols-3" data-qa="news-strip">
        {shown.map((h) => {
          const date = storyDate(h.publishedAt);
          return (
            <li key={h.url} className="min-w-0">
              {h.image ? (
                <Picture src={h.image} className="mb-2 aspect-[16/9]" />
              ) : (
                // No picture in the feed: the publisher's name on a plate
                // of the same shape, so the row keeps one line of tops.
                <div
                  aria-hidden
                  className="mb-2 flex aspect-[16/9] items-center justify-center rounded-sm bg-faint px-3 text-center font-serif text-sm font-semibold text-muted"
                >
                  {h.publisher}
                </div>
              )}
              <p className="font-serif text-[15px] font-semibold leading-snug text-ink">
                <a href={h.url} target="_blank" rel="noreferrer" className="hover:text-brand">
                  {h.title}
                </a>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {h.publisherUrl ? (
                  <a href={h.publisherUrl} target="_blank" rel="noreferrer" className="hover:text-brand">
                    {h.publisher}
                  </a>
                ) : (
                  h.publisher
                )}
                {date && h.publishedAt ? (
                  <>
                    {" · "}
                    <time dateTime={h.publishedAt}>{date}</time>
                  </>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">The publishers&apos; own words and pictures, nothing written here.</p>
    </section>
  );
}
