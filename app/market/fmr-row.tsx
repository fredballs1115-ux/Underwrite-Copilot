import { FMR_BEDS, fmrLabel, fmrPhase, fyEnd, type Fmr } from "@/lib/fmr";
import { datedLong } from "@/lib/debt-index";
import { linkOk } from "@/lib/link-audit";
import { CopyCite } from "./copy-cite";
import { Fold } from "./fold";

/**
 * A covered metro's fair market rent on its market brief: HUD's bedroom row
 * with the two-bedroom figure as the headline, drawn as a ladder, with its
 * status, its source, HUD's name for the area and the day the year takes
 * effect, a citation to copy and the research note folded.
 *
 * Everything dated comes from the block (lib/fmr `fmrOf`): the fiscal year
 * the heading names, the day it takes effect. The year used to be typed on
 * the page, so on the day HUD's next year took effect the brief went on
 * printing last year's rents as current. Past its fiscal year's last day the
 * row says the year has ended, in the warning tone, until the file carries
 * the next one.
 *
 * Pure: the page hands in the block and today's date (read outside the
 * render), so the render test draws it on the research file's own blocks
 * and on any day.
 */
export function FmrRow({ name, fmr, today }: { name: string; fmr: Fmr | null; today: string }) {
  const twoBed = fmr?.rents["2br"] ?? null;
  if (!fmr || twoBed === null) {
    return (
      <p className="text-xs text-muted">
        {`${fmr ? `${fmrLabel(fmr.fy)} fair market rent` : "Fair market rent"} for this metro: not yet confirmed — ${fmr?.note ?? "queued in the research gaps."}`}
      </p>
    );
  }
  // The full bedroom row HUD publishes; 2BR stays the emphasized headline.
  const beds = FMR_BEDS.flatMap((k) => {
    const value = fmr.rents[k];
    return value === null ? [] : [{ label: k.toUpperCase(), value }];
  });
  const max = Math.max(...beds.map((b) => b.value));
  const ended = fmrPhase(fmr, today) === "ended";
  const when = ended ? `ended ${datedLong(fyEnd(fmr.fy))}` : `effective ${datedLong(fmr.effective)}`;
  const source = fmr.sources[0] ?? null;
  return (
    <div className="text-sm" data-qa="fmr-row">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {`${fmrLabel(fmr.fy)} fair market rent`}
      </span>{" "}
      {beds.map((b, i) => (
        <span key={b.label}>
          {i > 0 && <span className="text-muted"> · </span>}
          <span className="text-muted">{b.label}</span>{" "}
          <span className={`font-mono tabular-nums ${b.label === "2BR" ? "font-semibold" : "text-muted"}`}>
            {`$${b.value.toLocaleString("en-US")}`}
          </span>
        </span>
      ))}
      <span className="text-muted">/mo</span>
      <span
        className={`ml-2 rounded px-1.5 py-px align-middle text-[10px] font-medium ${
          fmr.status === "verified" ? "bg-emerald-500/10 text-emerald-600" : "bg-brand/10 text-brand"
        }`}
      >
        {fmr.status}
      </span>
      {source && linkOk(source) !== false && (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="ml-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          source
        </a>
      )}
      {/* Whose figures and from when: HUD's name for the area and the day
          the year takes effect — or, past the year's end, that it has ended. */}
      <p className={`mt-0.5 text-[11px] ${ended ? "font-medium text-caution" : "text-muted"}`} data-qa="fmr-when">
        {`${fmr.area} · ${when}`}
      </p>
      {/* Bedroom ladder, drawn — widths scale to the real dollars in the row
          above (aria-hidden: the numbers already read as text). */}
      {beds.length >= 2 && (
        <div className="mt-2 max-w-md space-y-1" aria-hidden>
          {beds.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-[10px] font-medium text-muted">{b.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-faint">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    b.label === "2BR" ? "bg-brand" : "bg-brand/40"
                  }`}
                  style={{ width: `${Math.max(8, Math.round((b.value / max) * 100))}%` }}
                  data-bar="fmr"
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
                {`$${b.value.toLocaleString("en-US")}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <CopyCite
        text={`${name} — ${fmrLabel(fmr.fy)} 2BR fair market rent $${twoBed.toLocaleString("en-US")}/mo (${fmr.area}, ${when}; ${fmr.status}${source ? `; source: ${source}` : ""}) · via Underwrite Copilot market brief`}
      />
      {fmr.note && <Fold text={fmr.note} className="mt-1 text-[11px] leading-relaxed text-muted" />}
    </div>
  );
}
