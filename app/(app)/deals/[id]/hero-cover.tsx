import type { DealCoverFacts } from "@/lib/deal-cover";
import { DealCover } from "../deal-cover";
import { ReplacePicture } from "./replace-picture";

/**
 * The deal header's picture where there is nothing to show of the place —
 * no address, no photograph of the building and no market photograph: the
 * deal's own cover (lib/deal-cover), the one its pipeline card wears, so the
 * deal looks the same on its card and on its page, and the header keeps its
 * split. Plainly an illustration ("No photo yet"), never a photograph.
 *
 * Held to `PropertyVisual`'s frame and corners — 16:9 on a phone, a wider
 * band where the header stacks, 16:9 again in the split — and marked
 * `data-hero-picture`, which the header splits on. The reader may add a
 * photograph from it, as from any picture of their own deal.
 */
export function HeroCover({
  cover,
  label,
  dealId,
  canAdd,
}: {
  cover: DealCoverFacts;
  /** the deal's name, for the picture's accessible name */
  label: string;
  dealId: string;
  /** offer "Add photo" (never on the sample) */
  canAdd: boolean;
}) {
  return (
    <figure data-hero-picture data-picture="cover" className="relative min-w-0 overflow-hidden rounded-t-[15px] bg-surface @3xl:rounded-tr-none">
      <DealCover cover={cover} label={label} className="block aspect-[16/9] w-full @2xl:aspect-[21/9] @3xl:aspect-[16/9]" />
      {canAdd ? (
        <div className="absolute right-2 top-2 z-[5]">
          <ReplacePicture dealId={dealId} hasPicture={false} tone="overlay" />
        </div>
      ) : null}
    </figure>
  );
}
