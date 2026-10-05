import { PML_LENDER_PCT, findingLabel, reportMonth, type SiteReportsRead } from "@/lib/site-reports";
import { Key, KeyItem, PanelNote, PanelRead, Tick, tileSpan } from "@/app/panel-parts";

/**
 * What the third-party reports found (#465) — the pure panel for
 * `lib/site-reports`, drawn by the deal page and the shared screen. Nothing
 * where the memorandum cites no report.
 *
 * Three pictures, each with its words beside it so nothing rides on
 * colour:
 *
 *   - THE REPORTS: a tile a report — the Phase I's finding, the Phase II,
 *     the immediate repairs, the seismic PML and the zoning — each in the
 *     tone of what it found.
 *   - THE PHASE I'S AGE: the months since its date on a track with the
 *     180-day and the one-year marks, the two lines the purchase is held to.
 *   - THE PML: the seismic probable maximum loss against the 20% at which
 *     most lenders ask for earthquake insurance.
 *
 * The sentences are the reader's own (`sentences`) and the model's read
 * (`siteReportsModelLine`, `meta.siteReports.read`), so the page, the
 * workbook and the report say the same thing.
 */

type Tone = "pass" | "caution" | "kill" | "neutral";

const TONE: Record<Tone, string> = {
  pass: "border-pass/30 bg-pass/5 text-pass",
  caution: "border-caution/40 bg-caution/5 text-caution",
  kill: "border-kill/40 bg-kill/5 text-kill",
  neutral: "border-line bg-surface text-ink",
};

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
/** A stated sentence cut to a tile: its first clause. */
const clause = (words: string) => {
  const first = words.split(/[;,.]/)[0].trim();
  return first.length > 28 ? `${first.slice(0, 27).trimEnd()}…` : first;
};

const ZONING_LABEL = {
  conforming: "Conforming",
  legal_non_conforming: "Legal non-conforming",
  non_conforming: "Non-conforming",
} as const;

