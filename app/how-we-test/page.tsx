import { PublicShell } from "@/app/public-shell";
import { publicMetadata } from "@/lib/page-meta";
import { HOW_WE_TEST_PAGE } from "@/lib/public-pages";
import { readerToday } from "@/lib/reader-day";
import { sampleStressTest } from "@/lib/sample-stress";
import { sampleTodayReads } from "@/lib/sample-stress-read";
import { HowWeTestView } from "./view";

// The methodology page (2026-10-19): how each of the memorandum's
// assumptions is tested, drawn from lib/stress-test-types' STRESS_METHODS.
// Public, in the public shell like /tools and /market: a prospect reads it
// from the footer, a signed-in analyst gets the app's chrome. The page is
// the pure view (./view.tsx) and nothing else, so the render test draws
// what a visitor gets.
export const metadata = publicMetadata(HOW_WE_TEST_PAGE);

// ISR, /demo's five-minute window: the worked example is the sample's
// stress test read on today's figures, so a static build would hold the
// day it was built.
export const revalidate = 300;

export default async function HowWeTestPage() {
  // The sample's one build (lib/sample-stress `sampleStressTest`) on the
  // day and the figures /demo and the homepage read it on, so the row the
  // page shows is the row they show. A failed read leaves the published
  // rows unchecked, never the page down (`sampleTodayReads` never throws).
  const example = sampleStressTest({ today: readerToday(null), reads: await sampleTodayReads() });
  return (
    <PublicShell>
      <HowWeTestView example={example} />
    </PublicShell>
  );
}
