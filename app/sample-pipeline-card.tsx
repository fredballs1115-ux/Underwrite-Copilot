// The homepage's "Your pipeline" card (app/page.tsx): the sample deal's
// own pipeline card, as the pipeline draws it once a reader adds the
// sample — the card itself (`DealTilePreview`, deal-tile.tsx), built by the
// pipeline's own builder (lib/pipeline-card `sampleDealCard`): its market's photograph with
// its caption and credit, the call on it, the price with its basis, the cap
// and the fit against the public sample's box. It opens /demo. Never an
// invented deal, and no stage control: the card's module imports no server
// action (lib/home-bundle.test.ts holds the homepage to that).
//
// A server component: the builder reads the market tables on the server;
// the card's own client code is a chunk the browser asks for as the section
// nears the screen (app/sample-pipeline-card-lazy.tsx).
import { SamplePipelineCardLazy } from "./sample-pipeline-card-lazy";
import { sampleDealCard } from "@/lib/pipeline-card";

export function SamplePipelineCard() {
  // The render's day (the page is ISR); the sample's card prints no date.
  const today = new Date().toISOString().slice(0, 10);
  return <SamplePipelineCardLazy card={sampleDealCard({ today })} today={today} />;
}