export function SiteReportsPanel({ reports, modelLine = "" }: { reports: SiteReportsRead | null; modelLine?: string }) {
  if (!reports) return null;
  const r = reports;
  const p1 = r.phaseI;
  const tiles: { key: string; label: string; value: string; sub: string; tone: Tone; title?: string }[] = [];
  if (p1) {
    const f = p1.finding;
    tiles.push({
      key: "phase-i",
      label: "Phase I",
      // A finding the reader cannot name is headlined in its own words,
      // whole in the tile's title.
      value: f === "stated" ? clause(p1.words) || "Cited" : f ? findingLabel(f) : "Cited",
      sub: p1.date ? `Dated ${reportMonth(p1.date)}` : "Undated",
      tone: f === "rec" ? "kill" : f === "crec" || p1.age === "redo" ? "caution" : f === "none" || f === "de_minimis" || f === "hrec" ? "pass" : "neutral",
      title: p1.words || undefined,
    });
  }
  if (r.phaseII) tiles.push({ key: "phase-ii", label: "Phase II", value: clause(r.phaseII), sub: "As stated", tone: "neutral", title: r.phaseII });
  if (r.pca) {
    const i = r.pca.immediate;
    tiles.push({
      key: "pca",
      label: "Immediate repairs",
      value: i == null ? "Not stated" : i > 0 ? dollars(i) : "None",
      sub: i != null && i > 0 && r.price != null ? `${pct1((i / r.price) * 100)} of the price` : r.pca.date ? `PCA ${reportMonth(r.pca.date)}` : "Property condition",
      tone: i != null && i > 0 ? "caution" : i === 0 ? "pass" : "neutral",
    });
  }
  if (r.pmlPct != null) {
    tiles.push({
      key: "pml",
      label: "Seismic PML",
      value: pct1(r.pmlPct),
      sub: r.pmlPct >= PML_LENDER_PCT ? `At or over ${PML_LENDER_PCT}%` : `Under ${PML_LENDER_PCT}%`,
      tone: r.pmlPct >= PML_LENDER_PCT ? "kill" : "pass",
    });
  }
  if (r.zoning) {
    const z = r.zoning.status;
    tiles.push({
      key: "zoning",
      label: "Zoning",
      value: z === "stated" ? clause(r.zoning.words) : ZONING_LABEL[z],
      sub: "As stated",
      tone: z === "conforming" ? "pass" : z === "stated" ? "neutral" : "caution",
      title: r.zoning.words,
    });
  }
  const flagged = tiles.some((t) => t.tone === "kill" || t.tone === "caution");

  // The Phase I's age on a track that runs a little past whichever is
  // later, its age or the year: the 180-day and one-year marks always show.
  const ageMonths = p1?.ageDays != null ? p1.ageDays / 30.44 : null;
  const ageSpan = ageMonths != null ? Math.max(15, Math.ceil(ageMonths + 3)) : null;
  // The PML on a track to 40%, or past the figure where it is higher.
  const pmlSpan = r.pmlPct != null ? Math.max(40, Math.ceil(r.pmlPct / 10) * 10 + 10) : null;

  return (
    <section
      aria-label="Third-party reports"
      data-qa="site-reports-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-pass bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-pass"}`}>Third-party reports</span>
        <span className="text-sm font-semibold">{flagged ? "Findings to price" : "Nothing flagged"}</span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>

      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-qa="site-report-tiles">
        {tiles.map((t) => (
          <li key={t.key} className={`rounded-lg border px-2.5 py-2 ${TONE[t.tone]} ${tileSpan(t.value)}`} data-report={t.key} title={t.title}>
            <span className="block text-[10px] font-semibold uppercase tracking-wider">{t.label}</span>
            <span className="block text-sm font-semibold leading-tight">{t.value}</span>
            <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>
          </li>
        ))}
      </ul>

      {/* The first report's read leads — the Phase I where there is one —
          and the rest is one click away and whole in the HTML, since the
          tiles and the pictures draw it. */}
      <PanelRead sentences={r.sentences} className="mt-2" />

      {ageMonths != null && ageSpan != null && (
        <div className="mt-3 text-[11px]" data-qa="site-report-age">
          <div className="flex items-baseline justify-between gap-x-3">
            <span className="font-medium text-ink">The Phase I&apos;s age</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`${Math.floor(ageMonths)} months`}</span>
          </div>
          <div className="relative mt-0.5 h-3 rounded-full bg-faint" aria-hidden>
            <div
              className={`h-full rounded-full ${p1?.age === "redo" ? "bg-kill/60" : p1?.age === "update" ? "bg-caution/60" : "bg-pass/60"}`}
              data-bar="esa-age"
              style={{ width: pctOf(ageMonths, ageSpan) }}
            />
            <Tick at={pctOf(180 / 30.44, ageSpan)} bar="esa-180" tone="bg-caution" />
            <Tick at={pctOf(365 / 30.44, ageSpan)} bar="esa-year" tone="bg-kill" />
          </div>
          <Key>
            <KeyItem mark="tick" tone="bg-caution">180 days: interviews, searches and the site visit updated by closing</KeyItem>
            <KeyItem mark="tick" tone="bg-kill">One year: a new report</KeyItem>
          </Key>
        </div>
      )}

      {r.pmlPct != null && pmlSpan != null && (
        <div className="mt-3 text-[11px]" data-qa="site-report-pml">
          <div className="flex items-baseline justify-between gap-x-3">
            <span className="font-medium text-ink">Seismic PML</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{pct1(r.pmlPct)}</span>
          </div>
          <div className="relative mt-0.5 h-3 rounded-full bg-faint" aria-hidden>
            <div
              className={`h-full rounded-full ${r.pmlPct >= PML_LENDER_PCT ? "bg-kill/60" : "bg-pass/60"}`}
              data-bar="pml"
              style={{ width: pctOf(r.pmlPct, pmlSpan) }}
            />
            <Tick at={pctOf(PML_LENDER_PCT, pmlSpan)} bar="pml-line" />
          </div>
          <Key>
            <KeyItem mark="tick" tone="bg-ink">{`${PML_LENDER_PCT}%: most lenders ask for earthquake insurance or a retrofit at or above it`}</KeyItem>
          </Key>
        </div>
      )}

      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
