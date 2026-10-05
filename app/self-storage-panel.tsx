import type { SelfStorageRead } from "@/lib/self-storage";

/**
 * A self-storage facility (#471) — the pure panel for `lib/self-storage`,
 * drawn by the deal page and the shared screen. Nothing on anything else.
 *
 * Two pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE OCCUPANCIES: the share of units let, of the area let and of the
 *     rent collected, each a bar on one scale to 100%, with the 85% line a
 *     facility is read as stabilized past — so the gap between units and
 *     rent is the distance between two bars.
 *   - THE RATES: what sitting tenants pay against the street rate on one
 *     scale, the street a tick — the premium a move-out gives back is the
 *     bar past the tick.
 *
 * Then a tile each for the climate-controlled share, the tenant insurance,
 * the management, the expansion and the supply per person, each as stated.
 * The sentences are the reader's own and the model's read
 * (`storageModelLine`, `meta.storage.read`).
 */

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const clamp = (n: number) => `${Math.max(0, Math.min(100, n))}%`;

export function SelfStoragePanel({ storage, modelLine = "" }: { storage: SelfStorageRead | null; modelLine?: string }) {
  if (!storage) return null;
  const r = storage;
  const flagged = r.leaseUp || (r.premiumPct != null && r.premiumPct > 0);

  const occupancies = [
    { key: "units", label: "Units let", value: r.physicalPct, cls: "bg-brand/60" },
    { key: "area", label: "Area let", value: r.sfPct, cls: "bg-brand/35" },
    { key: "economic", label: "Rent collected", value: r.economicPct, cls: r.economicGapPts != null && r.economicGapPts > 0 ? "bg-caution/60" : "bg-pass/60" },
  ].filter((o): o is { key: string; label: string; value: number; cls: string } => o.value != null);

  const f = r.footing;
  const scale = f ? Math.max(f.inPlace, f.street) * 1.08 : 0;
  const at = (n: number) => (scale > 0 ? (n / scale) * 100 : 0);

  const tiles: { key: string; label: string; value: string; sub: string }[] = [];
  if (r.climatePct != null) tiles.push({ key: "climate", label: "Climate-controlled", value: pct1(r.climatePct), sub: r.climateStated });
  if (r.tenantInsurance) tiles.push({ key: "insurance", label: "Tenant insurance", value: r.tenantInsurance, sub: "The operator's program" });
  // A tile's headline is its figure, or the memorandum's own words where
  // there is no figure to read — "as stated" is at most the caption.
  if (r.management) {
    tiles.push({
      key: "management",
      label: "Management",
      value: r.management.thirdParty ? `Third party${r.management.feePct != null ? `, ${pct1(r.management.feePct)}` : ""}` : r.management.stated,
      sub: r.management.thirdParty ? r.management.stated : "As stated",
    });
  }
  if (r.expansion) tiles.push({ key: "expansion", label: "Expansion", value: r.expansion, sub: "As stated" });
  if (r.perCapita) tiles.push({ key: "per-capita", label: "Supply per person", value: r.perCapita, sub: "As stated" });

  return (
    <section
      aria-label="Self-storage"
      data-qa="storage-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-pass bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-pass"}`}>Self-storage</span>
        <span className="text-sm font-semibold">
          {r.leaseUp && r.physicalPct != null
            ? `In lease-up, ${pct1(r.physicalPct)} of units let`
            : r.economicPct != null
              ? `${pct1(r.economicPct)} economic occupancy`
              : r.physicalPct != null
                ? `${pct1(r.physicalPct)} of units let`
                : "Let month to month"}
        </span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>

      {occupancies.length > 0 && (
        <div className="mt-2 space-y-1.5 text-[11px]" data-qa="storage-occupancy">
          {occupancies.map((o) => (
            <div key={o.key} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2">
              <span className="text-muted">{o.label}</span>
              <div className="relative h-2.5 rounded-full bg-faint" aria-hidden>
                <div className={`h-full rounded-full ${o.cls}`} data-bar={`storage-${o.key}`} style={{ width: clamp(o.value) }} />
                <div className="absolute -inset-y-1 border-l-2 border-dashed border-ink/50" data-bar="storage-stabilized" style={{ left: "85%" }} />
              </div>
              <span className="text-right font-mono tabular-nums">{pct1(o.value)}</span>
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-muted">
            <span aria-hidden className="inline-block h-2.5 w-0 shrink-0 border-l-2 border-dashed border-ink/50" />
            85%, past which a facility is read as stabilized
          </p>
        </div>
      )}

      {f && r.inPlace && r.street && (
        <div className="mt-3 text-[11px]" data-qa="storage-rates">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div
              className={`h-full rounded-full ${r.premiumPct != null && r.premiumPct > 0 ? "bg-caution/50" : "bg-pass/60"}`}
              data-bar="storage-inplace"
              style={{ width: clamp(at(f.inPlace)) }}
            />
            <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" data-bar="storage-street" style={{ left: clamp(at(f.street)) }} />
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
            <li>{`In-place ${r.inPlace.stated}`}</li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0 bg-ink" />
              {`Street ${r.street.stated}${
                r.premiumPct != null && r.premiumPct !== 0 ? ` (in-place ${pct1(Math.abs(r.premiumPct))} ${r.premiumPct > 0 ? "over" : "under"} it)` : ""
              }`}
            </li>
          </ul>
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-qa="storage-tiles">
          {tiles.map((t) => (
            <li key={t.key} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink" data-storage={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              {t.sub && <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>}
            </li>
          ))}
        </ul>
      )}

      {r.sentences.length > 0 && <p className="mt-2 text-sm leading-relaxed">{r.sentences[0]}</p>}
      {r.sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(1).join(" ")}</p>
        </details>
      )}
      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
