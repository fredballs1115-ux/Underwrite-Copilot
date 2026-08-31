import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { listSubmarkets } from "@/lib/market/store";
import { createSubmarket } from "./actions";

export const metadata: Metadata = { title: "Submarkets" };

const ERRORS: Record<string, string> = {
  name: "Give the submarket a name.",
  save: "Couldn't create that submarket.",
  notfound: "That submarket no longer exists.",
};

export default async function SubmarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const submarkets = await listSubmarkets(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Submarkets</h1>
        <p className="max-w-2xl text-sm text-muted">
          Exit cap and rent growth swing the return more than anything else, and nothing normally
          checks them. Build a submarket here — from your own market export, or by hand — link it to
          a deal, and those two assumptions get measured against what the submarket has actually
          done.
        </p>
      </header>

      {errorCode && ERRORS[errorCode] ? (
        <p className="rounded-lg border border-kill/30 bg-kill/5 px-4 py-3 text-sm text-kill">
          {ERRORS[errorCode]}
        </p>
      ) : null}

      {submarkets.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {submarkets.map((s) => (
            <li key={s.id}>
              <Link
                href={`/submarkets/${s.id}`}
                className="shadow-card hover-lift flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 transition"
              >
                <span className="font-medium text-ink">{s.name}</span>
                <span className="text-xs text-muted">
                  {s.metro ? `${s.metro} · ` : ""}
                  <span className="capitalize">{s.assetClass}</span>
                </span>
                {s.exclusionRules.subtypes.length ||
                s.exclusionRules.namePatterns.length ||
                s.exclusionRules.minSf != null ||
                s.exclusionRules.maxSf != null ? (
                  <span className="text-xs text-muted">
                    Exclusions:{" "}
                    {[
                      ...s.exclusionRules.subtypes,
                      ...s.exclusionRules.namePatterns,
                      s.exclusionRules.minSf != null ? `under ${s.exclusionRules.minSf.toLocaleString("en-US")} SF` : null,
                      s.exclusionRules.maxSf != null ? `over ${s.exclusionRules.maxSf.toLocaleString("en-US")} SF` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-base font-semibold text-ink">No submarkets yet</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Create one below, then import a market export or enter the periods you know.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">New submarket</h2>
        <form action={createSubmarket} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Name
            <input
              name="name"
              required
              placeholder="I-95 Corridor"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Metro
            <input
              name="metro"
              placeholder="Richmond, VA"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Asset class
            <select
              name="assetClass"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            >
              <option value="industrial">Industrial</option>
              <option value="office">Office</option>
              <option value="retail">Retail</option>
              <option value="multifamily">Multifamily</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Supply warning (months)
            <input
              name="supplyWarningMonths"
              defaultValue="24"
              inputMode="numeric"
              className="w-32 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Create
          </button>
        </form>
      </section>

      <p className="text-xs leading-relaxed text-muted">
        Licensed market data belongs to whoever licenses it. What you import here stays in your own
        account: it is never pooled into a shared dataset, never read by another tenant, and never
        redistributed. Import your own exports, and check the terms of your own licence before you
        do.
      </p>
    </div>
  );
}
