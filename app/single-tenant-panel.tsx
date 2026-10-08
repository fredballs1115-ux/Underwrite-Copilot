import { LeaseTermBar } from "@/app/lease-term-bar";
import { PanelHead, PanelNote, PanelRead } from "@/app/panel-parts";
import { termEndLabel } from "@/lib/ground-lease-term";
import {
  pct2,
  runsPastSale,
  singleTenantModelLine,
  termFromDelivery,
  type LeaseModel,
  type SingleTenantRead,
} from "@/lib/single-tenant";

/**
 * One tenant leases the whole property (#454) — the pure panel for
 * `lib/single-tenant`, drawn by the deal page under what is being sold and
 * by the shared screen under its own. Nothing on a multi-tenant deal.
 *
 * Two pictures, each with its legend in words so nothing rides on colour:
 *
 *   - THE TERM: the lease's years left from today on one track — the
 *     model's hold marked where the page has the model, the renewal options
 *     dashed after the term because they are the tenant's to exercise, and
 *     the hold's years past the lease's end in the warning tone. An early
 *     termination is drawn as the end, since the tenant decides. A lease
 *     on a building not yet delivered, its term a stated count, is drawn
 *     from delivery, as the reader says it, with no hold over it.
 *   - THE INCREASES: the lease's own growth a year against the model's rent
 *     growth, on one scale — only where the lease runs past the model's
 *     sale, since after it ends the growth is a renewal's question.
 *
 * The sentences are the reader's own (`headline`, `singleTenantModelLine`),
 * so every surface says the same thing.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
const pct1 = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

const GRADE: Record<string, string> = {
  investment: "investment grade",
  speculative: "below investment grade",
  split: "split rating",
};

export function SingleTenantPanel({ lease, model = null }: { lease: SingleTenantRead | null; model?: LeaseModel | null }) {
  if (!lease) return null;
  const r = lease;
  const eff = r.effective;
  const holdYears = model && model.holdMonths > 0 ? model.holdMonths / 12 : null;
  const inc = r.increases;
  // A lease that has not begun runs from delivery (lib/single-tenant
  // `termFromDelivery`): drawn from then, never as years left today.
  const fromDelivery = termFromDelivery(r);
  // The lease's growth against the model's, where the lease outlasts the
  // model's sale and its increases read as a rate.
  // Past the sale by the DAY, or whenever a lease from delivery begins, as
  // the model line reads it (lib/single-tenant `runsPastSale`), so the
  // picture and the sentence agree.
  const growth =
    model && holdYears != null && eff && runsPastSale(r, holdYears) && inc && inc.kind !== "cpi"
      ? { lease: inc.annualPct, model: model.rentGrowthPct * 100, how: inc.kind === "flat" ? "flat" : inc.how }
      : null;
  const scale = growth ? Math.max(growth.lease, growth.model, 1) : 1;
  // The lease's growth a year, then the lease's own words where they say it
  // differently ("10% every 5 years", "flat") — never "3% a year — 3% a
  // year" for an annual bump the reader already words that way.
  const perYear = growth ? `${pct2(growth.lease)} a year` : "";
  const leaseText = growth && growth.how !== perYear ? `${perYear} — ${growth.how}` : perYear;
  const modelLine = model ? singleTenantModelLine(r, model) : "";
  const facts = [
    { k: "Guarantor", v: r.guarantor || "None named in the memorandum" },
    r.rating ? { k: "Credit rating", v: r.rating.grade ? `${r.rating.stated} — ${GRADE[r.rating.grade]}` : r.rating.stated } : null,
    r.leaseType ? { k: "Lease type", v: r.leaseType } : null,
    r.landlordObligations ? { k: "Landlord's obligations", v: r.landlordObligations } : null,
    r.tenantRights ? { k: "Tenant's rights", v: r.tenantRights } : null,
    // The lease's base rent is one of its terms, checked against the
    // memorandum: whole dollars, as stated, never written short.
    r.rent != null ? { k: "Annual base rent", v: `$${r.rent.toLocaleString("en-US")}` } : null,
  ].filter((f): f is { k: string; v: string } => f != null);

  return (
    <section
      aria-label="Single tenant"
      data-qa="single-tenant-panel"
      className="mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3"
    >
      <PanelHead title="Single tenant" tone="text-brand">
        <span className="text-sm font-semibold">{r.tenant}</span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </PanelHead>
      {/* Who leases it and who guarantees it lead; the term, the options
          and the increases are one click away and whole in the HTML, since
          the pictures below draw them. */}
      <PanelRead sentences={r.sentences} />

      {fromDelivery != null ? (
        <div className="mt-2.5" data-qa="single-tenant-term">
          <LeaseTermBar
            yearsLeft={fromDelivery}
            fromDelivery
            optionYears={r.term && !r.term.includesOptions ? r.term.options?.years ?? null : null}
            optionsWord="Renewal options"
            ceiling={!!r.term?.includesOptions}
          />
        </div>
      ) : (
        eff &&
        eff.yearsLeft > 0 && (
          <div className="mt-2.5" data-qa="single-tenant-term">
            <LeaseTermBar
              yearsLeft={eff.yearsLeft}
              endLabel={eff.early ? `${termEndLabel(eff)}, the tenant's early termination` : termEndLabel(eff)}
              optionYears={!eff.early && r.term && !r.term.includesOptions ? r.term.options?.years ?? null : null}
              holdYears={holdYears}
              optionsWord="Renewal options"
              ceiling={!eff.early && !!r.term?.includesOptions}
            />
          </div>
        )
      )}

      {growth && (
        <ul className="mt-3 space-y-1.5" data-qa="single-tenant-growth">
          {[
            { key: "lease", label: "The lease's increases", pct: growth.lease, text: leaseText, tone: "bg-brand/70", bar: "lease-increase" },
            { key: "model", label: "The model's rent growth", pct: growth.model, text: `${pct1(growth.model)} a year`, tone: "bg-muted/50", bar: "model-growth" },
          ].map((g) => (
            <li key={g.key} className="text-[11px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-ink">{g.label}</span>
                {/* The rate and the lease's words stay one phrase: where the row
                    is too narrow for both, the phrase takes a line of its own. */}
                <span className="whitespace-nowrap font-mono tabular-nums text-muted">{g.text}</span>
              </div>
              <div className="relative mt-0.5 h-2 rounded-full bg-faint" aria-hidden>
                <div className={`absolute inset-y-0 left-0 rounded-full ${g.tone}`} data-bar={g.bar} style={{ width: pctOf(g.pct, scale) }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {facts.length > 0 && (
        // A fact's label over its value until the panel itself is 28rem
        // wide: beside an 11rem label column a phone left the value 75px,
        // and "Walgreens Boots Alliance, Inc." broke a word a line.
        <div className="@container/tenant mt-3">
          <dl
            className="grid grid-cols-1 gap-y-1.5 text-xs @md/tenant:grid-cols-[minmax(7rem,11rem)_1fr] @md/tenant:gap-x-3 @md/tenant:gap-y-1"
            data-qa="single-tenant-facts"
          >
            {facts.map((f) => (
              <div key={f.k} className="@md/tenant:contents">
                <dt className="font-medium text-ink">{f.k}</dt>
                <dd className="min-w-0 text-muted">{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
