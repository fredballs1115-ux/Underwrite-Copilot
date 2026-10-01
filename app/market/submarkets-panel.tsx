import type { Submarket } from "@/lib/market/types";
import { ASSET_CLASS_OPTIONS } from "@/lib/asset-class";
import { createSubmarket } from "@/app/(app)/submarkets/actions";
import { SubmarketCards } from "./submarket-cards";

/**
 * "Your submarkets" — the user's own supply / rent-trend / vacancy series,
 * built from their own market exports, as ONE panel on Market data.
 *
 * Submarkets used to have a nav section of their own. They never earned it:
 * a submarket is part of the market picture, and the only things a user does
 * here are glance at the list and create one — everything else (imports,
 * exclusion rules, periods) happens on the submarket's own page, which stays
 * at /submarkets/[id]. So the list and the create form live here, next to
 * the user's own comp memory, and /submarkets redirects to this anchor.
 */

const ERRORS: Record<string, string> = {
  name: "Give the submarket a name.",
  save: "Couldn't create that submarket.",
  notfound: "That submarket no longer exists.",
};

export function SubmarketsPanel({
  submarkets,
  errorCode,
}: {
  /** the reader's own submarkets, read by the page beside its memory (the
   *  page orders its sections by whether there are any); empty on a schema
   *  without migration 0033, and the empty state stands */
  submarkets: readonly Submarket[];
  /** carried across from a create/delete redirect — see ERRORS */
  errorCode?: string;
}) {
  const message = errorCode ? ERRORS[errorCode] : undefined;

  return (
    <section
      id="submarkets"
      className="shadow-card scroll-mt-6 rounded-2xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Your submarkets</h2>
        <span className="text-[11px] text-muted">
          {submarkets.length === 0
            ? "none yet"
            : `${submarkets.length} on file`}{" "}
          · private to your account
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-xs text-muted">
        Exit cap and rent growth swing the return more than anything else, and
        nothing normally checks them. Build a submarket from your own market
        export or by hand, link it to a deal, and those two assumptions get
        measured against what the submarket has actually done.
      </p>

      {message ? (
        <p className="mt-3 rounded-lg border border-kill/30 bg-kill/5 px-3 py-2 text-sm text-kill">
          {message}
        </p>
      ) : null}

      {submarkets.length ? (
        <SubmarketCards submarkets={submarkets} />
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
          No submarkets yet. Create one below, then import a market export or
          enter the periods you know.
        </p>
      )}

      {/* Collapsed once the user has submarkets: the list is what they came
          for, and creating one is the rarer act. Open on an empty panel so
          the first one is a single step. */}
      <details
        className="mt-4 rounded-lg border border-line/70"
        open={submarkets.length === 0}
      >
        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-ink">
          New submarket
        </summary>
        <form
          action={createSubmarket}
          className="flex flex-wrap items-end gap-3 border-t border-line/70 px-4 py-4"
        >
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
              defaultValue="industrial"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            >
              {/* The site's own class list, the one every deal is filed
                  under (lib/asset-class) — not four of its sixteen. */}
              {ASSET_CLASS_OPTIONS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
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
      </details>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Licensed data stays in your own account — never pooled, never read by
        another tenant, never redistributed. Check your licence&apos;s terms
        before importing.
      </p>
    </section>
  );
}
