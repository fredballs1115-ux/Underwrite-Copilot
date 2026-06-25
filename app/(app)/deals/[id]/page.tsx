import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEAL_STEPS, type DealRow } from "@/lib/deals";

// In Next.js 16, `params` is a Promise — you await it before reading the id.
export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const deal = data as DealRow;

  return (
    <div className="space-y-6">
      <Link href="/deals" className="text-sm text-muted hover:text-ink">
        ← All deals
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{deal.name}</h1>
        <p className="mt-1 text-sm capitalize text-muted">{deal.asset_class}</p>
      </div>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Screening checklist
        </h2>
        <ul className="mt-3 space-y-2">
          {DEAL_STEPS.map((step, i) => {
            const done = deal[step.key] != null;
            return (
              <li
                key={step.key}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    done ? "bg-pass/15 text-pass" : "bg-paper text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{step.label}</span>
                <span className="text-xs text-muted">
                  {done ? "Done" : "Not run yet"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Uploading the OM and running the analysis arrives in Phase 2.
        </p>
      </section>
    </div>
  );
}
