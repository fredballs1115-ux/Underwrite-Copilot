import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveBuyBox } from "@/lib/criteria-server";
import { buyBoxLines } from "@/lib/criteria";
import { saveBuyBox } from "./actions";
import { PendingButton } from "../pending-button";

export const metadata: Metadata = { title: "Buy box" };

const ASSET_CLASSES: [string, string][] = [
  ["multifamily", "Multifamily"],
  ["office", "Office"],
  ["industrial", "Industrial"],
  ["retail", "Retail"],
];

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

export default async function CriteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const active = user
    ? await getActiveBuyBox(supabase, user.id)
    : { box: null, scope: "personal" as const, editable: true, teamName: null, teamId: null };
  const box = active.box ?? {};

  const banner = saved
    ? { cls: "bg-pass/10 text-pass", text: "Buy box saved — every screen now checks against it." }
    : error === "owner"
      ? { cls: "bg-kill/10 text-kill", text: "Only the team owner can edit the team's buy box." }
      : error === "save"
        ? { cls: "bg-kill/10 text-kill", text: "Couldn't save — make sure migration 0008 has been run, then try again." }
        : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Buy box</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Your standing criteria. Every deal you screen is checked against
          them — deterministically, in code — and the verdict weighs the fit.
          {active.scope === "team" && (
            <>
              {" "}
              This is <span className="font-medium text-ink">{active.teamName}</span>&apos;s
              shared buy box{active.editable ? "" : " — only the owner can edit it"}.
            </>
          )}
        </p>
      </div>

      {banner && (
        <p className={`rounded-lg px-3 py-2 text-sm ${banner.cls}`}>
          {banner.text}
        </p>
      )}

      {!active.editable ? (
        <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-semibold tracking-tight">
            {active.teamName}&apos;s criteria
          </h2>
          {active.box ? (
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {buyBoxLines(active.box).map((l) => (
                <li key={l} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
                    ✓
                  </span>
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No criteria set yet — ask the team owner to define them here.
            </p>
          )}
        </section>
      ) : (
        <form action={saveBuyBox} className="space-y-6">
          <section className="shadow-card rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-sm font-semibold tracking-tight">
              What you buy
            </h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Asset classes</p>
                <p className="text-xs text-muted">Leave all unchecked for any.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ASSET_CLASSES.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-faint has-[:checked]:border-brand has-[:checked]:bg-brand/5"
                    >
                      <input
                        type="checkbox"
                        name="assetClasses"
                        value={value}
                        defaultChecked={box.assetClasses?.includes(value)}
                        className="h-3.5 w-3.5 accent-[#114e54]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="markets" className="text-sm font-medium">
                  Target markets
                </label>
                <p className="text-xs text-muted">
                  Comma-separated — matched against the deal&apos;s market and address.
                </p>
                <input
                  id="markets"
                  name="markets"
                  defaultValue={box.markets ?? ""}
                  placeholder="e.g. Dallas, Fort Worth, Austin"
                  className={`mt-2 ${inputCls}`}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight">
              Where the numbers must land
            </h2>
            <p className="mt-1 text-xs text-muted">
              Leave anything blank to skip that check.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="maxPriceM" className="text-sm font-medium">
                  Max price
                </label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-sm text-muted">$</span>
                  <input id="maxPriceM" name="maxPriceM" type="number" min="0" step="0.1" defaultValue={box.maxPriceM ?? ""} placeholder="60" className={inputCls} />
                  <span className="text-sm text-muted">M</span>
                </div>
              </div>
              <div>
                <label htmlFor="maxPerUnitK" className="text-sm font-medium">
                  Max price / unit
                </label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-sm text-muted">$</span>
                  <input id="maxPerUnitK" name="maxPerUnitK" type="number" min="0" step="1" defaultValue={box.maxPerUnitK ?? ""} placeholder="250" className={inputCls} />
                  <span className="text-sm text-muted">k</span>
                </div>
              </div>
              <div>
                <label htmlFor="minCapPct" className="text-sm font-medium">
                  Min going-in cap
                </label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input id="minCapPct" name="minCapPct" type="number" min="0" step="0.05" defaultValue={box.minCapPct ?? ""} placeholder="5.5" className={inputCls} />
                  <span className="text-sm text-muted">%</span>
                </div>
              </div>
              <div>
                <label htmlFor="minIrrPct" className="text-sm font-medium">
                  Min base IRR
                </label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input id="minIrrPct" name="minIrrPct" type="number" min="0" step="0.5" defaultValue={box.minIrrPct ?? ""} placeholder="14" className={inputCls} />
                  <span className="text-sm text-muted">%</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <label htmlFor="notes" className="text-sm font-semibold tracking-tight">
              Priorities in your own words
            </label>
            <p className="mt-1 text-xs text-muted">
              Fed to the verdict verbatim — e.g. &ldquo;value-add only, no new
              construction, prefer assumable debt, 5-year hold.&rdquo;
            </p>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={600}
              defaultValue={box.notes ?? ""}
              className={`mt-3 ${inputCls} resize-y`}
            />
            <div className="mt-4 flex items-center gap-3">
              <PendingButton
                pendingLabel="Saving…"
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Save buy box
              </PendingButton>
              <p className="text-xs text-muted">
                Applies to every new screen and verdict from now on.
              </p>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
