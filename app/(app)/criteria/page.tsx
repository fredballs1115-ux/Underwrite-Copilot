import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveBuyBox } from "@/lib/criteria-server";
import { buyBoxLines, geoTargets, priceBand } from "@/lib/criteria";
import {
  saveBuyBox,
  addBuyBox,
  selectBuyBox,
  renameBuyBox,
  deleteBuyBox,
} from "./actions";
import { PendingButton } from "../pending-button";
import { GeoPicker } from "./geo-picker";

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
    : {
        box: null,
        boxes: [],
        activeId: "",
        scope: "personal" as const,
        editable: true,
        teamName: null,
        teamId: null,
      };

  // The named box the form edits: the active one, raw (so a brand-new empty
  // box still renders a blank form to fill).
  const activeNamed =
    active.boxes.find((b) => b.id === active.activeId) ?? active.boxes[0] ?? null;
  const box = activeNamed?.box ?? {};
  const boxId = activeNamed?.id ?? "";
  const db = box.dealbreakers ?? {};

  const banner = saved
    ? {
        cls: "bg-pass/10 text-pass",
        text:
          saved === "box"
            ? "New mandate added — fill it in and save."
            : saved === "deleted"
              ? "Mandate deleted."
              : saved === "name"
                ? "Mandate renamed."
                : "Buy box saved — every screen now checks against it.",
      }
    : error === "owner"
      ? { cls: "bg-kill/10 text-kill", text: "Only the team owner can edit the team's buy box." }
      : error === "save"
        ? { cls: "bg-kill/10 text-kill", text: "Couldn't save your buy box — please try again. If it keeps failing, email underwritecopilot.support@gmail.com." }
        : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Buy box</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The firm&apos;s mandate. Every deal you screen is scored against it —
          deterministically, in code — for a 0–100 mandate-fit read and a
          Pursue / Watch / Pass call, plus a pass, near-miss, or miss per
          criterion.
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
          {active.boxes.length > 1 && (
            <p className="mt-1 text-xs text-muted">
              Active mandate:{" "}
              <span className="font-medium text-ink">
                {activeNamed?.name ?? "Mandate"}
              </span>{" "}
              (of {active.boxes.length}).
            </p>
          )}
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
        <>
          {/* Named mandates: switch which one every screen is judged against,
              add another, rename or delete. Shown once at least one exists. */}
          {active.boxes.length >= 1 && (
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight">
                  Your mandates
                </h2>
                <form action={addBuyBox}>
                  <PendingButton
                    pendingLabel="Adding…"
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
                  >
                    + Add mandate
                  </PendingButton>
                </form>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {active.boxes.map((b) =>
                  b.id === boxId ? (
                    <span
                      key={b.id}
                      className="rounded-lg border border-brand bg-brand/5 px-3 py-1.5 text-sm font-medium text-brand"
                    >
                      {b.name}
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide">
                        active
                      </span>
                    </span>
                  ) : (
                    <form key={b.id} action={selectBuyBox}>
                      <input type="hidden" name="boxId" value={b.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-faint"
                      >
                        {b.name}
                      </button>
                    </form>
                  ),
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={renameBuyBox} className="flex items-center gap-1.5">
                  <input type="hidden" name="boxId" value={boxId} />
                  <input
                    name="name"
                    defaultValue={activeNamed?.name ?? ""}
                    maxLength={60}
                    aria-label="Rename this mandate"
                    className="w-44 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
                  />
                  <PendingButton
                    pendingLabel="…"
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
                  >
                    Rename
                  </PendingButton>
                </form>
                {active.boxes.length > 1 && (
                  <form action={deleteBuyBox}>
                    <input type="hidden" name="boxId" value={boxId} />
                    <PendingButton
                      pendingLabel="Deleting…"
                      className="rounded-lg border border-kill/30 px-3 py-1.5 text-xs font-medium text-kill transition-colors hover:bg-kill/5"
                    >
                      Delete this mandate
                    </PendingButton>
                  </form>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                Every screen is judged against the highlighted mandate. Editing
                below changes that one.
              </p>
            </section>
          )}

          <form action={saveBuyBox} className="space-y-6">
            {/* Which named box these edits belong to (guards against a switch
                mid-edit). */}
            <input type="hidden" name="boxId" value={boxId} />
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
                          className="h-3.5 w-3.5 accent-brand"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Geography</p>
                  <p className="text-xs text-muted">
                    The mandate&apos;s territory — matched against each deal&apos;s
                    market, address, and county.
                  </p>
                  <div className="mt-2">
                    <GeoPicker initial={geoTargets(box)} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <h2 className="text-sm font-semibold tracking-tight">
                Where the numbers must land
              </h2>
              <p className="mt-1 text-xs text-muted">
                Leave anything blank to skip that check. Each figure scores on a
                sliding scale — a near-miss earns partial credit toward the fit
                score.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-sm font-medium">Price range</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm text-muted">$</span>
                    <input aria-label="Minimum price, millions" name="priceMinM" type="number" min="0" step="0.1" defaultValue={box.priceMinM ?? ""} placeholder="10" className={inputCls} />
                    <span className="text-sm text-muted">–</span>
                    <input aria-label="Maximum price, millions" name="priceMaxM" type="number" min="0" step="0.1" defaultValue={priceBand(box).max != null ? priceBand(box).max! / 1e6 : ""} placeholder="80" className={inputCls} />
                    <span className="text-sm text-muted">M</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Size range</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input aria-label="Minimum square feet, thousands" name="sfMinK" type="number" min="0" step="1" defaultValue={box.sfMin != null ? box.sfMin / 1e3 : ""} placeholder="50" className={inputCls} />
                    <span className="text-sm text-muted">–</span>
                    <input aria-label="Maximum square feet, thousands" name="sfMaxK" type="number" min="0" step="1" defaultValue={box.sfMax != null ? box.sfMax / 1e3 : ""} placeholder="300" className={inputCls} />
                    <span className="text-sm text-muted">k SF</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="maxPerUnitK" className="text-sm font-medium">
                    Max basis / unit
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
                  <label htmlFor="minCoCPct" className="text-sm font-medium">
                    Min cash-on-cash
                  </label>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm text-muted">≥</span>
                    <input id="minCoCPct" name="minCoCPct" type="number" min="0" step="0.25" defaultValue={box.minCoCPct ?? ""} placeholder="6" className={inputCls} />
                    <span className="text-sm text-muted">%</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="minIrrPct" className="text-sm font-medium">
                    Target return (IRR)
                  </label>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm text-muted">≥</span>
                    <input id="minIrrPct" name="minIrrPct" type="number" min="0" step="0.5" defaultValue={box.minIrrPct ?? ""} placeholder="14" className={inputCls} />
                    <span className="text-sm text-muted">%</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <h2 className="text-sm font-semibold tracking-tight">Dealbreakers</h2>
              <p className="mt-1 text-xs text-muted">
                Hard red lines. Any one tripped caps the deal at Pass, whatever
                the rest of the score — separate from the sliding-scale checks
                above.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:bg-faint has-[:checked]:border-brand has-[:checked]:bg-brand/5">
                  <input type="checkbox" name="db_requireAssetClass" defaultChecked={!!db.requireAssetClass} className="h-3.5 w-3.5 accent-brand" />
                  Asset class must be in the mandate list above
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:bg-faint has-[:checked]:border-brand has-[:checked]:bg-brand/5">
                  <input type="checkbox" name="db_requireGeography" defaultChecked={!!db.requireGeography} className="h-3.5 w-3.5 accent-brand" />
                  Property must sit in a target market above
                </label>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="db_maxPriceM" className="text-sm font-medium">
                    Hard price ceiling
                  </label>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm text-muted">$</span>
                    <input id="db_maxPriceM" name="db_maxPriceM" type="number" min="0" step="0.1" defaultValue={db.maxPriceM ?? ""} placeholder="100" className={inputCls} />
                    <span className="text-sm text-muted">M</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="db_minCapPct" className="text-sm font-medium">
                    Hard cap floor
                  </label>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm text-muted">≥</span>
                    <input id="db_minCapPct" name="db_minCapPct" type="number" min="0" step="0.05" defaultValue={db.minCapPct ?? ""} placeholder="4.5" className={inputCls} />
                    <span className="text-sm text-muted">%</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="db_maxPerUnitK" className="text-sm font-medium">
                    Hard basis ceiling
                  </label>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm text-muted">$</span>
                    <input id="db_maxPerUnitK" name="db_maxPerUnitK" type="number" min="0" step="1" defaultValue={db.maxPerUnitK ?? ""} placeholder="350" className={inputCls} />
                    <span className="text-sm text-muted">k/unit</span>
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
            </section>

            {/* Persistent action bar OUTSIDE the cards — the submit saves the
                whole form, not just the card it used to sit in. */}
            <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur">
              <PendingButton
                pendingLabel="Saving…"
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Save {activeNamed && active.boxes.length > 1 ? `“${activeNamed.name}”` : "buy box"}
              </PendingButton>
              <p className="text-xs text-muted">
                Saves everything above — applies to every new screen and verdict.
              </p>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
