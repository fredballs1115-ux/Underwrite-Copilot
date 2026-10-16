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

/** The most deals the preview draws: a glance, not a second pipeline. */
export const BOX_PREVIEW_MAX = 8;

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
};

/** One deal's chip under the box, from its pipeline card. */
export function boxPreviewItem(c: Pick<DealCard, "id" | "name" | "score" | "mandateVerdict" | "fit" | "fitCoverage" | "fitFirstRead">): BoxPreviewItem {
  const firstRead = c.fitFirstRead ? ", first read" : "";
  const title = checkedSentence(c.fitCoverage);
  if (c.score != null && c.mandateVerdict) {
    return {
      id: c.id,
      name: c.name,
      chip: `${fitScoreLabel(c.score, c.mandateVerdict, c.fit === "outside", c.fitCoverage)}${firstRead}`,
      tone: fitTone(c.mandateVerdict, c.fit, c.fitCoverage),
      title,
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
    };
  }
  return { id: c.id, name: c.name, chip: "Not judged yet", tone: "muted", title: null };
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
        {more ? `Your ${items.length} newest live deals, as saved.` : "Your live deals, as saved."}
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
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
