import Link from "next/link";
import { changelogEntries } from "@/lib/changelog";

/** Compact "what's new" card for the pipeline page — the product tells you
 *  what improved instead of hoping you notice. Server component, checked-in
 *  data, no dismissal state to manage: it stays small and stays honest. */
export function WhatsNewCard({ limit = 3 }: { limit?: number }) {
  const entries = changelogEntries(limit);
  if (entries.length === 0) return null;
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          New in Underwrite Copilot
        </h2>
        <Link
          href="/whats-new"
          className="text-[11px] font-medium text-brand hover:text-brand-strong"
        >
          All improvements →
        </Link>
      </div>
      <ul className="mt-2 space-y-2">
        {entries.map((e) => (
          <li key={`${e.date}|${e.title}`} className="text-sm leading-snug">
            <Link
              href={e.href}
              className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
            >
              {e.title}
            </Link>
            <span className="ml-2 text-[11px] text-muted">{fmt(e.date)}</span>
            <p className="mt-0.5 text-[13px] text-muted">{e.blurb}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
