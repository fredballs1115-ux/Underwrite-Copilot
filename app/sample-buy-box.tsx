// The sample deal's Buy box tab, on the homepage's walkthrough and on /demo:
// the deal page's own panel (app/(app)/deals/[id]/buy-box-panel), read on
// the server against the public sample's box (lib/sample-deal
// SAMPLE_DEMO_BOX) by the deal header's reader. The panel speaks to a
// signed-in reader ("The deal against your mandate"), and a visitor set no
// box, so a caption over it says whose box it is, and the box's own lines
// (lib/criteria `buyBoxLines`) say what it asks.
import { BuyBoxPanel, type BuyBoxPanelData } from "./(app)/deals/[id]/buy-box-panel";

/** The tab's two server reads: the panel's data and the box's lines. */
export interface SampleBuyBoxData {
  panel: BuyBoxPanelData;
  /** the sample's box, one line a criterion */
  lines: string[];
}

export function SampleBuyBox({ data }: { data: SampleBuyBoxData }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2" data-qa="sample-box-caption">
        <p className="text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink">The sample&apos;s example buy box</span>
          {" — on a deal of your own, the box you set."}
        </p>
        <ul aria-label="The sample's example buy box" className="flex flex-wrap gap-1.5">
          {data.lines.map((line) => (
            <li key={line} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <BuyBoxPanel data={data.panel} />
    </div>
  );
}
