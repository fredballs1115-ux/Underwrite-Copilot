import { PublicShell } from "@/app/public-shell";
import { publicMetadata } from "@/lib/page-meta";
import { HOW_WE_TEST_PAGE } from "@/lib/public-pages";
import { HowWeTestView } from "./view";

// The methodology page (2026-10-19): how each of the memorandum's
// assumptions is tested, drawn from lib/stress-test-types' STRESS_METHODS.
// Public, in the public shell like /tools and /market: a prospect reads it
// from the footer, a signed-in analyst gets the app's chrome. The page is
// the pure view (./view.tsx) and nothing else, so the render test draws
// what a visitor gets.
export const metadata = publicMetadata(HOW_WE_TEST_PAGE);

export default function HowWeTestPage() {
  return (
    <PublicShell>
      <HowWeTestView />
    </PublicShell>
  );
}
