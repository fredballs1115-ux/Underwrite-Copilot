// What the buy box says about the reader's own deals (signed-in gaps, M12):
// each of the newest live deals with its picture and the fit chip its
// pipeline card would wear under the box as saved — the same builder the
// pipeline's card is drawn from (lib/pipeline-card, through lib/buy-box-chip
// `dealCheckSource`), said in the card's own words (lib/fit-label). The
// page had described the box in a sentence; this shows what it does.
//
// Pure (no hooks, no I/O): the page reads the rows and builds the cards.
import Link from "next/link";
import type { DealCard } from "../deals/pipeline";
import { FIT_TONE_CLS } from "../deals/deal-card-parts";
import { DealAvatar } from "../deal-avatar";
import { FOLD_WORD, checkedOf, checkedSentence, fitScoreLabel, fitTone, type FitTone } from "@/lib/fit-label";
import { STAGES, isOpenStage } from "@/lib/stages";
import type { ListJobStatus } from "@/lib/screen-run";

/** The most deals the preview draws: a glance, not a second pipeline. */
export const BOX_PREVIEW_MAX = 8;

/** The query's filter for the deals still in play (lib/stages
 *  `isOpenStage`): every stage but the closed and the dead, a row with no
 *  stage and a legacy stage included (`normalizeStage` reads both as open).
 *  Read in the query, so the preview's count is of live deals alone. */
export const OPEN_STAGE_FILTER = `stage.is.null,stage.not.in.(${STAGES.filter((s) => !isOpenStage(s)).join(",")})`;

/** How a running, stalled or failed run is said beside a chip: the
 *  pipeline card's own words over its call (deal-tile's `TileCall`). */
export const RUN_WORDS: Record<NonNullable<ListJobStatus>, { label: string; title: string; cls: string }> = {
  running: {
    label: "Re-screening…",
    title: "A re-screen is running: the fit is read off the terms as it rewrites them",
    cls: "border-brand/30 bg-brand/5 text-brand",
  },
  stalled: {
    label: "Stalled",
    title: "The run stopped writing progress — open the deal to start it again",
    cls: "border-caution/30 bg-caution/10 text-caution",
  },
  failed: {
    label: "Failed",
    title: "The latest screen failed — open the deal to see why and try again",
    cls: "border-kill/30 bg-kill/10 text-kill",
  },
};

export type BoxPreviewItem = {
  id: string;
  name: string;
  /** the chip's words: "Fit 82 · Pursue", "Fit 63 · Outside box", "Near
   *  box, 2 of 4 checked"; "Not judged yet" where the screen has read
   *  nothing the box can check */
  chip: string;
  tone: FitTone;
  /** the chip's tooltip: which criteria could not be checked, where any */
  title: string | null;
  /** the deal's latest run, as its pipeline card says it (lib/screen-run
   *  `listJobStatus`): a screen running, stalled or failed; null where none */
  run?: ListJobStatus;
  /** the deal holds a call, so a running screen is a re-screen */
  hasCall?: boolean;
};

type PreviewCard = Pick<DealCard, "id" | "name" | "score" | "mandateVerdict" | "fit" | "fitCoverage" | "fitFirstRead"> &
  Partial<Pick<DealCard, "jobStatus" | "verdict">>;

/** One deal's chip under the box, from its pipeline card. */
export function boxPreviewItem(c: PreviewCard): BoxPreviewItem {
  const run = { run: c.jobStatus ?? null, hasCall: !!c.verdict };
  const firstRead = c.fitFirstRead ? ", first read" : "";
  const title = checkedSentence(c.fitCoverage);
  if (c.score != null && c.mandateVerdict) {
    return {
      id: c.id,
      name: c.name,
      chip: `${fitScoreLabel(c.score, c.mandateVerdict, c.fit === "outside", c.fitCoverage)}${firstRead}`,
      tone: fitTone(c.mandateVerdict, c.fit, c.fitCoverage),
      title,
      ...run,
    };
  }
  if (c.fit) {
    const count = checkedOf(c.fitCoverage);
    return {
      id: c.id,
      name: c.name,
      chip: `${FOLD_WORD[c.fit]} box${count ? `, ${count}` : ""}${firstRead}`,
      tone: fitTone(null, c.fit, c.fitCoverage),
      title,
      ...run,
    };
  }
  return { id: c.id, name: c.name, chip: "Not judged yet", tone: "muted", title: null, ...run };
}

/** A run's words beside a chip: "Re-screening…" over a call on file, and
 *  "Screening…" on a deal's first screen, as the pipeline card says them. */
export function runWords(it: Pick<BoxPreviewItem, "run" | "hasCall">): { label: string; title: string; cls: string } | null {
  if (!it.run) return null;
  const w = RUN_WORDS[it.run];
  if (it.run === "running" && !it.hasCall) return { ...w, label: "Screening…", title: "A screen is running: the fit is read off the terms as it writes them" };
  return w;
}

/** The line over the chips: how many live deals they are, "newest" only
 *  where more live deals exist than the preview draws (audit C10, L3). */
export function previewCountLine(count: number, more: boolean): string {
  if (more) return `Your ${count} newest live deals, as saved.`;
  return `Your ${count === 1 ? "one live deal" : `${count} live deals`}, as saved.`;
}

const TONE_RING: Record<FitTone, string> = {
  pass: "border-pass/30 bg-pass/10",
  caution: "border-caution/30 bg-caution/10",
  kill: "border-kill/30 bg-kill/10",
  muted: "border-line bg-faint",
};

export function BoxPreview({ items, more }: { items: BoxPreviewItem[]; more: boolean }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="box-preview-h" data-qa="box-preview" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="box-preview-h" className="text-sm font-semibold tracking-tight">
        Your pipeline against this box
      </h2>
      <p className="mt-0.5 text-xs text-muted">
        {previewCountLine(items.length, more)}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={`/deals/${encodeURIComponent(it.id)}`}
              className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-faint"
            >
              <DealAvatar dealId={it.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{it.name}</span>
                <span
                  data-qa="box-preview-chip"
                  title={it.title ?? undefined}
                  className={`mt-0.5 inline-block max-w-full truncate rounded-full border px-2 py-px text-[11px] font-semibold tabular-nums ${TONE_RING[it.tone]} ${FIT_TONE_CLS[it.tone]}`}
                >
                  {it.chip}
                </span>
                <RunTag it={it} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A run beside the chip, in the pipeline card's words; nothing where the
 *  deal has no run to say. The space before it is spelled, so a screen
 *  reader hears two words. */
function RunTag({ it }: { it: BoxPreviewItem }) {
  const run = runWords(it);
  if (!run) return null;
  return (
    <>
      {" "}
      <span
        data-qa="box-preview-run"
        title={run.title}
        className={`ml-1 mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-semibold ${run.cls}`}
      >
        {it.run === "running" ? <span aria-hidden className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" /> : null}
        {run.label}
      </span>
    </>
  );
}
