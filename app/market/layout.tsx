import { PublicShell } from "@/app/public-shell";

/** /market sits OUTSIDE the signed-in route group on purpose: the homepage,
 *  /why, and /demo all link the covered-market briefs (marquee, coverage
 *  board), and those must open for a prospect with no account. Signed-in
 *  visitors still get the full app chrome; the page itself already renders
 *  both ways (its own-deals memory section is user-gated). The two front
 *  doors live in PublicShell, shared with /tools. */
export default async function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
