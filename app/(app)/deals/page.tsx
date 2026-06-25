import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type DealRow } from "@/lib/deals";
import { createDeal } from "./actions";

type DealListItem = Pick<DealRow, "id" | "name" | "asset_class" | "created_at">;

const ERRORS: Record<string, string> = {
  name: "Please give the deal a name.",
  file: "Please choose a PDF offering memorandum to upload.",
  pdf: "That file isn’t a PDF — please upload the OM as a PDF.",
  size: "That PDF is larger than 22 MB — please try a smaller file for now.",
  save: "Couldn’t save the deal. Please try again.",
};

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const errorMessage = errorCode ? ERRORS[errorCode] : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("id, name, asset_class, created_at")
    .order("created_at", { ascending: false });

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
          Upload the offering memorandum (PDF). We’ll extract the key terms and
          flag what to verify against the source.
        </p>

        {errorMessage && (
          <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
            {errorMessage}
          </p>
        )}

        <form action={createDeal} className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              name="name"
              required
              placeholder="Deal name — e.g. The Maddox at Highland Park"
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
          </div>
          <input
            type="file"
            name="om"
            accept="application/pdf"
            required
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-strong"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Create &amp; analyze
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Your deals
        </h2>
        {deals.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No deals yet. Upload your first OM above to get started.
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
