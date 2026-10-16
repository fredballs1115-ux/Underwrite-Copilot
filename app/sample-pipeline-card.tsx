// The homepage's "Your pipeline" card (app/page.tsx): the sample deal's
// own pipeline card, as the pipeline draws it once a reader adds the
// sample — the card itself (`DealTilePreview`, deal-tile.tsx), built by the
// pipeline's own builder (lib/pipeline-card `sampleDealCard`): its market's photograph with
// its caption and credit, the call on it, the price with its basis, the cap
// and the fit against the public sample's box. It opens /demo. Never an
// invented deal, and no stage control: the card's module imports no server
// action (lib/home-bundle.test.ts holds the homepage to that).
//
// A server component: the builder reads the market tables on the server,
// and only the card's own client code reaches the browser.
import { DealTilePreview } from "./(app)/deals/deal-tile";
import { sampleDealCard } from "@/lib/pipeline-card";

export function SamplePipelineCard() {
  // The render's day (the page is ISR); the sample's card prints no date.
  const today = new Date().toISOString().slice(0, 10);
  return (
    <DealTilePreview
      d={sampleDealCard({ today })}
      href="/demo"
      title="Open the sample deal"
      note="Sample deal"
      todayIso={today}
      className="grid w-full max-w-[20rem]"
      // Far down the page: no preload, no high priority, asked for as it
      // nears the screen.
      lazy
    />
  );
}
