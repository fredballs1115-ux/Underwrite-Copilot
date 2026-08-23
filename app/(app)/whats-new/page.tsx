import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { changelogEntries } from "@/lib/changelog";

export const metadata: Metadata = { title: "What's new" };

/** The full improvement log — the pipeline card shows the top three; this is
 *  everything the checked-in changelog carries, newest first, each entry
 *  linking to the feature it describes. */
export default async function WhatsNewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/whats-new");
  const entries = changelogEntries(12);
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">What&apos;s new</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every product improvement, newest first — each links straight to the
          feature it describes. The homepage&apos;s proof strip and the
          pipeline&apos;s card draw from this same list.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
          Nothing logged yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={`${e.date}|${e.title}`}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={e.href}
                  className="text-sm font-semibold underline decoration-dotted underline-offset-2 hover:text-brand"
                >
                  {e.title}
                </Link>
                <span className="text-[11px] text-muted">{fmt(e.date)}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{e.blurb}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
