import type { AllowanceRead, RegimeRead, RegulationRead } from "@/lib/rent-regulation";
import { sentencesOf } from "@/lib/first-sentence";

/**
 * The rent rules that reach the building — the pure panel for
 * `lib/rent-regulation`, drawn by the deal page and the shared screen.
 * Nothing where no rule the site holds reaches the building and the
 * memorandum names no regime.
 *
 * Each picture has its words beside it, so nothing rides on colour:
 *
 *   - THE REGIMES: each the site's rules say reaches the building, with
 *     whether it applies or possibly applies (and the questions a
 *     "possibly" leaves open) and the rule's own source.
 *   - THE REGULATED SHARE: the memorandum's regulated units as a share of
 *     its count, one bar, only where both are stated and agree.
 *   - THE ALLOWANCE AGAINST THE MODEL: each figure the regime allows for
 *     the period in force, and — on the deal page, which has the model —
 *     the model's one rent growth rate, all on one scale.
 *   - THE PERIOD: each filed allowance's period with today's tick, so an
 *     allowance about to end, ended or not yet begun is seen as one.
 *
 * Then a tile each for the regime as the memorandum names it and the
 * legal and preferential rents, each as stated; the read's first sentence,
 * the rest folded; and the model's read (`regulationModelLine`,
 * `meta.regulation.read`), so the page, the workbook and the report say the
 * same thing. The figures are written the way lib/rent-regulation writes
 * them (its `pctText` and `dayText`), here without loading its tables.
 */

/** "4.1%", "0%", "9.683%" — as published (lib/rent-regulation `pctText`). */
const pctText = (n: number) => `${Number.isInteger(n) ? n : Number(n.toFixed(3))}%`;

