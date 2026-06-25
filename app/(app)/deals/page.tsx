import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type DealRow } from "@/lib/deals";
import { createDeal } from "./actions";

type DealListItem = Pick<DealRow, "id" | "name" | "asset_class" | "created_at">;

export default async function DealsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("id, name, asset_class, created_at")
    .order("created_at", { ascending: false });

  // Most likely error here is "table doesn't exist yet" — guide the user to the
  // one-time database setup instead of crashing.
  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        <p className="font-medium">Database isn’t set up yet</p>
        <p className="mt-1 text-muted">
          Run <code>supabase/migrations/0001_init.sql</code> in your Supabase SQL
          editor, then refresh this page.
        </p>
        <p className="mt-2 text-xs text-muted">({error.message})</p>
      </div>
    );
  }

  const deals = (data ?? []) as DealListItem[];

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-medium">New deal</h2>
        <p className="mt-1 text-sm text-muted">
          Name it now; uploading the OM and running the analysis comes in the
          next phase.
        </p>
        <form
          action={createDeal}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input
            name="name"
            required
            placeholder="e.g. The Maddox at Highland Park"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            name="assetClass"
            defaultValue="auto"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="auto">Auto-detect</option>
            <option value="multifamily">Multifamily</option>
            <option value="office">Office</option>
            <option value="industrial">Industrial</option>
            <option value="retail">Retail</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Create
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Your deals
        </h2>
        {deals.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No deals yet. Create one above to get started.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {deals.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/deals/${d.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-paper"
                >
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs capitalize text-muted">
                    {d.asset_class}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