/** "Oct 1, 2026" (lib/rent-regulation `dayText`). */
function dayText(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(at)) return iso;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const count = (n: number) => n.toLocaleString("en-US");
/** A share as the reader says it: 1–99% unless all or none. */
const shareText = (n: number) => `${n >= 100 ? 100 : n <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(n)))}%`;
const clamp = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where today falls in a period, 0–100 — past either end, at that end. */
function periodPosition(a: Pick<AllowanceRead, "period_start" | "period_end">, today: string): number | null {
  const start = Date.parse(`${a.period_start}T00:00:00Z`);
  const end = Date.parse(`${a.period_end}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (![start, end, now].every(Number.isFinite) || end <= start) return null;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

/** The source's own host, as a link names it: "rentguidelinesboard.cityofnewyork.us". */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const PERIOD_WORDS: Record<AllowanceRead["state"], (a: AllowanceRead) => string> = {
  current: (a) => `In force ${dayText(a.period_start)} to ${dayText(a.period_end)}`,
  ended: (a) => `Ended ${dayText(a.period_end)}: the figure in force now needs checking`,
  upcoming: (a) => `Begins ${dayText(a.period_start)}: none is filed for today`,
};

export function RegulationPanel({
  regulation,
  today = null,
  modelGrowthPct = null,
  modelLine = "",
}: {
  regulation: RegulationRead | null;
  /** the day the read is drawn on, an ISO day — today's tick on each period */
  today?: string | null;
  /** the model's one rent growth rate, percent, where the page has a model */
  modelGrowthPct?: number | null;
  /** the model's read of it (`meta.regulation.read`) */
  modelLine?: string;
}) {
  if (!regulation) return null;
  const r = regulation;
  const lead: RegimeRead | undefined = r.regimes[0];
  // A regime that applies, or the memorandum's own claim of one, sets the
  // regulated rents: the warning tone. One the rules say possibly applies
  // is a question to answer.
  const flagged = r.claimOnly || r.regimes.some((g) => g.outcome === "applies");
  const headline = r.claimOnly
    ? r.stated
      ? `${capital(r.stated)}, as the memorandum states`
      : "Regulated rents, as the memorandum states"
    : lead
      ? `${capital(lead.name)} ${lead.outcome === "applies" ? "applies" : "possibly applies"}`
      : "Rent regulation";

  const inForce = r.regimes.filter((g) => g.allowance?.state === "current" && g.allowance.figures.length > 0);
  const model = modelGrowthPct != null && Number.isFinite(modelGrowthPct) ? Math.round(modelGrowthPct * 100) / 100 : null;
  const scale =
    Math.max(1, model ?? 0, ...inForce.flatMap((g) => g.allowance!.figures.map((f) => f.pct))) * 1.15;
  const at = (n: number) => clamp((Math.max(0, n) / scale) * 100);
  const periods = today ? r.regimes.filter((g) => g.allowance) : [];

  const tiles: { key: string; label: string; value: string; sub: string }[] = [];
  if (r.stated && !r.claimOnly) tiles.push({ key: "stated", label: "The memorandum names it", value: r.stated, sub: "As stated" });
  if (r.legalRent) tiles.push({ key: "legal-rent", label: "Legal regulated rent", value: r.legalRent, sub: "As stated" });
  if (r.preferentialRent) tiles.push({ key: "preferential-rent", label: "Preferential rent", value: r.preferentialRent, sub: "As stated, below the legal rent" });

  const sentences = sentencesOf(r.headline);

  return (
    <section
      aria-label="Rent regulation"
      data-qa="regulation-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-brand bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-brand"}`}>Rent regulation</span>
        <span className="text-sm font-semibold">{headline}</span>
      </p>

      {r.regimes.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px]" data-qa="regulation-regimes">
          {r.regimes.map((g) => {
            const host = g.source ? hostOf(g.source) : null;
            return (
              <li key={g.ruleId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-regime={g.ruleId}>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    g.outcome === "applies" ? "bg-caution/10 text-caution" : "bg-faint text-muted"
                  }`}
                >
                  {g.outcome === "applies" ? "Applies" : "Possibly applies"}
                </span>
                <span className="font-medium text-ink">{capital(g.name)}</span>
                {g.outcome !== "applies" && g.unknowns.length > 0 && (
                  <span className="text-muted">{`Open: ${g.unknowns.join("; ")}`}</span>
                )}
                {g.source && host && (
                  <a href={g.source} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    {`Source: ${host}`}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {r.sharePct != null && r.regulatedUnits != null && r.totalUnits != null && (
        <div className="mt-3 text-[11px]" data-qa="regulation-share">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-full bg-caution/60" data-bar="reg-units" style={{ width: clamp(r.sharePct) }} />
          </div>
          <p className="mt-1.5 text-muted">
            {`${count(r.regulatedUnits)} of the ${count(r.totalUnits)} ${r.noun.many} rent-regulated, as the memorandum states (${shareText(r.sharePct)})`}
          </p>
        </div>
      )}

      {inForce.length > 0 && (
        <div className="mt-3 space-y-1.5 text-[11px]" data-qa="regulation-allowance">
          {inForce.map((g) => {
            const a = g.allowance!;
            return (
              <div key={g.ruleId} className="space-y-1.5" data-regime={g.ruleId}>
                <p className="text-muted">{`${capital(g.name)} allows, for ${a.applies_to} ${dayText(a.period_start)} to ${dayText(a.period_end)}:`}</p>
                {a.figures.map((f) => (
                  <div key={f.label} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-2">
                    <span className="text-muted">{capital(f.label)}</span>
                    <div className="relative h-2.5 rounded-full bg-faint" aria-hidden>
                      <div className="h-full rounded-full bg-caution/60" data-bar="reg-allowance" style={{ width: at(f.pct) }} />
                    </div>
                    <span className="text-right font-mono tabular-nums">{pctText(f.pct)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {model != null && (
            <div className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-2">
              <span className="text-muted">The model grows every rent</span>
              <div className="relative h-2.5 rounded-full bg-faint" aria-hidden>
                <div className="h-full rounded-full bg-brand/60" data-bar="reg-model-growth" style={{ width: at(model) }} />
              </div>
              <span className="text-right font-mono tabular-nums">{pctText(model)}</span>
            </div>
          )}
        </div>
      )}

      {periods.length > 0 && today && (
        <ul className="mt-3 space-y-2 text-[11px]" data-qa="regulation-periods">
          {periods.map((g) => {
            const a = g.allowance!;
            const pos = periodPosition(a, today);
            if (pos == null) return null;
            return (
              <li key={g.ruleId} data-regime={g.ruleId}>
                <div className="relative h-2 rounded-full bg-faint" aria-hidden>
                  <div className="h-full rounded-full bg-ink/20" data-bar="reg-period" style={{ width: clamp(pos) }} />
                  <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" data-bar="reg-today" style={{ left: clamp(pos) }} />
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
                  <span>{`${capital(g.name)}: ${PERIOD_WORDS[a.state](a)}`}</span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0 bg-ink" />
                    {`Today, ${dayText(today)}`}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-qa="regulation-tiles">
          {tiles.map((t) => (
            <li key={t.key} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink" data-reg={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>
            </li>
          ))}
        </ul>
      )}

      {sentences.length > 0 && <p className="mt-2 text-sm leading-relaxed">{sentences[0]}</p>}
      {sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{sentences.slice(1).join(" ")}</p>
        </details>
      )}
      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
